# Simulation RF : le S₂₁ d'un réseau entre deux ports

La famille **RF** du panneau « Simulation EM… » (éditeur PCB et visionneuse IPC-2581) répond à une question : quelle part de la puissance disponible d'une puce radio arrive au connecteur ou à l'antenne, à travers les pistes et les composants du réseau d'adaptation, et que faut-il retoucher ?
Elle porte un seul onglet, **S21**, entre deux ports d'impédance complexe (R + jX), simples ou différentiels. Le réseau est trouvé par la page, calculé par le serveur (`python/rf_reseau.py`).
Ce chapitre suit la famille RF seule ; l'ouverture du panneau, les réglages communs et les familles SI et PI sont au chapitre [08 Simulation SI](08-simulation-si.md). Le traitement de chaque broche d'une puce radio est dans [Simulation RF : que faire de chaque broche](10b-rf-acces-des-broches.md), à lire avant de poser les ports.

> [!NOTE]
> Le calcul passe par le serveur (`python web_CAO.py`) et a besoin de numpy. Sans eux, le panneau l'indique. Le principe, les étalonnages et les formules sont dans [../simulation-em.md](../simulation-em.md), section « RF — le S₂₁ d'un réseau entre deux ports ». Ce chapitre dit comment s'en servir.

## Guide par tâche

### Je veux ouvrir l'onglet S21

1. Cliquer **Simulation EM…** dans la barre d'outils de l'éditeur PCB ou de la visionneuse IPC-2581.
2. Choisir la famille **RF** (« Radiofréquence »), puis l'onglet **S21**.
3. Sans résultat, le panneau affiche : « Posez le port 1 sur la broche de sortie de la puce, le port 2 sur le connecteur ou l'antenne, puis calculez. »

Si l'outil ne sait pas décrire sa carte pour la RF, le panneau le dit : « Cet outil ne sait pas encore décrire sa carte pour la simulation RF. »

### Je veux poser les deux ports et calculer le S₂₁

1. Port 1 : cliquer **🎯**, puis cliquer sur la carte la pastille de la broche de sortie de la puce (le clic doit tomber à moins de 0,5 mm du cuivre d'une pastille). Le champ à droite affiche `REF.broche · net`.
2. Port 2 : même geste, sur le connecteur ou l'antenne.
3. Régler l'impédance de chaque port : partie réelle (champ de gauche, en Ω), signe de la partie imaginaire (`+ j` inductif, `− j` capacitif), partie imaginaire (champ de droite, en valeur absolue, en Ω). À la première pose, un port prend 50 + j0 Ω ; reposer le port sur une autre pastille garde l'impédance (et la borne −) déjà saisies. Au port 1, saisir l'impédance de **sortie** de la puce ; au port 2, celle de la charge.
4. Régler la fréquence de travail **f₀** (champ « Fréquence » et son unité) et la bande (début → fin, unité, nombre de points).
5. Cliquer **▶ Calculer**.
6. Lire la fiche : S₂₁ à f₀ en dB et en pour-cent de la puissance disponible, Z vue par la puce face à sa cible, pertes (voir la tâche « Je veux lire la fiche » ci-dessous).

Changer l'impédance d'un port ou poser un port efface le résultat : « L'impédance d'un port a changé : relancez le calcul. » Une carte modifiée depuis le calcul l'efface aussi : « La carte a changé depuis le calcul : relancez-le. »

### Je veux un port différentiel (RFI_P / RFI_N)

1. Poser la borne + comme un port simple (🎯 puis la pastille).
2. Cliquer **±** du même port, puis la pastille de la borne −. Le champ affiche `REF.broche · net / − REF.broche · net` et le bouton **±** reste enfoncé.
3. La tension du port est V(+) − V(−), sans masse : il n'y a pas de mode commun dans ce modèle.
4. Pour revenir à un port simple, rappuyer sur **±**.

Le bouton **±** reste grisé tant que le port n'est pas posé. La borne − ne peut pas être la pastille de la borne +, et elle doit être sur un net de signal (sur la masse, retirer la borne − : c'est un port simple).

### Je veux lire la fiche et savoir quoi retoucher

1. Lire la phrase sous le tableau :
   - **rouge**, S₁₁ au-dessus de −10 dB : « Désadapté à … : la puce voit … au lieu de … » ;
   - **note**, bien adapté mais plus de 1 dB dissipé : « Bien adapté, mais le réseau DISSIPE … dB » ;
   - sinon : « Bien adapté à … ».
