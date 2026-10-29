# Visionneuse IPC-2581

La Visionneuse IPC-2581 ouvre une carte livrée au format IPC-2581 (un seul fichier XML : empilage, cuivre, plans, perçages, composants, nets) et l'affiche couche par couche. Elle ne modifie rien : ce n'est pas un éditeur, et le fichier d'origine n'est jamais touché.
La lecture du fichier se fait par le parseur Python du serveur (`/api/ipc2581`) ; une fois le modèle reçu, tout se passe dans le navigateur. Le modèle traduit s'exporte en `.json` et se rouvre sans serveur.
À partir de la carte lue, la visionneuse sert aussi à mesurer, à classer les nets, à produire des dossiers PDF et STEP (mécanique, plans, fiche de mesure, carte en 3D) et à lancer les simulations du panneau « Simulation EM » ([chapitre 08](08-simulation-si.md), [09](09-simulation-pi-thermique-audit.md), [10](10-simulation-rf-em.md)).

> [!NOTE]
> La page a besoin du serveur (`python web_CAO.py`) pour lire un `.xml`, `.cvg`, `.ipc`, `.ipc2581` ou `.zip`. Ouverte en double-clic (`file://`), elle ne peut relire qu'un `.json` déjà exporté de cette page.

## Guide par tâche

### Je veux ouvrir une carte

1. Lancer le serveur (`python web_CAO.py`), puis ouvrir « Visionneuse IPC-2581 » depuis l'[accueil](01-accueil-projets-tactile.md).
2. Cliquer **📂 Ouvrir un fichier…** (ou **📂 Choisir un fichier…** sur l'écran d'accueil de la page), appuyer sur `O`, ou déposer le fichier n'importe où sur la page.
3. Formats acceptés : `.xml`, `.cvg`, `.ipc`, `.ipc2581`, l'archive `.zip` qui en contient un, et le `.json` exporté depuis cette page.
4. Attendre l'écran « Lecture de … » : le pied de page annonce ensuite « … ouvert : N composant(s), N piste(s) », et signale un empilage incomplet s'il y en a un.
5. Si le fichier contient des nets, la fenêtre de classification des nets s'ouvre d'elle-même : la valider (**✓ Valider et appliquer les préréglages**) ou cliquer **Passer**.

En cas d'échec, le message du serveur s'affiche sur l'écran d'accueil de la page (fichier trop grand, XML tronqué, archive sans IPC-2581, serveur injoignable) ; si une carte est déjà ouverte, seule la première ligne du message paraît dans le pied de page (« Échec : … »). À l'arrivée sur la page, sans carte reprise, le serveur est sondé tout de suite : son absence est dite avant même le choix d'un fichier.

La carte lue suit d'un outil à l'autre : en revenant d'un autre outil, elle est remise en place (avec sa vue) si elle tient dans la session du navigateur. Avec un dossier de projet rattaché, la carte `<projet>-IPC.json` du projet s'ouvre d'elle-même à l'arrivée, sauf si une carte est déjà ouverte.

### Je veux regarder une couche à la fois

1. Dans le panneau **Couches**, cliquer une couche pour l'allumer ou l'éteindre.
2. Utiliser **Tout**, **Rien** ou **Cuivre seul** pour changer toutes les couches d'un coup.
3. Dans la rangée de natures d'objet au-dessus de la liste, couper **Plans** pour voir ce qui est sous un plan de masse, ou **Textes** pour alléger l'image.
4. Appuyer sur `B` pour regarder par en dessous : la pile s'inverse et l'image est en miroir.

### Je veux savoir où va un signal

1. Cliquer une piste, une pastille ou un via : son net est mis en évidence sur la couche cliquée, et la fiche **Net** apparaît dans le panneau **Sélection**.
2. Maintenir `Maj` en cliquant pour suivre le net sur toutes les couches ; la fiche écrit ce qui est montré (« … seule — Maj+clic : toutes les couches »).
3. Autre voie : choisir le net dans le panneau **Nets** (filtre « filtrer… » et boutons **Tous / Signal / PWR / GND**) ; c'est alors le net entier qui est montré. Recliquer le net choisi (sans `Ctrl`) le désélectionne.
4. `Échap` (ou le bouton **✕** du panneau Nets) retire la mise en évidence.

### Je veux comparer plusieurs morceaux

1. `Ctrl`+clic sur une piste, un plan, un via ou un boîtier l'ajoute à la sélection (ou le retire s'il y était) ; `Ctrl`+`Maj`+clic ajoute un net entier.
2. Les listes **Nets** et **Composants** suivent la même règle (`Ctrl`+clic).
3. Le panneau **Sélection** liste les morceaux retenus, numérotés ; **×** retire une ligne, **Tout désélectionner** vide la liste.
4. Les fiches décrivent toujours le dernier morceau cliqué. Les simulations calculent chaque parcours continu séparément (lots) : voir [chapitre 08](08-simulation-si.md).

