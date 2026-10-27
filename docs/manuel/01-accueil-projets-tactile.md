# Accueil, projets, profils et gestes communs

Ce chapitre décrit ce qui entoure les outils : la page d'accueil, le serveur local `web_CAO.py`, les projets sur disque, les utilisateurs, le mode tactile et la roulette, le mode tuto, ainsi que les gestes que partagent le schéma et le PCB (recherche, mesure, cross-probing, annuler/rétablir, variantes de montage, panneaux).
Les raccourcis propres à un éditeur sont dans [l'Éditeur Schématique](02-editeur-schematique.md) et [l'Éditeur PCB](03-editeur-pcb-edition-routage.md) ; la tablette et le téléphone sont traités ici.
L'accueil (`index.html`) s'ouvre en double-clic, sans serveur ; le serveur ajoute les projets sur disque, les profils en fichier, la LIB, la recherche de composants, la visionneuse IPC-2581 et les simulations.

## Guide par tâche

### Je veux lancer WEB_CAO

1. Sans rien installer : ouvrir `index.html` dans un navigateur récent. Schéma, routage et exports de fabrication fonctionnent ; chaque outil s'ouvre dans un nouvel onglet et l'accueil reste ouvert.
2. Avec le serveur local (Python 3, bibliothèque standard) : lancer `python web_CAO.py`. Le navigateur s'ouvre à la bonne adresse, sauf sur un Raspberry Pi ou un poste Linux sans affichage graphique (voir `--navigateur` / `--sans-navigateur`).
3. Sous Windows, un double-clic sur `web_CAO.py` ou sur `demarrer_WEB_CAO.cmd` suffit. Le premier démarre en mode local ; le second passe `--local` explicitement et garde le message à l'écran si Python ne démarre pas.
4. Pour les solveurs numériques (SI / PI), installer numpy et scipy : `pip install -r requirements.txt`.
5. Au démarrage, le serveur cherche une mise à jour sur GitHub (si `git` est présent et le dossier est un dépôt) et se relance si elle est appliquée ; hors ligne, ou si l'application échoue, il démarre quand même avec la version en place. `--sans-maj` désactive cette étape.

> [!NOTE]
> Une page ouverte en `file://` (double-clic) ne peut pas appeler le serveur : le serveur n'admet que sa propre origine. Pour tout ce qui passe par lui (simulations, LIB, visionneuse IPC-2581, recherche de composants, projets sur disque saisis par chemin), ouvrir la page à l'adresse qu'affiche `web_CAO.py`.

### Je veux utiliser WEB_CAO depuis une tablette ou un téléphone

1. Sur le poste ou le Raspberry Pi, lancer `python web_CAO.py` depuis un terminal (sans `--local`) : le serveur écoute sur le réseau et affiche son adresse, plus l'adresse Tailscale s'il y en a une.
2. Sur la tablette, ouvrir cette adresse dans le navigateur.
3. À la première visite, la page demande un code d'appairage à 6 chiffres : le lire dans la console du serveur (ou dans les logs de WEB_CAO dans WEB·SUITE) et le saisir, puis « Valider ». L'appareil s'en souvient ensuite (cookie d'un an), pour tous les web tools de ce poste.
4. Si la connexion est chiffrée (HTTPS), installer une fois le certificat de ce poste depuis le lien « le certificat de ce poste » de la page du code (`/appairage/ca.pem`). Sur iPad : Réglages, Profil téléchargé, Installer ; puis Général, Informations, Réglages des certificats, activer. Comparer l'empreinte SHA-256 du certificat, que l'appareil montre à l'installation, avec celle que le terminal affiche.
5. Ouvrir ensuite l'accueil et cocher « Mode tactile » (voir plus bas).
6. Pour travailler sur les projets depuis la tablette, le serveur doit avoir été lancé avec `--projets-reseau` (réseau de confiance seulement), ou par WEB·SUITE.

> [!NOTE]
> Lancé depuis un terminal, le serveur refuse par défaut les dossiers de projet et met la LIB en lecture seule : lire et écrire sur le disque sans mot de passe n'est pas offert à un réseau. Lancé par double-clic ou avec `--local`, il n'écoute que la machine elle-même et tout est permis ; la machine elle-même n'a jamais besoin de code.

### Je veux créer un projet

1. Sur l'accueil, bloc « Projet », onglet « ➕ Nouveau projet ».
2. Saisir le « 1. Nom du projet » (60 caractères au plus, sans `\ / : * ? " < > |`, sans point en début ou fin de nom ; les accents et les espaces sont admis). Le nom donne le dossier et les préfixes de fichiers (`-SCH.json`, `-PCB.json`).
3. Renseigner « 2. Chemin d'accès / Dossier parent sur le support » : taper un chemin, cliquer sur « 📁 Parcourir… » (sélecteur de dossier du navigateur ; le champ ne reçoit alors que le nom du dossier, et le retaper à la main annule ce choix) ou sur un bouton d'« Emplacements ». Avec le serveur, les boutons sont « Emplacements rapides » : un par racine déclarée (`--projets`, ou `projets/` du dépôt par défaut), nommé d'après le dernier élément du chemin. Sans serveur, il n'y a que « 📁 Projets locaux (dépôt) ».
4. Vérifier l'aperçu « 👁️ Dossier et fichiers qui seront créés » : `projet.cao.json`, `<nom>-SCH.json`, `<nom>-PCB.json`.
5. Cliquer sur « ✨ Créer et initialiser le projet » (ou Entrée dans le champ du nom). Un message confirme la création.
6. Lancé par WEB·SUITE, le champ de chemin disparaît : le projet est toujours créé sous `PROJETS/CAO`.

### Je veux ouvrir un projet existant

1. Bloc « Projet », onglet « 📁 Ouvrir un projet existant ».
2. Au choix : cliquer sur un projet de la liste « Projets du dossier des projets » (bouton « Ouvrir → » ; un clic sur la ligne suffit), ou sur « Choisir le dossier du projet sur le support… » / « 📁 Parcourir les dossiers… », ou saisir le chemin sous « Ou saisir directement le chemin du dossier » (`Entrée` ou « Ouvrir ce dossier »). Lancé par WEB·SUITE, seule la liste reste : la zone de choix du dossier et la saisie de chemin disparaissent, et si aucun projet n'est ouvert l'onglet « Ouvrir » s'affiche d'emblée.
3. La carte « Projet en cours » apparaît avec le nom, la révision (« REV A »), le dossier, l'état des trois documents (Schéma, PCB, IPC-2581) et l'heure de dernière sauvegarde.
4. Les éditeurs ouverts ensuite chargent le schéma et la carte du dossier ; l'entête de chaque outil affiche le nom du document (par exemple « carte PIR-PCB »).
5. Avec le sélecteur de dossier, un dossier sans `projet.cao.json` est initialisé comme nouveau projet : sans question s'il est vide, après confirmation (« Voulez-vous l'initialiser comme nouveau projet… ») s'il contient déjà des éléments. Avec le chemin saisi, un dossier sans `projet.cao.json` est refusé (« Le fichier projet (projet.cao.json) : introuvable ») et rien n'est créé.
6. Si l'autorisation d'accès au dossier a été perdue d'une visite à l'autre, un clic sur la zone de sélection le rouvre (« Réouverture de … »).
7. Sans sélecteur natif, la zone de choix utilise le chemin déjà saisi dans le champ, ou demande d'en saisir un.