2. Lire la ligne **Pertes** : « désadaptation » (ce qui repart vers la puce) et « dissipées » (ce que pistes et composants brûlent). Une forte désadaptation se corrige en retouchant l'adaptation ; une forte perte dissipée se cherche dans le tableau des pistes (colonne Pertes) et dans les modèles des composants.
3. Sur l'abaque de Smith, le trait jaune est la Z vue par la puce sur la bande, le point plein sa valeur à f₀, le cercle vert la **cible** (conjugué de la sortie de la puce). Retoucher le réseau revient à amener le point sur le cercle.

### Je veux essayer une autre valeur de composant (« et si »)

1. Dans le tableau des composants, colonne **Et si**, saisir la nouvelle valeur du condensateur (pF), de la self (nH) ou de la résistance (Ω). Le champ montre la valeur d'origine en grisé.
2. Le calcul se relance seul. Le composant devient un idéal de cette valeur le temps du calcul (colonne Modèle : `et si`) ; la carte ne change pas.
3. Vider le champ rend le modèle d'origine.
4. Pour voir ce que coûte un composant (diode ESD, point de test), cocher **exclu** sur sa ligne : il sort du réseau.

### Je veux lier un modèle à un composant

Trois voies, de la plus durable à la plus locale.

1. **Dans la LIB (durable).** Gestion LIB, fiche de la référence, carte « MODÈLES DE SIMULATION », **📎 Lier un fichier…** (chapitre [05 Gestion LIB](05-gestion-lib.md)). Pour un Touchstone, le formulaire demande la patte de chaque port (numéro ou nom de broche du brochage) et la masse ; le fichier est rangé dans `lib_simulation` avec ses lignes `! broches` / `! masse`, puis ajouté à la colonne « Modèle Simulation ». Enregistrer la LIB ensuite (le message dit « à enregistrer »). **✕** délie sans effacer le fichier.
2. **Plusieurs états (commutateur).** Lier plusieurs fichiers : la colonne les sépare par ` | `. Le premier sert par défaut (Gestion LIB l'indique « par défaut »). Dans le tableau des composants de l'onglet S21, une liste déroulante dans la colonne Modèle choisit l'état, composant par composant, et le choix est gardé avec la carte.
3. **Pour ce projet seulement.** Dans le tableau des composants, **📂** importe un fichier pour ce composant (`.s1p`, `.s2p`, `.s3p`, `.s4p`, `.sub`, `.mod`, `.cir`, `.sp`, `.lib`) ; **✕** l'oublie. Le calcul se relance seul.

Pour un Touchstone d'une puce qui a d'autres broches que ses ports (masse, commandes), le fichier le dit en commentaire :

```
! broches : 5 3 1
! masse : 2
```

`! broches` met le port k sur la k-ième broche nommée ; `! masse` rapporte les ports à cette broche (à ses vias, pas à une masse idéale). Les broches non nommées restent hors du modèle, et la marche du réseau ne passe pas par elles.

### Je veux donner l'impédance d'une broche annexe

1. Repérer, dans le tableau des composants, les lignes de la forme `REF.broche` (colonne Valeur : « broche de REF · net ») : ce sont les autres broches de la puce ou du connecteur qui touchent le réseau.
2. Saisir la partie réelle (Ω) et la partie imaginaire (Ω) dans les deux champs ; le `+ j` entre eux est fixe, une partie imaginaire capacitive se tape avec son signe moins. Colonne Modèle : `impédance`.
3. Les deux champs vides, ou 0 + j0, laissent la broche **ouverte** (valeur par défaut). Le calcul se relance seul.

### Je veux voir ce que coûte le couplage entre pistes

1. Décocher **couplage entre pistes** à côté du bouton **▶ Calculer**. Le calcul se relance seul.
2. Comparer le S₂₁ avant et après. Le tableau « Longement » liste les pistes couplées, leur longueur, leur écart et leur NEXT saturé.

### Je veux exporter le résultat

1. Calculer d'abord ; sans résultat, le panneau répond « Rien à enregistrer : calculez d'abord. ».
2. Cliquer **.s2p**. Le fichier `rf-<carte>.s2p` est téléchargé : S en module / phase, **renormalisé à 50 Ω**, avec en en-tête les impédances réelles du calcul.
3. L'onglet **📋 Rapport** du panneau génère aussi un rapport complet de la simulation (section commune, chapitre [08](08-simulation-si.md)).

## Référence

### Ports

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Port 1** (étiquette) | Rangée du port 1 : l'impédance de **sortie** de la puce. | Obligatoire. |
| **Port 2** (étiquette) | Rangée du port 2 : l'impédance de la charge (connecteur, antenne). | Obligatoire. |
| **🎯** | Arme la pose : le prochain clic sur une pastille de la carte la désigne comme port. Dans l'éditeur PCB, l'outil passe en mode sélection. | Une pastille à moins de 0,5 mm du clic, sinon « Aucune pastille sous le clic : visez le cuivre d'une pastille. ». Elle doit avoir un net de signal (ni masse, ni sans net) ; le refus vient au calcul, pas à la pose. |
| **±** | Rend le port différentiel : le prochain clic désigne la borne −. Rappuyer revient au port simple. | Grisé sans borne +. La borne − doit être sur un autre net de signal et ne peut pas être la pastille de la borne +. |
| Nom du port (`REF.broche · net`) | Affiche la pastille posée, et la borne − après `/ −`. `—` : rien posé. | `(introuvable)` si la pastille n'existe plus sur la carte. |
| Champ de gauche (partie réelle) | Partie réelle de l'impédance, en Ω. | Strictement positive ; sinon la saisie est refusée et le champ reprend sa valeur. Virgule ou point décimal. |
| Sélecteur `+ j` / `− j` | Signe de la partie imaginaire : `+ j` inductif, `− j` capacitif. | Un nombre négatif tapé dans le champ de droite vaut `− j`, quel que soit le sélecteur. |
| Champ de droite (partie imaginaire) | Valeur absolue de la partie imaginaire, en Ω. | Nombre fini. |
| **Ω** | Unité des deux champs. | Pas de sélecteur. |

### Fréquence et bande

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Fréquence** (champ et unité) | f₀ : la fréquence à laquelle la fiche est donnée. Unités Hz, kHz, MHz, GHz. Changer l'unité garde le nombre écrit (868 de MHz à GHz vaut 868 GHz). | Valeurs initiales : f₀ 1 GHz, bande 0,1 → 5 GHz (les trois champs sont en GHz), 21 points. Ces champs sont ceux du panneau commun (partagés avec les autres onglets qui saisissent f₀ et la bande) et ne sont pas enregistrés avec le projet. Un profil ne les change pas (il porte l'empilage et les fiches PDN). Si f₀ est tapée hors de la bande, la page recale la bande autour d'elle. |
| **Bande** (début, `→`, fin, unités) | Bande des courbes. | Bande donnée à l'envers : remise dans l'ordre. f₀ hors bande : le serveur étend la bande pour l'inclure, et le dit. Une f₀ qui ne tombe pas sur un point de la grille y est ajoutée. |
| **Points** | Nombre de points de la courbe. | 401 au plus ; au-delà, ramené à 401 et le dit. |