### Je veux savoir à quel net va chaque broche d'un composant

1. Cliquer le boîtier sur la carte (cliquer une de ses pastilles affiche aussi sa fiche), ou le chercher dans le panneau **Composants** (filtre par repère, valeur ou boîtier).
2. La fiche **Composant** donne repère, type, valeur, boîtier, face, position, rotation, puis la liste **Broches**.
3. Cliquer un nom de net dans cette liste pour le sélectionner (`Ctrl`+clic pour l'ajouter).

### Je veux mesurer une distance

1. Appuyer sur `M` (ou **📏 Mesurer**).
2. Cliquer le point de départ, puis le point d'arrivée : la distance et les écarts ΔX / ΔY s'affichent dans l'unité du fichier. Un troisième clic recommence.
3. Viser une pastille ou un perçage : le point s'accroche à son centre (entraxe réel entre deux vias).
4. `Échap` ou `M` range la règle. Glisser déplace toujours la carte.

### Je veux compléter l'empilage avant de lire une impédance

1. Ouvrir le panneau **La carte**, section « Empilage du calcul ».
2. Les champs jaunes sont ceux que le fichier ne renseigne pas ; la valeur grisée (placeholder) est celle qui sera prise à défaut.
3. Saisir l'épaisseur de cuivre, l'épaisseur et la permittivité εr de chaque diélectrique ; changer au besoin le rôle d'une couche (Signal / GND / PWR).
4. La valeur saisie vaut aussitôt pour toutes les pistes de la couche et apparaît en bleu. Elle est gardée dans le profil, par nom de couche (ou de couple de couches pour un diélectrique) : elle revient à la réouverture, et vaut aussi pour un autre fichier dont les couches portent les mêmes noms.
5. Le tan δ (angle de perte) n'a pas de champ : il est lu dans le fichier, sinon 0,02 (FR-4) est pris et les résultats de simulation le signalent.
6. Le lien « Oublier les valeurs que j'ai saisies » revient à ce que dit le fichier.

### Je veux classer les nets (alimentation, masse, signal)

1. Cliquer **⚡ Nets (PWR/GND/Sig)** (ou **⚡ Classifier** dans le panneau Nets).
2. Pour chaque net, choisir **⏚ GND**, **⚡ PWR** ou **〰 Signal**, et la nature d'un signal (Horloge, Rapide, RF, Analogique, Antenne, classe d'interface, Lent).
3. **✨ Auto-détection** refait la détection automatique ; **Tout Signal** remet tout en signal.
4. **✓ Valider et appliquer les préréglages** applique la classification aux réglages de simulation. Chaque choix fait dans la fenêtre est pris en compte et mémorisé tout de suite, par nom de fichier, dans ce navigateur (et dans l'export `.json`) : **Passer** ne l'annule pas, il ne fait que ne pas appliquer les préréglages.

### Je veux exporter ou archiver ce que j'ai lu

1. **Exporter .json** : enregistre le modèle traduit (rouvrable sans serveur), téléchargé sous `<fichier lu>.json`. Avec un dossier de projet rattaché, la carte est rangée dans le projet (`<projet>-IPC.json`) au lieu d'être téléchargée.
2. **Exporter .png** : image de ce qui est affiché (rendu à 2x), `<nom>.png`.
3. `Ctrl`+`S` déclenche le même export que **Exporter .json**.

### Je veux préparer un boîtier (dossier mécanique)

1. Cliquer **Dossier méca**.
2. Dans le tableau « Repère / Hauteur (mm) / Ouv. », saisir la hauteur d'un composant si elle manque (le champ affiche en grisé la valeur du fichier ou de la LIB) et cocher **Ouv.** pour prévoir une ouverture dans le boîtier.
3. Contrôler l'aperçu de la feuille ; le sous-titre de la fenêtre résume le nombre de fixations, d'ouvertures et de composants sans hauteur.
4. Cliquer **⬇ Télécharger .zip** : `<carte>-MECA.zip` contient le plan mécanique (PDF), les données pour une IA (JSON) et la carte en 3D avec ses composants dessus et dessous (`<carte>-MECA.step`).

### Je veux la carte en 3D pour la mécanique (STEP)

1. Cliquer **Export STEP…** (après **Dossier méca**).
2. Cocher **Carte (PCB)**, **Composants dessus**, **Composants dessous**. **Cuivre extérieur** et **Sérigraphie** sont grisés (« non disponible ici ») : la visionneuse ne les a pas en polygones.
3. Cliquer **Exporter le .step** : `<carte>-3D.step`, un assemblage en millimètres, dans le repère des Gerber. Chaque composant prend le modèle 3D de la LIB, trouvé par la Part Name puis par la référence fabricant ; sans modèle, il sort en boîte à sa hauteur.

Le contenu est le même que l'**Export STEP…** de l'éditeur PCB : voir [Éditeur PCB : fabrication](04-editeur-pcb-fabrication.md), « STEP pour la mécanique ».

### Je veux sortir les plans de fabrication et d'assemblage

1. Cliquer **Plans (Draftsman)**.
2. Parcourir l'aperçu : plan de fabrication (contour coté, tableau de perçage, empilage, notes), assemblage face dessus, et face dessous si des composants y sont.
3. Cliquer **⬇ Télécharger le PDF** : `<carte>-PLANS.pdf`, texte cherchable, avec un signet par composant.

### Je veux fournir une fiche à un technicien

1. Cliquer **Fiche de mesure**.
2. Saisir la sonde + (couleur) et la sonde − (noire) : `U3.12`, `TP2` ou un net (`GND`), ou cliquer une pastille dans l'aperçu (la sonde + se remplit d'abord, puis la sonde −).
3. Choisir le type de mesure, éventuellement la valeur attendue, la tolérance, l'échelle des détails et une note, puis **+ Ajouter la mesure** (ou `Entrée`).
4. Répéter pour chaque mesure, puis **⬇ Télécharger le PDF** : `<carte>-MESURES.pdf`.

