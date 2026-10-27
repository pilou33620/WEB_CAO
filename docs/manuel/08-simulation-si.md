# Simulation : le panneau « Simulation EM… » et l'intégrité du signal (SI)

Le bouton « Simulation EM… » de l'éditeur PCB et de la visionneuse IPC-2581 ouvre un même panneau, rangé en quatre familles (SI, PI, RF, AUDIT), dont les résultats se peignent sur le cuivre de la carte.
Ce chapitre décrit le panneau lui-même (onglets, boutons communs, rapport, réglages depuis une datasheet), puis la famille Signal (SI) : impédance Z₀, Z différentielle et paramètres S, crosstalk, chemin de retour, bus synchrone, diagramme de l'œil, modèles IBIS et classes d'interface.
Les familles PI, thermique et Audit sont dans le [chapitre 09](09-simulation-pi-thermique-audit.md), la famille RF dans le [chapitre 10](10-simulation-rf-em.md) ; la physique, les équations et les étalons de validation sont dans [../simulation-em.md](../simulation-em.md).

> [!NOTE]
> Tout calcul de section (Impédance, Z différentielle, Crosstalk, Current Return Path, Diagramme de l'œil) passe par le serveur local : `python web_CAO.py`, puis la page ouverte à l'adresse qu'il affiche. Une page ouverte en `file://` ne peut pas l'appeler. Seul l'onglet « Bus synchrone » calcule dans la page, sans serveur.

## Guide par tâche

### Je veux ouvrir le panneau et choisir une analyse

1. Éditeur PCB : menu **Outils**, rubrique **Analyser**, bouton **Simulation EM…**. Visionneuse IPC-2581 : bouton **Simulation EM…** de la barre d'outils. Le panneau « Simulation EM » s'ouvre (ou se déplie s'il était replié).
2. Choisir la famille dans la première rangée : **SI** Intégrité du signal, **PI** Intégrité de l'alimentation, **RF** Radiofréquence, **AUDIT** Audit de la carte.
3. Choisir l'analyse dans la seconde rangée. Pour SI : **Impédance**, **Z différentielle**, **Crosstalk**, **Current Return Path**, **Bus synchrone**, **Diagramme de l'œil**.
4. Les résultats s'écrivent dans la section « Résultats », séparée du panneau de réglages. Elle reparaît d'elle-même à la fin du premier calcul ; on la place, on l'agrandit ou on la détache comme les autres sections.

Changer d'onglet ne relance rien : le résultat de chaque analyse est gardé, et revenir sur l'onglet le retrouve.

### Je veux savoir si une piste est à la bonne impédance

1. Onglet **Impédance**. Régler **Cible** (Ω) et **Tolérance** (%). Régler **Fréquence** (f₀, avec son unité) : c'est à cette fréquence que Z₀ est donné et peint.
2. Vérifier la ligne **Masse** en tête du panneau : les nets en surbrillance sont ceux que le calcul tient pour de la masse coplanaire (voir « Je veux dire quels nets sont de la masse »).
3. Sélectionner le cuivre sur la carte. Éditeur PCB : **clic** pour le tronçon seul, **Maj+clic** pour la piste entière, **Maj+clic** à nouveau pour la piste sur toutes les couches. Visionneuse : **clic** pour la piste sur sa couche, **Maj+clic** pour tout le net sur toutes les couches.
4. Cliquer **▶ Calculer**. Le cuivre se colore : bleu dans la tolérance, rouge trop élevé, vert trop faible (le vert veut dire « trop bas », pas « bon »).
5. Lire le verdict en tête de fiche (« N section(s) hors tolérance, X mm » ou « Toute la sélection est dans la tolérance »), puis le tableau des tronçons : la colonne **Écart** donne l'écart à la cible, avec la même couleur que la carte.
6. Pour situer un tronçon fautif : bloc « LE LONG DU PARCOURS », curseur **Position** ; un viseur se promène sur le cuivre à l'abscisse lue.

### Je veux dire quels nets sont de la masse

1. Dans la ligne **Masse** (présente sous Impédance, Z différentielle, Crosstalk, Current Return Path et Diagramme de l'œil), cliquer sur les nets à compter comme plan de retour. Ils s'allument ; l'indication « proposé par la carte » devient « revenir à la proposition ».
2. Le résultat affiché est alors effacé (« La masse de référence a changé : relancez le calcul. »). Relancer.
3. Pour revenir au choix automatique : cliquer « revenir à la proposition ».

Seul le cuivre de ces nets, quand il borde la piste sur sa propre couche, entre dans le calcul coplanaire. Un îlot d'un autre signal n'y entre pas ; la fiche le signale comme « cuivre qui n'est pas de la masse ».

### Je veux calculer plusieurs morceaux d'une même ligne

1. Sélectionner un premier morceau, puis **Ctrl+clic** sur chaque morceau à ajouter.
2. Calculer. Chaque parcours continu est calculé séparément (c'est ce qu'il faut pour une ligne RF coupée par des condensateurs de liaison).
3. Le tableau de synthèse donne une ligne par lot (**Lot**, **Portée**, **l (mm)**, **Z₀ min–max**, **Moyenne**, **Hors tol.**). Cliquer une ligne déplie la fiche complète de ce lot. La carte peint tous les lots.

Les paramètres S sont ceux du lot déplié : ce qui relie deux lots (condensateur, résistance, connecteur) n'est pas dans le modèle.

### Je veux lire les paramètres S d'une liaison

1. Onglet **Impédance**. Régler **Bande S** (début → fin, chacun avec son unité) et **Points**, ainsi que **Réf.** (impédance de référence des ports). L'onglet **Current Return Path** porte les mêmes champs de bande (état partagé) mais ne trace pas la courbe.
2. Cliquer **▶ Calculer**. La courbe en bas de fiche trace **S11** (jaune) et **S21** (bleu) en dB ; le repère **f₀** marque la fréquence centrale. Changer la fréquence, la bande, les points ou la référence après un calcul efface le résultat (« La fréquence a changé : relancez le calcul. ») : recalculer.
3. Survoler la courbe : la ligne de lecture donne la fréquence, S₁₁, S₂₁, le ROS et l'impédance vue par le port Z = Z_réf(1+S₁₁)/(1−S₁₁), en complexe.
4. Si la fiche annonce « Bande trop peu échantillonnée », saisir le nombre de points qu'elle propose.
5. Exporter avec **.s2p** (Touchstone), **.csv** (tableau des tronçons) ou **.json** (le problème, rejouable au solveur en ligne de commande).

### Je veux vérifier une paire différentielle

1. Onglet **Z différentielle**. Régler **Cible Zdiff** (Ω) et **Tolérance** (%).
2. Désigner les deux pistes : soit sélectionner les deux pistes sur la carte (les deux encarts se remplissent seuls), soit cliquer **🎯** à côté de **Piste 1** puis de **Piste 2** avec chaque piste sélectionnée, soit taper un nom de net (liste de recherche). Avec une seule piste sélectionnée, elle devient Piste 1 et l'outil propose son partenaire (`_P`/`_N`, paire déclarée…) en Piste 2 s'il le reconnaît.
3. Cliquer **▶ Calculer**.
4. Lire le verdict (« La paire est dans la tolérance » / « N paire(s) sur M hors tolérance »), le tableau **Nets / Longement / Zdiff / Zcomm / impair / pair / εeff**, et la carte de chaleur : Zdiff tronçon par tronçon, à l'écart réel de chaque tronçon. Le gris veut dire « la paire ne longe pas ici ».
5. Le bloc « LE LONG DU PARCOURS » trace Zdiff et la Z₀ de chaque piste : la piste dont la Z₀ s'écarte est celle qui fait dériver la paire.
6. Si le schéma porte une terminaison différentielle, un bouton **Cibler N Ω** aligne la cible sur sa valeur.

### Je veux nommer une paire que l'outil ne reconnaît pas

1. Dans **Z différentielle** (ou **Diagramme de l'œil** en mode différentiel), remplir **Piste 1** et **Piste 2** à la main : 🎯 pour prendre la sélection, ou le nom du net.
2. **⇄** inverse les deux pistes ; **✕** vide un encart.
3. La détection automatique lit les suffixes (`_P`/`_N`, `+`/`−`, `_DP`/`_DM`…) et les paires déclarées dans l'éditeur ; une paire nommée à la main passe devant.

Deux pistes d'un même net sont refusées (« Piste 1 et Piste 2 ont le même net ») ; l'outil propose le partenaire probable.

### Je veux lire les paramètres S mixtes d'une paire

1. Après un calcul **Z différentielle**, descendre au bloc « Paramètres S en mode mixte ».
2. Choisir le mode : **Sdd (différentiel)**, **Scc (commun)** ou **Scd (conversion CEM)**.
3. Scd₂₁ au-dessus de −20 dB est signalé comme un risque accru de rayonnement (trait pointillé « Seuil CEM −20 dB » sur la courbe).
4. **📥 .s2p** exporte le Touchstone du mode affiché (Scc pour Scc, Sdd sinon).

### Je veux estimer le crosstalk d'une piste

1. Onglet **Crosstalk**. Sélectionner la piste **agresseur** sur la carte.
2. Dans la rangée « Piste sélectionnée », saisir **tr** (ns) : le temps de montée de l'agresseur. Vide, il est déduit de la classe du net, ou vaut 1 ns si le net n'a aucune classe ; la fiche dit lequel a servi.
3. Cliquer **▶ Analyser la piste**. Les voisines sont trouvées seules (présélection géométrique, puis confirmation).
4. Lire l'en-tête « NIVEAU 2 — STATUT VERT/ORANGE/ROUGE », puis le tableau paire par paire : **k_total**, **NEXT** et **FEXT** en % et en dB, **statut**.
5. Une victime « non calculée » n'est pas une victime sans couplage : la fiche le répète.

### Je veux savoir où reprendre le tracé pour réduire le NEXT

1. Après **▶ Analyser la piste**, aller au bloc « Carte locale — où le NEXT se fabrique » : une courbe par victime le long du parcours de l'agresseur, les seuils DRC en tirets, les zones de vigilance du plan en hachures.
2. Déplacer **Position** : un point par courbe, et la lecture de l'écart mesuré à cet endroit.
3. Allumer **chaleur sur le cuivre** pour peindre le NEXT local le long des victimes, et **zones à risque (n)** pour peindre les portions où il se fabrique.
4. La liste **À faire** traduit ces zones en gestes, dans l'ordre.

### Je veux passer toute la carte au crible du crosstalk

1. Onglet **Crosstalk**, rangée « Toute la carte » : saisir **tr global** (ns), qui s'applique à toutes les paires.
2. Cliquer **▶ Toute la carte**.
3. Le tableau montre d'office les paires orange et rouges ; la case « montrer aussi les paires vertes » ajoute les vertes. Un clic sur une ligne centre la vue sur la paire.
4. La case « colorer sur le layout » allume ou éteint la coloration (au statut DRC) sur le cuivre.
5. **.csv** (à côté du bouton) exporte toutes les paires.

### Je veux contrôler le chemin de retour d'un via

1. Onglet **Current Return Path**. Régler **Fréquence**, **tr** et **amplitude** (V crête à crête du signal).
2. Sélectionner une piste qui change de couche, puis **▶ Calculer**.
3. Lire le tableau **Via / Couches / Retour / L boucle / Vias de masse**. Cliquer une ligne met le via en surbrillance sur la carte avec son chevelu de retour ; cliquer un via de masse de la dernière colonne l'isole.
4. Une cellule « Retour » rouge (« aucun », « ⚠ plan→plan ») appelle un via de masse ou une même référence des deux côtés ; une cellule « vigilance » dit que le via de retour est trop loin.

### Je veux vérifier le setup et le hold d'un bus synchrone

1. Onglet **Bus synchrone**. Choisir le **Protocole** (SPI, QSPI, I2C, UART, RGMII, SDRAM/DDR, Manuel / Expert) : pour les protocoles à timing, f, t_su, t_h, T_co min et T_co max se préremplissent ; les corriger depuis la datasheet des composants. I2C et UART ont d'autres champs (voir la référence).
2. Constituer la liste des signaux : **+ Ajouter net… ▾**, **+ Horloge**, **+ Donnée**. À l'ouverture de l'onglet, les nets sélectionnés sont repris, ou un net d'horloge reconnu et sept autres nets.
3. Cliquer le rôle (**⏱ CLK** / **⇄ DATA**) pour le basculer, choisir le net dans la liste de chaque signal, cocher **R série** pour une résistance d'adaptation.
4. Lire le résultat : le calcul se lance à l'ouverture de l'onglet et se relance à chaque modification (**▶ Simuler** le relance à la main). La carte de résultat dit « ✔ CONFORME » ou « ⚠ VIOLATIONS DÉTECTÉES ».
5. Pour une violation Hold ou une donnée à recentrer, le bouton de la colonne **Action / Reco** (éditeur PCB) arme l'outil serpentin avec la longueur à ajouter.

### Je veux ouvrir l'œil d'une liaison

1. Onglet **Diagramme de l'œil**. Choisir le **Protocole** dans la liste (ou « Aucun gabarit — œil libre ») : débit, front, émetteur, récepteur, égaliseur, setup/hold et taux d'erreur se préremplissent, et restent modifiables.
2. En **Mode** « simple », sélectionner la piste ; en « différentiel », remplir **Piste 1** et **Piste 2**.
3. Ajuster les champs de l'émetteur (**V haut / V bas à vide**, **Rs**) et du récepteur (**RL**, **CL**) d'après la datasheet.
4. Cliquer **▶ Calculer**.
5. Lire le verdict (« Gabarit respecté », « Gabarit respecté en PRBS, pas au pire cas », « Gabarit violé »…), la figure (densité PRBS, œil pire cas, gabarit, seuil) et le tableau **PRBS / pire cas** : hauteur, largeur, marge sur le gabarit.

### Je veux compter la gigue, le bruit et le taux d'erreur

1. Dans l'onglet **Diagramme de l'œil**, remplir **RJ** (ps rms), **DJ** (ps c-c) et/ou **Bruit** (mV rms), et choisir le **BER** visé.
2. Calculer. Une colonne « à 10⁻¹² » (ou le taux choisi) s'ajoute au tableau, avec les contours de taux d'erreur sur l'œil et la baignoire en dessous. Le gabarit se juge aussi sur le contour du taux visé.
3. Cocher « voisines de la sélection » pour ajouter la diaphonie des voisines au pire cas et à l'œil statistique, et choisir leur sens (« sens inconnu (le pire) », « même sens (FEXT) », « sens opposé (NEXT) »).

### Je veux utiliser un modèle IBIS pour l'émetteur ou le récepteur

1. Dans le bloc **IBIS** de l'onglet **Diagramme de l'œil**, cliquer **fichier .ibs…** à la ligne « émetteur » ou « récepteur » et choisir le fichier.
2. Choisir le **[Model]** et le coin (**typ**, **min**, **max**) ; en différentiel, le modèle et le coin du brin inverse (N), ou « = P ».
3. Choisir la broche (ou, en différentiel, la paire de [Diff Pin]) pour prendre son boîtier propre ; sans choix, « boîtier moyen ».
4. Calculer. Le tampon émetteur remplace le générateur de Thévenin ; le récepteur apporte sa capacité C_comp et ses diodes. Quand la liaison se simule dans le temps (émetteur IBIS, récepteur à diodes ou [Rgnd]/[Rpower], ou brin inverse décalé), le motif doit être **PRBS7** ou **PRBS9** : en PRBS15 le serveur refuse le calcul. Un récepteur IBIS sans diode reste linéaire et accepte PRBS15.
5. Le bouton **✕** retire le modèle.

### Je veux régler les simulations depuis une datasheet

1. Dans le panneau « Claude » (voir le [chapitre 11](11-claude-mcp.md)), demander à Claude de lire la datasheet et de proposer les réglages de simulation.
2. Claude lit le catalogue (`cao_sim_lire`) et propose un lot (`cao_sim_ecrire`) : une carte du panneau « Claude » montre chaque valeur proposée à côté de la valeur actuelle.
3. Cliquer **Appliquer** sur la carte (ou **Refuser**). Rien ne change avant ce clic, sauf si l'interrupteur « Appliquer directement (cet onglet) » est allumé.
4. Le bouton **Annuler** de la carte remet les valeurs d'avant, tant qu'aucun de ces paramètres n'a été retouché depuis.

### Je veux garder une trace d'une simulation

1. Calculer l'analyse voulue, puis cliquer **📋 Rapport** dans la rangée des onglets (sans résultat, le rapport s'ouvre quand même et dit « Simulation non exécutée »).
2. Dans la fenêtre : **📋 Copier** (Markdown autonome), **🖨️ Imprimer / PDF** ou **⤓ Fichier .html** (autonome, hors ligne). **✕**, Échap ou un clic hors de la fenêtre ferme.

### Je veux classer un net par interface

1. Éditeur schématique, éditeur PCB ou visionneuse : dans la liste des classes d'un net, choisir une des interfaces (**USB FS**, **USB HS**, **ETH 100**, **ETH 1000**, **LVDS**, **CAN**, **RS-485**) ; l'info-bulle de l'option donne le nom long de la norme.
2. Sous **Crosstalk** et dans l'audit de la carte, la classe fixe le front du net (voir « Classes d'interface »).

## Référence

### Le panneau : ouverture, rangées, boutons communs

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Simulation EM…** | Éditeur PCB : menu Outils, rubrique Analyser. Visionneuse : barre d'outils. Ouvre ou déplie le panneau « Simulation EM ». | Le panneau démarre masqué (éditeur PCB comme visionneuse) ; déjà ouvert, le bouton le déplie s'il était replié. Le menu de l'espace de travail le rend aussi trouvable. |
| En-tête du panneau : **▾** Replier, **□** Plein écran, **⬒** Détacher / rattacher, **✕** Fermer | Gestion de la section comme les autres sections du dock. | La section « Résultats » a les mêmes quatre boutons. |
| Rangée des familles : **SI** Intégrité du signal, **PI** Intégrité de l'alimentation, **RF** Radiofréquence, **AUDIT** Audit de la carte | Choisit la famille ; l'info-bulle de chaque bouton dit à quelle question elle répond. | Changer de famille ouvre la première analyse de la famille. |
| Rangée des analyses (SI) : **Impédance**, **Z différentielle**, **Crosstalk**, **Current Return Path**, **Bus synchrone**, **Diagramme de l'œil** | Ouvre l'analyse. Le résultat de chaque analyse est gardé quand on change d'onglet. | Impédance, Z différentielle et Current Return Path lisent la même réponse du serveur (une sélection, un calcul). Crosstalk et Diagramme de l'œil ont chacun leur route et leur résultat. |
| **▾ réglages** / **▸ réglages** | Replie les réglages pour laisser la place aux résultats. | La rangée des boutons (Calculer, exports) reste visible. |
| **📋 Rapport** | Ouvre le rapport de l'analyse courante (voir « Le rapport »). | Absent si la page ne charge pas `simulation-rapport.js`. |
| Ligne **Masse** (pastilles de nets) | Nets tenus pour plan de retour ; clic pour en ajouter ou retirer. | Jusqu'à huit pastilles, puis « +N autre(s) ». Un changement efface le résultat affiché. « Aucun net ne porte de cuivre plein sur cette carte » : pas de masse coplanaire à compter. |
| **suivre** | Recalcule à chaque changement de sélection (après un court repos). | Présente sous Impédance, Z différentielle et Current Return Path ; décochée d'office, et commune à ces trois onglets. Sans elle, changer la sélection efface le résultat. |
| Sélecteurs d'unité (**Hz / kHz / MHz / GHz**, **ps / ns / µs**, **mV / V**, **Mb/s / Gb/s**) | Changent l'unité d'écriture d'un champ en gardant le nombre écrit (868 passé de MHz en GHz vaut 868 GHz). | f₀, le début et la fin de la bande S ont chacun leur sélecteur (GHz d'office) ; la valeur est toujours convertie en unités SI pour le calcul. |
| Barre de progression | Les lots avancent par allers-retours au serveur ; les lots déjà rendus restent affichés. | |
| Gestes de sélection (éditeur PCB) | **Clic** : tronçon seul. **Maj+clic** : piste entière. **Maj+clic** à nouveau : piste sur toutes les couches. **Ctrl+clic** : ajoute un morceau (un lot par parcours continu). | La sélection à cheval sur plusieurs nets n'est pas une paire : voir Z différentielle. |
| Gestes de sélection (visionneuse) | **Clic** : la piste sur sa couche. **Maj+clic** : tout le net, toutes couches. **Ctrl+clic** (Cmd sur Mac) : ajoute un morceau ; **Ctrl+Maj+clic** ajoute un net entier. | Un fichier IPC-2581 décrit une piste comme une polyligne entière : pas de « tronçon » à isoler. |

Les résultats se peignent sur la carte : Z₀ ou Zdiff sous Impédance et Z différentielle (voir ci-dessous), statuts vert/orange/rouge sous Crosstalk, chevelu du retour sous Current Return Path. Les autres onglets ne peignent pas le cuivre.

### Impédance (Z₀ et paramètres S)

Le serveur résout la section droite de chaque tronçon (méthode des moments 2D, `python/ligne_mom.py`), puis met les tronçons en cascade pour obtenir les paramètres S de la liaison. Topologies traitées : microruban, microruban couvert, triplaque (centrée ou non), ligne coplanaire.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Cible** (Ω) | Impédance visée pour la piste sélectionnée. Défaut : 50. | Centre de la bande bleue de la carte. |
| **Tolérance** (%) | Pourcentage de la cible. Défaut : 10 ; l'écart absolu s'affiche à droite (« ± x Ω »). | Plancher de 0,1 Ω sur la tolérance absolue. |
| **Fréquence** + unité | f₀ : fréquence à laquelle Z₀ est donné et la carte peinte. Défaut : 1 GHz. | Saisir f₀ sous le début de la bande ou au-dessus de la fin adapte aussitôt la bande dans le panneau (début = 10 % de f₀, fin = 1,5 × f₀). Une bande réglée ensuite à la main qui laisse f₀ dehors est étendue par le serveur, et un avertissement le dit avant le calcul. Changer f₀ efface le résultat. |
| **Réf.** (Ω) | Impédance de référence des ports pour les paramètres S. Défaut : 50. | S₁₁ n'a de sens que contre cette référence ; la fiche la rappelle. |
| **Bande S** début → fin + unités | Bornes de la bande des paramètres S. Défaut : 100 MHz → 5 GHz. | |
| **Points** | Nombre de points de la courbe. Défaut : 21. | Plafond du serveur : 401. |
| Barre d'avertissement | Signale f₀ hors bande et un temps de montée supérieur à une demi-période du signal (si tr est saisi). | Le champ tr n'est pas sous Impédance : il se saisit sous Current Return Path (ou vient d'une datasheet) et sert aussi ici. |
| **▶ Calculer** | Lance le calcul de la sélection. | |
| **.csv** | Tableau des tronçons, avec la section résolue de chacun, la masse de référence, les notes et avertissements. | Tous les lots dans le même fichier (une colonne « lot »), à la différence de .s2p et .json. |
| **.s2p** | Paramètres S au format Touchstone. | Ceux du lot déplié. Le fichier note dans son en-tête les options de modèle qui s'écartent du défaut. Pas de .s2p quand la cascade est refusée (sélection ramifiée) : la fiche dit pourquoi. |
| **.json** | Le problème lui-même, rejouable au solveur en ligne de commande. | Celui du lot déplié. |
| **suivre** | Recalcul à chaque changement de sélection. | |
| **estomper le reste** | Estompe le cuivre qui n'entre dans aucun calcul. Allumé d'office. | Vaut aussi pour la carte de Zdiff. |

Ce que la fiche affiche :

| Élément de la fiche | Lecture | Limites |
|---|---|---|
| Verdict | « N section(s) hors tolérance, X mm » ou « Toute la sélection est dans la tolérance », avec min–max et moyenne pondérée par la longueur à f₀. | Compté en sections regroupées (pas en tronçons envoyés). |
| Ligne de méta | Portée, nombre de tronçons, longueur (mm), retard, pertes (dB), référence, durée. | Sur une sélection ramifiée, retard et pertes sont des sommes sans sens de trajet : barrés, avec la raison au survol. |
| Légende de la carte | bleu = dans la tolérance ; rouge = trop élevé (« > cible + tol. ») ; vert = trop faible (« < cible − tol. ») ; gris = pas de valeur. La clarté porte l'écart. | |
| « LE LONG DU PARCOURS » + **Position** | Z₀ tronçon par tronçon, et un viseur sur le cuivre à l'abscisse lue. | Sur une sélection ramifiée, l'abscisse cumule les tronçons dans l'ordre d'envoi. |
| **Section** | Pour chaque section distincte : couche, topologie, plans de référence, hauteur h (ou écart entre plans), ε_r, tan δ, épaisseur de cuivre, largeur, ε_eff, et la provenance de chaque cote (fichier, saisie ou repli). | Le masque de soudure n'est pas dans l'empilage envoyé ; la fiche le dit pour les couches extérieures. |
| Notes | Dispersion si elle déplace le chiffre, ligne coplanaire (écart au cuivre de masse), couture de vias (« couture serrée / limite / trop lâche »), cuivre voisin qui n'est pas de la masse, ports déduits. | Les ports sont idéaux : S₁₁ est celui du cuivre nu, meilleur que ce qu'un analyseur de réseau mesurerait. |
| Tableau **Tronçon / l (mm) / Larg. / Topo. / Z₀ Ω / Écart** | Un tronçon regroupé par ligne ; l'écart est coloré comme la carte. | 60 lignes au plus, puis « … et N autres ». |
| Discontinuités (**Après / Type / Détail / L / C / Phase**) | Coudes et vias cascadés, moignons de via, vias hors parcours. | Un via hors parcours n'entre pas dans la cascade. |
| Courbe **S11** / **S21** | Voir « Je veux lire les paramètres S ». Seul S₁₁ est tracé ; S₂₂ n'apparaît que par un avertissement quand la liaison est dissymétrique (il est dans le `.s2p`). | Le modèle est réciproque : S₁₂ = S₂₁. |

### Z différentielle (et paramètres S mixtes)

Section à deux conducteurs résolue pour chaque couple de pistes qui se longent : modes pair et impair. Zdiff = 2·Z_impair ; Zcomm = Z_pair / 2.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Cible Zdiff** (Ω) | Impédance différentielle visée. Défaut : 100. | |
| **Tolérance** (%) | Pourcentage de la cible. Défaut : 10. | Plancher de 0,1 Ω sur la tolérance absolue. |
| **Piste 1**, **Piste 2** | Nom du net (avec recherche) de chaque moitié de la paire. | Deux nets identiques sont refusés. |
| **🎯** (Piste 1, Piste 2) | Assigne la piste ou le net sélectionné. | |
| **✕** (Piste 1, Piste 2) | Efface l'encart. | |
| **⇄** | Inverse Piste 1 et Piste 2. | |
| **▶ Calculer** | Calcule la paire. | La fréquence et la bande des paramètres S mixtes ne se règlent pas ici : elles reprennent les valeurs de l'onglet Impédance. |
| **.json** | Le problème lui-même. | |
| **.s2p** (rangée des boutons, après .json) | Touchstone de la paire (même fichier que le bouton « 📥 .s2p » du bloc des paramètres S mixtes). | Voir « Paramètres S mixtes ». |
| **suivre** | Recalcul à chaque changement de sélection. | |
| **Cibler N Ω** (dans la fiche) | Aligne la cible sur la terminaison différentielle trouvée au schéma. | N'apparaît que si le schéma porte une telle résistance. |

| Élément de la fiche | Lecture | Limites |
|---|---|---|
| Verdict | « La paire est dans la tolérance », « Les N paires sont dans la tolérance », « N paire(s) sur M hors tolérance », « Aucune paire différentielle reconnue ». | Seules les paires déclarées ou reconnues par leurs suffixes sont jugées. |
| Méta | Nombre de longements, nets de masse, et **paire** : « reconnue », « choisie » ou « la plus proche ». | « La plus proche » est un repli, pas une déclaration : à vérifier avant de lire « ma paire fait N Ω ». |
| Légende de la carte | Zdiff tronçon par tronçon : trop faible, dans la tolérance, trop élevé ; **gris** = la paire ne longe pas ici. | Chaque tronçon est repris à son écart réel : la carte n'affiche pas partout le chiffre du tableau, qui est obtenu sur l'écart moyen du longement. |
| « LE LONG DU PARCOURS » | Courbes Zdiff, Piste 1 (bleu) et Piste 2 (orange), Z₀ ordinaire de la paire (gris), curseur **Position**. | |
| Tableau **Nets / Longement / Zdiff / Zcomm / impair / pair / εeff** (six colonnes : « impair / pair » et « εeff » portent chacune les deux valeurs) | Un couple par ligne ; couche et « des deux côtés » sous les noms ; Zdiff en couleur de verdict. | Rangé en « Paires reconnues » puis « Autres longements — ce ne sont pas des paires ». |
| Notes | Zdiff = 2 Z_impair et Zcomm = Z_pair / 2 ; ε_eff impair plus petit que le pair (le champ passe par l'air) ; si plus de deux conducteurs, les autres sont tenus à la masse ; pistes superposées signalées. | Les pistes superposées sur deux couches sont signalées, pas chiffrées. |

#### Paramètres S mixtes

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Sdd (différentiel)** | Mode différentiel pur, Sdd₁₁ et Sdd₂₁ normalisés sur la référence différentielle. | |
| **Scc (commun)** | Mode commun pur, Scc₁₁ et Scc₂₁, normalisés sur Z_réf,diff / 4. | |
| **Scd (conversion CEM)** | Conversion différentiel vers commun induite par le déséquilibre. Seuil tracé : −20 dB. | Au-dessus de −20 dB : risque accru de rayonnement. |
| **📥 .s2p (sdd)** / **📥 .s2p (scc)** | Télécharge le Touchstone du mode affiché. | En mode Scd, le fichier exporté est celui de Sdd. |
| Entête de bloc | « Skew ΔL », « Réf. diff », « Réf. comm ». | Une paire dissymétrique passe par une cascade à quatre accès, brin par brin ; la fiche le dit. |

### Crosstalk (niveau 2, scan normalisé)

Question posée : quel pic de bruit relatif une victime subit-elle, en pour-cent de l'amplitude de l'agresseur, sans connaître ni la tension réelle ni le protocole ? Hypothèses de départ : échelon unitaire sur l'agresseur, lignes adaptées aux deux bouts, front tr. Aucun onglet « Diaphonie » : il a été retiré au profit de celui-ci.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Piste sélectionnée : tr** (ns) | Temps de montée de l'agresseur. Vide : déduit de la classe du net, ou 1 ns si le net n'a aucune classe (une classe sans front, comme Masse ou Alimentation, est jugée « Lent »). | Un net de classe RF sans front saisi est jugé à 100 ps : le FEXT varie comme 1/tr et sort alors dix fois celui d'un front de 1 ns ; la fiche l'écrit en alerte. Renseigner un front, ou la porteuse RF du panneau de vérification (tr = 0,35 / f). |
| **confirmation** (dB) | Seuil d'atténuation (négatif) au-dessous duquel une voisine reste au tableau avec ses niveaux, sans être peinte ni comptée. Défaut : −40 (≈ 1 %). | S'applique au pire du NEXT et du FEXT. |
| **▸ avancés** / **▾ avancés · N modifié(s)** | Déplie la présélection ; nomme les réglages qui ont quitté leur défaut. | |
| avancés : **distance** (mm) | Distance latérale au-delà de laquelle une piste n'est plus candidate. Vide : trois fois le plus grand de la largeur et de la hauteur au plan. | Une voisine écartée à moins de 1,5 fois le seuil est nommée dans la fiche. |
| avancés : **longement mini** (mm) | En deçà, c'est un croisement, pas un longement. Vide : déduit. | |
| avancés : **couches adjacentes** | Compte les pistes superposées sur la couche voisine sans plan entre elles. Coché d'office. | Celles qu'un plan de référence sépare sont écartées (le plan est un écran). |
| avancés : **zone à risque** (%) | Fraction du pire point de chaque victime au-delà de laquelle la portion se peint sur le cuivre. Défaut : 50. | |
| **Statut DRC : orange dès** (%) | Seuil orange. Défaut : 3. | Mêmes seuils que la vérification de carte : les changer re-juge la fiche sans relancer le calcul. |
| **Statut DRC : rouge au-delà de** (%) | Seuil rouge. Défaut : 7. | Idem. |
| **pertes R, G** | Ajoute les pertes de la ligne (cuivre par effet de peau, diélectrique par tan δ) au genou du front, 0,35/tr. Décoché d'office. | Les pertes ne font qu'ôter du bruit. Les changer efface les résultats (piste et carte entière). |
| **Σ agresseurs** : **en phase** / **quadratique** | Compose le bruit de plusieurs agresseurs sur une victime : somme arithmétique (pire cas, défaut) ou racine de la somme des carrés (power sum). | La somme a son propre statut, compté dans celui de la paire. |
| **▶ Analyser la piste** | Niveau 2 de la piste sélectionnée : voisines, k_total, NEXT, FEXT, statut. | |
| **.csv** | Tableau niveau 2, puis carte locale position par position avec l'espacement mesuré. | L'en-tête porte les hypothèses. |
| **.json** | Le problème, rejouable. | |
| **rapport** | Rapport complet en texte : statut, tableau, réserves, présélection, plan de référence, hypothèses. | Distinct du bouton « 📋 Rapport » de la rangée des onglets. |
| **Toute la carte : tr global** (ns) | Front appliqué à toutes les paires. Défaut : 1 ns. | Le même que la règle « diaphonie » de la vérification de carte. Le changer efface le résultat « toute la carte ». |
| **▶ Toute la carte** | Chaque paire de pistes voisines de la carte, sous le tr global. | |
| **.csv** (rangée « Toute la carte ») | Le tableau de toutes les paires. | |

Statut DRC, par métrique, puis le pire des deux pour la paire : **vert** sous le seuil orange, **orange** du seuil orange au seuil rouge, **rouge** au-delà.

| Élément de la fiche | Lecture | Limites |
|---|---|---|
| En-tête | « NIVEAU 2 — STATUT VERT/ORANGE/ROUGE », ou « RIEN N'A ÉTÉ CALCULÉ », ou « AUCUNE VICTIME CONFIRMÉE ». « sous réserve » s'ajoute quand la fiche a des réserves graves. | Une présélection vide ne dit rien du couplage de la piste. |
| Ligne de méthode | Agresseur, tr et sa source, seuils, pertes ou non, mode de somme. | |
| Victime la plus bruitée | NEXT et FEXT en % et dB avec leur pastille, k_total, NEXT saturé ou non. | |
| « N voisine(s) NON CALCULÉE(S) » | Aucune section droite n'a pu être résolue (plan de référence absent) : leur niveau nul n'est pas un couplage nul. | Le statut ne les couvre pas. |
| **À faire** | Gestes numérotés (quoi, cible, où), avec « pourquoi ces gestes-là ». | |
| **N réserve(s)** | Réserves graves, avec « pourquoi, et quoi en faire ». | |
| Tableau « Étape 0b — niveau 2, paire par paire » | Colonnes **#**, **victime**, **k_total**, **NEXT**, **NEXT dB**, **FEXT**, **FEXT dB**, **Σ agresseurs**, **statut**, **T_d**, **NEXT saturé**, **où**, **longement**, **écart**, **couche**. Étiquettes : « superposée X mm », « fente +x % », « sous le seuil ». | Une ligne « sous le seuil » est au tableau mais ni peinte ni comptée. |
| « Carte locale — où le NEXT se fabrique » | Une courbe par victime ; boutons **chaleur sur le cuivre** et **zones à risque (n)** ; une case par victime pour allumer ou éteindre sa courbe ; **Position**. | Le FEXT n'a pas de carte : il co-propage et arrive en bloc au bout lointain. Seuils hors de l'échelle : nommés sous la figure. |
| Blocs repliés | « Étape 0a — ce qui longe, et ce qui a été écarté » (**piste / couche / type / côté / distance / écart médian / longement / retenue**), « Tous les avertissements », « Le plan de référence », « Sous quelles hypothèses ». | |
| « Toute la carte » | Pastille du pire statut, nombre de paires rouges/orange/vertes ; tableau **victime ← agresseur / couche / longueur / écart / k_total / NEXT / FEXT / statut** ; cases « montrer aussi les paires vertes » et « colorer sur le layout ». | Au-delà d'un certain nombre, les paires les plus couplées sont seules affichées (la fiche donne le nombre). |

Coloration sur le cuivre : la piste analysée peint chaque victime à la couleur de son NEXT local, borné par le NEXT de la paire ; « toute la carte » peint la portion de chaque victime en regard de son agresseur, à la couleur du statut de la paire, les rouges par-dessus.

Une fente du plan franchie par l'agresseur et la victime ajoute au niveau 2 un terme d'impédance commune du retour (résolu sur l'image des plans si la page l'envoie, modèle d'Ott en repli). La fiche l'étiquette « fente ».

### Current Return Path (chemin de retour)

Par où revient le courant de chaque via de la sélection : vias de masse qui referment la boucle, distance, part, inductance de boucle. Même calcul que sous Impédance ; l'onglet ne montre que le retour.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Fréquence** + unité | Fréquence de travail. | Ne change pas l'inductance de boucle ; décide de ce qui compte comme long. |
| **tr** + unité (ps, ns, µs) | Temps de montée 10–90 %. Vide : déduit de la fréquence. | Fixe le spectre (f_knee = 0,35 / tr) et l'excitation de la cavité entre plans. |
| **amplitude** + unité (mV, V) | Excursion crête à crête du signal. Défaut : 3,3 V. | Fixe linéairement le rayonnement de la boucle de retour. |
| **Bande S**, **Points** | Comme sous Impédance (état partagé). | |
| **▶ Calculer** | Calcule la sélection. | |
| **.json** | Le problème, rejouable. | |
| **suivre** | Recalcul à chaque changement de sélection. | |

| Élément de la fiche | Lecture | Limites |
|---|---|---|
| Verdict | « Aucun via dans la sélection » ; « N via(s) sur M sans retour identifié » ; « N via(s) sur M en zone de vigilance (boucle large > 1,8 mm) » ; « Le via a un retour identifié » ou « Les N vias ont un retour identifié ». | Une sélection sur une seule couche n'a pas de retour vertical à chiffrer. |
| Tableau **Via / Couches / Retour / L boucle / Vias de masse** | **Retour** : « N via(s) » (vert) avec distance au plus proche et score de reconstruction, « vigilance », « aucun ≤ X mm » (rouge), « cavité » avec l'impédance de traversée en Ω, « ⚠ plan→plan » (changement de référence sans via qui les joigne), « ? » (nets des plans inconnus), « non envoyé ». **L boucle** : nH et sa source. | Une source « self » ou « self+cavite » veut dire qu'aucun retour n'est identifié : le chiffre est un plancher. |
| Colonne **Vias de masse** | Pour chaque via de masse : rang, distance (mm), plans connectés, part du courant (%) ou « écarté ». | Plus de trois vias : liste défilante. D'après les info-bulles : zone de vigilance au-delà de 1,8 mm et jusqu'à 5,0 mm, rayon de recherche 5 mm. |
| Clic sur une ligne | Met le via en surbrillance sur la carte avec son chevelu de retour ; re-cliquer le désélectionne. | |
| Notes | Changement de plan de référence (grave quand aucun via ne joint les deux plans), doute si l'empilage ne déclare pas le net des plans, cavité entre plans (capacité, découplages trouvés, rayonnement estimé), bilan de fidélité de reconstruction. | Cavité seule : ni câbles ni mode commun dans l'estimation de rayonnement. |

### Bus synchrone (setup & hold)

Calcul local (sans serveur) à partir des temps de vol physiques de chaque net, lus par l'outil sur les longueurs et vias de la carte.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Protocole** | SPI (Synchrone), QSPI Flash (Rapide), I2C (Open-Drain), UART Asynchrone, RGMII Gigabit (125 MHz), SDRAM / DDR, Manuel / Expert. Précharge les temps ci-dessous. | Les préréglages sont des points de départ. |
| **f** (MHz), **t_su**, **t_h**, **T_co min**, **T_co max** (ns) | Fréquence d'horloge ; setup et hold exigés par le récepteur ; délais d'émission min et max de l'émetteur (SPI, QSPI, RGMII, SDRAM, Manuel). | À lire dans les datasheets. |
| **Mode** (I2C) | Standard (100 kHz), Fast-mode (400 kHz), Fast-mode Plus (1 MHz). | |
| **R_pullup** (kΩ) | Résistance de tirage I2C. Défaut : 4,7. | |
| **Débit** (UART) | 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600 bauds. | |
| **Nom** | Nom de la liaison, repris dans l'en-tête et les exports. | |
| **+ Ajouter net… ▾** | Ajoute un net du design au bus. | Le net est rangé en horloge si son nom ressemble à CLK/CK/SCK/SCL et qu'aucune horloge n'est déclarée. |
| **+ Horloge**, **+ Donnée** | Ajoute une ligne. | |
| **Vider** | Retire tous les signaux. | |
| **▶ Simuler** | Lance la simulation. | Un calcul est aussi relancé à chaque modification de valeur. |
| **.csv**, **.json** | Rapport du bus ; configuration et résultat. | |
| Pastille d'un signal : **⏱ CLK** / **⇄ DATA** | Bascule le rôle. | |
| Pastille : liste de net | Change le net du signal. | |
| Pastille : **R série** (+ valeur en Ω, net aval, **✂**) | Compte une résistance d'adaptation série : retard RC ajouté au temps de vol. **✂** déchaîne. | Valeur par défaut d'une résistance dont la valeur n'est pas lue : 22 Ω. |
| Pastille : **ref:** | Horloge de référence de la donnée, si plusieurs horloges. | |
| Pastille : **×** | Retire le signal. | |

Résultats d'un bus à timing (SPI, QSPI, RGMII, SDRAM, Manuel). En-tête : « Worst Hold Slack », « Worst Setup Slack », « Skew max », fréquence et T_cyc. Tableau : **Rôle / Sens / Horloge réf. / Net / Longueur / Temps vol / Skew Δt / Hold Slack / Setup Slack / Statut / Action / Reco**. Statuts : « CONFORME (+x ps) », « VIOLATION HOLD (−x ps) », « VIOLATION SETUP (−x ps) ».

```
Donnée allée (MOSI, ...) :
  slack setup = (T_cyc + t_vol_horloge − t_vol_donnée) − (T_co max + t_su)
  slack hold  = (t_vol_donnée − t_vol_horloge) + T_co min − t_h
Donnée de retour SPI/QSPI (MISO, DIN, RX, SO, SOMI, détectée par le nom) :
  slack setup = T_cyc − (t_vol_horloge + T_co max + t_vol_donnée) − t_su
  slack hold  = (t_vol_donnée − t_vol_horloge) + T_co min − t_h
```

Le bouton de la colonne **Action / Reco** : **Régler serpentin (+x mm)** (violation hold) ou **Centrer (+x mm)** arme l'outil serpentin dans l'éditeur PCB ; dans la visionneuse, qui ne modifie pas la carte, la colonne affiche un texte (« Serpentin requis », « Allonger »).

I2C : le tableau donne **Longueur / Capacité C_bus / Temps montée t_r / Limite norme / Statut / Recommandation R_pu** ; t_r ≈ 0,8473 · R_pu · C_bus ; statuts « OK », « CAP EXCESSIVE », « MONTÉE LENTE ». UART : **Longueur / Temps de vol / Durée du bit / Ratio vol / bit / Statut** ; « EXCELLENT » sinon, « ATTENTION » au-delà de 5 % du temps bit. Ces tableaux commencent par les colonnes **Signal** et **Net**, et l'I2C se juge par mode : Standard (t_r max 1000 ns, C_bus max 400 pF), Fast (300 ns, 400 pF), Fast-mode Plus (120 ns, 550 pF), d'après le code ; C_bus vient de la carte, ou 0,08 pF/mm en repli. Que ces seuils soient ceux de la norme I2C n'a pas été relu dans la norme : À vérifier.

### Diagramme de l'œil

Question posée : que voit le récepteur quand les bits se superposent ? La liaison est celle de l'onglet Impédance (ou de Z différentielle en mode différentiel), fermée sur l'émetteur et le récepteur, puis passée en temporel (`python/oeil.py`). Deux yeux sortent de la réponse à un bit : l'œil **PRBS** (superposition d'une séquence) et l'œil **pire cas** (analyse de distorsion crête : la pire combinaison de bits voisins).

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Protocole** | Gabarit du protocole ; préremplit débit, front, émetteur, récepteur, FFE, DFE, égaliseur, setup/hold, BER et le mode. « Aucun gabarit — œil libre » : pas de contrôle de gabarit. | Liste fournie par le serveur (`GET /api/oeil`) ; sans réponse, un message l'indique. Voir « Gabarits ». Le serveur doit disposer de numpy. |
| Lignes sous le protocole | Le lieu de mesure du gabarit (connecteur ou récepteur) et sa note. | Apparaissent avec un gabarit choisi. |
| Badge de fiabilité | « lu dans la norme », « recoupé », « à vérifier », « dérivé ». | Un gabarit n'est jamais un verdict de conformité. |
| **Mode** | « simple » (une piste contre la masse) ou « différentiel » (les deux pistes d'une paire). | Changer de mode efface le résultat. |
| **Motif** | PRBS7 (127 bits), PRBS9, PRBS15. Défaut : PRBS7. | PRBS15 fait apparaître les longues suites de bits identiques. |
| **Piste 1**, **Piste 2** (mode différentiel) | Comme sous Z différentielle ; états partagés. | |
| **Débit** + (Mb/s, Gb/s) | Débit par fil (par paire en différentiel). Défaut : 100 Mb/s. | |
| **Front** + (ps, ns, µs) | Temps de montée 10–90 % en sortie d'émetteur. Défaut : 1 ns. Vide : 30 % de l'UI. | |
| **Émetteur : V haut / V bas** (V) | Niveaux à vide du générateur ; en différentiel, la tension différentielle à vide d'un « 1 ». Défaut : 3,3 / 0. | |
| **Rs** (Ω) | Résistance de sortie (différentielle en mode différentiel). Défaut : 40. | Une ligne « ≈ a … b V à la charge » donne l'amplitude après le pont diviseur avec RL. |
| **Récepteur : RL** (Ω) | Terminaison. Vide ou 0 : haute impédance (entrée CMOS). | |
| **CL** (pF) | Capacité de la broche d'entrée. Défaut : 5. | |
| **FFE** | Coefficients de pré-accentuation dans l'ordre (pré-curseur, principal, post-curseurs), séparés par des espaces. Vide : aucune. | De 1 à 8 coefficients, pas tous nuls ; le principal est le plus grand en valeur absolue. |
| **DFE** (prises) | Nombre de prises du DFE du récepteur, de 0 à 8. | |
| **égaliseur de référence** | Applique le CTLE (et le DFE) de référence du protocole. | N'apparaît que si le gabarit en suppose un ; c'est après lui que le gabarit officiel se juge. |
| **Setup**, **Hold** (ns) | Fenêtre setup/hold du récepteur. | N'apparaissent que pour un gabarit dérivé des seuils (bus lents). |
| **Gigue : RJ** (ps rms) | Gigue aléatoire de l'émetteur, écart-type, gaussienne. | Vide : pas d'œil statistique. |
| **DJ** (ps c-c) | Gigue déterministe, crête à crête, en double Dirac. | |
| **Bruit** (mV rms) | Bruit gaussien du récepteur, ramené à l'échantillonneur. | |
| **BER** | Taux d'erreur visé : 10⁻⁶, 10⁻⁹, 10⁻¹², 10⁻¹⁵. Défaut : 10⁻¹². | Contour sur lequel le gabarit se juge ; actif seulement si RJ, DJ, bruit ou diaphonie est saisi. |
| **Diaphonie : voisines de la sélection** | Chaque voisine qui longe la piste sur sa couche devient un agresseur borné (NEXT ou FEXT du niveau 2 de Crosstalk × excursion de la victime). | Ajouté au pire cas et à l'œil statistique ; l'œil PRBS reste sans diaphonie. En différentiel, la partenaire n'est jamais un agresseur. |
| Sens des voisines | « sens inconnu (le pire) », « même sens (FEXT) », « sens opposé (NEXT) ». | |
| **Liaison : C** (nF) | Condensateur de liaison en série sur chaque brin. Vide : aucun. | Compte la coupure basse et le droop des longues suites de bits. |
| **boîtier…** | 0201, 0402, 0603, 0805, 1206 : fixe l'ESL par défaut. | |
| **ESL** (nH), **ESR** (Ω) | Inductance et résistance série. Vides : celles du boîtier / 0. | |
| **côté émetteur** / **côté récepteur** | Où le condensateur est posé. | Sans terminaison : pont diviseur avec CL, pas de décharge. |
| **IBIS** : **fichier .ibs…** (émetteur, récepteur) | Charge un fichier IBIS. | Voir « Modèles IBIS ». |
| **boîtier**, **voisines** | Compte le boîtier IBIS de chaque bout ; compte aussi les mutuelles vers les broches voisines. | Cochés d'office quand un fichier est chargé. |
| **Décalage N** (ps), **Z_MC** (Ω) | Mode différentiel : retard du brin inverse (vide : tdelay de [Diff Pin]) ; impédance de mode commun de la terminaison du récepteur (vide : flottante). | Le mode commun qui en sort est rendu. |
| **régler l'égaliseur d'après l'AMI** | Applique à l'égaliseur de référence ce que les paramètres lisibles du .ami proposent. | N'exécute pas le modèle AMI. |
| **▶ Calculer** | Calcule l'œil. | |
| **.csv** | Mesures, œil pire cas, réponse à un bit, contours et baignoire si présents, mode commun. | |

Ce que la fiche affiche :

| Élément | Lecture | Limites |
|---|---|---|
| Verdict | « Gabarit respecté » (avec marge PRBS et pire cas), « Gabarit respecté en PRBS, pas à 10⁻¹² », « Gabarit respecté en PRBS, pas au pire cas », « Gabarit violé » (échantillons dans le masque, hors limites), « Œil ouvert », « Œil ouvert en PRBS, fermé au pire cas », « Œil fermé ». | Sans polygone de gabarit, le verdict ne parle que de l'ouverture. |
| Figure | Densité des traces PRBS (échelle log), œil pire cas, contours de taux d'erreur, gabarit, seuil. | |
| Tableau **PRBS / pire cas / à BER** | Hauteur d'œil, largeur d'œil (UI), marge sur le gabarit (%). | La marge est de combien on peut agrandir le gabarit avant qu'une trace le touche. |
| Baignoire | Taux d'erreur au seuil, phase par phase, en échelle logarithmique, avec le taux visé. | Présente avec l'œil statistique. |
| Tableau de détails | Débit et UI, niveaux échantillonnés, excursion, interférence entre bits (pire cas), retard, CTLE, DFE, FFE, ligne, œil statistique, diaphonie bornée, IBIS, seuil du récepteur (vdiff), mode commun, couplage AC, IBIS-AMI, calcul. | Hypothèses de l'œil statistique : bits indépendants et équiprobables, décisions du DFE justes, gigue rapportée à l'échantillonneur. |
| Notes et avertissements | Réponse non éteinte dans la fenêtre, fenêtre raccourcie, etc. | |

#### Gabarits

Famille, nom (tel qu'affiché) et fiabilité, d'après `python/oeil.py`.

| Famille | Gabarits | Fiabilité |
|---|---|---|
| USB | USB 2.0 HS — au connecteur (Template 1) ; USB 2.0 HS — extrémité de câble (Template 2/4) ; USB 3.x Gen 1 (5 Gb/s) — après CTLE de référence | recoupé ; lu dans la norme ; recoupé |
| PCI Express | PCIe Gen 1 (2,5 GT/s) — récepteur ; Gen 2 (5 GT/s) — récepteur ; Gen 3 (8 GT/s) — après égaliseur de référence | recoupé |
| Vidéo et écrans | HDMI 1.4 TMDS — récepteur (TP2) ; LVDS (TIA/EIA-644) — récepteur ; MIPI D-PHY HS — récepteur | recoupé ; dérivé ; dérivé |
| Stockage et réseau | SATA Gen 1 (1,5 Gb/s), Gen 2 (3 Gb/s), Gen 3 (6 Gb/s) — récepteur ; SGMII / 1000BASE-X (1,25 Gb/s) — récepteur | recoupé |
| Bus lents (CMOS) | SPI — LVCMOS 3,3 V ; SPI — LVCMOS 1,8 V ; QSPI (mémoire flash) — 3,3 V ; Carte SD High Speed (50 MHz) — 3,3 V ; eMMC High Speed (52 MHz) — 3,3 V | dérivé |

Sens des badges : **lu dans la norme** (valeurs relues dans le texte de la norme), **recoupé** (recoupées avec une source publique, la norme n'ayant pas été consultée), **à vérifier** (valeurs non recoupées), **dérivé** (gabarit non officiel, construit sur les seuils du récepteur et sa fenêtre setup/hold). Un gabarit au connecteur (USB 2.0 Template 1) se juge à la broche du connecteur ; les autres à l'entrée du récepteur. Les bus lents n'ont pas de masque officiel : le décalage entre donnée et horloge reste l'affaire de l'onglet Bus synchrone.

#### Modèles IBIS

Un fichier `.ibs` (ANSI/EIA-656) remplace le générateur de Thévenin de l'émetteur (tampon non linéaire : résistance de sortie dépendant de la tension, diodes, front mesuré) et donne au récepteur sa capacité C_comp et ses diodes. Le texte du fichier est lu dans la page et envoyé avec la requête ; le serveur ne le garde pas.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **fichier .ibs…** | Charge un fichier `.ibs`, `.ibis` ou `.txt`. | Le serveur refuse avec la ligne fautive ce qu'il ne comprend pas. Plafond du texte : 12 Mio d'après `python/ibis.py`. |
| Liste du **[Model]** | Choix du modèle (type affiché entre parenthèses). | |
| Liste du coin | **typ**, **min** (faible, lent), **max** (fort, rapide). | |
| **N : = P** / **N : modèle** ; **coin N** | Modèle et coin du brin inverse. | En différentiel : un brin rapide contre un brin lent fait du mode commun. |
| **broche…** / **paire…** (boîtier moyen) | Prend le modèle et le boîtier R/L/C d'une broche ([Pin]) ou d'une paire de [Diff Pin] (brin inverse retardé de tdelay). | Sans choix : [Package] du composant, « boîtier moyen ». |
| **✕** | Retire le modèle. | |
| **fichier .ami…** | Apparaît quand le modèle déclare un [Algorithmic Model] : charge le `.ami` pour lire les paramètres (FFE, DFE, CTLE, gigue). | |
| **bibliothèque .so/.dll (chemin dans la LIB)**, **paramètres : nom=valeur …** | Désigne la bibliothèque du fabricant à exécuter, et surcharge ses paramètres. | Exécution seulement pour un fichier désigné sous la LIB ou un projet du serveur, jamais depuis le navigateur ni une URL ; tout échec devient un avertissement et un repli sur l'égaliseur de référence. |

Lu de chaque [Model] : `Model_type`, `C_comp`, `Vinl`/`Vinh`, les courbes V-I ([Pullup], [Pulldown], [GND Clamp], [POWER Clamp]), [Ramp], [Rising/Falling Waveform], [Rgnd]/[Rpower]. Le boîtier et les broches ([Package], [Pin], [Diff Pin], [Model Selector], [Package Model]) sont lus aussi. Ce qui est ignoré (sous-modèles, [Model Spec]) est dit dans le résultat. La simulation pas à pas ne se fait qu'en PRBS7 ou PRBS9 : avec PRBS15 et une liaison simulée dans le temps (émetteur IBIS, récepteur IBIS à diodes ou [Rgnd]/[Rpower], ou paire avec décalage N ; un récepteur IBIS sans diode reste linéaire), le serveur refuse le calcul (« PRBS15 et modèle IBIS : 32 767 bits à simuler pas à pas, c'est trop long ») et le message s'affiche à la place de l'œil ; le pire cas et l'œil statistique couvrent déjà les longues suites.

### Le rapport

Bouton **📋 Rapport** (rangée des onglets) : un seul rapport pour toutes les analyses. Il reprend la fiche telle qu'affichée, avec les champs remplacés par leur valeur et les boutons ôtés.

| Bouton ou élément | Effet | Limites |
|---|---|---|
| **📋 Copier** | Copie le rapport complet en Markdown, autonome. | |
| **🖨️ Imprimer / PDF** | Impression, ou enregistrement en PDF par le navigateur. | |
| **⤓ Fichier .html** | Télécharge un fichier HTML autonome, lisible hors ligne. | |
| **✕** (ou Échap) | Ferme la fenêtre. | |
| Chiffres clés | En tête, propres à chaque analyse (par exemple, pour Crosstalk : statut, agresseur, NEXT et FEXT de la pire victime ; pour l'œil : hauteur, largeur, débit, marge). | Une analyse sans extracteur dans `SIM_RAP_KPI` (Current Return Path) reprend la ligne de contexte de sa fiche. Sans résultat, le rapport s'ouvre et dit « Simulation non exécutée ». |
| Sections | « 🛡️ Diagnostics & vigilance », « 📏 La piste », « 🧱 Empilage », « 🔌 Bornes », « ⚙️ Réglages de la simulation », « 📘 Méthode & définitions », « 📊 Résultats détaillés », « 🧾 Rapport texte complet », « 🗂️ Données brutes du calcul » (JSON). | La piste et l'empilage sont ceux du document envoyé au serveur, pas la sélection actuelle. Le rapport ne juge rien que la fiche n'ait jugé. |

### Régler les simulations depuis une datasheet

Il n'y a pas de bouton dans le panneau : c'est Claude, par le MCP de web_suite (voir le [chapitre 11](11-claude-mcp.md)), qui lit la datasheet et propose un lot. Le catalogue est une liste fermée (`commun/simulation-datasheet.js`) : chaque clé a son unité et ses bornes.

| Groupe | Clé (unité) | Ce que la datasheet règle | Bornes |
|---|---|---|---|
| `si` | `tr` (ns) | Temps de montée du driver, 10–90 % (le plus rapide : pire cas) | 0,005 à 10000 |
| `si` | `swing` (V) | Amplitude crête à crête (VOH − VOL, VDDIO, ou VOD) | 0,05 à 60 |
| `si` | `cible` (Ω), `tolPct` (%) | Impédance visée d'une piste simple et sa tolérance | 10 à 200 ; 0 à 50 |
| `si` | `cibleDiff` (Ω), `tolDiffPct` (%) | Impédance différentielle visée et sa tolérance | 20 à 300 ; 0 à 50 |
| `si` | `fc` (MHz) | Fréquence d'intérêt f₀ | 0,001 à 100000 |
| `bus` | `protocole` | Un des protocoles de l'onglet Bus synchrone | liste |
| `bus` | `freqMhz` (MHz) | Fréquence d'horloge | 0,0001 à 10000 |
| `bus` | `tsu`, `th` (ns) | Setup et hold exigés par le récepteur | −10 à 10000 |
| `bus` | `tcoMin`, `tcoMax` (ns) | Clock-to-output min et max de l'émetteur | −50 à 10000 |
| `bus` | `rpuK` (kΩ), `baudrate` (bit/s) | Pull-up I2C ; débit UART | 0,1 à 1000 ; 300 à 10⁸ |

| Comportement | Détail | Limites |
|---|---|---|
| Rien ne s'applique sans être vu | La carte du panneau « Claude » liste chaque valeur à côté de la valeur actuelle, avec la page et la citation de la datasheet. | Une valeur hors bornes, une clé inconnue ou une unité différente refuse le lot entier, motif affiché. |
| Après application | Un changement de f₀ efface le résultat Impédance ; un changement de tr efface le résultat Crosstalk et reprend la valeur dans le champ **tr** de l'onglet Crosstalk ; amplitude et cibles ne changent que le verdict (rien n'est effacé : relancer Current Return Path pour que l'amplitude compte). Le bus se recalcule. | Le catalogue `si` ne contient que tr, swing, cible, tolPct, cibleDiff, tolDiffPct et fc : aucun champ de l'œil, de Crosstalk (seuils, distance…), ni la bande S, les points ou Réf. Current Return Path n'y prend que fréquence, tr et amplitude. |
| Annuler | Le bouton **Annuler** de la carte remet les valeurs d'avant. | Valable tant qu'aucun de ces paramètres n'a été retouché depuis ; pas de Ctrl+Z pour ce lot. Une valeur déjà égale à l'actuelle ou une clé donnée deux fois refuse le lot. |
| Les groupes PI (fiche de charge, régulateur, stratifié, condensateurs, chute DC) | Même mécanisme. | Voir le [chapitre 09](09-simulation-pi-thermique-audit.md). |

### Classes d'interface

Une classe d'interface est une classe de net rattachée à une famille. La famille décide des règles qui s'appliquent ; l'interface donne son front, sa cadence et la Z_diff de sa norme. Pas de Z₀ de brin : la norme n'en fixe pas.

| Interface | Nom long (info-bulle) | Famille | Front tr | Cadence | Z_diff |
|---|---|---|---|---|---|
| **USB FS** | USB 2.0 Full Speed | Lent | 4 ns | 6 MHz | 90 Ω |
| **USB HS** | USB 2.0 High Speed | Rapide | 0,5 ns | 200 MHz | 90 Ω |
| **ETH 100** | Ethernet 100BASE-TX | Rapide | 3 ns | 31,25 MHz | 100 Ω |
| **ETH 1000** | Ethernet 1000BASE-T | Rapide | 2 ns | 50 MHz | 100 Ω |
| **LVDS** | LVDS (TIA-644) | Rapide | 0,3 ns | 330 MHz | 100 Ω |
| **CAN** | CAN (ISO 11898) | Lent | 50 ns | 500 kHz | 120 Ω |
| **RS-485** | RS-485 (TIA-485) | Lent | 20 ns | 5 MHz | 120 Ω |

| Élément | Effet | Limites |
|---|---|---|
| Choix de la classe d'un net | Liste des classes de l'éditeur schématique, de l'éditeur PCB et de la visionneuse ; l'option porte le nom long en info-bulle. | Dans l'éditeur PCB, une classe absente de la carte est proposée sous « Nouvelle classe » et créée au premier rattachement. |
| Règles de la classe | Une interface prend les règles de sa famille (largeur, isolation, via, perçage). | Une famille « Lent » prend celles de la classe par défaut. |
| Front d'un net | Sous Crosstalk, le front vide d'une piste est déduit de sa classe : Horloge 2 ns, Rapide 1 ns, RF 100 ps, Analogique 100 ns, Lent 10 ns, Découpage 5 ns, ou celui de l'interface. Le front d'une interface est borné par sa cadence : min(tr, 0,1 / cadence). | Classe sans front (Masse, Alimentation…) : jugée comme « Lent » ; net sans classe : 1 ns. Le panneau de vérification de carte peut régler ces fronts. |
| Z_diff d'une interface | Sert de Z_diff visée par classe dans le panneau de vérification de toute la carte ([chapitre 09](09-simulation-pi-thermique-audit.md)), où elle se règle par classe. | Pas de reprise automatique dans l'onglet Z différentielle : sa cible (100 Ω d'office) se saisit à la main, se règle par datasheet ou par « Cibler N Ω » (terminaison du schéma). |

La table est écrite deux fois, en JSON dans `commun/classes-interface.js` et en Python dans `python/crosstalk.py` (`INTERFACES`) ; un banc les compare.

## Limites connues

- **Suite de sections uniformes.** Les coudes, vias et moignons sont cascadés en éléments localisés (tableau des discontinuités de la fiche) ; ne sont pas modélisés la cavité entre plans hors du chemin de retour chiffré, et le rayonnement (sauf celui de la boucle de retour d'un via, estimé à part comme un plancher).
- **Quasi-statique.** La section est résolue en quasi-statique ; la dispersion est ajoutée par un modèle (Getsinger) et l'écart se creuse au-delà de quelques gigahertz sur stratifié courant.
- **Plan de retour supposé continu** sous les pistes. Là où il est percé ou fendu, le courant fait un détour qu'Impédance ne chiffre pas ; Crosstalk l'estime à part quand la page envoie l'image des plans.
- **Ports idéaux.** S₁₁ est celui du cuivre nu, nécessairement meilleur qu'une mesure au VNA.
- **Sélection ramifiée.** La mise en cascade suppose une chaîne : sur un net qui se ramifie, les impédances par tronçon restent justes, mais paramètres S, retard total et pertes totales n'ont plus de sens ; la fiche le signale.
- **Couplage chiffré entre pistes parallèles de la même couche** ; les pistes superposées sont cherchées et signalées, le résultat devient un plancher ; les pistes qui se croisent ne sont ni cherchées ni chiffrées.
- **Un chiffre de crosstalk est un minorant** du bruit total de la victime : chaque ligne est ce qu'elle prend à cet agresseur. Une voisine « non calculée » n'est pas une voisine sans couplage.
- **Plan absent ou garde non cousue.** Une garde sans via ne blinde pas ; elle est posée flottante dans la coupe et la fiche le dit.
- **Œil linéaire sans IBIS.** Émetteur et récepteur sont des éléments linéaires (générateur de Thévenin, RL, CL). Gigue, bruit et diaphonie ne comptent que s'ils sont saisis.
- **Œil statistique.** Bits indépendants et équiprobables ; décisions du DFE supposées justes ; la séquence des voisines n'est pas connue (l'œil PRBS n'a pas de diaphonie).
- **IBIS-AMI.** Un récepteur AMI avec AMI_Init seul sur des tampons non linéaires égalise la part linéaire de la forme d'onde, pas ce que les tampons y ajoutent ; un Tx AMI ne pilote pas le tampon IBIS multi-niveaux.
- **Gabarits.** Aucun n'est un verdict de conformité ; ceux marqués « dérivé » ne sont pas officiels.
- **Bus synchrone.** Modèle de temps de vol : ni réflexions, ni diaphonie. Les temps du composant viennent de la saisie.
- **Visionneuse.** La carte n'est pas modifiable : pas d'outil serpentin ; les options de modèle (« Diélectrique causal (Djordjevic-Sarkar) » et sa fréquence de fiche, « Modèle de via », « Portée percée de tous les vias déclarés ») se règlent dans le bloc « Modèles de simulation » du panneau « La carte » de la visionneuse ([chapitre 07](07-visionneuse-ipc2581.md)).
- **Calculs hors panneau.** La famille PI, la thermique et l'Audit sont traitées au [chapitre 09](09-simulation-pi-thermique-audit.md) ; l'onglet S21 (RF) au [chapitre 10](10-simulation-rf-em.md).

## Voir aussi

- [Chapitre 03 : éditeur PCB, édition et routage](03-editeur-pcb-edition-routage.md) : sélection des pistes, classes de net, empilage physique, outil serpentin.
- [Chapitre 02 : éditeur schématique](02-editeur-schematique.md) : classes de net, terminaison différentielle lue par Z différentielle.
- [Chapitre 07 : visionneuse IPC-2581](07-visionneuse-ipc2581.md) : panneau « La carte », empilage du calcul.
- [Chapitre 09 : simulation PI, thermique, audit de carte](09-simulation-pi-thermique-audit.md) : Chute DC, Z(ω) PDN, vérification de toute la carte.
- [Chapitre 10 : simulation RF et EM](10-simulation-rf-em.md) : S21, abaque de Smith, « et si ».
- [Chapitre 11 : Claude et le MCP](11-claude-mcp.md) : réglages depuis une datasheet, cartes à cliquer.
- [../simulation-em.md](../simulation-em.md) : physique, équations, validations et historique des décisions.
- [../verification-carte.md](../verification-carte.md) : mode d'emploi de la vérification de toute la carte (règle « diaphonie », chemins de retour, paires).
- [../../bancs-mesure/crosstalk/README.md](../../bancs-mesure/crosstalk/README.md) : carte d'essai et comparaison simulation / mesure du crosstalk.