### Commandes

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **▶ Calculer** | Trouve le réseau, l'envoie au serveur, affiche la fiche. Un indicateur de progression tourne pendant le calcul : « Les pistes par le solveur de section, puis l'assemblage nodal des composants. » | Un calcul à la fois. |
| **.s2p** | Télécharge `rf-<carte>.s2p`. | Seulement après un calcul. Renormalisé à 50 Ω, 2 ports. |
| **couplage entre pistes** (case) | Coché par défaut : deux pistes du réseau qui se longent à moins de trois hauteurs au plan sont calculées en lignes couplées. Décocher relance le calcul. | Voir la section « Le couplage entre pistes du réseau » de [../simulation-em.md](../simulation-em.md). |
| **▾ réglages** / **▸ réglages** | Replie ou déplie les réglages pour laisser la place aux résultats ; **▶ Calculer** reste visible. | Commun à tout le panneau. |
| **📋 Rapport** | Rapport complet de la simulation (copier, imprimer en PDF, enregistrer en `.html`). | Commun à tout le panneau. |
| Rangée **Masse** (boutons de nets) | Nets tenus pour plan de retour : le cuivre de ces nets qui borde une piste sur sa couche entre dans le calcul. Étiquette « proposé par la carte » ou lien « revenir à la proposition ». | Commune à SI et RF. Sans cuivre plein sur la carte : « aucun net ne porte de cuivre plein sur cette carte ». |