### Je veux lancer une simulation sur des pistes

1. Désigner la piste ou le net (voir ci-dessus).
2. Cliquer **Simulation EM…** : les panneaux **Simulation EM** et **Résultats** s'ouvrent.
3. Choisir la famille et l'analyse, puis **▶ Calculer**. Le détail des réglages est dans les chapitres [08](08-simulation-si.md) (SI), [09](09-simulation-pi-thermique-audit.md) (PI, audit) et [10](10-simulation-rf-em.md) (RF).

## Référence

### Barre d'outils

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| ⌂ Accueil | | Retour à la page d'accueil | |
| Éditeur schématique | | Revient au schéma resté dans son onglet | |
| Éditeur PCB | | Revient au routage, la carte y est restée | |
| Composants | | Ouvre la recherche de composants ([chapitre 06](06-recherche-composants.md)) | |
| 📚 Gestion LIB | | Ouvre la gestion des bibliothèques ([chapitre 05](05-gestion-lib.md)) | |
| 👤 … | | Profil d'utilisateur : panneaux, réglages et derniers documents lui appartiennent | |
| 📱 Tactile | | Bascule le mode tactile ([chapitre 01](01-accueil-projets-tactile.md)) | |
| 📂 Ouvrir un fichier… | `O` | Choisit un fichier IPC-2581 (`.xml`, `.cvg`, archive `.zip`) ou un `.json` exporté | Serveur requis sauf pour un `.json` |
| Exporter .json | `Ctrl`+`S` | Enregistre le modèle traduit ; avec un dossier de projet, le range dans le projet | Au-delà de 16 Mo, la voie projet est refusée et le téléchargement prend le relais, en le disant |
| ☁ Enregistrer (projet + GitHub) | `Ctrl`+`S` | Remplace « Exporter .json » quand la page est lancée par WEB_SUITE : range la carte dans PROJETS puis l'envoie sur GitHub | N'existe que sous WEB_SUITE ; jamais de repli en téléchargement : si l'écriture est refusée, rien n'est enregistré et le pied de page le dit |
| Exporter .png | | Image de ce qui est affiché, rendue à 2x | Aucune carte ouverte : rien |
| Dossier méca | | Ouvre la fenêtre du dossier mécanique | Carte ouverte requise |
| Export STEP… | | Ouvre la fenêtre des cases, puis télécharge `<carte>-3D.step` | Carte ouverte requise ; cuivre et sérigraphie non disponibles ; modèles 3D lus par le serveur |
| Plans (Draftsman) | | Ouvre la fenêtre des plans de fabrication et d'assemblage | Carte ouverte requise |
| Fiche de mesure | | Ouvre la fenêtre de la fiche du technicien | Carte ouverte requise |
| Ajuster | `F` | Cadre toute la carte | |
| Dessous / Dessus | `B` | Regarde la carte par en dessous (le bouton nomme la vue vers laquelle il mène) | Image en miroir et pile inversée |
| Repères | `R` | Affiche ou masque les repères des composants | Masqués par défaut ; les autres affichages (plans, perçages, etc.) sont actifs par défaut |
| Perçages | `D` | Affiche ou masque les perçages | |
| Plans | `P` | Affiche ou masque les plans de cuivre | |
| 📏 Mesurer | `M` | Arme la règle (voir « Je veux mesurer une distance ») | La mesure n'est pas conservée |
| ⚡ Nets (PWR/GND/Sig) | | Ouvre la fenêtre de classification des nets | Nécessite une carte avec des nets |
| Simulation EM… | | Ouvre (et déplie) les panneaux Simulation EM et Résultats | Le calcul a lieu sur le serveur |
| Espace de travail ▾ | | Menu des panneaux (voir plus bas) | |

