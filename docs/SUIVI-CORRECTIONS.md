# Suivi des corrections (restes de l'audit)

Tenu à jour au fur et à mesure. Branche `claude/inspiring-rubin-wmo2lm`.
Décisions du 11/11 : toutes appliquées (boutons pour les fonctions sans appelant, BOM au CSV, H1 gardé, castellations, onglet Général, horloges en mots entiers, fréquence 0 refusée, import JLC prudent, marqueur ∅ remplacé).

État : **F** fait et poussé · **C** en cours · **R** reste à faire · **D** à décider par l'utilisateur · **L** laissé volontairement.

## 1. Éditeur PCB

| État | Point | Où | Note |
|---|---|---|---|
| F | Mires et points de test hors de `bom.csv` / `positions.csv` | `04-fabrication.js` | filtre `TP/FID/MH/H<chiffre>` |
| F | « Nouveau » vide vraiment la carte (avec confirmation) | `07-app.js` | |
| F | Historique du champ Texte : une étape par saisie | `06-panels.js` | |
| F | Piste de plus de 2 m écartée à la lecture | `05-tools.js` | |
| F | Repli du profil fabricant annoncé | `24-pcb-capabilities.js` | |
| F | Variantes multi-parties | `26-variantes.js` | |
| F | Sérigraphie plus rapide à l'écran | `03-render.js` | |
| F | Empreinte LIB posée au panneau | `01-core.js`, `08-empreinte.js` | |
| F | Fenêtre « bus synchrone » : mêmes marges que l'onglet Bus, retour SPI, plancher 1 kHz | `09-diffpair.js`, `06-panels.js` | calcul commun `simBusMarges` |
| F | Un connecteur importé nommé `H1` sort de la nomenclature | `04-fabrication.js` (`jlcNonPose`) | |
| F | Exemption des pastilles de bord (castellations) dans la règle de bord | `axeDansCarte` | |
| F | Marque UTF-8 (« BOM » au sens octets, pas nomenclature) absente de l'export CSV de la LIB : accents illisibles dans Excel | `gestion-lib/js/01-donnees.js` |
| F | Dessiner un arc (`ca`) dans une empreinte | `01-core.js` (`fpDessinsMonde`) | bloque l'import des `fp_arc` KiCad en arcs |
| F | Champ `clearance` propre à une pastille | modèle + `padClone` | bloque l'aller-retour KiCad de ce réglage |

## 2. Schématique