### Fiche de résultat

| Ligne ou élément | Contenu | Limites |
|---|---|---|
| **S₂₁ à f₀** | S₂₁ en dB, et en pour-cent de la puissance disponible de la puce (10^(S₂₁/10) × 100). | |
| **S₁₁ / S₂₂** | Réflexions aux deux ports, en dB. S₁₁ très négatif (nul en valeur linéaire) : la puce voit le conjugué de sa sortie. | |
| **Z vue par la puce** | Z vue au port 1 à f₀, et `(cible : …)` : le conjugué de la sortie de la puce. | |
| **Z vue par la charge** | Z vue au port 2 à f₀. | |
| **Validité** | « quasi-statique jusqu'à … » et la cause la plus basse (coupure du premier mode supérieur d'une piste, résonance d'une pastille, ondes de surface, rayonnement des discontinuités). | Ligne absente si aucune limite n'est calculée. Une bande qui dépasse la limite ajoute un avertissement. |
| **Pertes** | « désadaptation » (dB), « dissipées » (dB, `—` si indéfinie) et, s'il y en a, « dont … % partis dans les pistes voisines ». | La perte dissipée est celle du réseau seul (pistes et composants). |
| Phrase de verdict | Rouge si S₁₁ > −10 dB ; note si dissipation > 1 dB ; sinon « Bien adapté ». | Seuils fixes (−10 dB, 1 dB). |
| **Courbe** | S21 (bleu), S11 (jaune), S22 (vert) en dB sur la bande, repère **f₀**. | Axe vertical borné à 60 dB sous le maximum. |
| **Abaque de Smith** | Normalisé à 50 Ω : Z vue par la puce sur la bande (jaune), point plein à f₀, cible (cercle vert). Légende : « Z vue par la puce (point : f₀) », « cible (conjugué de la sortie) ». | Une seule Z (celle du port 1). |

### Tableau des composants

Colonnes : **Réf.**, **Valeur**, **Modèle**, **Et si**, et une colonne de commandes. Il apparaît dès la marche faite, même sans résultat.

| Bouton ou champ | Effet | Limites |
|---|---|---|
| Colonne **Modèle** | Origine du modèle : `et si`, `projet` (importé), `bibliothèque`, `idéal`, suivie du nom du fichier ; `exclu` ; `aucun` en rouge si rien n'est trouvé. | Ordre de recherche : valeur « et si », modèle importé pour le projet, colonne « Modèle Simulation » de la carte, ligne du catalogue (`LIB_composants.csv`, par référence fabricant ou nom de pièce), fichier `<référence fabricant>.sub`, enfin idéal tiré de la valeur. Un modèle générique (`capacitor`, `inductor` ou `resistor`, en `.sub` ou `.mod`) n'est qu'un gabarit : l'idéal tiré de la valeur le remplace. |
| Liste déroulante du modèle | Choisit le fichier parmi les états liés (séparés par une barre verticale dans la colonne). Relance le calcul. | Seulement pour un modèle de bibliothèque à plusieurs fichiers. |
| Champ **Et si** (+ unité pF, nH ou Ω) | Autre valeur, composant idéal le temps du calcul. Relance le calcul. | Pour C, L, R seulement. Vide : modèle d'origine. |
| **📂** | Importe un modèle pour ce composant : `.sNp` (paramètres S mesurés, composants actifs compris) ou sous-circuit SPICE linéaire. | Extensions acceptées : `.s1p`, `.s2p`, `.s3p`, `.s4p`, `.sub`, `.mod`, `.cir`, `.sp`, `.lib`. Gardé avec le projet (éditeur) ou dans le navigateur, sous le nom du fichier (visionneuse). |
| **✕** | Oublie le modèle importé (info-bulle : « Oublier le modèle importé … »). | N'apparaît que s'il y en a un. |
| Case **exclu** | Retire le composant du réseau (info-bulle : « Exclure ce composant du réseau RF »). Relance le calcul. | Sa ligne reste, marquée `exclu`. |
| Ligne `REF.broche` (broche annexe) | Impédance R + j X de la broche, deux champs en Ω. Colonne Modèle : `impédance` ou `ouverte`. | Seulement les autres broches du composant qui porte un port. Vide ou 0 + j0 : ouverte. |