### Raccourcis et gestes de la carte

Les touches sont ignorées dans un champ de saisie, ou avec `Ctrl`, `Cmd` ou `Alt` (sauf `Ctrl`+`S`).

| Geste ou touche | Effet | Limites |
|---|---|---|
| Glisser (bouton gauche) | Déplace la carte | |
| Molette | Zoome sur le point visé | Échelle limitée entre 0,02 et 4000 |
| Pincement à deux doigts | Zoome ; deux doigts qui glissent déplacent la carte | |
| `+` ou `=` | Zoom avant (x1,25) au centre de la vue | |
| `-` | Zoom arrière (x0,8) au centre de la vue | |
| `F` | Cadre toute la carte | |
| Clic | Désigne ce qui est dessous (pastille, perçage, piste, plan, boîtier, dans cet ordre) et met en évidence son net sur la couche cliquée | Cuivre cherché d'abord, de la couche du dessus vers le dessous ; tolérance de 3 pixels ; une nature d'objet coupée (rangée du panneau Couches) ou une couche cachée n'est pas désignable ; un clic dans le vide désélectionne |
| `Maj`+clic | Suit le net sur toutes les couches et chiffre le net entier ; pour un via, montre tous les vias du même net et rien d'autre | |
| `Ctrl`+clic (ou `Cmd`) | Ajoute à la sélection, ou retire ce qui y était | Un clic dans le vide avec `Ctrl` ne vide pas la sélection |
| `Ctrl`+`Maj`+clic | Ajoute un net entier à la sélection | |
| Reclic sur un boîtier sélectionné | Le désélectionne | Vaut pour les boîtiers seulement |
| Double-clic | Désigne l'objet dessous (comme un clic), sans recadrer ; sur un boîtier, il reste sélectionné | Pour recadrer : `F` ou **Ajuster** |
| Clic droit | Si rien n'est sélectionné, désigne ce qui est sous le pointeur ; pas de menu contextuel | |
| `B` | Dessus / dessous | |
| `R`, `D`, `P` | Repères, perçages, plans | Même état que les boutons de la barre |
| `M` | Arme ou range la règle | |
| `O` | Ouvrir un fichier | `Maj`+`O` n'est pas pris |
| `Échap` | Range la règle si elle est armée, sinon ne plus rien sélectionner | Dans une fenêtre (méca, plans, mesure), ferme la fenêtre ; ne ferme pas la fenêtre de classification des nets (**Passer** ou ✕) |
| `Ctrl`+`S` | Exporte le modèle (voir barre d'outils) | |
| Clic sur une pastille ou un via en attente d'une borne | Choisit la borne demandée par le panneau de simulation (chute continue, port RF, chemin de retour) sans changer la sélection | Voir [chapitres 08 à 10](10-simulation-rf-em.md) |

Au survol, le pied de page décrit l'objet sous le pointeur et sa position (X, Y, dans l'unité du fichier).

### Écran d'ouverture

| Élément | Effet | Limites |
|---|---|---|
| Zone « Déposez le fichier ici » | Dépôt par glisser-déposer, ou clic pour choisir le fichier | Un seul fichier à la fois ; le dépôt reste actif après l'ouverture |
| 📂 Choisir un fichier… | Même effet que **Ouvrir un fichier…** | |
| Message d'erreur sous la zone | Dit pourquoi la lecture a échoué | |
| Écran « Lecture de … » | Attente pendant que le parseur travaille sur le serveur | |

