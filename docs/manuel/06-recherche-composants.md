# Recherche de composants

La Recherche de composants interroge [pcbparts.dev](https://pcbparts.dev/) : stock et prix JLCPCB / LCSC, équivalences, brochage, symbole et empreinte KiCad, fiches Mouser et DigiKey, cartes de référence et règles de conception. Elle passe par le serveur local (`python web_CAO.py`) et ne s'ouvre pas en `file://`.
Depuis l'Éditeur Schématique, une fenêtre « Enrichissement composant » applique le résultat à un composant déjà posé : référence, fabricant, boîtier, caractéristiques, brochage, datasheet.
Un composant JLCPCB / LCSC se verse aussi dans la bibliothèque : le bouton « ⚡ Ajouter à Gestion LIB » ouvre l'import de [Gestion LIB](05-gestion-lib.md).

## Guide par tâche

### Je veux trouver une pièce en stock chez JLCPCB

1. Ouvrir la page : bouton « Recherche de composants » de l'accueil (nouvel onglet), ⌕ dans la barre de l'Éditeur Schématique ou de l'Éditeur PCB, ou « Recherche composants » dans la barre de Gestion LIB.
2. Laisser l'outil « Recherche JLCPCB » (outil de départ) et saisir la requête dans « Requête », par exemple `10k resistor 0603 1%`.
3. Au besoin, préciser « Boîtier », « Fabricant », « Sous-catégorie », ou ouvrir « Filtres avancés » (stock minimum, bibliothèque, tri, filtres paramétriques).
4. Appuyer sur Entrée ou sur « Rechercher ». Cliquer une ligne du tableau : sa fiche s'affiche dans le panneau « Détail ».

> [!NOTE]
> Les exemples de l'outil sont en anglais (`10k resistor 0603 1%`, `STM32F103 LQFP48`). `À vérifier` : le comportement avec une requête en français (c'est pcbparts.dev qui interprète la requête, le dépôt ne la traduit pas).

### Je veux trouver un équivalent à une pièce en rupture

1. Sélectionner la pièce dans le tableau.
2. Dans « Détail », cliquer « Équivalences » : le formulaire de l'outil « Équivalences » se remplit avec le code LCSC et la requête part aussitôt (le tableau est remplacé ; « ↶ Précédent » le ramène).
3. Dans « Filtres avancés », cocher « Même boîtier », choisir la « Bibliothèque » ou fixer un « Stock minimum », puis relancer.

### Je veux récupérer le brochage, le symbole ou l'empreinte KiCad