Valeurs d'un composant idéal : lues dans le champ Valeur du composant, sous des écritures comme `3.3nH`, `1,5 pF`, `4k7`, `2R2`, `10 kΩ`. Un condensateur ou une résistance dont la valeur n'est pas lisible n'est pas inventé : « aucun modèle RF ». Une self dont la valeur n'est pas lisible (par exemple `10` sans unité) est refusée de la même façon ; seul un zéro explicite (`0 nH`, `0`) donne un court-circuit.

### Tableaux sous la fiche

| Tableau | Contenu | Limites |
|---|---|---|
| **Piste** | Par branche de piste : net, longueur (dont couplée), Z₀ (min–max), section résolue (couche, h au plan, εr), pertes en dB. Lignes « vias de masse … » avec leur self en nH ; « via de la coulée de masse de … » pour une coulée maillée. | L'empilage est celui de l'outil : saisi dans « Empilage physique » (éditeur), lu et complété dans « La carte » (visionneuse). |
| **Longement** | Pistes couplées, longueur, écart, NEXT saturé. | Absent sans couplage. |
| Énergie des voisines | « Énergie partie dans les pistes d'autres nets, fermées sur leur Z₀ : net x % ». | Pistes d'autres nets à moins de 2 mm, 60 au plus. Seuil d'affichage 0,001 %. |
| **Couplage magnétique** | Mutuelle (nH) et k entre selfs, et entre self et piste ; les 8 plus fortes, le reste compté. | Sens d'enroulement pris droit ; self multicouche traitée comme bobinée. |
| **Fente du plan sous** | Largeur de la fente franchie et détours de retour (mm), `(coupé de bord à bord)` si le plan est coupé d'un bord à l'autre. | Estimation d'ingénieur (Ott) ; détour plafonné à 30 mm. |
| Note de capacité | « Capacité au plan comptée : pastilles … pF, zones de cuivre … pF ». | |
| Notes `·` | Avertissements du calcul (alimentations tenues pour une masse RF, masse idéale faute de via, modèle introuvable, boucle ignorée, domaine de validité dépassé…). | |

### Modèles lus