### Panneau Couches

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Tout | | Allume toutes les couches | |
| Rien | | Éteint toutes les couches | |
| Cuivre seul | | Ne garde que les couches de cuivre | |
| Rangée des natures d'objet : Contour, Plans, Pistes, Pastilles, Perçages, Contre-perçage, Textes, Boîtiers, Repères | `P` (Plans), `D` (Perçages), `R` (Repères) | Allume ou éteint un type d'objet sur toutes les couches | Un plan de masse couvre tout : le couper montre ce qui est dessous |
| Contre-perçage | | Cercle orange autour de chaque via contre-percé, au diamètre du foret quand le fichier le donne | N'apparaît que si le fichier déclare des contre-perçages |
| Ligne de couche (pastille de couleur, nom, nombre d'objets) | | Montre ou cache la couche | Groupes « Cuivre » (dans l'ordre de l'empilage) et « Techniques » (sérigraphie, masque, pâte, contour…) |

L'état des couches cachées, des natures d'objet et la face regardée sont conservés dans le profil de l'utilisateur, par nom de couche.

### Panneau La carte

| Section ou champ | Effet | Limites |
|---|---|---|
| Fichier | Nom, unités, dimensions, épaisseur, origine | |
| Contenu | Composants, nets, pistes (+ arcs), longueur de cuivre, plans, pastilles, perçages (dont métallisés), contre-perçages (vias et forets sans via), textes | |
| Empilage | Couches dans l'ordre, avec épaisseur, matériau, Dk, Df, et une pastille de fonction (Signal / GND / PWR pour le cuivre ; Diélectrique, Masque, Sérigraphie, Perçage, Pâte, Contour) | La fonction d'un cuivre est lue dans le fichier, sinon déduite de la couverture (40 % de la carte ou plus = plan) ; l'infobulle donne l'origine |
| Empilage du calcul : liste Signal / GND / PWR par couche de cuivre | Force le rôle d'une couche pour la simulation | Revenir à la valeur auto retire le forçage |
| Empilage du calcul : champ « mm » du cuivre | Épaisseur de cuivre ; vide = valeur du fichier, ou défaut | Champ jaune : absent du fichier ; bleu : saisi ici ; décimale virgule ou point |
| Empilage du calcul : « ↕ diélectrique » (mm, εr) | Épaisseur et permittivité du diélectrique entre deux conducteurs | Même code couleur |
| Note jaune « Le fichier ne dit pas tout » | Compte les valeurs absentes et signale l'absence de plan de référence | |
| Oublier les valeurs que j'ai saisies | Revient à ce que dit le fichier | Ne touche pas aux modèles de simulation |
| Modèles de simulation : Diélectrique causal (Djordjevic-Sarkar) | Dk et Df lus comme valeurs de fiche et prolongés de façon causale | Décoché par défaut |
| Modèles de simulation : Fréquence de la fiche (GHz) | Fréquence où Dk/Df sont donnés | 1 GHz par défaut ; actif seulement avec le causal |
| Modèles de simulation : Modèle de via | « π (C/2 – L – C/2) », « Ligne (barreau réparti) » ou « Auto (ligne si le via est long devant λ) » | Auto par défaut |
| Modèles de simulation : Portée percée de tous les vias déclarés | Envoie au serveur la portée de chaque via dont le fichier la déclare, pour chiffrer le moignon | Cochée par défaut ; un fichier qui ne déclare pas la portée ne la fournit pas |

Les modèles de simulation sont gardés par nom de fichier dans le profil.

### Panneau Nets

| Bouton ou menu | Effet | Limites |
|---|---|---|
| filtrer… | Filtre la liste par nom | Affiche 400 nets au plus ; affiner le filtre au-delà |
| ⚡ Classifier | Ouvre la fenêtre de classification | |
| ✕ | Ne plus mettre de net en évidence | |
| Tous / Signal / PWR / GND | Filtre la liste par classe | |
| Ligne de net | Sélectionne le net entier (`Ctrl`+clic : ajoute ou retire) ; affiche la classe ou la nature, le nom, le nombre de pistes, la longueur, le nombre de perçages | Recliquer le net choisi le désélectionne |

### Panneau Composants

| Bouton ou menu | Effet | Limites |
|---|---|---|
| repère, valeur, boîtier… | Filtre par repère, valeur, boîtier, référence ou type | Affiche 400 composants au plus |
| Ligne de composant | Sélectionne et centre la vue sur le composant (`Ctrl`+clic : ajoute ou retire sans recadrer) ; indique le boîtier, « dessous », « non monté » | Recliquer la ligne ne désélectionne pas (il recadre) ; la désélection se fait sur la carte (reclic sur le boîtier), par `Ctrl`+clic ou `Échap` |

### Panneau Sélection (fiches)

| Fiche | Contenu | Limites |
|---|---|---|
| Sélection (2 morceaux ou plus) | Liste numérotée ; **×** retire une ligne ; **Tout désélectionner** | La numérotation ne correspond pas toujours aux lots de la simulation (un net entier peut se découper) |
| Composant | Repère, type, valeur, tolérance, référence, boîtier, montage, face, position, rotation, broches ; case « Non monté (ignoré par les simulations) » ; propriétés (10 au plus) ; liste des broches avec leur net (80 au plus) | Un composant non monté est ignoré par toutes les simulations, ses pastilles restent du cuivre |
| Net | Nom et classe, boutons GND / PWR / Signal (appliqués aussitôt, préréglages de simulation compris), liste de nature, classe du fichier et paire différentielle (partenaire cliquable, Z diff cible) quand le fichier les porte, longueur, pistes, pastilles, perçages, plans, couches, « Montré » | Nature proposée seulement pour un signal |
| Net entier (`Maj`+clic ou choix dans la liste) | Ligne de transmission du net : longueur, retard, capacité, inductance, étendue de Z₀ avec moyenne pondérée, tableau « Par couche et largeur » | Z₀ ne s'additionne pas ; les arcs et la longueur sur couches absentes de l'empilage ne sont pas comptés ; hypothèses signalées en jaune |
| Piste (clic seul) | Largeur, longueur (chaîne de tronçons continus), segments, couche, ligne de transmission : topologie (microruban ou triplaque), plan(s) de référence, hauteur au plan, épaisseur de cuivre, εr du stratifié et effective, Z₀, retard (total et par mm), capacité et inductance (totales sur la longueur de la piste) | Formules Hammerstad, Wheeler, IPC-2141A ; triplaque décentrée (écart de plus de 40 %) : Z₀ demandée au solveur de section si le serveur est là |
| Pastille | Broche, couche, trou, anneau, diamètre, définition, position, contre-perçage éventuel | Une cote supposée par le lecteur est marquée comme telle (infobulle) |
| Perçage | Diamètre, métallisation, anneau, pastille, définition, position, contre-perçage | Idem |
| Contre-perçage (dans Pastille ou Perçage) | Face, couche à ne pas couper, moignon résiduel, profondeur, foret, source, et ce que le fichier tait | N'est transmis à la simulation que s'il est complet |
| Plan | Net, couche, aire, nombre de contours et de découpes | Le vide au milieu d'une découpe ne désigne pas le plan |

### Fenêtre de classification des nets

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Totaux (Total, ⏚ GND, ⚡ PWR, 〰 Signal) | Comptent les nets ; un clic sur une pastille filtre | |
| Rechercher un net par nom... | Filtre le tableau | 300 lignes au plus |
| Tous / ⏚ GND / ⚡ PWR / 〰 Signal | Filtre par classe | |
| ✨ Auto-détection | Relance la détection automatique sur tous les nets | Efface aussi la mémoire des choix manuels du fichier |
| Tout Signal | Passe tous les nets en signal | Tous les nets du fichier, même si le filtre n'en montre que quelques-uns (l'infobulle le dit) |
| ⏚ GND / ⚡ PWR / 〰 Signal (par ligne) | Classe le net ; liste de nature pour un signal | La colonne « Origine / Motif » dit Auto (avec la raison) ou Manuel |
| Bandeau « Préréglages de simulation » | Aperçu : plans de masse SI, rail PI actif et tension, signaux privilégiés | |
| Passer / ✕ | Ferme sans appliquer les préréglages de simulation | Les classes déjà choisies restent (prises en compte et mémorisées à chaque clic) ; pas de fermeture par `Échap` ni par clic à côté |
| ✓ Valider et appliquer les préréglages | Applique la classification aux réglages de simulation (plans de masse SI, rail PI, signaux) et ferme | La mémorisation par fichier (navigateur) a déjà eu lieu à chaque choix |

