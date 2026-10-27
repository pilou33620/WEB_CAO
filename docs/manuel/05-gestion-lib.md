# Gestion LIB

Gestion LIB tient la bibliothèque centrale : le catalogue `LIB_composants.csv` (une ligne par référence), les empreintes PCB, les symboles schématiques, les modèles de simulation (SPICE, Touchstone) et les modèles 3D, partagés par le schéma, le PCB et les simulations.
Elle contient les éditeurs d'empreintes et de symboles, la saisie du brochage, la liaison des modèles de simulation et l'import JLCPCB / LCSC.
Elle passe par le serveur local (`python web_CAO.py`) : la page ne s'ouvre pas en `file://`. Ouverture : bouton « Gestion LIB » de l'accueil, ou « 📚 Ouvrir dans Gestion LIB ↗ » depuis une fiche du schéma ou du PCB.

## Guide par tâche

### Je veux retrouver une référence dans le catalogue

1. Ouvrir l'onglet « 📋 Catalogue Composants (CSV) » (onglet de départ).
2. Saisir dans « Rechercher par référence, description, valeur, boîtier, fabricant... » : la recherche porte sur la `Part Name`, la `Description`, la `Value`, le `Package type`, le `Manufacturer`, les références fabricant et secondes sources, et sur les noms d'empreinte et de symbole liés.
3. Au besoin, restreindre par préfixe (liste « Tous les préfixes (R, C, U...) ») ou par statut d'association (liste « Tous les statuts d'association »).
4. Cliquer l'en-tête d'une colonne pour trier ; un second clic inverse l'ordre (▲ / ▼).
5. Cliquer une ligne : la fiche de la référence s'ouvre dans l'inspecteur (à droite).

> [!NOTE]
> Le tableau n'affiche que les 250 premières lignes du résultat. Le compteur « N affiché(s) sur M » compte toutes les lignes retenues par les filtres, y compris celles qui ne sont pas dessinées : affiner la recherche pour atteindre les suivantes.

### Je veux choisir les colonnes visibles

1. Cliquer « ⚙️ Colonnes (n) » : n est le nombre de colonnes affichées.
2. Cocher ou décocher les colonnes ; « Filtrer les colonnes... » réduit la liste.
3. « Par défaut » remet les neuf colonnes d'origine, « Tout cocher » et « Tout décocher » agissent sur toutes les colonnes affichées dans la fenêtre.
4. Cliquer « Appliquer (n) ». Une colonne au moins est exigée. Le choix est gardé dans le navigateur (clé `cao_lib_colonnes_visibles`), pas dans la LIB.

### Je veux ajouter une référence à la main

1. Cliquer « ➕ Nouveau composant ».
2. Remplir « Part Name * » (obligatoire), « Préfixe (Ref Des) * », « Boîtier (Package) », « Valeur », « Fabricant », « Description ».
3. Cliquer « Ajouter et auto-associer » : la ligne est ajoutée en tête du catalogue et l'association automatique est appliquée à cette seule ligne (symbole d'après le préfixe, empreinte d'après le boîtier si le fichier existe dans la LIB, modèle générique).
4. Corriger les associations dans la ligne (listes déroulantes) puis « 💾 Enregistrer ».

> [!NOTE]
> Sans préfixe saisi, le code retient `U`. Il ne vérifie pas que la `Part Name` est libre : deux lignes de même nom sont possibles (contrairement à la création par Claude, qui refuse un nom pris).

### Je veux importer un composant JLCPCB / LCSC

1. Cliquer « ⚡ Importer JLCPCB / LCSC » (ou, depuis la [Recherche de composants](06-recherche-composants.md), « ⚡ Ajouter à Gestion LIB »).
2. Saisir un code LCSC direct (par exemple `C6186`) ou une désignation (`STM32F103`, `100nF 0805`), puis « Rechercher » ou Entrée. Un code `C` suivi de chiffres ouvre directement la fiche ; une désignation affiche jusqu'à 25 résultats.
3. Cliquer un résultat (« Vérifier & Importer ➔ ») : la fiche de contrôle montre les champs principaux et le nombre de broches du brochage trouvé.
4. Corriger si besoin les champs principaux ou, dans « 📋 Voir et ajuster l'intégralité des 39 colonnes du CSV », n'importe quelle colonne.
5. Cliquer « 📥 Confirmer et Enregistrer dans la Bibliothèque (39 colonnes) ». Le catalogue est enregistré aussitôt, la ligne est affichée et sélectionnée.

> [!NOTE]
> L'enregistrement de l'import écrit tout le catalogue, y compris les modifications en attente faites avant l'import. Un symbole existant qui n'est pas celui de la pièce (`npn.json`, `ic.json`…) est réutilisé sans être écrasé ; seul le symbole nommé d'après la pièce est écrit (ou réécrit).

### Je veux associer empreinte, symbole et modèle à une référence

1. Dans la ligne du catalogue, ouvrir la liste de la colonne « Empreinte PCB », « Empreinte Schématique » ou « Modèle Simulation » et choisir un fichier ; « -- Aucune -- » / « -- Aucun -- » efface l'association. Une case qui contient un chemin `lib/empreinte/…` est retrouvée dans la liste par son nom ; elle garde son chemin tant que la valeur n'est pas changée.
2. Pour associer d'un coup toutes les cases vides du catalogue, cliquer « 🔄 Auto-associer » : le symbole suit le préfixe (`R` vers `resistor.json`, `C` vers `capacitor.json`, `Q` vers `npn.json`, etc.), l'empreinte suit le boîtier (`0603`, `SOIC-8`, `SOT-23`…) si le fichier existe dans la LIB, le modèle de simulation est un modèle générique (`resistor.sub`, `capacitor.sub`…) s'il existe.
3. « Auto-associer » ne remplace jamais une case remplie et écrit des noms nus (`resistor.json`, `0603.json`), pas des chemins `lib/…`. Il complète aussi la colonne `Brochage` des seules références au brochage certain : transistors (bipolaire `B=1,E=2,C=3`, MOSFET `G=1,S=2,D=3`) en boîtier SOT-23 / SOT-323 / SC-70 à 3 pattes, et trois références relevées sur datasheet (OPA369, LM78L en SO-8, LP2980 en SOT-23-5). Les modèles de simulation génériques ne sont posés que pour les symboles résistance, condensateur, self, diode, transistors et ampli-op.
4. Cliquer « 💾 Enregistrer ».

### Je veux enregistrer ou sauvegarder le catalogue