| Format | Pris en charge | Limites |
|---|---|---|
| SPICE | R, L, C, sous-circuits imbriqués (`.SUBCKT`), `PARAMS:`. | Un transistor, une diode, une source commandée sont refusés (« n'est pas un élément linéaire ») : il faudrait un point de polarisation. Fournir le `.sNp`. |
| Touchstone | Versions 1 et 2 ; paramètres S, Y ou Z ; formats MA, DB, RI ; unités Hz à GHz. N ports sur les N broches du composant dans l'ordre des numéros, ou selon `! broches` et `! masse`. | Paramètres G et H refusés. Données de bruit d'un `.s2p` ignorées. Pas d'extrapolation : un fichier hors de sa bande est refusé. |
| Idéal | R, L, C tirés de la valeur du composant. | Une résistance ou une self nulle est un court-circuit (admittance très grande), pas une fusion de nœuds. |

### Refus fréquents

| Message | Cause | Remède |
|---|---|---|
| « Posez les deux ports. » | Un port manque. | Poser le port 1 et le port 2. |
| « Les deux ports sont sur la même pastille. » | | Désigner deux pastilles. |
| « Port k : la pastille … n'a pas de net de signal. » | Port sur la masse ou sur une pastille sans net. | Choisir une pastille de signal. |
| « Net … : une dérivation tombe au milieu d'un arc… » | Une dérivation tombe sur un arc là où il ne peut pas être coupé (cas rare : un arc touché par une autre piste ou une pastille est normalement coupé en deux arcs pour le calcul). | Raccorder sur une piste droite. |
| « Aucun chemin entre les deux ports… » | Le net du port 2 n'est pas atteint depuis celui du port 1. | Vérifier les nets, ré-inclure un composant exclu. |
| « Le réseau RF s'étend sur plus de 40 nets… » | La marche a quitté le chemin RF. | Exclure le composant par lequel elle s'échappe. |
| « La pastille … n'est reliée par aucune piste. » | Pastille du réseau sans piste ni zone. | La router. |
| « … : aucun modèle RF. Importez son .sNp, ou excluez-le. » | Ni modèle, ni valeur lisible. | 📂, ou **exclu**. |
| « … nomme les broches …, que l'empreinte n'a pas toutes. » | `! broches` ou `! masse` du fichier ne correspondent pas à l'empreinte. | Corriger ces lignes. |

## Limites connues

- **Petit signal, linéaire.** Le calcul est un balayage en fréquence sur des composants linéaires. Un amplificateur, un mélangeur, un transistor ne passent que par leur Touchstone ; aucun point de polarisation, aucune compression, aucun bruit.
- **Quasi-statique.** Sections en 2D, pastilles en 3D, dispersion de Getsinger par-dessus : ni modes supérieurs, ni ondes de surface, ni rayonnement (une fente du plan rayonne en vrai ; ici elle est une self estimée). La fiche donne la fréquence où cela cesse de valoir.
- **Deux ports exactement.** Une seule matrice S 2 × 2, un seul S₂₁, un seul bilan (port 1 vers port 2). Émission et réception sont deux calculs : on déplace le port 2, on change l'état du commutateur. Une puce à deux sorties se calcule en posant l'une comme port et l'autre comme broche annexe.
- **Les N ports ne sont pas codés.** La spécification [../../SPEC-rf-multiports.md](../../SPEC-rf-multiports.md) prévoit de 2 à 4 ports (matrice S complète, menu Sij, export `.sNp`) ; le plan [../../tasks/plan-rf-multiports.md](../../tasks/plan-rf-multiports.md) est en cours et rien de cela n'est livré. Aujourd'hui, le bouton d'export est `.s2p` et rien d'autre.
- **Pas de mode commun** sur un port différentiel : seule la tension V(+) − V(−) est vue.
- **Export renormalisé à 50 Ω**, parce que Touchstone n'accepte pas de référence complexe ; l'en-tête garde les impédances réelles.
- **Taille du problème.** 200 branches et 200 composants au plus, 40 nets pour la marche, requête de 8 Mio au plus ; un maillage de zone est plafonné à 30 000 cellules (la fiche dit s'il a fallu desserrer).
- **Masse idéale sans via.** Un composant en dérivation sans via de masse trouvé est rapporté à une masse idéale, et la note le dit.
- **Résultat périmé.** Le résultat part si la carte change ; il ne dépend pas de la sélection d'une piste (cliquer une piste ne l'efface pas).
- **Pas de peinture sur la carte.** Contrairement à l'onglet Impédance, S21 ne colore pas le cuivre.
- **Visionneuse.** Le fichier IPC-2581 n'est jamais modifié ; l'état RF (ports, modèles importés, broches annexes, états) est gardé dans le navigateur, sous le nom du fichier, et un modèle trop lourd pour ce stockage reste en mémoire seulement.
- **Établi ou non.** Les cas du banc `python/test/banc-rf.py` couvrent notamment le réseau en L, les ports différentiels, les Touchstone, le couplage, les selfs, les fentes et les zones ; ces étalons sont des formules, des solveurs du dépôt ou des cas à solution exacte. Le dépôt ne contient aucune mesure d'un montage RF : aucun écart avec une mesure n'est annoncé.

## Voir aussi

- [Simulation RF : que faire de chaque broche d'une puce radio](10b-rf-acces-des-broches.md) : ports simples, différentiels, broches annexes, alimentations, masse, commandes.
- [08 Simulation SI](08-simulation-si.md) : le panneau « Simulation EM… », ses réglages communs, la rangée Masse, le rapport.
- [09 Simulation PI, thermique, audit](09-simulation-pi-thermique-audit.md) : les autres familles du panneau.
- [05 Gestion LIB](05-gestion-lib.md) : lier un modèle SPICE ou Touchstone à une référence (carte « Modèles de simulation »).
- [03 Éditeur PCB : édition, routage](03-editeur-pcb-edition-routage.md) et [07 Visionneuse IPC-2581](07-visionneuse-ipc2581.md) : les deux outils qui portent le panneau.
- [11 Claude et le MCP](11-claude-mcp.md) : piloter la simulation depuis Claude.
- [../simulation-em.md](../simulation-em.md) : le détail du calcul, section « RF — le S₂₁ d'un réseau entre deux ports ».
- [../../SPEC-rf-multiports.md](../../SPEC-rf-multiports.md) : la spécification (non codée) des simulations à plusieurs ports.