Une classe écrite dans le fichier (IPC-2581 de l'éditeur PCB de ce dépôt, ou de tout outil qui suit la même forme) sert de classement initial ; un nom de masse ou de tension passe devant.

### Fenêtre Dossier mécanique

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Tableau Repère / Hauteur (mm) / Ouv. | Une ligne par composant : hauteur saisie (0 à 100 mm), case d'ouverture dans le boîtier | Hauteur : saisie, sinon celle du fichier (`<Package height>`), sinon celle de la LIB servie par `/api/lib/composants`. Hors serveur : fichier et saisie seulement, la fenêtre le dit |
| Aperçu de la feuille | Se met à jour à la saisie | Sans `<Package><Outline>`, le corps est la boîte des pastilles et le dossier le signale |
| ⬇ Télécharger .zip | `<carte>-MECA.zip` : plan mécanique (PDF), JSON pour une IA, carte en 3D avec ses composants (STEP) | |
| ✕, `Échap`, clic hors de la fenêtre | Ferme | |

Les trous non métallisés servent de fixations ; ceux qui tombent dans le corps d'un composant sont rattachés à lui. Les réglages (hauteurs, ouvertures) sont gardés dans le modèle, donc dans **Exporter .json**.

### Fenêtre Plans (Draftsman)

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Aperçu | Plan de fabrication : vue de dessus, contour et découpes, symboles de perçage, cotes hors tout, tableau de perçage (symbole, Ø fini, quantité, métallisé, portée, usage), empilage, notes de fabrication ; assemblage face dessus ; assemblage face dessous si elle porte des composants | Les composants non montés sont en tirets avec « NM » ; les notes de fabrication sont un texte type, matériaux et finition à confirmer avec le fabricant ; les cotes et détails posés à la main existent dans l'éditeur PCB seulement |
| ⬇ Télécharger le PDF | `<carte>-PLANS.pdf`, texte cherchable, signets par composant | |
| ✕, `Échap`, clic hors de la fenêtre | Ferme | |

### Fenêtre Fiche de mesure

| Champ ou bouton | Effet | Limites |
|---|---|---|
| Sonde + (couleur) | Point de la sonde colorée : `U3.12`, `u3-12`, `J1 3`, `TP2` ou un net (`GND`) | Pour un net, le point le plus accessible est pris (point de test, puis face dessus, puis plus grande pastille) |
| Sonde − (noire) | Point de la sonde noire | Les deux sondes ne peuvent pas être sur la même pastille |
| Mesure | Tension DC (par défaut), Résistance, Continuité, Oscilloscope | |
| Attendu, Tolérance | Valeur attendue (« 3,3 V ») et tolérance (« ± 5 % ») | Texte libre ; gardés à 40 caractères (attendu) et 30 (tolérance) |
| Échelle des détails | auto, 2:1, 3:1, 4:1, 5:1, 10:1 | |
| Note pour le technicien | Texte libre | 60 caractères saisissables |
| + Ajouter la mesure | Ajoute la mesure à la liste (`Entrée` dans un champ fait de même) | 40 mesures au plus ; 4 par feuille. Au-delà, l'ajout est refusé (« Fiche pleine ») et les champs gardent la saisie |
| Clic sur une pastille de l'aperçu | Remplit la sonde active (+ d'abord, puis −) | |
| ✕ (par mesure) | Supprime la mesure | |
| ⬇ Télécharger le PDF | `<carte>-MESURES.pdf` : où poser les sondes, vues de détail agrandies, tableau des mesures | |
| ✕, `Échap`, clic hors de la fenêtre | Ferme | |