### Je veux enregistrer, en local ou sur GitHub

1. `Ctrl+S` (ou Fichier, « Enregistrer .json ») enregistre le document ouvert dans le dossier du projet. Sans projet ouvert, le fichier est téléchargé.
2. Un avis en haut de l'écran confirme l'enregistrement (vert, 5 s), signale un enregistrement partiel (orange, 9 s) ou un échec (rouge, il reste jusqu'au toucher). Un toucher le ferme.
3. Projet ouvert par le serveur : si le document a été modifié ailleurs depuis son ouverture (autre onglet, autre appareil, export vers le PCB), une confirmation demande s'il faut l'écraser ; refuser annule l'enregistrement, sans repli en téléchargement.
4. Lancé par WEB·SUITE, `Ctrl+Maj+S` (Fichier, « Sauvegarder le projet → GitHub », bouton affiché seulement dans ce cas) enregistre puis envoie tout le projet sur GitHub en un seul commit. `Ctrl+S` et « Exporter vers le PCB » restent en local : une retouche de dernière minute ne fait pas un commit.
5. Lancé par WEB·SUITE sans projet ouvert, l'éditeur demande de saisir le nom du projet de `PROJETS` où ranger le document (créé s'il n'existe pas ; s'il existe, une confirmation prévient que son document sera remplacé) ; il ne télécharge jamais. Au tout premier envoi depuis un poste dont git n'a ni nom ni e-mail, deux questions les demandent une fois.

### Je veux retrouver un travail non enregistré

1. Tant que le document est modifié et qu'un projet est ouvert, chaque éditeur écrit toutes les 30 s un brouillon à côté du document (`<nom>-SCH.brouillon.json` ou `<nom>-PCB.brouillon.json`) ; l'enregistrement l'efface.
2. À la réouverture, si un brouillon est plus récent que le document, une confirmation propose de le reprendre. Annuler le laisse sur le disque jusqu'au prochain enregistrement.
3. Un brouillon repris compte comme non enregistré : enregistrer pour le garder.
4. Sans projet ouvert (téléchargement), il n'y a pas de brouillon sur disque.

### Je veux fermer ou détacher un projet

1. Carte « Projet en cours » : « ✕ Fermer » ferme le projet, sans toucher aux fichiers.
2. « 🔗 Détacher » défait le lien avec le dossier après confirmation ; les fichiers restent sur le disque. Le projet est refermé du même coup (un projet sans dossier n'existe qu'en mémoire), et le nom disparaît de l'accueil. Le travail non enregistré du schéma et du PCB dans cet onglet est alors perdu, et la confirmation le dit : enregistrez d'abord.

### Je veux changer d'utilisateur ou en créer un

1. Sur l'accueil, bloc « Utilisateur » : cliquer sur un nom de la liste (la coche ✓ marque l'utilisateur courant).
2. Pour en ajouter un : saisir son nom dans « Nom d'un nouvel utilisateur… » puis « Ajouter » (ou Entrée) ; un navigateur neuf commence avec l'utilisateur « Pilou ». Le nom devient un nom de fichier : 40 caractères au plus, sans `\ / : * ? " < > |`, sans point en début ou fin de nom, hors noms réservés Windows (CON, PRN, AUX, NUL, COM1 à COM9, LPT1 à LPT9).
3. Pour supprimer l'utilisateur courant : « Supprimer celui-ci » et confirmer. Seules ses préférences sont effacées ; schémas et cartes ne sont pas touchés. Le dernier utilisateur ne peut pas être supprimé.
4. Dans un éditeur, la visionneuse ou la recherche de composants, le bouton « 👤 nom » de l'entête ouvre un menu « Utilisateur » : changer d'utilisateur ou « Nouvel utilisateur… ». La suppression se fait sur l'accueil seulement.

### Je veux activer le mode tactile

1. Accueil, bloc « Ergonomie & Écran tactile » : cocher « Mode tactile (iPad Pro / tablette / écran tactile) ». Le réglage est gardé dans le navigateur (`cao.modeTactile`) et copié dans le profil, mais seul le navigateur le relit : un autre appareil ne le reprend pas par le profil.
2. Ou, dans le schéma, le PCB ou la visionneuse IPC-2581 : bouton « 📱 Tactile » de l'entête (il s'allume quand le mode est actif).
3. Un pincement zoome, deux doigts déplacent la vue, le stylet est reconnu et la paume est ignorée tant qu'il est posé.
4. Un appui long sur la feuille ouvre la roulette de commandes (voir ci-dessous).

### Je veux utiliser la roulette de commandes

1. Appui long (environ 0,45 s) du stylet ou du doigt sur la feuille : un anneau se remplit sous la pointe, puis la roulette s'ouvre. Le bouton latéral d'un stylet qui en a un l'ouvre tout de suite.
2. Sans lever la pointe, glisser jusqu'à une commande et lever pour la lancer. Lever sur place laisse la roulette ouverte : toucher ensuite la commande.
3. Une entrée marquée d'un point est un groupe : l'effleurer ou la toucher ouvre ses commandes en éventail de pastilles.
4. Le bouton central, `Échap` ou un toucher en dehors de la roulette la ferme.
5. Sans appui long (souris, ou doigt sans mode tactile) : bouton « Roulette » de l'entête, à droite de « Tactile ». Elle s'ouvre au milieu de la feuille, sur ce qui est sélectionné ; un second clic la referme.
6. Pour choisir plusieurs éléments au doigt : commande « Multi » de la roulette. Tant qu'elle est enclenchée, chaque toucher ajoute ou retire l'élément, et glisser sur le vide trace un lasso. Une pastille « Sélection multiple ✕ » en haut de l'écran la rappelle et la relâche.

### Je veux personnaliser la roulette

1. Ouvrir la roulette et toucher le secteur « ＋ » : la fenêtre « Roulette de commandes » s'ouvre.
2. Choisir la roulette à régler (un composant, un fil / une piste, le vide, un tracé en cours), puis monter (↑), descendre (↓) ou retirer (✕) chaque entrée. La liste se lit dans le sens horaire en partant du haut.
3. Sous « Ajouter », choisir la destination (la roulette ou un groupe), puis une commande du catalogue. Huit éléments au plus dans la roulette, six commandes au plus par groupe.
4. Pour un groupe : saisir « Nom du nouveau groupe » (14 caractères) puis « Créer le groupe ».
5. Pour une commande à soi : sous « Ma propre commande (raccourci clavier) », saisir Icône (2 caractères), Nom (14 caractères) et Raccourci (par exemple « B » ou « Ctrl+Shift+N »), puis « Ajouter ». La roulette rejoue ce raccourci dans l'éditeur.
6. Sous « Gestes », régler les trois cases, ou « Revenir aux roulettes d'origine » : les roulettes et les trois cases reprennent leur valeur d'origine (doigt et paume cochés, noms décochés) ; seules les commandes personnelles sont conservées.
7. Les réglages sont gardés dans le profil de l'utilisateur, par outil.

### Je veux faire la visite guidée