1. Cliquer « 💾 Enregistrer » ou presser Ctrl+S (dans l'éditeur d'empreinte ouvert, Ctrl+S enregistre le fichier de l'éditeur, pas le catalogue). Le bouton affiche « 💾 Enregistrer » avec une étoile `*` tant qu'une modification est en attente, « 💾 Enregistré » sinon.
2. Le catalogue entier est réécrit sur le serveur (`LIB_composants.csv`, séparateur `;`, UTF-8).
3. Pour obtenir une copie, « 📥 Exporter CSV » télécharge `LIB_composants.csv` dans le navigateur.
4. Fermer la page avec une modification non enregistrée déclenche l'avertissement du navigateur.

Lancée par WEB·SUITE, la page ne propose plus l'export CSV : « Enregistrer » écrit dans `PROJETS/LIB_CAO` puis envoie sur GitHub (bouton « 💾 Enregistrer (LIB + GitHub) »). Les fichiers d'empreinte, de symbole et de modèle sont envoyés de la même façon à chaque écriture, groupés en un seul envoi.

### Je veux créer ou modifier une empreinte PCB

1. Créer : « 📐 Nouvelle empreinte » (barre du haut) ou « ➕ Nouvelle empreinte » (onglet « 📐 Empreintes PCB »). Modifier : double-clic sur la vignette d'une empreinte, sur le bouton ✏️ de la vignette, sur l'aperçu « EMPREINTE PCB » de l'inspecteur, ou sur une ligne du catalogue qui a une empreinte.
2. Dans l'onglet « Général » de l'éditeur, renseigner le nom, le boîtier, le style, le pas, le nombre de broches, la description et le « Corps sérigraphie (mm) » ; « ⊡ Calculer d'après les pastilles » calcule le corps avec 0,4 mm de marge.
3. Dans « Pastilles / Broches », ajouter (« ➕ Ajouter pastille »), régler X, Y, W, H, forme, perçage et fente, ou glisser les pastilles sur le plan (outil « 🖐️ Déplacer pad », grille magnétique réglable).
4. Dans « 📏 Traits / Lignes », poser la sérigraphie : « 📏 Tracer au pointeur » ou « ➕ Ajouter ligne ».
5. Saisir le nom du fichier en haut (`nom_fichier.json`) puis « 💾 Enregistrer ». Les contrôles de l'empreinte s'exécutent ; en cas d'erreur, la liste est montrée et la question « Enregistrer quand même ? » est posée. Le « Nom de l'empreinte » doit être le même que le nom du fichier sans `.json` : une empreinte neuve porte `NOUVEAU_BOITIER` pour `NOUVELLE_EMPREINTE.json`, ce qui déclenche la question tant qu'on n'a pas aligné les deux (le générateur aligne le nom du fichier d'une empreinte neuve).

### Je veux générer une empreinte depuis la datasheet (IPC-7351B)

1. Ouvrir l'éditeur d'empreinte (nouvelle empreinte), onglet « ⚡ Générateurs ».
2. Choisir la « Famille » (`CHIP`, `SOT`, `SOIC`, `TSSOP`, `MSOP`, `QFN`, `DFN`, `DIP`, `BARRETTE`) : les champs changent selon la famille.
3. Choisir la « Densité » : N nominale, M large, L serrée.
4. Saisir les cotes de la datasheet en mm : « 5,8 6,2 » pour un minimum et un maximum, « 3,9 x 4,9 » pour largeur × longueur. Un champ vide prend la cote JEDEC courante pour SOT, SOIC, TSSOP, MSOP, DIP, BARRETTE et pour CHIP avec un code de puce, à vérifier sur la datasheet ; en revanche CHIP sans code, SOIC / TSSOP / MSOP sans nombre de broches, QFN et DFN (broches, pas, corps, longueur de plot, largeur de plot) refusent un champ vide.
5. Cliquer « Générer » : l'empreinte remplace le contenu de l'éditeur, avec les cotes Z, G, X calculées et les remarques. Rien n'est écrit dans la LIB avant « 💾 Enregistrer ».

### Je veux poser des trous non métallisés, régler le masque, la pâte ou la forme par couche

1. Dans l'éditeur d'empreinte, cliquer « ⊕ Trou » puis cliquer le plan : un trou est posé sur la grille, au diamètre du dernier trou (3,2 mm pour le premier). X, Y, Ø, L (trou oblong) et Rot se règlent dans la table « Trous non métallisés » de l'onglet « Pastilles / Broches ».
2. Pour supprimer : bouton ✕ de la ligne, ou sélectionner le trou sur le plan et presser Suppr ou Retour arrière.
3. Cliquer une pastille (plan ou table) : sa fiche s'affiche sous la table. Y régler « Liaison à la zone de son net », « Masque (vernis) » et « Pâte à braser » ; pour une pastille traversante, la forme sur les « Couches internes » et le « Dessous ».

### Je veux créer ou modifier un symbole

1. « ⚡ Nouveau symbole » ou « ➕ Nouveau symbole » pour créer ; double-clic sur une vignette, ✏️, ou sur l'aperçu « SYMBOLE SCHÉMA » de l'inspecteur pour modifier.
2. « Général » : ID Symbole, Nom du symbole, Préfixe de référence, Catégorie, Valeur par défaut, Boîtier par défaut.
3. « Pastilles / Broches » (intitulé de l'onglet, qui devient une table « Broches » pour un symbole) : numéro, X, Y de chaque broche ; ou glisser les broches avec « 🖐️ Déplacer broche ».
4. « ⚡ Générateurs » : « Générer Symbole CI » pose un circuit intégré symétrique (nombre de broches, espacement, largeur du corps, longueur de broche).
5. Enregistrer.

### Je veux saisir le brochage d'une référence

1. Sélectionner la ligne du catalogue ; dans l'inspecteur, champ « Brochage » (symbole → empreinte).
2. Saisir `NOM=patte` séparés par des virgules, par exemple `OUT=1,IN-=2,IN+=3,V-=4,V+=8`. L'aperçu sous le champ montre le résultat ou les erreurs (cadre rouge si la saisie est illisible).
3. Valider par Entrée ou en quittant le champ : une saisie illisible n'est pas reportée dans le catalogue. Un champ vide est permis (la broche n du symbole va sur la patte n).
4. « 💾 Enregistrer ». La colonne `Brochage` est ajoutée au catalogue si elle n'existe pas encore.

Syntaxe complète : voir la section [Brochage](#brochage-colonne-brochage).

### Je veux lier un modèle SPICE ou un Touchstone à une référence

1. Sélectionner la ligne du catalogue, carte « MODÈLES DE SIMULATION » de l'inspecteur.
2. Cliquer « 📎 Lier un fichier… » et choisir un fichier : `.sub`, `.mod`, `.cir`, `.lib`, `.sp`, `.spi`, `.spice`, ou un Touchstone `.s1p` à `.s9p`.
3. Un modèle SPICE est rangé tel quel. Un Touchstone ouvre un formulaire : pour chaque « Port k » du fichier, la patte de l'empreinte (son numéro, ou le nom d'une broche du brochage), et la « Masse », la patte à laquelle les ports se rapportent (vide : la masse de la carte). Le formulaire est prérempli : d'après les lignes `! broches :` / `! masse :` déjà présentes dans le fichier, sinon ports 1 à N si la référence a N pattes, et masse = la broche GND / VSS / AGND / PGND / EP du brochage quand le fichier a moins de ports que la référence n'a de pattes.
4. Cliquer « Ranger dans la LIB et lier ». Le fichier est écrit dans `lib_simulation`, ses lignes `! broches :` et `! masse :` sont ajoutées pour le Touchstone, et son chemin `lib/simulation/<nom>` est ajouté à la case « Modèle Simulation » de la référence.
5. Cliquer « 💾 Enregistrer » : le fichier est déjà écrit dans la LIB, mais la liaison dans le catalogue reste en mémoire jusqu'à l'enregistrement.

Détail du calcul qui lit ces fichiers : [guide de la simulation EM](../simulation-em.md) et chapitre [Simulation RF et EM](10-simulation-rf-em.md).

### Je veux déclarer les états d'un commutateur

1. Lier plusieurs fichiers à la même référence, un par état (par exemple `..._J1-J2_...s3p` et `..._J1-J3_...s3p`), en répétant « 📎 Lier un fichier… ».
2. La case « Modèle Simulation » porte alors les chemins séparés par une barre verticale. Dans la liste, le premier est marqué « par défaut » ; la simulation RF le prend d'office et propose les autres, composant par composant.
3. Pour retirer un état : ✕ à droite de son nom (« Délier », le fichier reste dans la LIB). Cliquer le nom affiche les 60 premières lignes du fichier.

Le tableau du catalogue affiche « N modèles » pour une case à plusieurs fichiers ; elle ne se modifie alors que dans l'inspecteur.

### Je veux changer de dossier de bibliothèque

1. Sur l'accueil, bloc « Bibliothèque centrale (LIB) » : saisir le chemin du dossier, ou « 📁 Parcourir… ».
2. Cliquer « Appliquer ce dossier ». Cocher « Copier les composants et empreintes par défaut si le dossier est vide » pour initialiser un dossier neuf (copie faite si le dossier n'existe pas ou n'a pas de `LIB_composants.csv`). « Par défaut » revient au dossier du dépôt.
3. Autre voie : lancer le serveur avec `--lib DOSSIER` (valable pour ce lancement seulement, sans mémorisation).

Le choix est mémorisé dans `config_lib.json`, à la racine de l'outil. Lancée par WEB·SUITE, la LIB est `PROJETS/LIB_CAO` et ne se déplace pas. Voir [Bibliothèque centrale](#bibliothèque-centrale-dossier-réseau-lecture-seule).

### Je veux faire figurer un modèle 3D (STEP) sur une référence

1. Déposer le fichier STEP dans le dossier `Models` de la LIB (aucun bouton de Gestion LIB ne le fait).
2. Lancer `node python/maillages_3d.mjs <dossier LIB>` : chaque STEP devient un maillage léger dans `Models/maillages`, et la colonne `Position 3D` est calculée pour chaque ligne qui a un `Modèle 3D`.
3. Renseigner la colonne `Modèle 3D` (`Models/<fichier>`) : affichée dans le tableau par « ⚙️ Colonnes », éditable dans le fichier CSV seulement.
4. Un modèle mal posé se corrige à la main dans `Position 3D` (`haut=Y+ rot=90 x=0 y=0 z=0.4`). Le script ne remplace jamais une position écrite.

Le rendu est celui de l'animation 3D de l'Éditeur PCB : voir [Éditeur PCB : fabrication](04-editeur-pcb-fabrication.md).

### Je veux ouvrir directement une référence ou un fichier depuis un autre outil

Les boutons « 📚 Ouvrir dans Gestion LIB ↗ » (fiche d'un composant du schéma), « 📐 Ouvrir dans Gestion LIB ↗ » (fiche d'une empreinte du PCB) et « ⚡ Ajouter à Gestion LIB » (Recherche de composants) ouvrent Gestion LIB dans un nouvel onglet avec un paramètre d'adresse (voir [Paramètres d'adresse](#paramètres-dadresse)).

### Je veux poser un composant depuis l'explorateur de bibliothèque

1. Dans l'Éditeur Schématique, bouton « Composant… » ou touche A ; dans l'Éditeur PCB, bouton « Empreinte… » ou touche A.
2. Chercher, filtrer, cliquer une carte : un dessin générique du symbole et de l'empreinte, et les caractéristiques de la ligne, s'affichent à droite.
3. Double-clic sur la carte, ou le bouton « ✔ Placer sur le schéma » / « ✔ Placer sur la carte », ou Entrée (hors champ de saisie). Au schéma, le composant est alors prêt à poser : cliquer sur la feuille (R pour pivoter, Maj+clic pour en poser plusieurs). Au PCB, l'empreinte est posée aussitôt, sous le pointeur ou au centre de la carte.

Référence : [Explorateur de bibliothèque](#explorateur-de-bibliothèque-commun-aux-éditeurs).

### Je veux que Claude crée ou corrige un composant

1. Laisser Gestion LIB ouverte (le pilotage passe par la page).
2. Demander à Claude : créer une référence avec son empreinte (générée en IPC-7351B, convertie depuis un `.kicad_mod`, ou existante), corriger des cases d'une référence, lier un modèle de simulation.
3. Une carte apparaît dans le panneau « Claude » : elle montre ce qui sera écrit. Rien n'est écrit dans la LIB avant le clic de l'utilisateur, même si l'interrupteur « Appliquer directement » de l'onglet est allumé.

Détail : chapitre [Claude et le MCP](11-claude-mcp.md) et section [Pilotage par Claude](#pilotage-par-claude).

### Je veux relier les modèles Murata ou normaliser les chemins du catalogue

Scripts en ligne de commande, hors de la page : voir [Scripts de maintenance](#scripts-de-maintenance).

## Référence

### Barre du haut

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| ⌂ Accueil | — | Retour au tableau de bord principal | — |
| Éditeur schématique, Éditeur PCB, Recherche composants, Visionneuse IPC-2581 | — | Liens vers les autres outils | Ouverts dans le même onglet |
| 📐 Nouvelle empreinte | — | Ouvre l'éditeur d'empreinte sur une empreinte neuve (2 pastilles, nom `NOUVELLE_EMPREINTE.json`) | Rien n'est écrit avant l'enregistrement |
| ⚡ Nouveau symbole | — | Ouvre l'éditeur de symbole sur un symbole neuf (4 broches, nom `NOUVEAU_SYMBOLE.json`) | Idem |
| ➕ Nouveau composant | — | Ouvre la fenêtre « Ajouter un composant à la bibliothèque » | Pas de contrôle de doublon de `Part Name` |
| ⚡ Importer JLCPCB / LCSC | — | Ouvre la fenêtre d'import | Demande le serveur et l'accès à pcbparts |
| 🔄 Auto-associer | — | Remplit les cases vides Empreinte PCB, Empreinte Schématique, Modèle Simulation et le Brochage certain, pour tout le catalogue ; toast « N association(s) automatique(s) générée(s) » ou « Tous les composants sont déjà associés » | Ne remplace jamais une case remplie ; n'associe une empreinte que si le fichier existe dans la LIB ; un préfixe inconnu reçoit `ic.json` |
| 📥 Exporter CSV | — | Télécharge `LIB_composants.csv` (`;`, CRLF, UTF-8 sans BOM) | Masqué quand la page est lancée par WEB·SUITE |
| 💾 Enregistrer | Ctrl+S | Écrit le catalogue sur le serveur | Sans modification : « Aucune modification du catalogue à enregistrer ». Si le catalogue a changé ailleurs (autre onglet, carte de Claude), une confirmation prévient que l'enregistrement effacerait ces changements |

### Onglets et bandeau de statistiques

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| 📋 Catalogue Composants (CSV) | — | Vue du catalogue et inspecteur ; la pastille donne le nombre de lignes | — |
| 📐 Empreintes PCB | — | Galerie des fichiers de `lib_empreinte_pcb` ; la pastille donne leur nombre | Inspecteur replié |
| ⚡ Symboles Schématiques | — | Galerie des fichiers de `lib_empreinte_schematique` | Inspecteur replié |
| 🔬 Modèles Simulation | — | Liste des fichiers de `lib_simulation`, chacun avec son texte complet | Inspecteur replié ; lecture seule |
| Total composants | — | Nombre de lignes du catalogue | — |
| Empreintes PCB associées / Symboles schéma associés / Modèles simu associés | — | Nombre et pourcentage de lignes dont la case est remplie | Ne vérifie pas que le fichier existe |
| « N affiché(s) sur M » | — | Lignes retenues par les filtres, sur le total | Seules 250 lignes sont dessinées |

### Onglet Catalogue : filtres, tableau, sélecteurs

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Rechercher par référence, description, valeur, boîtier, fabricant... | — | Filtre en direct, sans casse, sur les colonnes `Part Name`, `Description`, `Value`, `Package type`, `Manufacturer`, `Part Number`, `manufacturer part Number`, `vendor reference`, `Source alternative`, `2nd source P/N`, `3nd source P/N`, `4nd source P/N`, `Empreinte PCB`, `Empreinte Schématique` | Les autres colonnes ne sont pas cherchées |
| Tous les préfixes (R, C, U...) | — | Un préfixe de repère à la fois, avec son nombre de lignes | La liste est refaite au chargement et à l'ajout d'un composant |
| Tous les statuts d'association | — | « Associés à 100% (PCB + Schéma) », « Empreinte PCB manquante », « Symbole schéma manquant », « Modèle simulation manquant », « Non associés (partiels ou vides) » | — |
| ⚙️ Colonnes (n) | — | Ouvre le choix des colonnes | Neuf colonnes par défaut |
| En-tête de colonne | — | Tri par la colonne ; un second clic inverse ▲ / ▼ | Tri alphabétique français, nombres compris dans le texte ; départ : `Part Name` croissant |
| Ligne du tableau (clic) | — | Sélectionne la référence, remplit l'inspecteur (en téléphone portrait, la fiche passe devant la liste) | — |
| Ligne du tableau (double-clic) | — | Ouvre l'éditeur de l'empreinte PCB liée, sinon du symbole lié | Aucun effet sans empreinte ni symbole |
| Liste « Empreinte PCB » / « Empreinte Schématique » / « Modèle Simulation » | — | Choisit le fichier associé (liste chargée à l'ouverture) ; « -- Aucune -- » / « -- Aucun -- » vide la case | Une case « Modèle Simulation » à plusieurs fichiers devient l'étiquette « N modèles » (infobulle : la liste) |
| Autres colonnes | — | Affichage seul (les valeurs longues sont tronquées, infobulle complète) | Pas d'édition dans le tableau : le CSV, l'import ou Claude (lib_composant_modifier) |

### Inspecteur de la référence

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| ‹ Liste | — | Revient à la liste | Visible en téléphone portrait seulement |
| Fiche : Boîtier, Valeur, Fabricant, MPN | — | Rappel de `Package type`, `Value`, `Manufacturer`, `manufacturer part Number` | Lecture seule |
| Brochage (symbole → empreinte) | — | Saisie de la colonne `Brochage`, vérifiée à la frappe ; l'aperçu liste `BROCHE→patte` par partie, ou les erreurs | Valeur reportée au catalogue au « change » (Entrée, perte de focus), si lisible ; à enregistrer |
| SYMBOLE SCHÉMA (aperçu) / ⊡ | Double-clic | ⊡ recadre ; double-clic ouvre l'éditeur du symbole | Aucun effet sur « Non associé » |
| EMPREINTE PCB (aperçu) / ⊡ | Double-clic | ⊡ recadre ; double-clic ouvre l'éditeur de l'empreinte | Aucun effet sur « Non associée » |
| Aperçus : glisser, molette | — | Déplace et zoome l'aperçu | Zoom borné (empreinte 2 à 200, symbole 0,4 à 10) |
| MODÈLES DE SIMULATION : nom d'un modèle | — | Affiche les 60 premières lignes du fichier (le premier modèle s'affiche d'office) | « fichier introuvable dans la LIB » si le chemin est faux |
| par défaut | — | Marque le premier modèle quand il y en a plusieurs | — |
| ✕ (Délier) | — | Retire le modèle de la case ; le fichier reste dans la LIB | À enregistrer |
| 📎 Lier un fichier… | — | Choisit un fichier `.sub .mod .cir .lib .sp .spi .spice .s1p … .s9p` | Nom nettoyé (caractères hors `A-Z a-z 0-9 _ . + -` remplacés par `_`) ; un fichier de même nom demande « Le remplacer ? » |
| Port k / Masse | — | Patte de chaque port d'un Touchstone, et patte de masse | Numéro de patte, ou nom d'une broche du brochage qui va sur une seule patte ; patte dans 1 à N si le nombre de pattes est connu ; pas de patte donnée deux fois ; fichier sans ligne `#` refusé |
| Annuler / Ranger dans la LIB et lier | — | Ferme le formulaire / écrit le fichier avec ses lignes `! broches :` et `! masse :`, puis lie | Le fichier est écrit tout de suite ; la liaison attend « Enregistrer » |

### Onglets Empreintes PCB, Symboles Schématiques, Modèles Simulation

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Filtrer les empreintes... / Filtrer les symboles... / Filtrer les modèles .sub... | — | Filtre sur le nom de fichier ; le compteur indique « N empreinte(s) / symbole(s) / modèle(s) » | Sans casse ; revient à la page 1 |
| ◀ ▶ et numéros de page | — | Pagination (24 vignettes par page, 20 modèles par page) | Absente s'il n'y a qu'une page |
| ➕ Nouvelle empreinte / ➕ Nouveau symbole | — | Ouvre l'éditeur sur un fichier neuf | — |
| Vignette | Double-clic | Ouvre l'éditeur du fichier | — |
| ✏️ | — | Ouvre l'éditeur du fichier | — |
| Carte d'un modèle | — | Affiche le texte du fichier | Lecture seule ; l'étiquette « SPICE Subcircuit (.sub) » est la même pour tous les fichiers, Touchstone compris |

### Fenêtre « Ajouter un composant à la bibliothèque »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Part Name *, Préfixe (Ref Des) *, Boîtier (Package), Valeur, Fabricant, Description | — | Champs de la nouvelle ligne (`Part Name`, `Reference designator Prefix`, `Package type`, `Value`, `Manufacturer`, `Description`) | `Part Name` obligatoire (alerte « Le nom du composant (Part Name) est obligatoire. » sinon) ; préfixe en majuscules, 5 caractères au plus, `U` par défaut malgré l'astérisque |
| Annuler, ✕ | Échap | Ferme sans rien ajouter | — |
| Ajouter et auto-associer | — | Ajoute la ligne en tête, applique l'association automatique à elle seule, la sélectionne | À enregistrer |

### Fenêtre « Colonnes du catalogue composants »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Filtrer les colonnes... | — | Réduit la liste des cases | — |
| Tout cocher / Par défaut / Tout décocher | — | Coche toutes les cases visibles / les neuf colonnes d'origine / aucune | — |
| Appliquer (n) | — | Applique le choix, le mémorise dans le navigateur | Au moins une colonne |
| Annuler, ✕ | Échap | Ferme sans changement | — |

Colonnes par défaut : `Part Name`, `Reference designator Prefix`, `Package type`, `Value`, `Description`, `Manufacturer`, `Empreinte PCB`, `Empreinte Schématique`, `Modèle Simulation`.

### Fenêtre « Importer un composant JLCPCB / LCSC »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Champ de recherche | Entrée | Code LCSC (`C` + chiffres) : fiche directe ; sinon recherche texte | 25 résultats au plus ; passe par le serveur (outils `jlc_search`, `jlc_get_part`, `jlc_get_pinout` de pcbparts) |
| Rechercher | — | Lance la recherche | — |
| Carte de résultat | Clic | Modèle, fabricant, description, code LCSC, boîtier, prix (en $), pastille `Basic` ou `Extended`, stock ou `Rupture` ; ouvre la fiche | — |
| ← Retour aux résultats | — | Revient à la liste | — |
| Fiche : Part Name, Préfixe Schématique, Valeur Électrique, Classe du composant, Boîtier (Package), Empreinte PCB liée, Symbole Schéma lié, Type de composant (Active / Passive) | — | Champs principaux, recopiés dans la table des colonnes | Valeurs déduites de la fiche JLCPCB : à contrôler |
| 📋 Voir et ajuster l'intégralité des 39 colonnes du CSV | — | Table numérotée de toutes les colonnes, chacune modifiable | — |
| Annuler, ✕ | — | Ferme la fenêtre | Pas de raccourci Échap pour cette fenêtre |
| 📥 Confirmer et Enregistrer dans la Bibliothèque (39 colonnes) | — | Écrit un symbole généré nommé d'après la pièce (si le brochage est connu ; un symbole existant n'est jamais écrasé), ajoute la ligne, enregistre le catalogue entier, diffuse aux autres outils ouverts | Pas de contrôle de doublon ; l'empreinte nommée n'est pas créée |

Remplissage des colonnes par l'import : `Part Type` = `General` ; `Vendor` = `JLCPCB` ; `vendor reference` = code LCSC ; `Part Number` et `manufacturer part Number` = modèle ; `Number Of pins` (du brochage trouvé, vide sans brochage), `Value`, `Par class`, `Reference designator Prefix`, `Device type`, `Package type`, `Empreinte PCB`, `Empreinte Schématique` déduits de la catégorie, de la description et du boîtier ; tolérance, puissance, fréquence, tensions, courant, températures, dimensions, pas et type de montage d'après les caractéristiques du fabricant quand elles existent ; `Modèle Simulation` vide.

### Éditeur d'empreintes et de symboles : en-tête

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Nom du fichier (`nom_fichier.json`) | — | Nom sous lequel le fichier est écrit ; `.json` ajouté s'il manque | Nom obligatoire (alerte sinon) |
| ↩ (en-tête) / ↩ Annuler (barre du plan) | Ctrl+Z | Annule la dernière action | 50 niveaux ; la vue Code JSON garde l'annulation native du navigateur |
| ↪ (en-tête) / ↪ Rétablir | Ctrl+Y ou Ctrl+Maj+Z | Rétablit | — |
| 🎨 Visuel & Paramètres | — | Vue plan + volet de réglages | — |
| 📝 Code JSON | — | Vue du texte JSON | Voir plus bas |
| 💾 Enregistrer / 💾 Enregistrer le fichier | Ctrl+S | Contrôle l'empreinte (PCB), puis écrit le fichier dans la LIB, ferme l'éditeur, rafraîchit la galerie, les statistiques et l'inspecteur | Voir « Contrôles à l'enregistrement » |
| ✕ Fermer / Fermer | Échap | Ferme l'éditeur | Échap annule d'abord le trait en cours, puis la sélection ; l'appui suivant ferme. Sans question : les modifications non enregistrées sont perdues. Échap ferme aussi depuis un champ ou la vue JSON |

### Éditeur : barre du plan

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| ✋ Vue | — | Glisser déplace la vue | — |
| 🖐️ Déplacer pad / 🖐️ Déplacer broche | — | Outil de départ : glisser une pastille, une broche ou un trou, avec magnétisme à la grille ; X et Y s'affichent sous le plan et dans la table | Glisser dans le vide déplace la vue |
| 📏 Tracer trait | — | Un clic pour le départ, un clic pour l'arrivée (ou glisser-relâcher au-delà de 8 pixels) | Clic droit annule le trait en cours ; trait de sérigraphie 0,15 mm (PCB), trait de 2,5 px (symbole) |
| ⊕ Trou | — | Pose un trou non métallisé au clic | Empreintes PCB seulement : sans effet sur un symbole |
| Pas de grille | — | PCB : 0.05, 0.1, 0.5, 1.0 mm ; symbole : 5, 10, 20 px (20 px = 1 mm) | Remis à 0.1 mm / 10 px à chaque ouverture |
| ⊡ Centrer | — | Recadre sur le contenu | — |
| ➕ / ➖ | Molette | Zoom ×1,25 / ÷1,25 ; la molette zoome par 1,15 | Zoom borné (empreinte 2 à 200, symbole 0,4 à 10) |
| Clic molette ou clic droit | — | Déplace la vue (hors tracé en cours) | — |
| Suppr ou Retour arrière | Suppr | Efface le trou sélectionné | Hors champ de saisie ; ne supprime pas une pastille (utiliser ✕ de la table) |

### Éditeur : volet « Général »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| PCB : Nom de l'empreinte, Boîtier (Package), Style, Pitch / Pas (mm), Nombre de broches, Description | — | Champs `name`, `pkg`, `style`, `pitch`, `pins`, `description` | Style : `chip`, `row`, `dip`, `sop`, `quad`, `bga` ; `name` doit égaler le nom du fichier sans `.json` |
| PCB : Corps sérigraphie (mm) X1, Y1, X2, Y2 | — | Rectangle du corps | Un champ vide ou nul retombe sur ±1 |
| ⊡ Calculer d'après les pastilles | — | Corps = enveloppe des pastilles + 0,4 mm | Nécessite au moins une pastille |
| Symbole : ID Symbole, Nom du symbole, Préfixe de référence, Catégorie, Valeur par défaut, Boîtier par défaut | — | Champs `id`, `name`, `prefix`, `category`, `defaultValue`, `defaultPkg` | Préfixe : 5 caractères au plus ; `id` doit égaler le nom du fichier sans `.json` (contrôle de symbole côté MCP) |

### Éditeur : volet « Pastilles / Broches »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| ➕ Ajouter pastille | — | Pastille 1,0 × 1,2 mm, rectangulaire, en (0, 0) ; met `pins` à jour | — |
| Table des pastilles : #, X, Y, W, H, Forme (Rect / Rond / Ovale), Perçage, Fente | — | Édition en place ; cliquer une ligne la sélectionne sur le plan | Pas de colonne de rotation (clé `rot` : dans le code JSON). Fente : longueur hors tout d'un perçage oblong, 0 = rond |
| ✕ (ligne) | — | Supprime la pastille | — |
| Fiche de la pastille : Liaison à la zone de son net | — | Celle de la zone, Bras thermiques, Directe (plot exposé), Aucune | Clé `connexion` |
| Fiche de la pastille : Masque (vernis) | — | Règle de la carte, Marge propre (mm), Recouverte de vernis | Marge bornée à ±5 mm ; positive : le vernis s'ouvre au-delà |
| Fiche de la pastille : Pâte à braser | — | Règle de la carte, Réduction propre (mm), Sans pâte | Absente pour une pastille traversante (perçage > 0) |
| Fiche de la pastille : Couches internes, Dessous | — | « Même forme », « Autre forme » (forme, W, H), « Aucune pastille » (internes seulement) | Pastilles traversantes seulement ; W et H au moins 0,05 mm ; formes : Rond, Rect. arrondi, Rect. angles droits, Ovale, Chanfreiné |
| ➕ Ajouter broche | — | Symbole : broche suivante en (−40, 10 × n) | — |
| Table des broches : #, X, Y ; ✕ | — | Édition en place, suppression | — |
| Trous non métallisés : X, Y, Ø, L, Rot ; ⊕ Poser un trou ; ✕ | — | X, Y en mm ; Ø de 0,4 à 30 mm ; L : longueur d'un trou oblong (0 = rond) ; Rot : angle en degrés | Empreintes seulement |

### Éditeur : volet « Traits / Lignes »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| 📏 Tracer au pointeur | — | Active l'outil trait | — |
| ➕ Ajouter ligne | — | Ajoute un trait par défaut (PCB : de (−1, −1) à (1, −1), 0,15 mm ; symbole : de (−20, −20) à (20, −20), 2,5) | — |
| Table X1, Y1, X2, Y2, Ép. ; ✕ | — | Édition en place, suppression | Symbole : seules les primitives `line` sont listées ; rectangle, cercle, arc, polygone et texte : dans le code JSON |
| Couleur (rappel) | — | `#f3f4f6` pour la sérigraphie, `#cfe6fb` pour un trait de symbole | Information seule |

### Éditeur : volet « ⚡ Générateurs »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Famille | — | `CHIP`, `SOT`, `SOIC`, `TSSOP`, `MSOP`, `QFN`, `DFN`, `DIP`, `BARRETTE` ; recompose les champs | — |
| Densité | — | N — nominale, M — large, L — serrée | Nom suffixé de `-M` ou `-L` hors densité N |
| Nom (facultatif) | — | Nom de l'empreinte ; vide : nom calculé | Pour une empreinte neuve, le nom de fichier de l'en-tête suit |
| Champs de la famille | — | Cotes en mm : `min max`, `l x L`, nombre, entier, ou choix (CHIP : code `0201`, `0402`, `0603`, `0805`, `1206`, `1210`, `2010`, `2512` ; SOT : variante `SOT-23-3`, `SOT-23-5`, `SOT-23-6`, `SOT-223`) | Séparateurs : espace, `/`, `x`, `×`, `;` ; virgule décimale permise ; champ vide : cote JEDEC par défaut (sauf champs obligatoires, voir le guide), à vérifier |
| Familles | — | CHIP : code ou longueur / largeur / terminaison. SOT : variante, empattement, pied, largeur, pas, languette (SOT-223), corps. SOIC (pas 1,27), TSSOP et MSOP (pas 0,65) : broches (paires, 4 à 200), pas, empattement, pied, largeur, corps largeur × longueur. QFN (multiple de 4, 8 au moins) et DFN (pair) : broches, pas, corps, longueur du corps, longueur et largeur de plot, pastille thermique (nom suffixé `-EP`). DIP : broches paires (4 à 64), pas 2,54, écart des rangées 7,62, Ø de la patte 0,6. BARRETTE : 1 ou 2 rangées, 1 à 100 broches, pas 2,54, Ø 0,64 × √2 | Pastilles refusées si moins de 0,1 mm les sépare (0,2 mm en traversant) ; empreinte nommée `<famille>-<broches>` (SOIC, TSSOP, MSOP), `DIP-n`, `HEADER-pas-rangées x broches` |
| Générer | — | Remplace le contenu de l'éditeur, affiche erreurs (✗), remarques (•) et « IPC-7351B : Z … · G … · X … mm » | Historique d'annulation conservé ; rien d'écrit avant l'enregistrement |
| Symbole : Nb broches total, Espacement broches (px), Largeur corps (px), Longueur broche (px) | — | Paramètres du circuit intégré symétrique (par défaut 8, 20, 50, 15) | Un nombre impair de broches donne un côté gauche plus long d'une broche (7 : 4 à gauche, 3 à droite) |
| Générer Symbole CI | — | Remplace broches et primitives (corps, repère de broche 1, texte `IC`), puis ouvre « Pastilles / Broches » | Annulable |

Règles du calcul IPC-7351B : voir les commentaires de `commun/composants-lib.js` ; marges de fabrication F = 0,10 mm et de placement P = 0,05 mm, soudure selon la famille et la densité. Pas d'arrondi au 0,05 de la norme (cotes rendues au millième). Les valeurs de soudure des puces sont celles relayées par le générateur de KiCad ; la norme elle-même n'a pas été lue.

### Éditeur : vue « 📝 Code JSON »

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Zone de texte | — | Toute modification qui est du JSON valide met le modèle et le plan à jour | Erreur affichée : « Syntaxe JSON : … » ; le modèle garde la dernière version valide |
| Formatage auto | — | Réindente le JSON | Sans effet si le JSON est invalide |
| Enregistrer en vue JSON | Ctrl+S | Relit la zone de texte avant d'écrire | Alerte « Erreur dans le code JSON » et arrêt si illisible |

### Éditeur : contrôles à l'enregistrement

À l'enregistrement d'une empreinte, `commun/composants-lib.js` contrôle le fichier ; les erreurs sont listées (huit au plus) et l'utilisateur décide d'enregistrer quand même. Un symbole n'est pas contrôlé à l'enregistrement dans la page. Si le nom existe déjà dans la LIB (fichier neuf, ou nom changé), la question « existe déjà dans la LIB. Le remplacer ? » est posée, pour une empreinte comme pour un symbole.

| Contrôle | Refus (erreur) ou remarque |
|---|---|
| `format` | Doit valoir `pcbfp-1` |
| Clés connues | Seules `format`, `name`, `pkg`, `pins`, `style`, `pitch`, `span`, `pads`, `body`, `holes`, `description` ; toute autre est une erreur |
| `name` | 1 à 60 caractères parmi `A-Z a-z 0-9 _ . + -`, égal au nom du fichier sans `.json` |
| `style` | Un des six styles |
| Autres champs | `pkg` 80 caractères au plus, `description` 2000 au plus, `pitch` et `span` de 0 à 1000 mm, `rot` en degrés, `poly` avec `pts` ; le recouvrement n'est cherché que si rien d'autre n'est en erreur |
| Pastilles | 1 à 4096 ; `n` entier de 1 à 4096 ; x et y à ±100 mm ; largeur et hauteur de 0,05 à 200 mm ; forme parmi `rect`, `sharp`, `oval`, `circ`, `chamfer`, `poly` (3 points au moins) |
| Perçage | Plus petit que la pastille ; couronne de cuivre de 0,1 mm au moins |
| Numérotation | Pastille 1 présente ; numéros sans trou ; `pins` égal au nombre de numéros |
| Recouvrement | Deux pastilles de numéros différents qui se recouvrent : erreur |
| Trous | x, y à ±100 mm, Ø de 0,4 à 30 mm |
| Corps | x1 < x2 et y1 < y2 ; absent : remarque |
| Remarques | Numéros en double (pastille fractionnée ou thermique), pastilles CMS qui dépassent du corps |

### Brochage (colonne « Brochage »)

Le brochage est porté par la référence, pas par le symbole : un même symbole d'amplificateur sert à des références de boîtiers différents, et c'est la datasheet de la référence qui dit où tombent ses broches. Sans brochage, la broche n du symbole va sur la patte n.

```
OUT=1,IN-=2,IN+=3,V-=4,V+=8                         une seule partie
A:OUT=1,IN-=2,IN+=3|B:OUT=7,IN-=6,IN+=5|*:V-=4,V+=8  plusieurs parties ; « * » vaut pour toutes
...,NC=5/6/7                                         pattes laissées libres exprès
IN=3,OUT=2/4,GND=1                                   une broche sur plusieurs pattes
```

| Règle | Détail |
|---|---|
| Séparateurs | Virgule entre broches ; barre verticale entre parties ; jamais de point-virgule (séparateur du CSV) |
| Nom à gauche du « = » | Nom de la broche du symbole (`IN-`, `V+`, `B`, `C`, `E`, `G`…) ou son numéro ; comparé sans casse ni espaces, le signe moins typographique vaut le tiret |
| Patte à droite | Numéro ou nom d'une patte de l'empreinte (`A1`) : 1 à 8 caractères alphanumériques ; jusqu'à 8 pattes par broche, séparées par `/` |
| Partie | Nom de 1 à 4 caractères alphanumériques avant les deux-points ; `*` : entrées communes à toutes les parties |
| Erreurs signalées | `=` manquant, nom de broche vide, nom de partie illisible, patte illisible, broche donnée deux fois avec deux pattes différentes, patte prise par deux broches d'une même partie, aucune broche `NOM=patte` |
| Valeurs de remplissage | Vide, `xx`, `-`, `none`, `n/a` : lus comme « pas de brochage » |

Le contrôle complet face à une empreinte et à un symbole (`verifierBrochage` de `commun/composants-lib.js`) est celui de l'outil MCP `lib_brochage_verifier` et des cartes de création : chaque patte doit exister dans l'empreinte, chaque broche dans le symbole ; une pastille sans broche ni `NC`, ou une broche du symbole sans patte, est une remarque. Dans l'inspecteur, seule la lecture de la syntaxe est faite à la saisie. Le schéma applique le brochage aux composants : voir [Éditeur Schématique](02-editeur-schematique.md). Code de lecture : [commun/brochage.js](../../commun/brochage.js).

### Colonnes du catalogue

Le catalogue est un CSV séparé par `;`, relu en UTF-8 (avec repli Latin-1 / cp1252) et réécrit en UTF-8. La LIB partagée compte 42 colonnes : les 39 colonnes normalisées de l'import, puis `Brochage`, `Modèle 3D` et `Position 3D`.

| Colonne | Rôle établi dans le code |
|---|---|
| `Part Name` | Nom de la référence ; désigne la ligne (clé de recherche, de liaison et de pilotage) |
| `Part Type`, `Par class`, `Device type` | Type, classe (`Resistor`, `Capacitor`, `Diode`…), `Active` ou `Passive` ; remplis par l'import |
| `Description`, `Value`, `Reference designator Prefix`, `Number Of pins` | Description, valeur, préfixe de repère (1 à 4 lettres), nombre de pattes |
| `Maximun Height`, `Standoof Height` | Hauteurs ; l'import remplit la première depuis la hauteur assise |
| `Part Number`, `Manufacturer`, `manufacturer part Number`, `Vendor`, `vendor reference` | Références fabricant et fournisseur ; `vendor reference` reçoit le code LCSC de l'import |
| `Source alternative`, `2nd source P/N`, `2nd source Manufacturer`, `3nd source P/N`, `3nd source Manufacturer`, `4nd source P/N`, `4nd source Manufacturer` | Secondes sources, cherchées par la barre de recherche (les références) |
| `Dielectrique`, `tolerance`, `wattage`, `fréquency`, `PPM`, `Voltage Rating`, `current Rating`, `Maximum operating temperature`, `Minimum operating temperature` | Caractéristiques électriques ; remplies par l'import quand le fabricant les donne |
| `Package type`, `Dimenssions`, `terminal pitch`, `mounting type`, `gender` | Boîtier et mécanique |
| `Empreinte PCB`, `Empreinte Schématique`, `Modèle Simulation` | Fichiers associés, par chemin `lib/empreinte/<nom>.json`, `lib/symbole/<nom>.json`, `lib/simulation/<nom>` ; plusieurs modèles séparés par une barre verticale |
| `Brochage` | Voir section précédente |
| `Modèle 3D`, `Position 3D` | STEP de `Models` et sa pose (`haut=Y+ rot=0 x=0 y=0 z=0`) ; lus par l'animation 3D de l'Éditeur PCB |

Une cellule qui commence comme une formule de tableur (`=`, `@`, `+` ou `-` suivi d'une lettre) ou qui cache un caractère invisible est refusée par les contrôles de création de ligne (côté Claude) ; la saisie manuelle dans la page n'a pas ce contrôle.

### Explorateur de bibliothèque (commun aux éditeurs)

Fenêtre « Explorateur Visuel de Bibliothèque » (schéma) ou « Bibliothèque d'Empreintes PCB » (PCB), ouverte par `commun/explorateur-lib.js`. Elle lit le catalogue déjà chargé par l'éditeur, sinon `/api/lib/composants`. Ses vignettes et ses deux aperçus sont des dessins génériques déduits de la catégorie, du boîtier et de la description de la ligne, pas le contenu des fichiers d'empreinte et de symbole de la LIB. Gestion LIB elle-même ne s'en sert pas.

| Élément | Raccourci | Effet | Limites |
|---|---|---|---|
| Ouverture (schéma) | Bouton « Composant… », A | Mode schéma | Titre du bouton de validation : « ✔ Placer sur le schéma » |
| Ouverture (PCB) | Bouton « Empreinte… », A | Mode PCB ; le même explorateur sert à réaffecter l'empreinte d'un composant (« ✔ Affecter à REF ») | Titre : « ✔ Placer sur la carte » |
| Rechercher par référence, valeur, boîtier, MPN... | — | Filtre sur `Part Name`, `Value`, `Description`, boîtier ou empreinte, `Part Number`, `Manufacturer` | Bouton ✕ (Effacer) vide le champ |
| Liste des catégories | — | Toutes, Résistances (R), Condensateurs (C), Inductances (L), Diodes & LEDs (D), Transistors & FETs (Q), Circuits Intégrés (U/CI), Connecteurs (J/CON), Alimentation & Régul., Divers / Autres | Classement déduit du préfixe, du nom et de la description |
| Modèle SPICE, CMS / SMD, Traversant / THT | — | Cases de filtre | Détection par texte du boîtier et de la description |
| « N réf » | — | Nombre de références retenues | Seules les 120 premières cartes sont dessinées |
| Carte (clic) | — | Sélectionne et affiche, à droite, dessins génériques du symbole et de l'empreinte, et caractéristiques (Boîtier / Footprint, Valeur, Tension max, Courant max, Puissance, Fréquence, Modèle SPICE) | Première carte sélectionnée d'office si aucune ne l'était déjà |
| Carte (double-clic) / ✔ Placer … | Entrée (hors champ de saisie) | Ferme l'explorateur et passe la référence à l'éditeur : le schéma entre en mode pose (clic sur la feuille), le PCB pose l'empreinte aussitôt | Entrée est ignorée dans un champ de saisie |
| Annuler, ✕, clic sur le fond | Échap | Ferme sans rien poser | — |

### Pilotage par Claude

`gestion-lib/js/08-pilote-lib.js` branche sur la page les commandes du canal de pilotage. Le code métier est dans `commun/composants-lib.js` ; il n'y a pas de bouton correspondant dans la page, sauf l'aperçu et la carte.

| Commande MCP | Effet | Limites |
|---|---|---|
| `lib_empreinte_generer` | Famille et cotes de la datasheet vers une empreinte `pcbfp-1` (IPC-7351B) | Calcul seul, rien n'est écrit |
| `lib_empreinte_verifier` | Contrôle d'une empreinte `pcbfp-1` | Calcul seul |
| `lib_kicad_convertir` | `.kicad_mod` vers `pcbfp-1` : pastilles, trous non métallisés, contour F.Fab devenu corps | Texte de 200 Ko au plus, lu sans être exécuté ; pastilles personnalisées (`custom`) refusées ; tracés, textes, modèles 3D et arcs comptés dans les remarques mais non repris ; pastilles tournées d'un angle quelconque à vérifier |
| `lib_brochage_verifier` | Brochage face à l'empreinte (nommée ou donnée) et au symbole | Calcul seul |
| `lib_composant_creer` | Carte : symbole neuf éventuel, empreinte neuve éventuelle, puis ligne de catalogue ajoutée | Toujours au clic ; jamais d'écrasement d'un fichier ni d'une `Part Name` ; fichiers écrits retirés si le serveur refuse la ligne |
| `lib_composant_modifier` | Carte : remplace des cases d'une référence existante | Toujours au clic ; la `Part Name` ne change pas ; refus si la ligne a changé entre la carte et le clic ; empreinte neuve sous un nom neuf |
| `lib_simulation_lier` | Carte : range un modèle `.sNp` ou SPICE dans `lib_simulation` et l'ajoute à la case « Modèle Simulation » | Toujours au clic ; un fichier de même nom n'est repris que s'il est identique |

Pendant la carte, l'aperçu « EMPREINTE PCB » de l'inspecteur montre l'empreinte proposée (« Aperçu (carte de Claude) : nom »). D'autres outils du serveur (`lib_composants`, `lib_fichiers`, `lib_fichier_lire`, `lib_fichier_ecrire`, `lib_parasites`) lisent et écrivent la LIB sans passer par la page : voir [Claude et le MCP](11-claude-mcp.md).

### Bibliothèque centrale : dossier, réseau, lecture seule

| Élément | Effet | Limites |
|---|---|---|
| Dossier par défaut | `LIB/` à côté de `index.html` s'il existe, sinon `../PROJETS/LIB_CAO` | — |
| `--lib DIR` | Dossier de la bibliothèque pour ce lancement | Non mémorisé ; prime sur `config_lib.json` ; refuse un dossier absent |
| Bloc « Bibliothèque centrale (LIB) » de l'accueil | Chemin, « Appliquer ce dossier », « 📁 Parcourir… », « Par défaut », case « Copier les composants et empreintes par défaut si le dossier est vide » | Mémorisé dans `config_lib.json` ; racine de disque et URL refusées |
| Contenu d'une LIB | `LIB_composants.csv`, `lib_empreinte_pcb/`, `lib_empreinte_schematique/`, `lib_simulation/`, `Models/` (STEP) et `Models/maillages/` | Extensions écrivables : `.json .mod .sub .lib .cir .sp .spi .spice .txt .ibs .sNp .kicad_mod .kicad_sym` |
| Lecture seule en réseau | Lancé depuis un terminal, le serveur écoute sur tout le réseau : lire reste permis (catalogue, empreintes), écrire, effacer ou déplacer la LIB est refusé (« Bibliothèque en lecture seule ») | `--local` (ou double-clic) ouvre l'écriture ; `--projets-reseau` l'ouvre dans la LIB active mais ne permet pas de la déplacer |
| Lancement par WEB·SUITE | La LIB est `PROJETS/LIB_CAO`, envoyée sur GitHub avec les projets ; les champs de chemin de l'accueil sont masqués | Elle ne se déplace pas depuis l'accueil |

Les modifications de la LIB sont diffusées aux autres outils ouverts : un catalogue enregistré ailleurs est relu s'il n'y a pas de modification en cours ; sinon un avertissement prévient que l'enregistrer effacerait ce changement.

### Paramètres d'adresse

| Paramètre | Effet |
|---|---|
| `?comp=<nom>` | Filtre le catalogue sur le nom et sélectionne la référence (sinon la première) |
| `?tab=pcb&nom=<fichier>` | Ouvre l'onglet et l'éditeur de l'empreinte (`tab=schematique` : éditeur de symbole ; `tab=simulation`, `tab=composants` : l'onglet seul) |
| `?importer_lcsc=<Cxxxx>` | Ouvre l'import JLCPCB / LCSC sur ce code |

### Scripts de maintenance

| Script | Usage | Limites |
|---|---|---|
| `python/maillages_3d.mjs` | `node python/maillages_3d.mjs <dossier LIB> [--recalculer]` : maillages des STEP de `Models`, calcul de `Position 3D`, hauteur `Maximun Height` si vide | Demande `npm install occt-import-js` ; ne remplace jamais une position écrite (sauf `--recalculer`) |
| `python/lier_modeles_murata.py` | `python python/lier_modeles_murata.py` (rapport) ; `--appliquer` écrit les `.sub` à plat dans `lib_simulation` et met à jour le CSV | Ne remplace que les modèles génériques (`capacitor.sub`, `inductor.sub`, vide) ; LIB désignée par la variable `WEB_CAO_LIB` ou le dossier par défaut |
| `python/standardiser_catalogue.py` | Réécrit les chemins des colonnes Empreinte PCB, Empreinte Schématique, Modèle Simulation sous la forme `lib/empreinte/…`, `lib/symbole/…`, `lib/simulation/…` | Lit `LIB_composants.csv` à la racine de l'outil (pas la LIB active) et écrit aussi `lib/LIB_composants.csv` ; aucun autre fichier du dépôt ne l'appelle, et il échoue sur le dépôt actuel : le CSV de la racine n'a que 4 colonnes (pas de `Empreinte PCB`) et le dossier `lib/` n'existe pas |
| `python/extraire_bibliotheques.py` | Lance `extraire_bibliotheques.js` : génère l'arborescence `LIB/` (`lib_empreinte_pcb`, `lib_empreinte_schematique`, `lib_simulation`, `LIB_composants.csv`) | Génération initiale, aucun autre fichier du dépôt ne l'appelle ; les empreintes et symboles sont codés dans `extraire_bibliotheques.js`, qui écrit `LIB/` à la racine de l'outil (pas la LIB active) et réécrit le `LIB_composants.csv` de la racine ; à ne pas lancer sans sauvegarde |
| `commun/parasites-murata.json` | Table `{ "<référence Murata>": { "c", "esl", "esr" } }` pour un condensateur, `{ "l", "dcr" }` pour une self, en unités SI | Copie de repli ; le serveur relit les `.sub` de `lib_simulation` (route `/api/lib/parasites`) : un modèle ajouté compte au calcul suivant, sans régénérer la table |

## Limites connues

- Le tableau du catalogue dessine 250 lignes au plus (voir note plus haut) ; les galeries sont paginées.
- Le catalogue est réécrit en entier à chaque « Enregistrer » : deux onglets modifiés en même temps risquent de s'écraser. La page prévient seulement quand le catalogue a changé ailleurs.
- Sans trait en cours ni sélection, Échap ferme l'éditeur sans confirmation, modifications non enregistrées perdues, même depuis un champ ou la vue JSON.
- Modifier le numéro dans la colonne « # » de la table des pastilles ou des broches enregistre un texte (champ texte), alors que le contrôle d'empreinte exige un entier de 1 à 4096 : la question « Enregistrer quand même ? » apparaît. Les traits de sérigraphie (clé `lines`, écrite par l'onglet « Traits / Lignes » et le tracé au pointeur) sont acceptés par le contrôle, avec une remarque : l'éditeur PCB (`normFpDef`) ne lit pas `lines`, ces traits ne sont visibles que dans Gestion LIB.
- L'import JLCPCB ne contrôle pas qu'une `Part Name` existe déjà. L'empreinte nommée par l'import (`Empreinte PCB liée`) n'est jamais créée : aucun code ne l'écrit, elle reste un nom (`SOT-23.json`) qui peut ne pas exister dans la LIB.
- Aucun bouton ne range un fichier STEP ou ne règle `Modèle 3D` / `Position 3D` : édition du CSV et script `maillages_3d.mjs`.
- La rotation d'une pastille (`rot`), les formes « Rect. angles droits » et « Chanfreiné » pour la forme principale, et les primitives de symbole autres que les traits ne se règlent que dans le code JSON.
- Un modèle SPICE lié est lu en linéaire par la simulation (R, L, C, sous-circuits) : un transistor ou une diode SPICE est refusé par la simulation RF. Voir [Simulation RF et EM](10-simulation-rf-em.md).
- Les valeurs de soudure des puces du générateur IPC-7351B viennent de KiCad ; la norme n'a pas été lue (voir le commentaire de `commun/composants-lib.js`). Les cotes JEDEC par défaut sont à vérifier sur la datasheet.
- Le serveur recopie aussi le catalogue enregistré dans `LIB_composants.csv` à la racine de l'outil, en ignorant l'échec éventuel de cette copie.
- Écriture refusée tant que le serveur écoute sur le réseau sans `--local` ou `--projets-reseau` (message « Bibliothèque en lecture seule »).

## Voir aussi

- [Accueil, projets, tactile](01-accueil-projets-tactile.md) : dossier de la LIB, mode tuto, mode tactile.
- [Éditeur Schématique](02-editeur-schematique.md) : pose d'un composant, brochage, explorateur de bibliothèque.
- [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md) : pose et réaffectation d'une empreinte.
- [Éditeur PCB : fabrication](04-editeur-pcb-fabrication.md) : animation 3D qui utilise les modèles 3D de la LIB.
- [Recherche de composants](06-recherche-composants.md) : « ⚡ Ajouter à Gestion LIB ».
- [Simulation RF et EM](10-simulation-rf-em.md) et [les broches d'une puce radio](10b-rf-acces-des-broches.md) : modèles Touchstone et SPICE liés ici.
- [Claude et le MCP](11-claude-mcp.md) : cartes de création et de liaison.
- [Guide de la simulation EM](../simulation-em.md) : lecture des modèles liés.
- [README du dépôt](../../README.md) : options du serveur (`--local`, `--lib`, `--projets-reseau`).