Les mesures sont gardées dans le modèle, donc dans **Exporter .json**.

### Panneaux Simulation EM et Résultats

| Élément | Effet | Limites |
|---|---|---|
| Simulation EM… (barre d'outils) | Affiche le panneau Simulation EM s'il est masqué, le déplie et le rafraîchit | Masqué d'usine |
| Panneau Simulation EM | Réglages communs avec l'éditeur PCB : familles SI, PI, RF, AUDIT et leurs analyses ; barre « Masse » (net pris pour plan de retour coplanaire), cible, tolérance, fréquence, bande, **▶ Calculer**, exports **.csv**, **.s2p**, **.json**, case **suivre**, **📋 Rapport**, **▾ réglages** | Voir les chapitres 08, 09 et 10 |
| Panneau Résultats | Sortie des calculs (courbes, fiches) | Masqué d'usine ; réapparaît à la fin du premier calcul |

Particularités de la visionneuse : l'empilage envoyé est celui du calcul (celui de « La carte », valeurs saisies comprises) ; un perçage IPC-2581 ne déclare pas toujours sa portée de couches, la visionneuse le suppose traversant et la note du résultat le dit ; la masse coplanaire est mesurée sur le cuivre lu. Le calcul demande le serveur et numpy/scipy (`pip install numpy scipy`). Pas de portée « tronçon » : seulement le clic (piste sur sa couche), `Maj`+clic (net entier) et `Ctrl`+clic (plusieurs morceaux, un lot chacun). Pour les contrôles de carte, voir aussi [la vérification de carte](../verification-carte.md) et [le guide Simulation EM](../simulation-em.md).

### Menu Espace de travail

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Espace de travail ▾ | Ouvre le menu des panneaux | |
| Une ligne par panneau (Couches, La carte, Sélection, Composants, Nets, Simulation EM, Résultats) | Affiche ou masque le panneau, avec sa position | |
| Tout afficher | Affiche tous les panneaux masqués | |
| Disposition en colonnes | Remet la disposition d'usine, tous panneaux dépliés | |
| Réinitialiser la disposition | Rétablit l'espace de travail d'usine | |
| ▾ / □ / ⬒ / ✕ (en-tête de panneau) | Replier, plein écran, détacher/rattacher, fermer | `Échap` sort du plein écran ; double-clic sur l'en-tête replie |

Disposition d'usine : Couches à gauche ; La carte et Sélection à droite ; Composants et Nets en bas (Nets replié) ; Simulation EM et Résultats masqués.

### Pied de page

| Élément | Contenu |
|---|---|
| Fichier | Nom du fichier lu |
| Composants, Nets, Perçages | Totaux du fichier |
| Message | Aide, description de l'objet survolé, résultat de la dernière action ou erreur |
| Position | X, Y du pointeur dans l'unité du fichier |
| Zoom | Échelle en pixels par unité du fichier (« px/mm »), pas en pourcentage ; une règle d'échelle est dessinée dans le coin de la carte |
| Face | dessus ou dessous |

### Mode tactile

| Geste | Effet | Limites |
|---|---|---|
| Glisser d'un doigt | Déplace la carte | |
| Pincement | Zoome | |
| Appui court | Désigne ce qui est dessous (comme un clic) | |
| Appui long du stylet (ou du doigt, selon le réglage) | Ouvre la roulette de commandes (contexte « vide », intitulée « Carte ») : Recadrer, Zoom +, Zoom −, Dessous | La roulette se règle comme dans les autres outils ; pas de commande contextuelle sur un objet. Voir [chapitre 01](01-accueil-projets-tactile.md) |
| `Ctrl`+clic, `Maj`+clic | Aucun équivalent : la commande « Multi » (sélection multiple tactile) des éditeurs n'est pas câblée dans cette page, et la roulette « Carte » n'a que Recadrer, Zoom +, Zoom −, Dessous | Sur tablette, ni l'ajout à la sélection, ni le suivi du net sur toutes les couches ; le net entier reste accessible par le panneau **Nets** |

## Limites connues

- **Serveur requis** pour tout sauf un `.json` exporté. La taille maximale d'un fichier est annoncée par le serveur (192 Mo dans `web_CAO.py`) ; au-delà, l'ouverture est refusée.
- **Un modèle traduit pèse lourd** (de l'ordre de 8 Mo pour une 4 couches moyenne). La voie « projet » plafonne à 16 Mo ; au-delà, l'export bascule en téléchargement.
- **Contour d'un boîtier** : dessiné seulement si le fichier le donne (`<Package><Outline>`) ; sinon cadre en tirets, estimé à partir des pastilles (un connecteur à une seule rangée apparaît comme une bande).
- **Hauteur des textes** : celle de la boîte du texte, sinon de sa taille de police, sinon 1,2 mm ; la police est celle de l'écran, pas celle du fichier.
- **Pastilles** : leurs couches sont celles de leur padstack, telles que le fichier les nomme ; le côté du composant n'est pas utilisé pour les deviner.
- **Plans** : chaque contour de plan est rempli séparément (règle pair-impair par contour) ; deux plans qui se chevauchent sur la même couche sont des cas douteux dans le fichier.
- **Plan de référence** : une couche est un conducteur si le fichier le déclare (`layerFunction`), un plan s'il annonce PLANE, POWER ou GROUND ; sinon une zone pleine couvrant au moins 40 % de la carte est tenue pour un plan. Sans l'un ni l'autre, la fiche écrit « aucun plan » au lieu d'inventer une impédance.
- **Permittivité** : lue dans la `<Spec>` du fichier quand il la donne (parseur depuis 1.70) ; tous les outils ne l'écrivent pas, d'où la saisie dans « La carte ».
- **Angle de perte (tan δ)** : lu dans le fichier (Df de la `<Spec>`, moyenné sur l'épaisseur des diélectriques), affiché dans l'empilage de « La carte » ; il n'existe pas de champ pour le saisir. Absent, le repli est 0,02 (FR-4) et les résultats de simulation le signalent (pertes diélectriques indicatives ; l'impédance n'en dépend pas).
- **Triplaque dissymétrique** : Z₀ demandée au solveur de section si le serveur est disponible ; sans serveur, la formule reste seule, avec sa note.
- **Contre-perçage** : lu sous deux formes seulement (`<Spec><Backdrill>` de la norme, vérifiée sur le code d'export de KiCad et non sur le texte de la norme ; foret posé sur un calque de perçage à part). Un export qui n'écrit la passe que dans le nom d'un calque n'est pas lu.
- **Portée des vias** : un perçage IPC-2581 ne déclare pas toujours les couches qu'il traverse ; sans cette portée, le moignon d'un via reste « inconnu » côté serveur et le contrôle des changements de couche est optimiste.
- **Double-clic** : il désigne l'objet sans recadrer (le README du dossier l'a longtemps annoncé comme « voir toute la carte »). Seul `F` (ou **Ajuster**) recadre.
- **Rien n'est modifiable** : la visionneuse ne change ni le fichier ni la carte ; seules les saisies d'aide (empilage du calcul, classes de nets, hauteurs du dossier méca, mesures) sont conservées, dans le profil ou dans l'export `.json`.

## Voir aussi

- [Accueil, projets, profils, tactile](01-accueil-projets-tactile.md)
- [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md) et [fabrication](04-editeur-pcb-fabrication.md) (Draftsman, dossier mécanique, Gerber)
- [Gestion LIB](05-gestion-lib.md) (hauteurs des composants pour le dossier mécanique)
- [Simulation SI](08-simulation-si.md), [PI, thermique et audit](09-simulation-pi-thermique-audit.md), [RF et EM](10-simulation-rf-em.md)
- [Claude et le MCP](11-claude-mcp.md) (lecture de la carte IPC par Claude)
- [README de la visionneuse](../../visionneuse-ipc2581/README.md) (détails de l'implémentation et des bancs d'essai)
- [Guide Simulation EM](../simulation-em.md), [vérification de carte](../verification-carte.md), [spécification du dossier mécanique](../../SPEC-dossier-meca.md)