1. Accueil : cliquer sur « 🎓 Mode tuto » (le bouton s'allume).
2. Cliquer sur la carte d'un outil : il s'ouvre dans un nouvel onglet avec une carte « Commencer ». Ou cliquer sur « ▶ Parcours complet », qui ouvre le premier outil ; la dernière étape de chaque visite mène à l'outil suivant.
3. Avancer par « Suivant › », `→` ou `Entrée` ; reculer par « Précédent » (à partir de la 2e étape) ou `←` (sans effet sur la carte de départ) ; quitter par « Passer » (1re étape) ou `Échap` (à tout moment). À la dernière étape, le bouton porte le nom de l'outil suivant ; après le dernier outil (la Visionneuse IPC-2581), il devient « Terminer » et ramène à l'accueil.
4. Tant que « Mode tuto » est coché, des pastilles « ? » se posent sur les grandes fonctions visibles ; le survol redonne l'explication.
5. Les exemples ouverts par la visite sont annulables : `Ctrl+Z` défait tout.

### Je veux chercher un composant ou un net

1. Dans le schéma ou le PCB : `Ctrl+F` (ouvre la boîte), ou Outils, « Rechercher » (ouvre, et referme si elle est ouverte). La recherche de la page du navigateur n'est pas utilisée.
2. Taper un repère (C47, R1) ou un nom de net. Le classement va du plus sûr au plus large : correspondance entière, puis début, puis contient, puis le libellé (valeur, boîtier). R1 passe avant R10 et R100.
3. `↑` / `↓` choisissent, `Entrée` y va, `Échap` ferme (ou clic sur le résultat, ou sur ✕).
4. Au schéma, la recherche traverse toutes les feuilles et change de feuille si besoin ; au PCB elle cadre l'empreinte ou le net. La vue ne zoome que si la cible déborde ou est trop petite.

### Je veux mesurer une distance

1. Placer, « Mesure » (`K`) dans le schéma ou le PCB.
2. Un clic pose le départ, le suivant fige l'arrivée, le troisième repart de zéro. `Échap` efface la cote sans quitter le mode ; un second `Échap` rend la main à la sélection.
3. La barre d'état donne la distance, ΔX, ΔY et l'angle ; l'étiquette de la cote les affiche sur la feuille.
4. Au PCB, la mesure s'accroche aux pastilles, vias et sommets de piste (sinon à la grille) et c'est une cote de fabrication en millimètres. Au schéma, elle s'accroche aux broches et la lecture précise « convention de dessin (1 case = 1 mm), pas une cote de fabrication ».

### Je veux voir dans l'autre éditeur ce que je regarde ici

1. Garder le schéma et le PCB ouverts dans deux onglets du même navigateur, servis par `web_CAO.py`.
2. Sélectionner un seul composant (ou une seule empreinte) ; à défaut, au schéma sélectionner un fil (c'est le net du premier fil qui est montré), au PCB mettre un net en évidence. Puis `L` (Outils, « Montrer au PCB » ou « Montrer au schéma »). Le bouton est grisé si le navigateur n'a pas de canal entre onglets.
3. L'autre onglet saute sur la cible sans que celui-ci bouge. Un message dit le résultat : montré, absent du document de l'autre onglet, aucun onglet ouvert sur l'autre outil, ou navigateur sans partage entre onglets.
4. Pour changer d'outil dans le même onglet avec la cible : sélectionner d'abord, puis cliquer sur le bouton d'outil de l'entête (➔ vers le PCB, ⬅ vers le schéma). L'outil d'arrivée se place sur la cible.

### Je veux passer d'un outil à l'autre sans perdre mon travail

1. Utiliser les boutons de l'entête (➔ / ⬅, ⌕ Composants, 📚 Gestion LIB, ⌂ Accueil), pas la barre d'adresse.
2. Le document en cours, la vue et l'état « modifié » sont mis de côté dans l'onglet et repris à l'arrivée (la recherche de composants et la visionneuse en font autant). Aucune question de fermeture n'est posée pour un changement d'outil ; elle reste posée pour une vraie fermeture d'onglet avec un travail non enregistré.
3. Le travail mis de côté survit à un rechargement de la page mais disparaît à la fermeture de l'onglet : ce n'est pas un enregistrement.

### Je veux annuler ou rétablir

1. `Ctrl+Z` annule, `Ctrl+Y` (ou `Ctrl+Maj+Z`) rétablit ; ou menu Édition, « Annuler » / « Rétablir ».
2. Au schéma, l'historique garde 60 étapes ; au PCB, 80 étapes dans la limite d'un budget mémoire.
3. Une carte appliquée par Claude est une étape. Dans les fenêtres de brochage (schéma) et de règles (PCB), `Ctrl+Z` et `Ctrl+Y` restent actifs.

### Je veux gérer des variantes de montage

1. Au schéma : Fichier, « Variantes de montage… » (ou le bouton ◫ du panneau Nomenclature & Nets).
2. Saisir un « Nom (ex. Lite, Pro…) », choisir « vierge » ou « copie de … », puis « ＋ Ajouter ».
3. Dans la matrice, décocher « monté » pour un composant dans une variante. Les boutons ✓ et ✗ d'une colonne montent ou retirent tous les composants affichés (filtre actif).
4. Choisir la variante active par le bouton radio de sa ligne, ou par le menu « Carte complète » du panneau Nomenclature & Nets. Les composants non montés sont voilés, barrés et marqués « NM » sur la feuille.
5. Pour un seul composant : panneau Propriétés, cases « Monté dans les variantes ». Pour plusieurs : « Monter » / « Ne pas monter » dans la variante active.
6. « ⇩ Exporter la BOM de chaque variante » écrit une nomenclature CSV par variante, carte complète comprise.
7. Au PCB : Fichier, « Variante de montage… ». Les variantes se créent dans le schéma ; la carte en reprend une copie (« ⟳ Reprendre du schéma » pour la relire). La variante active retire ses empreintes de `bom.csv` et `positions.csv` ; le cuivre ne change pas.

### Je veux réorganiser les panneaux

1. Glisser un panneau par son en-tête vers un dock (gauche, droite, bas) ou le laisser flotter au-dessus de la feuille.
2. Boutons d'en-tête : Replier (▾), Plein écran (□), Détacher / rattacher (⬒), Fermer (✕). Un double-clic sur l'en-tête replie. `Échap` sort du plein écran.
3. Affichage, « Espace de travail ▾ » : cocher les panneaux à montrer, « Tout afficher », « Disposition en colonnes » ou « Réinitialiser la disposition ».
4. La disposition est gardée dans le profil de l'utilisateur courant, par éditeur.

### Je veux utiliser un téléphone

1. En portrait étroit (largeur de 600 px ou moins) ou en paysage bas (hauteur de 500 px ou moins), les panneaux des docks et les panneaux flottants passent dans un tiroir à onglets en bas (portrait) ou à droite (paysage). La Gestion LIB et la recherche de composants ont aussi ce tiroir.
2. Portrait : toucher la poignée du tiroir pour l'ouvrir ou le fermer. Paysage : languette « Panneaux ‹ ».
3. Les menus s'ouvrent en position fixe, la barre d'outils défile au doigt. La disposition d'origine revient quand l'écran grandit.

### Je veux changer le dossier de la bibliothèque LIB

1. Accueil, bloc « Bibliothèque centrale (LIB) » : le badge dit « Dépôt (par défaut) » ou « Dossier personnalisé », puis le dossier actif et les compteurs (composants, empreintes PCB, symboles, modèles SPICE).
2. Saisir un chemin (ou « 📁 Parcourir… »), laisser ou décocher « Copier les composants et empreintes par défaut si le dossier est vide », puis « Appliquer ce dossier » (ou `Entrée`). Un dossier qui n'existe pas est créé si la case est cochée (sinon refusé) ; la copie se fait quand il est neuf ou n'a pas de `LIB_composants.csv`.
3. « Par défaut » revient au dossier `LIB/` du dépôt après confirmation.
4. Impossible sur un serveur en écoute réseau (champs grisés, « Bibliothèque en lecture seule ») ; lancé par WEB·SUITE, la LIB est `PROJETS/LIB_CAO` et ne se déplace plus.

### Je veux ouvrir ce manuel

1. Accueil, bouton « 📖 Manuel » de l'en-tête : il s'ouvre dans un nouvel onglet (`docs/manuel/manuel.html`).
2. La page est autonome et s'ouvre aussi en double-clic.

## Référence

### Page d'accueil : en-tête et cartes

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| « ▶ Parcours complet » | | Ouvre le premier outil avec sa visite guidée ; la visite enchaîne les cinq outils | Visible seulement quand « Mode tuto » est coché ; ouvre un nouvel onglet (repli dans l'onglet courant si la fenêtre est bloquée) |
| « 📖 Manuel » | | Ouvre `docs/manuel/manuel.html` dans un nouvel onglet | |
| « 🎓 Mode tuto » | | Active ou coupe le mode tuto (réglage `cao.tuto` du navigateur) ; les cartes s'ouvrent alors avec `?tuto` | Réglage par navigateur |
| Carte « Éditeur schématique » | | Ouvre `editeur-schematique/editeur-schematique.html` dans un nouvel onglet | |
| Carte « Éditeur PCB » | | Ouvre `editeur-pcb/editeur-pcb.html` | La simulation passe par le serveur |
| Carte « Recherche de composants » | | Ouvre `recherche-composants/recherche-composants.html` | Demande le serveur |
| Carte « Gestion LIB » | | Ouvre `gestion-lib/gestion-lib.html` | Demande le serveur |
| Carte « Visionneuse IPC-2581 » | | Ouvre `visionneuse-ipc2581/visionneuse-ipc2581.html` | Le parseur est en Python : demande le serveur ; un `.json` exporté se rouvre sans serveur |

### Page d'accueil : bloc « Projet »

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Badge « 🟢 nom » / « ⚪ Aucun projet » | | Dit si un projet est ouvert | |
| Carte « Projet en cours » | | Affiche le nom, « REV » (révision lue dans `projet.cao.json`, « A » à défaut), le dossier, « Dernière sauvegarde » et « Envoyé sur GitHub » | L'heure d'envoi GitHub est gardée dans ce navigateur : un envoi fait depuis un autre appareil n'y figure pas |
| Cases « SCHÉMA », « PCB », « IPC-2581 » | | Fichier présent (✓ nom, heure d'enregistrement) ou « non créé » / « absent » | |
| « ✕ Fermer » | | Ferme le projet et détache le dossier ; message « Vos fichiers restent intacts » | |
| « 🔗 Détacher » | | Défait le lien avec le dossier après confirmation | Rien n'est supprimé sur le disque ; le projet est aussi refermé, comme au chargement suivant de la page, et le travail non enregistré du schéma et du PCB de l'onglet est perdu (la confirmation le dit) |
| Onglet « ➕ Nouveau projet » | | Affiche le formulaire de création | |
| Champ « 1. Nom du projet » | `Entrée` | Nom du projet ; `Entrée` crée | 60 caractères ; caractères interdits `\ / : * ? " < > \|` ; refus par une alerte |
| Champ « 2. Chemin d'accès / Dossier parent sur le support » | | Dossier parent du projet | Absent lancé par WEB·SUITE |
| « 📁 Parcourir… » | | Sélecteur de dossier du navigateur (écriture) ; le champ de chemin reçoit le nom du dossier choisi | Sans sélecteur natif (navigateur sans File System Access) : message de saisir le chemin à la main ; modifier le champ ensuite annule le choix du sélecteur |
| « Emplacements : » / « Emplacements rapides : » | | « Emplacements : » (sans serveur) porte le seul bouton « 📁 Projets locaux (dépôt) » ; « Emplacements rapides : » (serveur joignable) le remplace par un bouton par racine déclarée, nommé d'après le dernier élément du chemin | Les racines viennent de `--projets` |
| Aperçu « 👁️ Dossier et fichiers qui seront créés » | | Montre `projet.cao.json`, `<nom>-SCH.json`, `<nom>-PCB.json` | |
| « ✨ Créer et initialiser le projet » | | Crée le projet. Ordre : WEB·SUITE (dans `PROJETS`), sinon dossier parent choisi au sélecteur, sinon serveur (chemin parent + nom), sinon sélecteur de dossier, sinon projet virtuel | Un projet virtuel n'existe qu'en mémoire (« aucun dossier rattaché ») et se referme à la reprise suivante |
| Onglet « 📁 Ouvrir un projet existant » | | Affiche les trois façons d'ouvrir | |
| « Choisir le dossier du projet sur le support… » / « 📁 Parcourir les dossiers… » | | Sélecteur de dossier ; s'il contient `projet.cao.json`, il s'ouvre | Dossier non vide sans `projet.cao.json` : confirmation « initialiser comme nouveau projet » ; dossier vide : initialisé sans question |
| « Ou saisir directement le chemin du dossier » + « Ouvrir ce dossier » | `Entrée` | Ouvre par le serveur : un nom ou un chemin relatif se lit sous la première racine ; un chemin complet aussi | Demande le serveur ; en écoute locale un chemin complet hors des racines est accepté pour cet appel ; en réseau (`--projets-reseau`), et lancé par WEB·SUITE, seules les racines comptent. Dossier sans `projet.cao.json` : refusé, message « Le fichier projet (projet.cao.json) : introuvable » |
| « Projets du dossier des projets » + « Ouvrir → » | | Liste des projets trouvés sous les racines du serveur (jusqu'à 4 niveaux de dossiers sous chaque racine), du plus récent au plus ancien, avec l'heure de dernière sauvegarde | Bloc masqué sans serveur ou sans projet trouvé |
| Message d'état (sous le bloc) | | Dit la création, l'ouverture (« … ouvert depuis … (le schéma, la carte PCB, le modèle IPC-2581 chargés) ») ou l'erreur en rouge | |
| Bandeau « ☁ Lancé par WEB·SUITE » | | Rappelle que les projets sont ceux de `PROJETS` et la différence entre Enregistrer et Sauvegarder | Affiché seulement lancé par WEB·SUITE ; peut afficher le détail d'un envoi GitHub indisponible |

### Page d'accueil : bloc « Bibliothèque centrale (LIB) »

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Badge « Dépôt (par défaut) » / « Dossier personnalisé » / « Déconnecté » | | État de la LIB | « Déconnecté » : serveur non lancé |
| Ligne « Dossier actif » | | Chemin et compteurs (composants, empreintes PCB, symboles, modèles SPICE) | « [Dossier introuvable] » si le chemin n'existe pas |
| Champ « Chemin du dossier LIB… » | `Entrée` | Saisie du chemin ; `Entrée` applique | |
| « Appliquer ce dossier » | | Fixe la LIB (réglage gardé dans `config_lib.json`) | Écoute réseau : grisé |
| « 📁 Parcourir… » | | Sélecteur de dossier ; ne donne que le nom du dossier, d'où le conseil de coller le chemin absolu | Sans sélecteur natif : alerte |
| « Par défaut » | | Revient à `LIB/` du dépôt, ou `../PROJETS/LIB_CAO` si `LIB/` n'existe pas | Confirmation ; écoute réseau : grisé |
| Case « Copier les composants et empreintes par défaut si le dossier est vide » | | Copie la LIB par défaut dans un dossier neuf ou sans `LIB_composants.csv` ; décochée, un dossier inexistant est refusé | Cochée par défaut |

### Page d'accueil : blocs « Utilisateur » et « Ergonomie & Écran tactile »

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Liste des noms | | Choisit l'utilisateur courant (✓) | |
| « Nom d'un nouvel utilisateur… » + « Ajouter » | `Entrée` | Crée l'utilisateur et le choisit | 40 caractères, mêmes interdits que pour un projet |
| « Supprimer celui-ci » | | Efface les préférences de l'utilisateur courant (fichier et copie du navigateur) | Confirmation ; refusé s'il est le seul |
| Ligne d'information | | Dit où vivent les préférences : `profils/<nom>.json`, « en attente du serveur », ou « gardés dans ce navigateur » (page en double-clic) | |
| Ligne « Schéma / PCB » (derniers documents) | | Jusqu'à 4 derniers noms et dates par outil | Mémoire de noms, pas un raccourci : le navigateur ne rouvre pas un fichier à partir de son nom |
| Case « Mode tactile (iPad Pro / tablette / écran tactile) » | | Active le tactile (`cao.modeTactile`) | |

### Serveur `web_CAO.py` : options

| Option | Effet | Limites |
|---|---|---|
| `--port N` | Port d'écoute (défaut 8000 ; `0` = au choix du système) | Port refusé ou occupé : repli sur les 20 ports voisins, puis choix du système (l'adresse change alors à chaque lancement, et les réglages gardés par origine ne suivent plus) |
| `--local` | N'écoute que 127.0.0.1 : projets et écriture de la LIB permis, aucun accès réseau | |
| `--host ADR` | Adresse d'écoute explicite (défaut : toutes les interfaces) | |
| `--navigateur` / `--sans-navigateur` | Force l'ouverture du navigateur ou non | Par défaut : ouvert sous Windows et sur un bureau Linux ou macOS ; non ouvert sur Raspberry Pi ou Linux sans affichage |
| `--sans-pause` | Rend la main sans attendre Entrée à la fermeture | Windows, double-clic |
| `--sans-maj` | Pas de mise à jour GitHub au démarrage | La mise à jour se fait en `--ff-only`, après mise de côté des modifications locales |
| `--dossier DIR` | Dossier servi | Utile quand `__file__` ne le désigne pas (Pyto) |
| `--projets DIR` | Racine(s) des dossiers de projet, répétable, ou plusieurs chemins séparés par le séparateur de chemins du système | Défaut : `projets/` à côté de `index.html` ; un nom ou un chemin relatif se lit sous la première racine, qui sert de défaut à la création ; un chemin complet saisi à la main hors des racines n'est accepté qu'en écoute locale, hors WEB·SUITE |
| `--projets-reseau` | En écoute réseau, ouvre quand même les projets sous les racines et l'écriture dans la LIB active | Sans mot de passe : réseau de confiance uniquement ; déplacer la LIB et télécharger des datasheets restent locaux ; la console affiche malgré tout « Les dossiers de projet sont refusés dans ce mode » |
| `--lib DIR` | Dossier de la bibliothèque centrale | Pour ce lancement seulement (non mémorisé) ; défaut `LIB/` du dépôt, sinon `../PROJETS/LIB_CAO` |

| Mode | Comment l'obtenir | Ce qui change |
|---|---|---|
| Local | `--local`, double-clic Windows, `demarrer_WEB_CAO.cmd` | Projets et LIB entièrement permis ; pas de code d'appairage |
| Réseau | Lancement depuis un terminal sans `--local` | Code d'appairage et HTTPS pour les autres appareils ; projets refusés et LIB en lecture seule, sauf `--projets-reseau` |
| WEB·SUITE | Lancé par le lanceur de WEB·SUITE | Projets dans `PROJETS/CAO`, LIB `PROJETS/LIB_CAO`, routes d'envoi GitHub ; le bouton « Sauvegarder le projet → GitHub » apparaît |

### Appairage et HTTPS

| Élément | Effet | Limites |
|---|---|---|
| Code à 6 chiffres | Affiché dans la console du serveur au démarrage en mode réseau ; la page « Code d'appairage » (`/appairage`) le demande à un nouvel appareil | Valable 10 min, usage unique ; un nouveau code s'affiche à l'expiration ; 5 erreurs le brûlent, puis pause de 60 s doublée à chaque code brûlé d'affilée (plafond 1 h) |
| Bouton « Valider » | Envoie le code ; bon code : l'appareil reçoit le cookie du jeton | |
| Jeton partagé | `~/.web_tools/jeton-reseau.txt`, commun aux web tools du poste ; supprimer le fichier en crée un neuf | Dossier personnel en lecture seule : jeton valable pour la session seulement |
| HTTPS | Autorité propre au poste créée une fois dans `~/.web_tools/tls/` par la commande `openssl`, qui signe le certificat du serveur ; même port pour HTTP et HTTPS | Sans `openssl` (Pyto, Windows sans Git) ou avec `WEB_TOOLS_HTTP=1` : tout reste en HTTP et le terminal le dit |
| `/appairage/ca.pem` | Certificat de l'autorité, à installer une fois par appareil | Comparer l'empreinte SHA-256 avec celle du terminal |

### Fichiers sur disque

| Fichier ou dossier | Contenu | Limites |
|---|---|---|
| `<projet>/projet.cao.json` | Manifeste (format `cao-projet-1`) : nom, révision (« A » à la création), auteur, dates, fichiers déclarés, notes | La révision alimente le cartouche du plan de fabrication |
| `<projet>/<nom>-SCH.json` | Document du schéma | Le nom déclaré dans le manifeste doit porter le suffixe de l'outil |
| `<projet>/<nom>-PCB.json` | Document de la carte | |
| `<projet>/<nom>-IPC.json` | Modèle traduit d'une carte IPC-2581 reçue (visionneuse) | Peut être absent |
| `<projet>/<nom>-SCH.brouillon.json`, `-PCB.brouillon.json` | Sauvegarde automatique toutes les 30 s | Ignorée par git (dans `PROJETS`) ; effacée à l'enregistrement |
| `<projet>/datasheets/` | PDF de datasheets téléchargés depuis la recherche de composants (50 Mo au plus par fichier) | Sans projet, ils vont dans `_communs/datasheets` de la racine des projets ; téléchargement réservé à l'écoute locale |
| `profils/<nom>.json` | Préférences d'un utilisateur (format `cao-profil-1`) | Voir la section suivante |
| `profils/fabricants/` | Profils de fabricants (`generique`, `jlcpcb`, `pcbway`, `eurocircuits`) | Utilisés par l'Éditeur PCB : voir [le chapitre PCB](04-editeur-pcb-fabrication.md) |
| `config_lib.json` | Dossier de LIB choisi depuis l'accueil | `--lib` ne l'écrit pas |

### Profils utilisateur

| Élément | Effet | Limites |
|---|---|---|
| Fichier `profils/<nom>.json` | Une personne, un fichier : `format`, `nom`, `t` (date de dernière écriture, en ms) et `sections` | Aucun schéma ni carte dedans ; copiable d'un poste à l'autre |
| Section `espace:<outil>.espace-travail.v1` | Disposition des panneaux : docks, ordre, panneaux flottants, masqués, tailles | |
| Section `reglages:schema` | Grille, accrochage, affichage des noms de nets, onglet de liste, « toutes feuilles » | |
| Section `reglages:pcb` | Grille, accrochage, anti-collision, vue dessus / dessous, contraste, face opposée, rooms, onglet de liste, filtre « non routés » | Le résultat du DRC n'est pas mémorisé |
| Sections `reglages:tactile`, `reglages:roulette:<outil>` | Mode tactile ; contenu de la roulette, commandes perso, trois options de gestes | `reglages:tactile` prime au démarrage ; le navigateur (`cao.modeTactile`) sert de repli quand le profil n'a pas la section |
| Sections `cartouche:commun`, `ipc2581`, `dsCapas`, `pdnFiches`, `pdnOptions` | Société et logo du cartouche ; réglages d'affichage de la visionneuse (couches, vue, surcharges d'empilage) ; fiches condensateurs et options PDN de la simulation | Détail dans les chapitres des éditeurs et de la simulation |
| Section `recents:<outil>` | 8 derniers documents (nom, date) | |
| Double stockage | Copie dans le navigateur (chemin rapide) et fichier (référence) ; le plus récent des deux gagne | En double-clic, seul le navigateur garde : le fichier se met à jour au prochain passage par le serveur |
| Écriture | Différée de 0,7 s, vidée au départ de la page | Un profil trop gros pour la copie du navigateur (512 Ko) n'y est pas gardé |

### Menus de l'entête des éditeurs

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Titres de menu (Fichier, Édition, Placer, Affichage, Outils) | `Échap` ferme | Un clic ouvre ; survoler un autre titre bascule ; un clic sur une entrée ferme le menu après son action | Les entrées à bascule (Grille, Chevelu, Vue…) et le pas de grille laissent le menu ouvert |
| Étiquette « OUTIL » | | Recopie le mode actif du menu Placer ; un clic ouvre ce menu | |
| Pastille sur un titre de menu | | Compteur (par exemple Schéma ↔ PCB) ou « ! » quand une entrée est en alerte | |
| Barre de navigation (➔ ou ⬅, ⌕, 📚, ⌂) | | Va à l'autre éditeur, à la recherche de composants, à la Gestion LIB, à l'accueil, en mettant le travail de côté | Cachée dans la version un seul fichier (`dist/`), qui n'a pas les autres outils à côté |
| « 👤 nom » | | Menu « Utilisateur » : liste, « Nouvel utilisateur… », note sur l'emplacement des préférences | Aussi dans la recherche de composants |
| « 📱 Tactile » | | Active ou coupe le mode tactile | Schéma, PCB, visionneuse IPC-2581 ; pas dans la recherche de composants ni la Gestion LIB |
| « Roulette » | | Ouvre ou ferme la roulette sur la sélection | Même pages que « Tactile » |
| Nom du document (à côté du titre) | | « <projet>-SCH » ou « <projet>-PCB » ; le survol rappelle que les fichiers exportés portent ce nom | Masqué sans projet |

### Mode tactile et roulette

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Pincement (deux doigts) | | Zoom | Mode tactile actif |
| Deux doigts glissés | | Déplace la vue | |
| Stylet | | Reconnu ; la paume et les doigts posés sont ignorés tant que le stylet est posé et 0,4 s après | Réglable (case « Ignorer la paume… ») |
| Appui long (0,45 s, tolérance de déplacement 10 px au stylet, 14 px au doigt) | | Ouvre la roulette selon ce qui est touché : composant, fil / piste, vide, ou tracé en cours | Le doigt ne l'ouvre que si la case « L'appui long au doigt… » est cochée (cochée par défaut) ; vibration brève si l'appareil la permet |
| Bouton latéral du stylet | | Ouvre la roulette tout de suite | Stylet qui en a un |
| Anneau sous la pointe | | Montre la progression de l'appui long | |
| Texte au centre de la roulette | | Titre de l'objet (10 caractères) et, dessous, la commande survolée (à défaut le type : composant, fil / piste, vide, tracé) | |
| Pastille « Sélection multiple ✕ » | | Rappelle « Multi » et le relâche d'un toucher | Non mémorisée : à rallumer à chaque besoin |
| Sélection de texte | | Bloquée au stylet, et au doigt en mode tactile, hors champs de saisie | La souris garde la sienne |
| Clic droit | | Reste celui de la souris | |

### Roulette : commandes disponibles

| Commande | Raccourci rejoué | Effet | Limites |
|---|---|---|---|
| Enregistrer | `Ctrl+S` | Enregistrement local de l'éditeur | |
| Projet → GitHub | `Ctrl+Maj+S` | Sauvegarde du projet sur GitHub | Sinon, comme Enregistrer |
| Annuler / Rétablir | `Ctrl+Z` / `Ctrl+Y` | Historique | |
| Copier / Couper / Coller | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Presse-papiers de l'éditeur | |
| Supprimer | `Suppr` | Supprime la sélection | |
| Échap | `Échap` | Revient à la sélection et termine le geste en cours | |
| Multi | sélection multiple | Voir plus haut | |
| Tout | `Ctrl+A` | Tout sélectionner | |
| Chercher | `Ctrl+F` | Ouvre la recherche | |
| Recadrer | | Voir toute la feuille | |
| Grille | `G` | Affiche ou masque la grille | |
| Mesure | `K` | Mode mesure | |
| Bibliothèque | `A` | Ouvre l'explorateur de la LIB | |
| Montrer ailleurs | `L` | Cross-probing vers l'autre éditeur | |
| Pivoter | `R` | Pivote la sélection | |
| Net entier | selon l'objet touché | Sélectionne le net entier | Disponible si l'éditeur le fournit |
| Terminer | double-clic | Clôt le tracé en cours | Roulette « tracé » |
| Schéma seulement : Propriétés (double-clic), Miroir (`M`), Dupliquer (`D`), Fil (`W`), Bus (`B`), Trait (`T`), Zone (`Z`), Noms de nets (`N`), Vers le PCB (bouton « Exporter vers le PCB ») | | Commandes propres au schéma | |
| PCB seulement : Retourner (`F`), Via (`V`), Piste (`T`), Paire diff. (`P`), Zone (`Z`), Dérouter (`U`), Chevelu (`N`), Vue dessous (`Y`) | | Commandes propres au PCB | |
| Visionneuse IPC-2581 seulement : Recadrer, Zoom +, Zoom −, Dessous (`B`) | | Une seule roulette, celle du vide | |

La roulette d'origine du schéma et celle du PCB sont organisées en groupes (Édition, Historique, Sélection, Dessiner ou Outils, Vue) qui s'ouvrent en éventail ; leur contenu exact se lit dans la fenêtre de personnalisation.

### Roulette : fenêtre de personnalisation

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Secteur « ＋ » (« Personnaliser ») | | Ouvre la fenêtre « Roulette de commandes » | |
| Onglets « un composant », « un fil / une piste », « le vide », « un tracé en cours » | | Choisit la roulette réglée | Visionneuse : une seule roulette, pas d'onglets |
| Liste « Contenu, sens horaire en partant du haut » | | ↑ « Monter », ↓ « Descendre », ✕ « Retirer » | Huit éléments au plus ; six commandes par groupe |
| Menu « dans » + catalogue | | Ajoute une commande dans la roulette ou un groupe | Message « Tout y est déjà » si rien à ajouter |
| « Nom du nouveau groupe » + « Créer le groupe » | | Crée un groupe vide (14 caractères) | |
| Icône (2 caractères), Nom (14), Raccourci + « Ajouter » | | Commande personnelle qui rejoue un raccourci | Raccourci non reconnu : message ; si la destination est pleine, la commande attend dans le catalogue |
| Case « L'appui long au doigt ouvre aussi la roulette » | | Doigt autorisé | |
| Case « Ignorer la paume et les doigts quand le stylet est posé » | | Rejet de la paume | |
| Case « Afficher les noms sous les icônes » | | Libellés sur la roulette | |
| « Revenir aux roulettes d'origine » | | Remet les roulettes et les trois cases de gestes à leur valeur d'origine | Garde les commandes personnelles |
| ✕ / fond / `Échap` | | Ferme la fenêtre | |

### Mode tuto

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Carte « Commencer › » / « Plus tard » | `→` ou `Entrée` / `Échap` | Lance ou reporte la visite à l'arrivée par `?tuto` | |
| « Suivant › » / « Précédent » | `→`, `Entrée` / `←` | Étape suivante ou précédente | La dernière étape propose l'outil suivant ; après le dernier, « Terminer » ramène à l'accueil. « Précédent » apparaît dès la 2e étape |
| « Passer » | `Échap` | Quitte la visite (première étape) | Les touches de la visite sont prises avant l'éditeur |
| Pastilles « ? » | | Survol : explication de l'étape | Posées toutes les 0,5 s sur les fonctions visibles ; menus ouverts compris |
| Visites | | Schéma (10 étapes, exemple « Interface IoT »), PCB (12, exemple « Interface IoT 4 couches »), Recherche de composants (8), Gestion LIB (9), Visionneuse IPC-2581 (9) | Le parcours suit l'ordre des cartes de l'accueil |

### Raccourcis communs aux éditeurs

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Annuler | `Ctrl+Z` | Annule | `Cmd` accepté |
| Rétablir | `Ctrl+Y`, `Ctrl+Maj+Z` | Rétablit | |
| Enregistrer .json | `Ctrl+S` | Enregistre en local | |
| Sauvegarder le projet → GitHub | `Ctrl+Maj+S` | Enregistre puis envoie sur GitHub | Lancé par WEB·SUITE ; sinon enregistrement simple |
| Tout sélectionner | `Ctrl+A` | Sélectionne tout | |
| Copier / Couper / Coller | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Presse-papiers | `Ctrl+C` laisse la main au navigateur s'il y a du texte sélectionné |
| Rechercher | `Ctrl+F` | Ouvre (sans refermer) le champ de recherche de repère ou de net | Remplace la recherche du navigateur |
| Mesure | `K` | Mode mesure | Visionneuse IPC-2581 : `M` |
| Montrer au PCB / au schéma | `L` | Cross-probing vers l'autre onglet | |
| Composant... / Empreinte... | `A` | Explorateur de la bibliothèque | |
| Pivoter | `R` | Pivote la sélection (un quart de tour pendant le placement) | PCB : `Maj+R` tourne dans l'autre sens pendant un glissement |
| Grille | `G` | Affiche ou masque la grille | |
| Supprimer | `Suppr` | Supprime la sélection | Schéma : `Retour arrière` aussi |
| Sélection | `V` (schéma) / `Échap` ou `S` (PCB) | Revient à la sélection | `Échap` termine d'abord le geste en cours, puis efface la sélection |
| Nets : tous / Chevelu | `N` | Schéma : cycle d'affichage des noms de nets ; PCB : chevelu | |
| Supprimer les fils / Dérouter | `U` | Schéma : supprime les fils de la sélection ; PCB : supprime pistes et vias de la sélection | |
| Flèches | `←` `↑` `→` `↓` | Schéma : déplace la sélection d'un pas de grille | Une rafale compte pour une étape d'historique |
| `Page ↑` / `Page ↓` | | Schéma : feuille précédente / suivante ; PCB : couche voisine | |
| Touches `1` à `9`, `0` | | PCB : couche cuivre 1 à 10 | |

Les autres raccourcis (tracé, zone, serpentin, coordonnées avec `Tab`, `Ctrl+G` pour grouper…) sont dans les chapitres des éditeurs. Les raccourcis sont ignorés quand le focus est dans un champ de saisie.

### Recherche (`Ctrl+F`) et mesure (`K`)

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Outils, « Rechercher » | `Ctrl+F` | Ouvre ou ferme la boîte de recherche (champ « Repere ou nom de net ») ; `Ctrl+F` ne fait qu'ouvrir | Schéma : repères de toutes les feuilles et nets ; PCB : empreintes et nets. Absent de la visionneuse |
| Résultats | `↑` `↓` / `Entrée` / `Échap` | Choisit, va à la cible, ferme ; au plus 14 lignes | Message « Rien de ce nom dans ce document. » |
| ✕ de la boîte | | Ferme | |
| Pied de boîte | | « Fleches pour choisir · Entree pour y aller · Echap ferme » (tel qu'à l'écran, sans accents) | |
| Placer, Repères, « Mesure » | `K` | Mode mesure : un clic départ, un clic arrivée, un troisième repart | Le mode se quitte par `Échap` (deuxième appui) ou en changeant d'outil |
| Lecture de la cote | | « Mesure d mm · ΔX · ΔY · angle° » dans la barre d'état et sur la feuille | Schéma : « convention de dessin (1 case = 1 mm), pas une cote de fabrication » |
| `Échap` en mode mesure | `Échap` | Efface la cote en cours | |

### Cross-probing et session de travail

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Outils, « Montrer au PCB » (schéma) / « Montrer au schéma » (PCB) | `L` | Envoie la sélection à l'onglet voisin par `BroadcastChannel` ; réponse : montré / absent / aucun onglet / indisponible | Sur demande, pas en suivi permanent. En `file://`, deux onglets n'ont pas la même origine : servir le dépôt par `web_CAO.py`. Rien de sélectionné : « Rien à montrer » |
| Bouton d'entête vers l'autre éditeur | | Part avec la cible : un seul composant sélectionné ; à défaut, au schéma le net du premier fil sélectionné, au PCB le net mis en évidence | Rien de sélectionné : navigation simple |
| Mise de côté du travail | | Document, vue et état « modifié » rangés dans `sessionStorage` à chaque départ, à `pagehide` et à la mise en arrière-plan de l'onglet | Propre à l'onglet ; plafond de 3 Mo ; trop gros ou stockage indisponible : confirmation avant de partir |
| Garde de fermeture | | Question à la fermeture d'un onglet modifié | Pas posée pour un changement d'outil |
| Export vers le PCB (schéma) | | Met à jour la carte du projet (empreintes, boîtiers, valeurs, nets ; placement et routage gardés), l'écrit en local, ouvre l'Éditeur PCB | Voir [l'Éditeur Schématique](02-editeur-schematique.md) |
| Alertes entre outils | | Les modifications du schéma alimentent le badge Schéma ↔ PCB du PCB ; les modifications de la Gestion LIB préviennent le schéma et le PCB | |

### Variantes de montage

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Schéma, Fichier, « Variantes de montage… » | | Fenêtre « Variantes de montage (BOM) » | 20 variantes au plus par document, nom de 40 caractères |
| Boutons radio des variantes | | Variante active : « Carte complète » (tout monté) ou une variante | Réglage du document, non annulable |
| Nom de variante (champ) | | Renomme | Un nom vide est refusé |
| « Nom (ex. Lite, Pro…) », menu « vierge » / « copie de … », « ＋ Ajouter » | | Crée une variante, éventuellement à partir des non-montés d'une autre | |
| ⇩ d'une ligne | | Exporte la BOM CSV de cette variante | |
| ✕ d'une ligne | | Supprime la variante après confirmation ; ses composants redeviennent montés | |
| « ⇩ Exporter la BOM de chaque variante » | | Un CSV par variante, carte complète comprise | |
| « Filtrer : repère, valeur, boîtier… » | | Filtre la matrice (repère, valeur, boîtier, type) | |
| Matrice (cases par composant et par variante) | | Cochée : monté ; non cochée : non monté (« NM ») | Un pas d'historique par geste |
| ✓ / ✗ en tête de colonne | | Tout monter / ne rien monter, parmi les composants filtrés | |
| Panneau Propriétés, « Monté dans les variantes » | | Une case par variante pour le composant | Pas pour les symboles sans repère |
| « Gérer les variantes de montage… » / « Créer des variantes de montage… » | | Ouvre la fenêtre | |
| « Monter » / « Ne pas monter » (sélection multiple) | | Applique à la variante active | Visible quand une variante est active |
| Panneau Nomenclature & Nets, menu de variante et ◫ | | Choisit la variante active ; ◫ ouvre la fenêtre | |
| Fichier, « Nomenclature .csv » / « Nomenclature .xlsx » (schéma) | | Exportent la variante active | |
| PCB, Fichier, « Variante de montage… » | | Choisit la variante ; « ⟳ Reprendre du schéma » relit les variantes du schéma enregistré ; « Fermer » | Les variantes ne se créent pas au PCB |
| Empreintes non montées (PCB) | | Voilées, barrées, « NM » ; retirées de `bom.csv` et `positions.csv` | Les pastilles restent gravées |

### Espace de travail et panneaux

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Affichage, « Espace de travail ▾ » | `Échap` ferme | Menu « Panneaux » : une ligne cochée par panneau (✓ visible, avec son emplacement) | |
| « Tout afficher » | | Rouvre les panneaux fermés | |
| « Disposition en colonnes » | | Remet les docks d'usine, dépliés | |
| « Réinitialiser la disposition » | | Disposition d'usine complète | Message « Espace de travail réinitialisé. » |
| En-tête de panneau (glisser) | | Déplace vers un dock ou fait flotter | Seuil de 5 px avant le glissement |
| En-tête (double-clic) | | Replie ou déplie | |
| ▾ « Replier » | | Replie le panneau | |
| □ « Plein écran » / ⧉ « Restaurer (Échap) » | `Échap` | Plein écran sur la feuille | |
| ⬒ « Détacher / rattacher » | | Passe en flottant et revient à son dock | |
| ✕ « Fermer » | | Masque ; le menu « Espace de travail » le rouvre | |
| Poignées de dock et bords des panneaux flottants | | Redimensionnent | Dock : 150 px au moins |
| Panneau qui a quelque chose à dire | | Réapparaît, se déplie et s'allume un instant (par exemple un calcul terminé) | Ne change pas de place |

### Téléphone

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Portrait (≤ 600 px de large) / paysage (≤ 500 px de haut) | | Active la disposition téléphone : docks masqués, panneaux (docks et flottants) en onglets dans un tiroir | Tablette et ordinateur gardent leur disposition |
| Poignée (« Ouvrir ou fermer les panneaux ») | | Ouvre ou ferme le tiroir | |
| Onglets du tiroir | | Un onglet par panneau ; le toucher ouvre, le re-toucher d'un onglet actif ferme | |
| Languette « Panneaux ‹ » | | Ouvre le tiroir en paysage | |
| Barre d'outils | | Défile au doigt ; cibles de 40 px | |

## Limites connues

- **Page en `file://`** : pas de projets par chemin, pas de LIB, pas de simulation ; les profils restent dans le navigateur, le cross-probing entre onglets ne passe pas.
- **Sélecteur de dossier** : l'accès sans serveur aux projets repose sur le sélecteur de dossier natif du navigateur (la documentation du code cite Chrome et Edge) ; ailleurs, il faut le serveur et un chemin saisi.
- **Projet virtuel** : sans serveur ni sélecteur, un projet n'existe qu'en mémoire du navigateur, et il est refermé à la reprise suivante.
- **Mode réseau** : projets refusés et LIB en lecture seule sans `--projets-reseau` ; ni mot de passe, ni chiffrement de la LIB au-delà du HTTPS décrit.
- **Brouillons** : écrits toutes les 30 s seulement avec un projet ouvert ; pas à la fermeture de page.
- **Travail mis de côté** : propre à l'onglet, 3 Mo au plus, perdu à la fermeture de l'onglet. Un document plus gros n'est pas mis de côté ; la confirmation avant de changer d'outil le dit.
- **Profils** : un profil est une habitude de travail, jamais un document. Le renommer à la main dans `profils/` ne renomme pas la copie du navigateur ; passer par « Supprimer celui-ci » pour effacer les deux.
- **Tactile** : la roulette et « Tactile » n'existent que dans le schéma, le PCB et la visionneuse IPC-2581. Le serveur prévoit Pyto sur iPad (détection `sur_ios`, rappel de garder Pyto au premier plan, repli sans `ssl`, option `--dossier` « utile sous Pyto ») ; la commande `python web_CAO.py --local --dossier <dossier>` est celle du README, et un en-tête du code consigne un diagnostic confirmé sur iPad (Pyto 19.0.1, Python 3.10).
- **Recherche et mesure** : la visionneuse IPC-2581 n'utilise pas ce panneau de repérage : pas de `L`, `Ctrl+F` y reste celui du navigateur, et sa mesure est sur `M`. Au schéma, la mesure n'est pas une cote.
- **Cross-probing** : exact seulement (une correspondance partielle n'est pas tentée) ; il faut que l'autre onglet soit ouvert et que la cible y soit.
- **Variantes** : elles se définissent au schéma seulement ; la carte en garde une copie à la synchronisation. Une variante ne change pas le cuivre.
- **Historique** : 60 étapes au schéma, 80 au PCB (et un budget mémoire) ; il ne survit pas à un rechargement de page.
- **Mode tuto** : les étapes sont fixes ; elles ne s'adaptent pas à l'état du document.

## Voir aussi

- [Éditeur Schématique](02-editeur-schematique.md) : feuilles, bus, netlist, export vers le PCB, panneau Propriétés.
- [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md) et [contraintes et fabrication](04-editeur-pcb-fabrication.md) : raccourcis de tracé, DRC, exports.
- [Gestion LIB](05-gestion-lib.md) et [Recherche de composants](06-recherche-composants.md) : catalogue et datasheets.
- [Visionneuse IPC-2581](07-visionneuse-ipc2581.md) : mesure `M`, plans, fiche de mesure.
- [Claude et le MCP](11-claude-mcp.md) : panneau « Claude », cartes de proposition, une carte égale une étape d'annulation.
- [README du dépôt](../../README.md) : démarrage rapide, options du serveur, bancs d'essai.
- [Guide de la simulation EM](../simulation-em.md) et [vérification de la carte](../verification-carte.md).