1. Sélectionner la pièce, puis cliquer « Brochage » dans « Détail » (numéros et noms de broches, extraits du symbole EasyEDA).
2. Pour KiCad : « Modèle CAO » interroge ComponentSearchEngine (colonnes « Broches », « Modèle » et « 3D » : présence d'un modèle et d'un modèle 3D, d'après la réponse de pcbparts.dev). « Symbole KiCad » renvoie le texte du symbole et de l'empreinte.
3. Le texte renvoyé s'enregistre tel quel dans une bibliothèque KiCad ; l'outil n'écrit lui-même aucun fichier de la LIB à partir de ce texte. La conversion d'un `.kicad_mod` en empreinte de la LIB passe par Claude (`lib_kicad_convertir`) : voir [Gestion LIB](05-gestion-lib.md#pilotage-par-claude).

### Je veux recouper avec Mouser ou DigiKey

1. Sélectionner la pièce, puis cliquer « Mouser » ou « DigiKey » dans « Détail ».
2. Ces deux outils ont un quota journalier : les utiliser après la recherche JLCPCB, pas à sa place.

### Je veux enrichir un composant du schéma (référence, boîtier, brochage, datasheet)

1. Dans l'Éditeur Schématique, sélectionner le composant. Dans ses propriétés, section « Recherche en ligne », cliquer « ⌕ Rechercher & Enrichir » (« ⌕ Modifier / Ré-enrichir » s'il l'est déjà). Le bouton n'existe pas pour les symboles sans repère : Alimentation, Masse, Étiquette / net, Étiquette globale, les annotations (Tension, Courant, Texte libre, Note encadrée) et « Type inconnu ». Il n'apparaît que pour un seul composant sélectionné.
2. La fenêtre s'ouvre et lance seule la recherche : la requête est devinée depuis le composant (voir Référence). La corriger dans le champ et cliquer « Chercher » si besoin.
3. Cliquer un candidat à gauche (le premier, « ★ Recommandé », est sélectionné d'office). À droite, vérifier « DISTRIBUTEURS & DISPONIBILITÉ », les « DONNÉES TECHNIQUES À ENRICHIR » et le tableau de brochage.
4. Décocher ce qu'il ne faut pas écrire ; « Essentiel seul » ne garde que les lignes marquées essentielles.
5. S'il y a des composants identiques (même type, même valeur), cocher ou non « Appliquer également aux N autre(s) composant(s) identique(s) ».
6. Cliquer « ✓ Valider et enrichir ». Le pied de page de l'éditeur résume ce qui a été fait.

> [!NOTE]
> L'enrichissement ne pose pas de nouveau composant : il complète un composant déjà placé. Pour en poser un à partir du catalogue, voir [Éditeur Schématique](02-editeur-schematique.md) et [Gestion LIB](05-gestion-lib.md).

### Je veux corriger les fils d'un composant après import du brochage

1. Dans la fenêtre d'enrichissement, choisir un candidat qui a un brochage (tableau « BROCHAGE SCHÉMATIQUE OFFICIEL »).
2. Si l'outil détecte des écarts entre vos fils et le brochage officiel, une section « VÉRIFICATION DU CÂBLAGE SCHÉMATIQUE (N anomalie(s)) » liste des corrections cochées par défaut : inversions de deux fils (alimentation ⇄ masse, SDA ⇄ SCL, TX ⇄ RX, D+ ⇄ D-, noms croisés) ou déplacement d'un fil vers une broche libre. Seuls les fils reliés à un net nommé sont examinés ; les broches sont rapprochées par numéro.
3. Décocher celles à refuser, puis « ✓ Valider et enrichir » : les fils cochés sont déplacés, même si « Brochage officiel » est décoché (les noms de broches ne sont alors pas importés). Sinon, la mention « Câblage existant cohérent avec le nouveau brochage » s'affiche.

### Je veux garder la datasheet avec le projet

1. Dans la fenêtre d'enrichissement, laisser « Télécharger la Datasheet » coché (la ligne n'existe que si une adresse de datasheet est connue).
2. Après validation, le PDF est enregistré dans `datasheets/` du projet (voir Référence). Le bouton « 📄 Ouvrir la Datasheet (locale) » des propriétés du composant l'ouvre. Si le téléchargement est refusé ou échoue (serveur en écoute réseau sans `--local`, adresse refusée, document non PDF), la barre d'aide indique « Fiche technique non téléchargée » avec la raison, et l'adresse en ligne est gardée sur le composant : le bouton « 📄 Ouvrir la Datasheet ↗ » l'ouvre.

### Je veux importer la pièce dans la LIB

1. Sélectionner la pièce JLCPCB dans le tableau (elle doit avoir un code LCSC).
2. Dans « Détail », cliquer « ⚡ Ajouter à Gestion LIB » : Gestion LIB s'ouvre dans un nouvel onglet avec l'import JLCPCB / LCSC préparé sur ce code.
3. Vérifier la fiche de 39 colonnes, puis « 📥 Confirmer et Enregistrer dans la Bibliothèque (39 colonnes) ». Le détail de cette étape est dans [Gestion LIB](05-gestion-lib.md).

### Je veux retrouver ou exporter un résultat

1. « ↶ Précédent » revient au résultat précédent (30 au plus dans la page).
2. « Exporter .csv » écrit le tableau affiché (pour une fiche unique : une ligne avec toutes ses clés) ; « Exporter .json » écrit la réponse complète.
3. Changer d'outil (schéma, PCB, Gestion LIB, accueil) puis revenir : la recherche est reprise sans nouvelle requête ; 5 entrées d'historique seulement suivent ce voyage.

## Référence

### Barre d'outils

| Bouton ou champ | Effet | Limites |
|---|---|---|
| ⌂ Accueil | Page d'accueil | Le contexte de recherche est rangé dans la session de l'onglet |
| Éditeur schématique | Retour au schéma, resté dans l'onglet | |
| Éditeur PCB | Retour au routage, resté dans l'onglet | |
| 📚 Gestion LIB | Gestion des bibliothèques | |
| 👤 … | Utilisateur : panneaux, réglages et derniers documents lui appartiennent | Voir [Accueil, projets, tactile](01-accueil-projets-tactile.md) |
| Rechercher (Entrée) | Lance l'outil courant avec les champs du formulaire | Désactivé pendant une requête ; mêmes boutons « Rechercher » et « Réinitialiser » sous le formulaire |
| Réinitialiser | Reconstruit le formulaire de l'outil (valeurs par défaut du serveur) | N'efface pas le tableau |
| ↶ Précédent | Rouvre le résultat précédent et remet son formulaire | Grisé sans historique ; 30 entrées |
| Exporter .csv | Fichier `<outil>-<date>-<heure>.csv`, séparateur point-virgule, du tableau affiché | Sans ligne (réponse vide ou message du serveur) : « Rien à exporter. » dans le pied de page ; une fiche unique sort sur une ligne |
| Exporter .json | Fichier `<outil>-<date>-<heure>.json`, réponse complète | |
| Espace de travail ▾ | Menu « Panneaux » : afficher ou masquer chaque panneau, « Tout afficher », « Disposition en colonnes », « Réinitialiser la disposition » | Disposition conservée dans le stockage local |

Pied de page : « Outil » (nom technique de l'outil courant), « Résultats » (nombre de lignes), message d'état, « serveur : » (adresse et nombre d'outils si la passerelle répond, « injoignable » sinon).

Raccourcis : Entrée dans un champ texte ou nombre lance la recherche (pas dans la zone de texte JSON ni dans une liste de choix) ; `/` hors d'un champ place le curseur dans « filtrer… » du panneau « Outils ».

### Panneaux

Chaque panneau a les boutons ▾ (Replier), □ (Plein écran), ⬒ (Détacher / rattacher) et ✕ (Fermer).

| Panneau | Contenu |
|---|---|
| Outils | Les outils groupés par famille, avec le champ « filtrer… » (cherche dans le nom, le titre et le résumé) |
| Détail | Fiche de la ligne sélectionnée et boutons d'enchaînement |
| Réponse brute | JSON renvoyé par pcbparts.dev, replié par défaut, bouton « Copier » |

### Les outils

Familles et outils du panneau « Outils » (titre affiché, nom technique) :

| Famille | Outils |
|---|---|
| JLCPCB / LCSC | Recherche JLCPCB (`jlc_search`), Stock en direct (`jlc_stock_check`), Fiche d'un composant (`jlc_get_part`), Équivalences (`jlc_find_alternatives`), Brochage (`jlc_get_pinout`), Catégories JLCPCB (`jlc_search_help`) |
| Distributeurs | Recoupement Mouser (`mouser_get_part`), Recoupement DigiKey (`digikey_get_part`) |
| Modèles CAO | Modèles CAO disponibles (`cse_search`), Symbole et empreinte KiCad (`cse_get_kicad`) |
| Capteurs & cartes | Choix d'un capteur (`sensor_recommend`), Cartes de référence (`board_search`), Détail d'une carte (`board_get`) |
| Règles de conception | Règles de conception (`get_design_rules`) |

Un outil que le serveur expose et que le catalogue ne décrit pas est listé sous « Autres » (liste non filtrée seulement).

### Formulaire

Les champs courants sont visibles ; les autres sont derrière « Filtres avancés ▾ (n) ». Un champ obligatoire selon le serveur porte un astérisque et reste visible. Les valeurs par défaut viennent du schéma du serveur. Un paramètre que le serveur ajoute et que le catalogue ignore apparaît en fin de « Filtres avancés », sous son nom technique ; un champ retiré côté serveur disparaît.

Types de champ : texte ; nombre (vide = non envoyé) ; case (une case décochée est envoyée comme `false`) ; liste (valeurs séparées par des virgules) ; choix ; oui / non / « (indifférent) » ; JSON (texte libre analysé). Un nombre invalide, un JSON invalide ou un champ obligatoire vide arrêtent l'envoi avec un message sous le formulaire. Les valeurs vides ne sont pas transmises à pcbparts.dev.

| Outil | Champs visibles | « Filtres avancés » |
|---|---|---|
| Recherche JLCPCB | Requête, Boîtier, Fabricant, Sous-catégorie | Boîtiers (ou), Bibliothèque, Tri (Stock décroissant / Prix croissant), Stock minimum, Nombre de résultats, Basic/Preferred d'abord, Tous les termes (ET), Filtres paramétriques (JSON) |
| Stock en direct | Requête, Catégorie, Sous-catégorie, Boîtier, Fabricant | Bibliothèque, Tri ((défaut) / Quantité / Prix), Stock minimum (0 pour voir les ruptures), Page, Nombre de résultats |
| Fiche d'un composant | Code LCSC, Référence fabricant | |
| Équivalences | Code LCSC | Même boîtier, Bibliothèque, Empreinte EasyEDA, Stock minimum, Nombre de résultats |
| Brochage | Code LCSC | UUID du symbole |
| Catégories JLCPCB | Catégorie, Sous-catégorie | |
| Recoupement Mouser | Référence | |
| Recoupement DigiKey | Référence | |
| Modèles CAO disponibles | Référence ou mot-clé | Nombre de résultats |
| Symbole et empreinte KiCad | Référence fabricant | Identifiant CSE (issu d'une recherche précédente) |
| Choix d'un capteur | Recherche libre, Grandeurs mesurées, Technologie, Bus, Plateforme | Nombre de résultats |
| Cartes de référence | Recherche libre, Circuit utilisé, Thèmes, Organisation, Nombre de couches | Nombre de résultats |
| Détail d'une carte | Identifiant de la carte, Centrer sur un circuit | Inclure les passifs, Inclure la netlist (réponse parfois > 100 ko) |
| Règles de conception | Sujet | |

Choix de « Bibliothèque » : (indifférent), Basic, Preferred, Sans frais de pose, Extended, Tous. Choix de « Bus » : (indifférent), I²C, SPI, UART, 1-Wire, Analogique, Numérique, PWM. Choix de « Plateforme » : (indifférente), Arduino, ESPHome, MicroPython, CircuitPython, Tasmota, Zephyr.

Précisions de l'interface : « Recherche JLCPCB » ne renvoie que des pièces en stock (stock ≥ 10) et sert en langage naturel ; « Stock en direct » interroge l'API JLCPCB en direct, plus lent, à réserver au contrôle avant commande ; « Catégories JLCPCB » sans paramètre liste les catégories, avec une catégorie ses sous-catégories, avec une sous-catégorie les attributs filtrables à reporter dans les « Filtres paramétriques (JSON) » (exemple affiché : `[{"name":"Resistance","op":"=","value":"10kOhm"}]`) ; « Cartes de référence » couvre environ 285 schémas de cartes libres.

### Résultats

La réponse s'affiche selon sa forme : tableau cliquable (liste d'objets), fiche (enregistrement unique : Fiche d'un composant, Symbole et empreinte KiCad, Détail d'une carte, Règles de conception), ou bloc de texte pour les textes longs. Si le serveur répond par un message, il est affiché tel quel. Un bandeau indique « Total » (si la réponse en donne un), la `query`, le `topic` ou le `slug` de la réponse sous leur nom technique, « Affichés » et « Clic sur une ligne pour le détail ». La première ligne est sélectionnée d'office.

| Outil | Colonnes du tableau |
|---|---|
| Recherche JLCPCB, Stock en direct, Équivalences | LCSC, Référence, Fabricant, Boîtier, Stock, Prix 1+, Bibliothèque |
| Brochage | Broche, Nom |
| Modèles CAO disponibles | Référence, Fabricant, Description, Broches, Modèle, 3D |
| Choix d'un capteur | Nom, Fabricant, Type, Tension, Mesure, Bus, Plateformes |
| Cartes de référence | Identifiant, Nom, Organisation, Contenu, Couches, Composants |

Pour les autres outils, les colonnes sont les clés simples de la réponse (8 au plus). Dans le tableau, « Prix 1+ » est affiché en dollars. Les exports `.csv` reprennent ces colonnes, avec un BOM UTF-8 pour Excel.

### Panneau « Détail » : boutons d'enchaînement

Chaque bouton remplit le formulaire de l'outil visé avec la valeur de la ligne et lance la requête. Les boutons proposés dépendent des champs présents.

| Bouton | Effet | Condition |
|---|---|---|
| ⚡ Ajouter à Gestion LIB | Ouvre `gestion-lib.html?importer_lcsc=<code>` dans un nouvel onglet | Un code LCSC |
| Copier `<code>` | Copie le code LCSC | Un code LCSC |
| Fiche complète | Outil « Fiche d'un composant » | Un code LCSC |
| Équivalences | Outil « Équivalences » | Un code LCSC |
| Brochage | Outil « Brochage » | Un code LCSC |
| Modèle CAO | Outil « Modèles CAO disponibles » | Une référence fabricant |
| Symbole KiCad | Outil « Symbole et empreinte KiCad » (par référence ou par identifiant CSE) | Une référence fabricant ou un identifiant CSE |
| Mouser, DigiKey | Recoupement distributeur (quota journalier) | Une référence fabricant |
| Cartes utilisant ce circuit | Outil « Cartes de référence », champ « Circuit utilisé » | Une référence fabricant |
| Contenu de la carte | Outil « Détail d'une carte » | Un identifiant de carte |
| Sous-catégories | Outil « Catégories JLCPCB » | Une catégorie |
| Fiche technique ↗, Page LCSC ↗, Dépôt source ↗, Image ↗, Page produit ↗, Lien ↗ | Ouvre l'adresse dans un nouvel onglet | Adresse en `http` ou `https` uniquement |

### Fenêtre « Enrichissement composant » (Éditeur Schématique)

**Requête de départ.** Pour un circuit intégré, un régulateur, un optocoupleur, ou une valeur qui ressemble à une référence (au moins deux lettres puis un chiffre), la requête est la valeur du composant. Sinon elle assemble valeur, boîtier (sauf `xx`) et un mot anglais selon la famille : `resistor`, `capacitor`, `inductor`, `diode`, `transistor`.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| ✕ (en-tête), Échap, clic hors de la fenêtre, Annuler | Ferme sans rien écrire | |
| Champ de recherche, Chercher (Entrée) | Cherche chez JLCPCB (16 résultats au plus) | Sans résultat JLCPCB, bascule seule sur Mouser et DigiKey |
| Basic / Sans frais d’abord | Ne garde que les pièces Basic ou Preferred s'il y en a | S'il n'y en a aucune, tout reste affiché |
| Mouser / DigiKey ↗ | Cherche directement chez Mouser et DigiKey | La référence est extraite de la requête (premier mot qui mêle lettres et chiffres) |
| N trouvé(s) | Nombre de candidats affichés | |
| Carte candidat | Sélectionne : charge la fiche JLCPCB, Mouser et DigiKey (sauf s'ils ont déjà répondu) et le brochage (sans code LCSC, une recherche JLCPCB sur la référence en cherche un) | Tri : Basic / Preferred d'abord, puis stock décroissant. Badges : Mouser, DigiKey, Mouser + DigiKey, ★ Recommandé (premier après tri), Basic |
| Tout cocher | Coche toutes les lignes de « DONNÉES TECHNIQUES À ENRICHIR » | |
| Essentiel seul | Ne laisse cochées que les lignes essentielles | |
| Appliquer également aux N autre(s) composant(s) identique(s) | Copie le résultat aux composants de même type et même valeur | N'apparaît que s'il y en a ; coché d'office ; ne reporte pas le déplacement des fils |
| ✓ Valider et enrichir | Écrit sur le composant ce qui est coché | Grisé tant qu'aucune fiche n'est chargée |

Lignes de « DONNÉES TECHNIQUES À ENRICHIR » (cochées d'office : essentielles) :

| Ligne | Coche d'office | Écrit sur le composant |
|---|---|---|
| Référence (MPN) | oui | référence fabricant |
| Fabricant | oui | fabricant |
| Boîtier / Empreinte | oui, si connu | champ « Boîtier » du composant du schéma (`pkg`). L'empreinte déjà posée sur la carte ne change pas d'elle-même ; l'export ⇉ PCB reporte les boîtiers changés (README du dépôt) |
| Caractéristiques (une ligne par valeur) | oui | « specs », seules les lignes cochées remplacent les anciennes (aucune cochée : les anciennes restent) |
| Télécharger la Datasheet | oui, si une adresse existe | voir ci-dessous |
| Code LCSC | non | code LCSC |
| Référence Mouser, Référence DigiKey | non, sauf pièce absente de JLCPCB | référence distributeur |
| Brochage officiel | oui, si un brochage existe | noms et numéros de broches, marqués vérifiés ; pour un circuit intégré, le nombre de broches est agrandi si le brochage en a plus (jamais réduit) |

Dans tous les cas, le résumé de stock et de prix JLCPCB, Mouser et DigiKey est mémorisé sur le composant. L'opération compte pour une étape d'annulation de l'éditeur. Le PCB ouvert reçoit un signal de mise à jour du brochage.

Tableau de brochage : colonnes « N° », « Broche officielle » (avec « ✓ Actuel » ou « Actuel sur schéma : … »), « Type électrique » (Alimentation, Masse (GND), Bus / Comm, Signal / E-S, déduit du nom), « Fil schématique actuel » et « Concordance » (« Prêt à câbler », « ✓ Broche définie », « ✓ Concordant », « ✓ Masse OK », « ✓ Alim OK », « Câblé (net) », « ⚠️ Court-circuit VCC/GND » ou « GND/VCC »).

**Datasheet.** Le serveur télécharge le PDF dans `datasheets/` du dossier du projet (`datasheets/` du dossier `_communs` sans projet), sous le nom de la référence. Garde-fous : http ou https, ports 80, 443, 8080, 8443 ; adresses publiques seulement ; 50 Mo au plus ; le contenu doit être un PDF (sinon erreur 422) ; refusé (403) quand le serveur écoute sur le réseau sans `--local`, même avec `--projets-reseau`. Une page web qui contient un lien vers un PDF est suivie une fois.

**Propriétés du composant** (section « Recherche en ligne ») : « ✕ » (Effacer les données enrichies) retire référence, fabricant, caractéristiques, datasheet, code LCSC, références distributeurs et résumé distributeurs ; il ne retire pas le brochage ni le boîtier. « 📄 Ouvrir la Datasheet » ouvre le PDF local, ou l'adresse en ligne (↗).

### Serveur

| Route | Rôle |
|---|---|
| `GET /api/tools` | Liste des outils et de leurs schémas, plus la liste autorisée (`allowed`) |
| `POST /api/tool` | Corps `{"name": …, "arguments": {…}}` ; renvoie `{"data": …}` |
| `POST /api/datasheet/telecharger` | Téléchargement d'une datasheet dans le projet |
| `GET /api/datasheet/ouvrir?projet=…&fichier=…` | Ouvre un PDF `.pdf` déjà rangé dans `datasheets/` |

Seuls les 14 outils de la liste blanche (`ALLOWED_TOOLS` de `python/passerelle_mcp.py`) sont acceptés (« Outil inconnu » sinon, code 400) ; chaque appel vers pcbparts.dev attend 30 s au plus. La page n'appelle que son propre serveur : ouverte en `file://` ou depuis un autre port que celui affiché par `web_CAO.py`, elle affiche « Passerelle introuvable ». Tout ce qui vient du réseau est échappé avant affichage.

## Limites connues

- Il faut `python web_CAO.py` et un accès à pcbparts.dev ; hors ligne, aucune recherche. Les quotas de Mouser et DigiKey sont journaliers.
- La page garde 30 résultats d'historique (5 d'entre eux au retour d'un autre outil) ; une réponse trop volumineuse pour la session d'onglet n'est pas reprise (seule la requête l'est).
- « Recherche JLCPCB » ne montre que les pièces en stock (≥ 10) ; « Stock en direct » avec « Stock minimum » à 0 montre les ruptures.
- Le texte KiCad renvoyé n'est pas converti automatiquement en composant de la LIB.
- La fenêtre d'enrichissement n'a pas d'outil d'équivalences : pour changer de pièce, ouvrir la page Recherche de composants.
- Si la pièce choisie n'a pas de code LCSC (candidat Mouser ou DigiKey), le code LCSC déjà porté par le composant est supprimé à la validation.
- Le brochage vient du symbole EasyEDA : il manque pour les composants simples ou passifs (la fenêtre l'indique).
- Les détails de colonnes ou de champs d'un outil dépendent de la réponse de pcbparts.dev ; ce qui n'y est pas renvoyé n'apparaît pas. `À vérifier` : valeur par défaut de « Nombre de résultats » : elle vient du schéma lu sur pcbparts.dev à l'exécution, absente du dépôt (la fenêtre d'enrichissement envoie `limit: 16`, l'import de Gestion LIB `limit: 25`).

## Voir aussi

- [Gestion LIB](05-gestion-lib.md) : import JLCPCB / LCSC, 39 colonnes, conversion KiCad.
- [Éditeur Schématique](02-editeur-schematique.md) : propriétés d'un composant, vérification de brochage.
- [Accueil, projets, tactile](01-accueil-projets-tactile.md) : serveur local, projets, profils.
- [Claude et le MCP](11-claude-mcp.md) : pilotage des pages par Claude (outils `pcbparts_outils` et `pcbparts_appeler` : liste blanche de WEB_CAO relue à chaque appel, arguments de 2 Ko au plus).
- [README de la Recherche de composants](../../recherche-composants/README.md) : organisation des fichiers.