| État | Point | Où |
|---|---|---|
| F | Deux fausses erreurs ERC (deux piles, AOP double) | `31-erc.js` |
| F | Nomenclature plus rapide, retour chariot entre guillemets | `13-fichiers.js` |
| F | Tracé d'un trait / rectangle / zone : étape d'historique | `09-interaction.js` |
| F | CI : netlist et dessin d'accord après changement du nombre de broches | `19-broches.js` |
| F | Ouverture d'un fichier à `pinout:[null,…]` | `15-import.js` |
| F | Libellé d'un cadre annulable ; nom de broche : une étape par saisie | `12-panneaux.js` |
| F | Synoptique : places et titres gardés à la renumérotation | `05-feuilles.js` |
| F | Recherche de composants : une recherche lente n'écrase plus la suivante | `22-recherche-composants.js` |
| F | PCB : boutons du point de broche 1 (`fpSetMark`, `fpMoveMark`, `fpSetMarkD`), du contour imprimé (`fpSetBody`), « Revenir à l'empreinte calculée » (`fpGeneric`) | `06-panels.js` |
| F | Supprimées (doublons) : `fpMovePad`, `stackSym`, `dfPlacerVue` ; essais repassés sur `fpSetPad`, `stackAsym`, `dfPoserVueRepousser` | `01-core.js`, `34-draftsman-vues.js` |
| F | Schématique : `icMovePin` a son geste (glisser une broche d'un CI « Libre ») | `09-interaction.js` |
| F | `schCartoucheBasculer` supprimée (doublon du bouton « Cartouche ») | `05-feuilles.js` |
| F | Supprimés : `N.replace`, `N.commit` (méthodes internes du routeur sans appelant) | `editeur-pcb/js/11-pns-node.js` |
| F | `el.specs` d'un fichier hostile affiche « [object Object] » | import | ne plante pas |
| R | HTML du schématique : pas relu ligne à ligne | | ids vérifiés seulement |

## 3. Gestion LIB et recherche de composants

| État | Point | Où |
|---|---|---|
| F | Prix en texte qui faisait tomber la liste JLC | `07-import-jlc.js` |
| F | « led » / « del » en sous-chaîne (« Sealed », « model ») | `07-import-jlc.js` |
| F | Éditeur : fichier illisible, confirmation à la fermeture | `05-editeur-lib.js` |
| F | Éditeur : clic sans déplacement, broche `[x, y]`, générateur CI borné à 1024 broches | `05-editeur-lib.js` |
| F | `recherche-composants/` relu en entier | |
| F | Onglet Général : toute saisie réécrit `body` (2 × 2 mm si absent) et `pitch: 0` | `editeurCollecterGeneralPcb` |
| F | Import JLC : valeur tirée du modèle (« LM358P » → « 358P »), température lue dans « 4~20mA » | `07-import-jlc.js` |
| F | Vue JSON de l'éditeur : `null` ou `5` accepté comme document | `05-editeur-lib.js` |
| R | `05-editeur-lib.js` l.1–285 non relues dans ce lot | |
| L | `banc-catalogue.js` ne tourne pas sans la LIB privée | |

## 4. Simulation (`commun/simulation-em.js`)

| État | Point |
|---|---|
| F | Diaphonie : mention « plafonné » (écran, rapport, CSV) |
| F | Avertissements du serveur visibles (Z différentielle, œil) |
| F | Lectures de valeurs : « μ », « 1meg », « 10μF », « V3P3 » |
| F | Chemin de retour : plantage sans f₀, valeurs inventées, boucle ouverte en vert, mauvais via allumé |
| F | Chute DC : couche peinte = celle du verdict, budgets sans arrondi, aide de la trame |
| F | Bus : t_co négatif, `.csv` cohérent avec l'écran, « ; » dans un nom |
| F | PDN : « ; » dans le `.csv` |
| F | Progression : horloge d'un calcul qui s'arrêtait quand un autre finissait |
| F | Réponse du serveur sans rapport : refus dit |
| F | Fréquences à cinq chiffres significatifs (13,56 MHz, 32,768 kHz) |
| F | PDN : Vdd / ondulation / ΔI à 0 → dernière valeur valable, réécrite dans le champ |
| F | Bus vide : plus de remplissage d'office |
| L | `-12V` lu 12 V (trois calculs attendent le module) |
| F | Bus : fréquence 0 acceptée, calcul à 100 MHz (affiché) |
| F | Horloge reconnue par `/clk\|ck\|sck/` : « BACKLIGHT », « ACK » passent pour des horloges |
| R | Z différentielle / couplage (~l.8660–9840) : relu plus vite que le reste |

## 5. Import / export KiCad (`commun/kicad-pcb.js`)

| État | Point |
|---|---|
| F | Net nommé d'un nombre (KiCad 10) |
| F | Couches mécaniques ↔ `User.2..9` |
| F | Fente verticale dans une pastille ronde ou carrée |
| F | Zones : isolement, bras thermiques, hachure, `thru_hole_only` |
| F | Verrous (empreintes, pistes, vias, zones, dessins) |
| F | Pastilles : connexion aux zones, forme par couche, arrondi |
| F | Pastilles sans numéro (nom « ∅ » dans l'éditeur) |
| F | Arcs de la carte et des empreintes (`gr_arc`, `fp_arc` à l'export) |
| F | « aucune connexion » exportée en thermique |
| F | Pastilles sans numéro : plus de marqueur « ∅ », numéro vide gardé, chacune son propre net |
| F | `fp_arc` importé reste en cordes | dépend de l'éditeur PCB (voir 1) |
| F | `clearance` de pastille perdu | dépend de l'éditeur PCB (voir 1) |
| R | `roundrect_rratio` intermédiaire, `thermal_bridge_angle`, verrou d'une découpe | modèle sans champ |
| F | Via dont `layers` ne nomme qu'une couche lu jusqu'à B.Cu | vu, non corrigé |
| R | Relecture par KiCad lui-même | `kicad-cli` absent ici |

## 6. Analyseurs Python

| État | Point | Où |
|---|---|---|
| F | 33 — chute DC sur piste oblique (+19 % → +0,3 % à 45°) | `dc_solver.py` |
| F | Piste droite hors trame (1 mm comptée 1,2 mm) | `dc_solver.py` |
| F | Échauffement de 48 millions de kelvins sur un disque | `dc_solver.py` |
| F | 36 — un fil BLAS par défaut | `web_CAO.py` |
| F | Œil : identité AMI à 1e-6, PRBS15 de 219 à 126 Mo | `oeil.py` |
| F | IPC-2581 : coordonnée `inf` / `nan` | `ipc2581_parser.py` |
| F | 30 — εeff et retard en cuivre épais (εeff : +24 % au pire → ≤ 1,3 %, contre différences finies) | `ligne_mom.py` |
| F | Avertissement « flancs en regard » sur la fiche | `simulation_em.py` |
| R | Flancs en regard (paire serrée, coplanaire à moins de 6 épaisseurs) : Z lue +3 à +7 % trop haut ; demande des panneaux sur les flancs | `ligne_mom.py` (`FLANCS_EN_REGARD`) | — décision : plus tard
| F | Formule légère côté page : même défaut d'εeff en cuivre épais | `commun/simulation-em.js` (`ltWeff`, `ltEeff`) |
| R | Essai « Scd21 miroir (N contre P) » recalé de 7 à 9 % : dissymétrie N/P de 7,8 % non expliquée | `banc-oeil.py`, modèle du via seul |
| R | Cuivre épais sans référence : vernis autre que 25 µm, section sans plan, triplaque couplée, plus de trois conducteurs | |
| F | Composante continue de la cascade (niveau établi −0,24 % à −0,78 %) | `oeil.transfert`, `simulation_em.simuler` |
| R | Échauffement d'une piste oblique : +6 à +8 % (côté prudent) | `dc_solver.py` |
| L | Plafond mémoire `MAX_IPC` (192 Mo) | décision : on se libère de la Pi plus tard |

## 7. Serveur et CI

| État | Point | Où |
|---|---|---|
| F | Plafond de 256 connexions, `fsync` avant renommage, 500 → 400 | `web_CAO.py` |
| F | Jeton non ASCII | `appairage.py` |
| F | CI : permissions, actions épinglées, essai sauté = échec | `ci.yml` |
| L | 14 — « ce poste » derrière un relais : hypothèse écrite dans le README et le manuel | |
| R | Reporter les deux lignes d'`appairage.py` dans web_suite | autre dépôt |
| F | `banc-serveur-routes` : l'essai du plafond rend son compteur avant la fin de ses fils (« Semaphore released too many times », échec 1 fois sur 5 sous charge) | `python/test/banc-serveur-routes.py` |
| R | La CI durcie n'a pas encore tourné sur GitHub | |

## 8. Jamais vérifié

- Navigateur réel, iPad.
- Relais réel.
- LIB privée.
- Raspberry Pi (temps, mémoire).


## Restes nés de cette série

| État | Point | Où |
|---|---|---|
| F | Paire de pistes routée jusqu'à un demi-trou : encore refusée (exception absente des paires et des détours) | `09-diffpair.js`, `pnsSurCarte` |
| F | Niveau établi d'une paire dissymétrique (brin par brin) : encore lu dans Re(B[0]) | `oeil._continu_brins` |
| R | Cascade d'une paire dont le brin P est le plus long : les deux brins sont comptés trop longs de la surlongueur (segments de P + surlongueur ajoutée à P ; N reçoit la longueur de P). Écart de longueur juste, pertes surestimées de ΔL/L | `simulation_em.py` (~l.7404, 7598) |
| F | Isolement propre d'une pastille : pas encore pris par le contrôle des bras thermiques ni l'écart entre pastilles d'une même empreinte | `02-connectivity.js` (`clrK`) |
| F | Pastille sans numéro désignée par sa place (« J1 (pastille sans numéro à x;y mm) ») dans tous les messages, `padDesig` | `01-core.js` |
| L | Onglet Général du symbole : préfixe « U » si vidé | `editeurCollecterGeneralSch` |

| F | Largeur des symboles indépendante de la police (table fixe Helvetica) : un CI ne s'élargit plus selon la machine, les fils ne se décrochent plus d'un poste à l'autre ; CI GitHub rouge depuis l'installation de canvas | `editeur-schematique/js/01-noyau.js` (`textW`) |
| R | Schémas existants : un CI à broches nommées peut changer de largeur une fois à l'ouverture (fils à vérifier) | |

## Revue complète du 18/11/2026 (schéma et PCB, fonction par fonction)

Treize relecteurs, un lot de fichiers chacun ; chaque point confirmé par une expérience
sur le bundle, puis corrigé avec un essai (`harness.js` des deux éditeurs, bancs KiCad).

| État | Point | Où |
|---|---|---|
| F | Import : id, uid et refStart démesurés (boucle sans fin sur 1e17) ; feuille « Hiérarchie » décidée par son drapeau | `15-import.js` |
| F | CI : valeur, nom de broche, choix au catalogue emmènent les fils ; cache des nets suit la valeur | `10-actions.js` (`icRetouche`), `07-connectivite.js` |
| F | Recherche de composants : broche retrouvée par sa patte (pinMap) ; LCSC gardé | `22-recherche-composants.js` |
| F | Motifs : nets homonymes de deux feuilles fusionnés, net « constructor », analyse demandée pendant une autre | `23-patterns.js` |
| F | Renumérotation : doublons et « R? » gardaient le même repère | `28-dessin-pilote.js` |
| F | Contraintes : « 5O » lu 5, « abc » effaçait, hors bornes effaçait (schéma et PCB) | `commun/contraintes.js` (`cmChampInvalide`) |
| F | Blocs (étiquettes locales), bus (vecteur démesuré, mémoire des piquages), piquage après découpe, CSV « -1+1 », palette, Détails, exemple, Ctrl+Z après ouverture de projet, boîtier « Personnalisé », texte redressé, connecteur du catalogue | schéma |
| F | `runDrc` rendait les écarts exclus ou ignorés ; codes DRC explicites (interdits, thermique, keep-out, régions) | `02-connectivity.js`, `38`, `39`, `47`, `50` |
| F | Permutation de couches : le rôle de plan suit sa zone ; empreinte comparée à la LIB d'empreintes ; vernis des pastilles polygonales ; bout de piste dans un via ; perçage de l'inspecteur | `54-controles.js`, `52-outils-vue.js` |
| F | Netlist : pastilles ajoutées à un trou de fixation ; nouvelles couches internes copiant le dessus ; chanfrein grossi trop court ; règle d'une autre paire ; trou à trou NPTH à 0 ; boîte d'une pastille tournée ; cache LIB lu par crochets | `01-core.js`, `02-connectivity.js`, `03-render.js` |
| F | Via posé en plein tracé sans étape ; serpentin qui laissait la piste remplacée sélectionnée ; Ctrl+Y en plein tracé ; esquisses gardées au Ctrl+Z ; classes V1.0 non bornées ; poignée d'un texte ou d'un aplat ; cadre aplati perdu ; modèle RF « __proto__ » ; lasso figé | `05-tools.js` |
| F | Rotation/face de groupe sans le cuivre ; via sur une seule couche ; t_h = 0 lu 1 ns ; couche active hors historique ; champ vidé → 0 ; serpentin faux pour une petite cible ou une piste courte ; vias de paire sans étape ; cote de couche ramenée dans les bornes | `06-panels.js`, `09-diffpair.js` |
| F | Injections HTML (règles du projet, nom de profil) ; designRules non validé ; court-circuit admis sans étape ; classe renommée perdant sa matrice ; double étape ; rotation depuis le score ; exemple sans confirmation ; sélection fantôme ; verrous et composants posés dans l'agencement ; mise à jour LIB annoncée réussie | `15-regles.js`, `20`, `22`, `21`, `17` |
| F | ECO : broches nommées et LIB à l'ajout ; profils : fusion profonde, « __proto__ », profil intégré écrasé, stockage, ligne de cuivre selon l'épaisseur, anneau des vias, cases de matrice ; satellites (μ grec, groupes) | `23-eco-sync.js`, `24-pcb-capabilities.js`, `28` |
| F | Gerber : isolement propre de la zone perdu, cuivre sans net non dégagé, sérigraphie trouée effaçant la précédente ; passage à 1 couche sans confirmation ; 402 pastilles pour un 0402 ; « Nouveau » gardait acquits et cartouche ; µ gravé blanc ; plan maître (dilatation du masque) et LISEZ-MOI (polarités) | `04-fabrication.js`, `03-render.js`, `07-app.js`, `04-pdf-masterdraw.js` |
| F | Simulation : nom de broche décalé (régulateur inversé), bornes DC doublées, terminaison différentielle jamais lue, oblongue debout, nets « LVDS_CLK+ », régulateur sans Vout, condensateurs PDN, rails inexistants | `19-simulation.js` |
| F | Contraintes physiques non bornées, largeur pour Z sous 0,05, topologie (arête doublée, pattes homonymes), nets cochés d'une ancienne carte | `30-contraintes.js`, `31-topologie.js` |
| F | IPC-2581 : composant pointant la mauvaise ligne de nomenclature, couche « CONTOUR » ; dossier méca en sens trigo (animation 3D suivie) ; pilotage : via à une couche, réglages perdus à l'application, aperçu d'une autre carte effacé | `35`, `36`, `41`, `37` |
| R | ECO : renumérotation décalée (R1→R2, R2→R3) non reconnue comme un renommage | `23-eco-sync.js`, `fpRenommages` |
| R | Gabarits buck/LDO : la diode et les C1/C2 du repli écrasés par la boucle des passifs | `22-bloc-placement.js` |
| R | Score de placement recalculé à chaque rafraîchissement (≈ 0,5 s sur 1 000 empreintes) | `20-placement-score.js` |
| L | Probables non confirmés : poussée de vias jugée sur la carte d'avant le geste (`pnsShoveVia`), netlist d'un schéma sans projet acceptée, étanchéité du pilotage aux règles, note « vias non modélisés » | |
