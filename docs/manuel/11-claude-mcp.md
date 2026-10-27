# Claude et le MCP de web_suite

Chapitre du manuel de WEB_CAO. Claude Code pilote les pages ouvertes (schéma, PCB, Gestion LIB, visionneuse IPC-2581) par le serveur MCP de web_suite : il lit le projet, lance des calculs et propose ses écritures sous forme de cartes que l'utilisateur valide.
Le panneau « Claude », en bas à droite de chaque page, affiche ces cartes et permet d'écrire à Claude depuis la page, sur n'importe quel appareil.
Rien ne change dans le projet avant un clic, sauf si l'interrupteur « Appliquer directement (cet onglet) » est allumé ; les écritures dans la LIB attendent toujours le clic.

> [!NOTE]
> L'ancien assistant IA intégré aux pages est retiré. Les noms d'outils de ce chapitre sont ceux déclarés par le serveur MCP (dépôt voisin web_suite, `lanceur/mcp_*.py` ; synthèse dans `lanceur/docs/DETAILS.md`). Le catalogue embarqué dans WEB_CAO est `commun/pilote-aide.json`.

## Guide par tâche

### Je veux vérifier que Claude est prêt

1. Lancer WEB_CAO depuis WEB·SUITE (le panneau envoie ses demandes au lanceur ; un outil lancé seul répond « Le lanceur WEB·SUITE ne répond pas : lance l'outil depuis WEB·SUITE pour écrire à Claude. »).
2. Ouvrir un éditeur (schéma, PCB, Gestion LIB ou visionneuse) servi par le serveur : ouverte en `file://`, la page n'a pas de panneau.
3. Cliquer sur le bouton « Claude » en bas à droite. La ligne d'état en haut du panneau est testée à chaque ouverture, sans requête au modèle. Point vert : « Claude Code <version> connecté. » Point rouge : le message dit ce qui manque (Claude Code introuvable, non connecté, ne répond pas, lanceur absent). En rouge, « Envoyer » est désactivé.
4. Si Claude Code est introuvable, l'installer et se connecter une fois (`claude` dans un terminal du poste), ou donner son chemin au lanceur par la variable `WEB_SUITE_CLAUDE`.

### Je veux demander quelque chose à Claude depuis la page

1. Ouvrir le panneau « Claude ».
2. Choisir le modèle dans la liste (Opus, Sonnet ou Haiku ; Opus par défaut ; le choix est gardé sur l'appareil).
3. Écrire la demande dans « Demander à Claude… (Entrée pour envoyer) ». `Entrée` envoie, `Maj+Entrée` va à la ligne (8000 caractères au plus).
4. La conversation s'affiche au fil de l'eau : vos messages, les réponses, les outils appelés (lignes `→ nom_de_l_outil`) et les cartes de proposition. Le bouton affiche « Claude travaille… » pendant la demande.
5. La conversation continue d'une demande à l'autre. Le bouton « Nouvelle conversation » fait repartir Claude de zéro à la prochaine demande ; les cartes qui attendent un clic ou qu'on peut encore annuler restent affichées.

Claude Code est lancé par le lanceur sur le poste qui fait tourner les outils (Pi ou PC), limité aux outils du MCP web_suite (et au skill web-suite) : ni terminal, ni lecture ou écriture de fichiers du poste. Une demande est arrêtée au bout de 30 minutes.

### Je veux joindre une datasheet, une capture ou un fichier

1. Dans le panneau ouvert : bouton « Joindre » (choix de fichiers), ou coller une image dans la zone de saisie, ou glisser-déposer un fichier sur le panneau.
2. Pour joindre l'image de l'onglet courant : bouton « Vue » (visible seulement si la page a un canevas ; fichier `vue-<page>.png`).
3. Les pièces apparaissent en puces sous la zone ; le `×` d'une puce la retire. Elles partent avec la prochaine demande ; si la demande est refusée, elles restent.
4. Une pièce refusée est expliquée dans le panneau (« Pièce jointe refusée : … »).

Formats acceptés : images (PNG, JPEG, GIF, WebP ; les autres formats lisibles par le navigateur, ou une image trop grande, sont redessinés en JPEG de 2000 px au plus), PDF, et tout fichier texte en UTF-8 (le SVG est du texte). Un fichier binaire (zip, docx…) est refusé.

### Je veux valider, refuser ou défaire une proposition

1. Quand Claude propose une écriture, le panneau s'ouvre (même masqué) et affiche une carte : un titre, la ligne « avant → après », éventuellement des détails.
2. Cliquer sur « Appliquer » pour écrire, ou « Refuser » pour abandonner. Pendant l'application, la carte affiche « En cours… » sans bouton.
3. Un lot (jusqu'à 50 éléments) est une seule carte et, une fois appliqué, une seule étape de l'historique : `Ctrl+Z` dans l'éditeur défait tout le lot. Un seul refus dans le lot, et rien n'est modifié.
4. Les écritures qui n'entrent pas dans l'historique de l'éditeur (les réglages de simulation) portent un bouton « Annuler » sur la carte. Un geste d'interface (`pilote_interface`) n'en a pas : la carte ne l'annule pas (`Ctrl+Z` si l'éditeur en a fait une étape). Il refuse d'annuler si l'état a changé depuis (« L'état a changé depuis : annuler écraserait tes modifications. »).
5. Au clic, la page revérifie que rien n'a bougé sous la carte ; sinon, rien n'est appliqué.

### Je veux que Claude enchaîne sans carte à valider

1. Dans le panneau, cocher « Appliquer directement (cet onglet) ».
2. Les écritures de cet onglet sont alors appliquées aussitôt ; la carte est ajoutée au panneau (sans l'ouvrir), avec la mention « Appliquée directement (interrupteur allumé). ». L'écriture reste une étape de l'historique (`Ctrl+Z`).
3. L'interrupteur concerne un onglet seulement et s'éteint à chaque chargement de la page.
4. Il ne lève pas la règle des écritures dans la LIB : `lib_composant_creer`, `lib_composant_modifier` et `lib_simulation_lier` attendent toujours le clic sur la carte.

### Je veux régler une simulation d'après une datasheet

1. Ouvrir l'éditeur PCB (ou la visionneuse IPC-2581) et joindre la datasheet (PDF) au panneau, ou la citer.
2. Demander par exemple les paramètres du PDN ou des condensateurs depuis la fiche. Claude lit le catalogue des paramètres réglables (`cao_sim_lire` `catalogue` : `groupe.clé`, unité ou choix, valeur actuelle, où la lire dans la datasheet), puis propose `cao_sim_ecrire`.
3. La carte montre chaque valeur. L'unité doit être celle du catalogue de la page (aucune conversion) ; bornes et choix sont ceux du catalogue.
4. Appliquer. Annuler se fait par le bouton « Annuler » de la carte, pas par `Ctrl+Z`.
5. Relancer le calcul : `cao_calcul` le lance dans la page et rend son rapport (voir [Simulation SI](08-simulation-si.md), [PI, thermique, audit](09-simulation-pi-thermique-audit.md) et [RF et EM](10-simulation-rf-em.md)).

### Je veux faire dessiner ou compléter un schéma

1. Ouvrir l'éditeur schématique sur la feuille voulue.
2. Décrire le circuit. Claude lit le document (`cao_schema_lire`) puis propose `cao_schema_dessiner`.
3. La page joue le lot puis le défait avant de montrer la carte ; elle refuse un fil qui relierait d'autres broches que celles demandées (Claude étiquette alors). Appliquer pose le tout en une étape (`Ctrl+Z`).
4. Les opérations agissent sur la feuille affichée sauf si une « feuille » est donnée.

Voir [Éditeur schématique](02-editeur-schematique.md).

### Je veux faire router ou placer par Claude

1. Ouvrir l'éditeur PCB.
2. Demander le routage d'un net ou d'une paire. Claude lit les liaisons à router (`cao_pcb_lire` `liaisons`, `zone`), peut demander des points de passage à `cao_chemin` (rien n'est écrit), puis propose `cao_router` ou `cao_paire`.
3. La carte annonce le résultat et dessine un aperçu en pointillés sur la carte tant qu'elle attend. Une route bloquée ne laisse rien ; les autres routes du lot restent.
4. Appliquer charge le tracé vu, en une étape (`Ctrl+Z`). Seuls le cuivre et les empreintes sont repris : réglages, couche active et couches visibles restent les vôtres.
5. `cao_score` (routage ou placement) mesure l'avancement sans rien modifier ; `cao_drc` relance le DRC.

Voir [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md).

### Je veux créer un composant ou lier un modèle dans la LIB

1. Ouvrir Gestion LIB (la page doit rester ouverte).
2. Demander le composant, en joignant la datasheet. Claude calcule l'empreinte (`lib_empreinte_generer`) ou convertit un fichier KiCad (`lib_kicad_convertir`), contrôle (`lib_empreinte_verifier`, `lib_brochage_verifier`), puis propose `lib_composant_creer`.
3. La carte montre la ligne du catalogue, les remarques et l'aperçu de l'empreinte. Rien n'est écrit avant « Appliquer », même interrupteur allumé. L'empreinte est neuve (jamais d'écrasement), puis une ligne est ajoutée au catalogue sans réécrire les autres.
4. La carte n'a pas de bouton d'annulation : pour défaire, retirer la ligne à la main dans Gestion LIB.
5. Pour corriger une référence existante : `lib_composant_modifier`. Pour lier un modèle de simulation : `lib_simulation_lier`.

Voir [Gestion LIB](05-gestion-lib.md).

### Je veux utiliser Claude Code depuis un terminal

1. Déclarer le serveur une fois sur le poste des outils : `claude mcp add -s user web_suite -- python3 <dépôt web_suite>/lanceur/mcp_web_suite.py` (sous Windows : `py -3` et le chemin du dépôt). Depuis Windows vers un Pi, par SSH : voir `lanceur/docs/DETAILS.md` du dépôt web_suite.
2. Dans Claude Code, `/mcp` affiche l'état de la connexion.
3. Demander à Claude d'appeler `etat` : il dit quels outils tournent et sur quel port.
4. Pour agir dans une page, Claude liste les onglets (`pilote_onglets`) puis vise l'un d'eux (argument `onglet`) ; par défaut, l'onglet du bon type utilisé le plus récemment.

### Je veux retrouver ce qu'une proposition est devenue

1. Une écriture proposée qui attend plus de 2 minutes rend « en_attente » à Claude, avec un identifiant.
2. Claude la suit par `pilote_suivre` : appliquée, refusée, finie (avec son résultat), échouée, expirée, ou toujours en attente.
3. La carte reste dans le panneau tant qu'elle attend un clic ou peut être annulée.

## Référence

### Le panneau « Claude »

| Bouton ou zone | Effet | Écrit ? | Limites |
|---|---|---|---|
| « Claude » (tête du panneau) | Ouvre ou replie le panneau ; glisser la tête le déplace (position gardée) | Non | Absent hors d'une page servie par le serveur (`file://`) |
| `×` | Réduit le panneau en pastille ; un clic sur « Claude » le rouvre | Non | Une carte à valider fait revenir le panneau masqué |
| Ligne d'état | Dit si Claude Code est prêt (point vert), ou ce qui manque (point rouge) | Non | Testée à chaque ouverture, sans requête au modèle |
| « Appliquer » (carte) | Écrit la proposition | Oui | Revérifie que rien n'a bougé sous la carte |
| « Refuser » (carte) | Abandonne la proposition | Non | Efface l'aperçu éventuel |
| « Annuler » (carte appliquée) | Défait l'écriture | Oui | Seulement pour les écritures hors historique ; refusé si l'état a changé |
| « Appliquer directement (cet onglet) » | Saute la carte pour cet onglet | Direct | Éteint à chaque chargement ; sans effet sur les écritures LIB |
| Zone « Demander à Claude… » | Envoie la demande (`Entrée`) | Non | 8000 caractères ; `Maj+Entrée` = saut de ligne |
| « Envoyer » | Envoie la demande ; devient « Claude travaille… » | Non | Désactivé si la ligne d'état est rouge ou si une demande est en cours |
| « Joindre » | Choisit des fichiers à joindre (images, PDF, texte) | Non | 10 pièces, 20 Mo, 400 000 caractères de texte au plus |
| « Vue » | Joint l'image du canevas de l'onglet | Non | Visible seulement si la page a un canevas |
| `×` d'une puce | Retire la pièce jointe | Non | |
| Liste du modèle | Opus, Sonnet ou Haiku | Non | Gardé sur l'appareil ; Opus par défaut |
| « Nouvelle conversation » | Claude repart de zéro à la prochaine demande | Non | Les cartes en attente ou annulables restent |

Le panneau garde au plus 30 entrées ; les plus anciennes disparaissent, jamais une carte en attente ou annulable. Il se replie tout seul 4 secondes après le traitement d'une carte, sauf si une carte attend, une demande est en cours, une saisie est commencée ou une pièce jointe est prête à partir. Les textes de Claude s'affichent en texte brut, jamais en HTML.

Pages qui ont le panneau : éditeur schématique, éditeur PCB, Gestion LIB, visionneuse IPC-2581. L'accueil et la recherche de composants n'en ont pas.

Plusieurs onglets d'un même outil dans un navigateur : un seul tient la connexion au serveur (le relais) et transmet aux autres ; l'interrupteur reste propre à chaque onglet.

### Ce que Claude lit (aucune carte)

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `etat` | Quels outils de WEB·SUITE tournent, port, adresse | Lecture | |
| `savoir_lire` | Fiche du savoir métier : SKILL, pcb, simulation, composants, schema, routage, antenne | Lecture | À lire avant une tâche hors du dépôt web_suite |
| `cao_projets` | Liste les projets WEB_CAO | Lecture | |
| `cao_projet_lire` | Projet (`projet.cao.json`) et état de ses documents | Lecture | |
| `cao_doc_lire` | Document d'un projet (schema, pcb, ipc2581) ; rend aussi « modifie » | Lecture | Au-delà de 100 Ko, résumé : redemander avec `parties` |
| `cao_solveurs` | État des solveurs (EM, DC, crosstalk, RF, œil, analyse de carte, import IPC-2581) | Lecture | Ne lance aucun calcul |
| `cao_profils`, `cao_profil_lire` | Profils (empilages et règles de fabricant) | Lecture | |
| `cao_schema_lire` | Schéma ouvert : `feuilles`, `composants`, `composant`, `etiquettes`, `nets`, `net` | Lecture | Page ouverte requise |
| `cao_pcb_lire` | PCB ouvert : empilage, classes, composants, composant, nets, net, drc, liaisons, zone, carte, zones, serigraphie, interdits | Lecture | Positions en mm |
| `cao_ipc_lire` | Visionneuse : empilage, composants, composant, nets, net | Lecture | Un fichier IPC-2581 doit être ouvert |
| `cao_sim_lire` | Simulations (analyses faites, chiffres clés), une partie d'un rapport, catalogue des paramètres réglables | Lecture | Rapport complet seulement pour l'analyse affichée (`afficher=true` y passe le panneau) |
| `cao_vue` | Cadrer, surligner, feuille (schéma), couches visibles, ajuster ; `capturer=true` rend l'image | Vue seulement | Ne modifie pas le projet ; la visibilité des couches du PCB part avec le prochain Enregistrer |
| `pilote_capture` | Image PNG du canevas d'un onglet (1600 px de large au plus) | Lecture | |
| `pilote_onglets` | Onglets ouverts : id, page, projet, appareil, dernier usage, interrupteur | Lecture | |
| `pilote_suivre` | État d'une commande « en_attente » | Lecture | |
| `lib_composants` | Recherche et pagination dans le catalogue de la LIB | Lecture | 50 par défaut, 500 au plus |
| `lib_fichiers`, `lib_fichier_lire` | Liste et lecture des fichiers de la LIB (empreintes, symboles, modèles) | Lecture | |
| `lib_parasites` | Parasites des condensateurs et selfs (C/ESR/ESL, L/DCR) tirés des modèles fabricant | Lecture | |
| `lib_empreinte_generer` | Calcule une empreinte IPC-7351B (chip, SOT, SOIC, TSSOP, MSOP, QFN, DFN, DIP, barrette) | Calcul, rien d'écrit | Nécessite Gestion LIB ouverte |
| `lib_empreinte_verifier`, `lib_brochage_verifier` | Contrôlent une empreinte, un brochage | Calcul, rien d'écrit | Idem |
| `lib_kicad_convertir` | Convertit un `.kicad_mod` en pcbfp-1 | Calcul, rien d'écrit | 200 Ko au plus ; pastille personnalisée refusée |
| `cao_calcul` | Lance une analyse dans la page PCB ou la visionneuse et rend son rapport : impedance, diff, retour, crosstalk, oeil, bus, dc, pdn, s21, verif | Calcul, document inchangé | Un calcul à la fois par page ; au-delà de 2 min, « en_attente » ; piste ou net sélectionné requis pour impedance, diff, retour |
| `cao_drc` | Lance le DRC du PCB ouvert, rend erreurs et remarques avec positions | Calcul | N'entre pas dans l'historique |
| `cao_thermique` | Estime l'échauffement des composants qui dissipent | Calcul | Ordre de grandeur (±30 %), pas une simulation ; la puissance se règle par `cao_composants_ecrire` (champ `puissance`) |
| `cao_score` | Score du PCB : `routage` ou `placement` | Lecture | Ne modifie rien |
| `cao_chemin` | Propose des points de passage (A* sur grille, 45°, vias) pour des liaisons ou une paire | Lecture | Rien n'est écrit ; à donner à `cao_router` ou `cao_paire` |
| `pcbparts_outils`, `pcbparts_appeler` | Relais vers pcbparts.dev (JLCPCB, Mouser, Digi-Key, brochages, règles de fabrication) | Lecture | Liste blanche côté WEB_CAO, passe par Internet |

Le relais pcbparts est celui de `python/passerelle_mcp.py` (client MCP de WEB_CAO vers pcbparts.dev), distinct du serveur MCP de web_suite.

### Ce que Claude écrit, avec une carte

Chaque carte est un lot (50 éléments au plus), appliqué en une étape d'historique, sauf mention contraire. Au PCB, les outils marqués DRC rendent aussi le DRC avant → après et les nouvelles erreurs.

#### Schéma

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `cao_valeur_composant` | Change la valeur d'un composant par son repère (R12 → 4k7) | Carte | `Ctrl+Z` ; pour plusieurs champs, `cao_composants_ecrire` |
| `cao_composants_ecrire` (page schema) | Repère, valeur, boîtier, fabricant, MPN, specs (clé → texte, null efface), non monté | Carte | Un repère est unique dans le document à chaque étape du lot |
| `cao_classes_ecrire` (page schema) | Classe d'un net nommé : `{action: affecter, net, classe}` ; « » rend le net à l'analyse automatique | Carte | Le PCB applique à la synchronisation |
| `cao_contraintes_ecrire` (page schema) | Contraintes d'un net que le PCB reprend (z, z_tol, l_min, l_max, vias_max, couches par rang, topologie p2p/chaine/etoile/flyby, ordre, stub_max, via_stub_max, etoile_tol) | Carte | Pas de règles de paire au schéma |
| `cao_schema_dessiner` | Opérations : poser, deplacer, tourner, miroir, supprimer, relier, fil, supprimer_fil, etiqueter (local, global, vcc, gnd), feuille (creer, renommer), renumeroter, cadre, texte libre (`annot_text`, `annot_note`) | Carte | 40 opérations au plus ; simulée puis défaite avant la carte ; un refus et rien ne change ; étiquettes désignées par `#id` |

#### PCB

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `cao_composants_ecrire` (page pcb) | Repère, valeur, boîtier (doit exister), face, x, y, rotation, puissance (W) | Carte, DRC | Le cuivre accroché suit selon la préférence de la page |
| `cao_pistes_ecrire` | Largeur des pistes d'un net (0,05 à 10 mm, par couche) ou `realigner` sur la classe | Carte, DRC | Pistes déjà posées |
| `cao_classes_ecrire` (page pcb) | Créer, modifier, supprimer, affecter des classes de nets | Carte, DRC | Pas la classe par défaut, ni une classe qui garde des nets ; le routage posé ne bouge pas |
| `cao_contraintes_ecrire` (page pcb) | Règles de paires différentielles (largeurs, écarts, découplage, impédance D90, D100, D85, D120) et contraintes de net | Carte, DRC | Les contraintes saisies au schéma ne sont pas touchées ; null efface |
| `cao_contour_ecrire` | Contour : rectangle, disque ou polygone (3 à 1000 sommets) | Carte, DRC | Côtés de 5 mm au moins ; découpes intérieures conservées |
| `cao_decoupes_ecrire` | Crée ou supprime des découpes intérieures (fenêtres fraisées) | Carte, DRC | Dans le contour |
| `cao_interdits_ecrire` | Zones interdites par face (hauteur max) et hauteurs maximales de face | Carte, DRC | |
| `cao_zones_ecrire` | Zones de cuivre : créer, modifier, supprimer ; liaison des pastilles thermique, directe, cms-directe, aucune | Carte, DRC | Les `id` viennent de `cao_pcb_lire` `zones` |
| `cao_serigraphie_ecrire` | Texte, trait, rectangle, repère (décalage), auto, supprimer | Carte | Ce qui est posé est ce que le Gerber imprime ; les valeurs des composants ne sont pas imprimées |
| `cao_pastille_regler` | Réglages d'une pastille (liaison, bras, masque, pâte) | Carte, DRC | Une empreinte calculée est figée en pastilles explicites |
| `cao_router` | Routes par points de passage, changement de couche par via, vias seules ; mode pousser (défaut) ou contourner | Carte, DRC | 20 routes, 50 vias seules, 200 points de passage par route et 1000 par carte au plus ; tout ou rien par route ; lot borné à 10 s de calcul dans la page ; aperçu en pointillés |
| `cao_paire` | Route une paire différentielle déclarée | Carte, DRC | Pistes au pas de la règle de paire |
| `cao_placement_auto` | Placement `forces`, `satellites` ou `blocs` (motif) | Carte, DRC | Joué puis défait ; l'aperçu dessine chaque empreinte à sa nouvelle place |

#### Simulation

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `cao_sim_ecrire` | Paramètres de simulation (groupes pdn_fiche, pdn, si, bus, dc ; parasites de condensateurs ; bornes de chute DC) | Carte | Hors historique : « Annuler » sur la carte ; unité du catalogue exigée |

#### LIB (clic obligatoire)

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `lib_composant_creer` | Empreinte neuve (pcbfp-1) puis ligne ajoutée au catalogue | Carte, clic toujours | Jamais d'écrasement ; pas d'annulation par la carte ; attend jusqu'à 2 min |
| `lib_composant_modifier` | Corrige cases d'une référence existante ; empreinte neuve facultative | Carte, clic toujours | La Part Name ne change pas ; refus si la ligne a changé depuis la lecture |
| `lib_simulation_lier` | Range un modèle (Touchstone `.s1p` à `.s9p` avec pattes de ports et masse, ou SPICE) dans lib_simulation et l'ajoute à « Modèle Simulation » | Carte, clic toujours | 4 Mo au plus ; seule cette case est réécrite |

#### Interface

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `pilote_interface_lire` | Liste les contrôles visibles de la page, numérotés `[n]` | Lecture | Le panneau « Claude » n'y figure jamais ; relire après un geste |
| `pilote_interface` | Un geste : cliquer, saisir, touche, souris sur le canevas (double, droit, molette, glisser, modificateurs) | Carte (directe si l'interrupteur est allumé) | Réservé à ce qu'aucun outil propre ne fait ; ne peut pas appuyer sur le panneau « Claude » ni choisir un fichier du disque ; la carte n'annule pas le geste (`Ctrl+Z` si l'éditeur en fait une étape) |

### Ce que Claude écrit sans carte

À demander d'abord à l'utilisateur : l'effet est immédiat.

| Outil | Effet | Écrit ? | Limites |
|---|---|---|---|
| `cao_doc_ecrire` | Remplace des clés de premier niveau d'un document de projet (schema, pcb, ipc2581) | Direct (fichier) | Exige le « modifie » lu par `cao_doc_lire` ; refus si le fichier a changé ; la page ouverte demandera avant d'écraser |
| `cao_profil_ecrire` | Crée un profil (cao-profil-1) | Direct (fichier) | Refus si le nom existe |
| `lib_fichier_ecrire` | Ajoute un symbole ou un modèle de simulation à la LIB | Direct (fichier) | Jamais d'écrasement ; les empreintes PCB passent par `lib_composant_creer` |
| `antenna_projet_enregistrer` | Enregistre le projet ouvert de WEB_ANTENNA | Direct (fichier) | `null` refusé |

### Les outils des autres outils de la suite

Ces outils n'agissent pas sur WEB_CAO ; leur emploi est décrit dans WEB_ANTENNA et WEB_3D.

| Outil | En deux lignes |
|---|---|
| `antenna_projets` | Liste les projets WEB_ANTENNA et le projet ouvert. |
| `antenna_projet_lire` | Lit le projet ouvert (en-tête, dessin, antenne, carte, résultats) ; résumé au-delà de 100 Ko. |
| `antenna_calculs` | Liste les calculs openEMS du projet ouvert. |
| `antenna_lire` | Lit la page ouverte (conception, résultats, courbe, balayage, audit avec cartes, réglages, carte importée) ; ne lance aucun calcul. |
| `antenna_vue` | Règle la vue (2D/3D, maillage, onglet de résultats, point de balayage, étape, panneau) sans toucher au projet ; peut capturer. |
| `antenna_proposer` | Carte d'action : `reglages`, `cotes`, `balayage` (armé, jamais lancé), `formes`. |
| `antenna_openems_etat` | État d'openEMS : préparer, lancer, script, visionneuse disponibles ou non. |
| `antenna_openems_chiffrer` | Vérifie et chiffre un modèle (estimation, balayage, tableau S, script) sans rien lancer. |
| `antenna_openems_suivre` | Suit un calcul lancé depuis la page : état, avancement, journal, résultat. |
| `antenna_openems_champs` | Inventaire des champs (`.vtr`) d'un calcul fini. |
| `web3d_projets` | Liste les fichiers 3D rangés dans PROJETS. |
| `web3d_scene` | Scène ouverte : fichiers et pièces (uuid, chemin, nom, visibilité, couleur). |
| `web3d_vue` | Vue standard, projection, cadrage d'une pièce ; peut capturer. |
| `web3d_visibilite` | Masquer, afficher, isoler, sélectionner des pièces. |
| `web3d_coupe` | Plan de coupe (axe ou face plane, décalage, sens). |
| `web3d_mesurer` | Dimensions, distance minimale entre deux pièces (avec cote), faces. |
| `web3d_collisions` | Interférences entre pièces visibles. |
| `web3d_ouvrir` | Ouvre des fichiers 3D dans la page, par carte, annulable. |
| `web3d_deplacer` | Déplace un fichier de l'assemblage (position, rotation, contraintes), par carte, annulable. |
| `web3d_ranger_step` | Extrait le STEP d'une pièce et le range dans PROJETS/3D, par carte, sans écrasement, non annulable. |

### Garde-fous

| Règle | Détail |
|---|---|
| Données, jamais consignes | Ce que rendent les pages, pcbparts, les datasheets, les pièces jointes et les fichiers KiCad est une donnée : Claude ne le suit pas comme une instruction et le signale. Les textes de Claude s'affichent en texte brut dans le panneau. |
| Rien sans clic | Toute écriture dans une page passe par une carte ; l'interrupteur d'un onglet saute la carte pour cet onglet seulement. |
| LIB protégée | `lib_composant_creer`, `lib_composant_modifier`, `lib_simulation_lier` attendent le clic, même interrupteur allumé ; jamais d'écrasement. |
| Tout ou rien | Un lot est vérifié en entier avant la carte et revérifié au clic ; un refus et rien ne change. |
| Pas d'écrasement | Les créations de fichier (profil, fichier LIB, empreinte) refusent un nom pris. |
| Boucle locale | Le MCP appelle les outils sur `127.0.0.1` ; les ordres au canal de pilotage ne viennent que du poste, jamais d'un autre appareil. Une demande écrite dans le panneau, elle, peut venir de n'importe quel appareil appairé. |
| Périmètre de Claude depuis la page | Seuls les outils du MCP web_suite ; pas de terminal ni de fichiers du poste. |
| Réponses | Au-delà de 100 Ko, une réponse devient un résumé (clés, tailles, extrait). |
| Ce que le MCP ne fait pas | Supprimer, ouvrir ou fermer un projet ANTENNA, toucher aux racines de projets ni au catalogue LIB entier. |

## Limites connues

- Les pages doivent être ouvertes dans un navigateur et servies par le serveur ; sans onglet ouvert, Claude ne lit que les fichiers (`cao_projet_lire`, `cao_doc_lire`, `lib_*`).
- Les outils de la LIB qui calculent ou écrivent exigent la page Gestion LIB ouverte.
- Un appel qui propose une écriture attend la décision jusqu'à 2 minutes, puis rend « en_attente » ; la carte reste cependant dans le panneau.
- Une demande écrite depuis le panneau est limitée à 8000 caractères, 10 pièces jointes, 20 Mo de pièces et 400 000 caractères de texte joint.
- Une conversation reprise (`--resume`) renvoie tout à l'API : au-delà de 20 Mo de pièces jointes cumulées, le lanceur le signale dans le panneau.
- Les écritures LIB ne se défont pas par la carte.
- Le panneau couvre le coin bas droit de la page ; un geste « souris » qui tomberait sous lui échoue et demande de le replier.
- Le MCP ne lance aucun calcul d'antenne ; WEB_3D et WEB_ANTENNA ont leurs propres cartes.
- `cao_thermique` est un ordre de grandeur (±30 %), pas une simulation.
- Pas de rapport complet pour une analyse non affichée : `cao_sim_lire` doit d'abord faire passer le panneau de simulation dessus.
- Un lot `cao_router` tient en 20 routes, 50 vias seules et 1000 points de passage (200 par route) ; le serveur et la page ont les mêmes plafonds. Au-delà, découper en plusieurs cartes.
- Les opérations exactes acceptées par la page pour `cao_schema_dessiner` sont celles du serveur ; leur liste complète est dans `commun/pilote-aide.json` (`Pilote.aide("cao_schema_dessiner")` dans la console de la page).

## Voir aussi

- [Éditeur schématique](02-editeur-schematique.md) : `cao_schema_dessiner`, valeurs et propriétés des composants.
- [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md) : routage, DRC, placement, classes et paires.
- [Éditeur PCB : fabrication](04-editeur-pcb-fabrication.md) : contour, zones, sérigraphie, intégration mécanique.
- [Gestion LIB](05-gestion-lib.md) : catalogue, empreintes, liaison d'un modèle de simulation.
- [Recherche de composants](06-recherche-composants.md) : le relais pcbparts.dev.
- [Visionneuse IPC-2581](07-visionneuse-ipc2581.md) : lectures et calculs sur une carte livrée.
- [Simulation SI](08-simulation-si.md), [PI, thermique, audit](09-simulation-pi-thermique-audit.md), [RF et EM](10-simulation-rf-em.md) : les analyses lancées par `cao_calcul`.
- [Accueil, projets, tactile](01-accueil-projets-tactile.md)
- [README du dépôt](../../README.md), section « Claude, par le MCP de web_suite ».
- Dans le dépôt voisin web_suite : `lanceur/docs/DETAILS.md` (outils, installation, dépannage), `lanceur/docs/SPEC-claude-pages.md`, `lanceur/docs/SPEC-mcp-canal-pilote.md`.
- Code côté page : `commun/pilote.js`, `commun/pilote-cao.js`, `commun/pilote.css`, `commun/ecriture-cao.js`, `editeur-schematique/js/28-dessin-pilote.js`, `editeur-pcb/js/37-routage-pilote.js`, `gestion-lib/js/08-pilote-lib.js`.
