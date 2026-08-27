# WEB_CAO

Chaîne de CAO électronique en HTML/JavaScript sans dépendance : on saisit le
schéma, on exporte la netlist, on route le circuit imprimé et on sort le
dossier de fabrication. Les deux éditeurs s'ouvrent par double-clic sur leur
fichier HTML — aucun serveur, aucun `npm install`, aucun outil de compilation.

S'y ajoutent deux outils qui, eux, ont besoin de la petite passerelle Python :
une recherche de composants (stock JLCPCB, équivalences, brochages, modèles
CAO), et une visionneuse IPC-2581 pour ouvrir la carte livrée par un fabricant.

## Structure du projet

```
index.html                     page d'accueil : schéma, PCB, composants, IPC-2581
serveur.py                     serveur HTTP local, pour ouvrir depuis un iPad
                               -- seul module Python à rester à la racine, pour
                               le double-clic Windows
python/                        les autres modules Python, aucun à lancer seul
├── passerelle_mcp.py          relais vers pcbparts.dev (bibliothèque standard)
├── ipc2581_data.py            modèle d'une carte IPC-2581 (Point, Track, Pad…)
├── ipc2581_parser.py          lecture d'un fichier IPC-2581 -> IPCDesign
└── ipc2581_json.py            IPCDesign -> JSON, pour la visionneuse
requirements.txt               aucune dépendance : le fichier le dit et l'explique
LIB_composants.csv             bibliothèque de références (optionnelle)

editeur-schematique/           saisie du schéma, netlist, nomenclature
editeur-pcb/                   routage, paires diff., empilage, DRC, Gerber
recherche-composants/          recherche de références via pcbparts.dev
visionneuse-ipc2581/           import et affichage d'une carte IPC-2581
└── test/banc-essai.py         banc d'essai du parseur, avec sa carte d'essai
commun/                        code partagé par les quatre outils
├── workspace.js               panneaux détachables et dockables
├── workspace.css              habillage de l'espace de travail
├── session.js                 le travail suit l'utilisateur d'un outil à l'autre
├── session.css                habillage des boutons de navigation
├── profils.js                 espace de travail propre à chaque utilisateur
├── profils.css                habillage du bouton d'utilisateur et de son menu
├── reperage.js                chercher un repère, mesurer une distance
├── reperage.css               habillage de la boîte de recherche
├── outils/monofichier.py      assemblage en un HTML autonome
└── test/dom-stub.js           DOM minimal pour les bancs d'essai

profils/                       un fichier par utilisateur : Pilou.json
```

Chaque outil a son propre `README.md` détaillant ses modules, et
[A-FAIRE.md](A-FAIRE.md) garde ce qui manque encore.

## Dépendances

Aucune, ni côté navigateur ni côté Python : `serveur.py` et `python/passerelle_mcp.py`
n'utilisent que la bibliothèque standard (vérifié sur Python 3.10 et 3.12).
`requirements.txt` ne contient donc aucun paquet — il documente la garantie au
lieu de lister quoi installer, et `pip install -r requirements.txt` n'a rien à
faire. C'est pour tenir cette propriété que le second serveur
`serveur-composants.py` (FastAPI, uvicorn, pydantic) a été supprimé : il
exposait les deux mêmes routes que `serveur.py`.

## Utilisation

Le plus simple : ouvrir `index.html` dans un navigateur, puis choisir l'outil.
Les scripts sont des scripts classiques (pas des modules ES), donc les deux
éditeurs fonctionnent en `file://`.

Pour travailler depuis une tablette du même réseau WiFi :

```bash
python serveur.py
```

Sous Windows, un double-clic sur `serveur.py` suffit : la console s'ouvre et
reste ouverte — le journal des requêtes défile dedans — et le navigateur
s'ouvre tout seul sur la bonne adresse. Elle ne se referme plus toute seule :
en cas d'échec du démarrage, le message d'erreur reste affiché jusqu'à ce que
vous appuyiez sur Entrée.

Le serveur affiche l'adresse à saisir sur l'autre appareil. Il sert le dossier
du dépôt en lecture seule, sans authentification : **à réserver à un réseau de
confiance.** `python serveur.py --local` limite l'écoute à cette machine ;
`--host` et `--port` permettent de choisir l'interface et le port,
`--sans-navigateur` empêche l'ouverture automatique du navigateur, `--dossier`
sert un autre dossier que celui du script.

### Sur iPad, avec Pyto

`serveur.py` tourne aussi directement sur l'iPad (Pyto, bibliothèque standard
uniquement) : on sert alors le dépôt à `127.0.0.1` et on l'ouvre sur la même
machine. Deux particularités du système :

- Pyto ouvre l'adresse dans son navigateur intégré, l'application reste donc au
  premier plan et le serveur continue de répondre. **Gardez Pyto au premier
  plan** : dès que l'application passe en arrière-plan, iOS suspend
  l'interpréteur et les pages ne chargent plus. En Split View à côté de Safari,
  les deux restent actifs ;
- la première tentative d'accès au réseau local déclenche la demande
  d'autorisation « Réseau local ». Refusée, l'adresse réseau affichée est
  inutilisable ; `--local` suffit pour un usage sur l'iPad seul ;
- **le dossier servi doit être autorisé.** C'est le piège principal : un dépôt
  posé dans iCloud Drive ou « Fichiers » est hors du conteneur de Pyto, et
  `os.listdir` y répond `[Errno 1] Operation not permitted` — le navigateur
  affiche alors « 404 — No permission to list directory » alors que le serveur
  tourne. `--dossier` n'y change rien, c'est une autorisation : dans la barre
  latérale de Pyto, **« Ouvrir dossier »** puis choisir le dossier du dépôt (une
  fois pour toutes), ou déplacer le dépôt dans le dossier propre à Pyto. Le
  serveur nomme désormais le dossier fautif et l'erreur système, au démarrage
  et dans la page d'erreur elle-même. `--dossier <chemin>` reste utile quand
  c'est le chemin, et non l'autorisation, qui est faux :

```bash
python serveur.py --local --dossier ~/Documents/WEB_CAO
```

La recherche de composants (`/api/*`) a besoin de `ssl` : si Pyto ne le fournit
pas, le serveur démarre quand même et ces deux routes répondent
« passerelle indisponible » — les deux éditeurs, eux, fonctionnent.

## Utilisateurs

Chacun a son espace de travail. La page d'accueil porte la liste des
utilisateurs — **Pilou** au départ — et c'est là qu'on en ajoute ou qu'on en
efface un ; dans les éditeurs, le bouton `👤` de la barre d'outils dit qui
travaille et permet d'en changer sans repasser par l'accueil.

Ce qui suit la personne :

- la disposition des panneaux de chaque outil : docks, tailles, panneaux
  flottants, repliés ou fermés ;
- les réglages d'affichage : pas de grille, anti-collision, vue dessus/dessous,
  contraste, étiquettes de net, onglet du panneau de listes ;
- les derniers documents ouverts ou enregistrés (leur nom et leur date : le
  navigateur ne sait pas rouvrir un fichier tout seul).

Ce qui ne le suit pas : les schémas et les cartes. Ce sont des fichiers, les
mêmes pour tout le monde, et rien de ce qui décrit le circuit — couches,
classes de net, règles de conception — n'est rangé dans un profil.

Chaque profil est un fichier, `profils/<nom>.json`, écrit par `serveur.py`.
Ouverte en double-clic (`file://`), une page ne peut rien écrire sur le disque :
les préférences sont alors gardées dans le stockage local du navigateur, et le
fichier se remet à jour au prochain passage par le serveur — c'est la date
inscrite dans chacun qui les départage. Supprimer un utilisateur depuis
l'accueil efface ses préférences, jamais son travail.

## Recherche de composants

`recherche-composants/` interroge [pcbparts.dev](https://pcbparts.dev/) : stock
et prix JLCPCB, équivalences, brochages, symboles et empreintes KiCad, cartes
de référence libres, règles de conception. Le navigateur ne pouvant pas appeler
ce service directement, `serveur.py` fait lui-même la passerelle sur
`/api/tools` et `/api/tool` — sans aucune dépendance à installer :

```bash
python serveur.py
```

La page se sert de l'origine qui l'a chargée : rien d'autre à démarrer. La
passerelle n'expose que les quatorze outils de sa liste blanche.

Détails dans [recherche-composants/README.md](recherche-composants/README.md).

## Visionneuse IPC-2581

`visionneuse-ipc2581/` ouvre une carte au format IPC-2581 — le format d'échange
qui décrit une carte entière dans un seul fichier XML : empilage, cuivre, plans,
perçages, pastilles, composants et nets. C'est ce que livre un fabricant, et ce
qu'on reçoit d'un bureau d'études qui ne travaille pas sur le même outil. La
page l'affiche couche par couche ; elle ne modifie rien.

Le parseur est en Python (`python/ipc2581_parser.py`), qu'un navigateur ne peut pas
exécuter : la page envoie le fichier à `serveur.py` sur `/api/ipc2581` et
reçoit le modèle traduit en JSON. Rien n'est écrit sur le disque, rien n'est
gardé après la réponse.

```bash
python serveur.py
```

Le fichier se choisit au bouton ou se dépose sur la page : `.xml`, `.cvg`,
l'archive `.zip` qui en contient un — c'est souvent la forme d'un dossier de
fabrication — et le `.json` déjà exporté depuis cette page. Ce dernier se
rouvre **sans serveur**, en double-clic : de quoi archiver une carte lue à un
instant donné, ou la consulter sur une machine sans Python.

Le cuivre du dessus est rouge, celui du dessous bleu, les internes prennent la
suite de la palette. Un clic sur une piste ou une pastille met son net en
évidence, un clic sur un boîtier ouvre sa fiche avec le net de chaque broche,
et `B` retourne la carte comme on la retournerait dans la main.

Une piste sélectionnée donne aussi ce qu'elle vaut électriquement — topologie,
plan de référence, impédance Z₀, retard, capacité et self réparties —, avec les
formules de l'éditeur PCB pour que les deux outils s'accordent. L'empilage
venant ici du fichier et non d'une saisie, ce qui y manque est écrit sous le
tableau plutôt que supposé en silence — et se complète à la main dans le
panneau « La carte », où chaque épaisseur et chaque permittivité est un champ.
Ce qu'on y écrit suit l'utilisateur d'une ouverture à l'autre.

Détails dans [visionneuse-ipc2581/README.md](visionneuse-ipc2581/README.md).

## Version un seul fichier

Chaque éditeur sait s'assembler en un HTML autonome, pratique à envoyer par
courriel ou à archiver :

```bash
python editeur-pcb/outils/build-monofichier.py
```

```bash
python editeur-schematique/outils/build-monofichier.py
```

La sortie va dans `dist/` de l'éditeur concerné, avec en plus le bundle
JavaScript seul (`dist/pcb.js`, `dist/schema.js`) — c'est lui que chargent les
bancs d'essai.

## Bancs d'essai

Aucune dépendance obligatoire : Node et Python suffisent.

```bash
python editeur-pcb/outils/build-monofichier.py && node editeur-pcb/test/harness.js
```

```bash
python editeur-schematique/outils/build-monofichier.py && node editeur-schematique/test/harness.js
```

```bash
python visionneuse-ipc2581/test/banc-essai.py
```

Chaque banc reconstruit un DOM minimal (`commun/test/dom-stub.js`) et exécute
le bundle sans navigateur. Le PCB couvre la netlist, le chevelu multicouche,
les vias, les îlots de cuivre, les classes de net, le contour libre, les rôles de
couche, l'empilage physique et ses contrôles de perçage, les règles de
conception — matrice des natures de cuivre, figures cotées, comptes par règle,
et le fait que chacun de leurs champs écrive vraiment dans le document —,
le Gerber, l'Excellon,
les empreintes dessinées à la main avec leur bibliothèque, les paires
différentielles — tracé couplé, vias en éventail, longueur découplée,
impédance —, les deux cartes d'exemple — routage complet et contrôle DRC sans
remarque — et l'import défensif d'un document ; le schématique couvre la
découpe des fils, l'extraction des nets, les nets globaux entre feuilles, la
netlist, la nomenclature et l'analyse du CSV de bibliothèque. Les deux
vérifient le repérage commun — le classement des résultats, le cadrage, la cote
et ses aimants, et la recherche qui change de feuille au schématique —,
l'espace de travail commun, la session d'onglet — document mis de
côté puis repris à l'identique, état illisible ou trop gros écarté, garde de
sortie qui se tait pour un changement d'outil mais pas pour une fermeture — et
l'échappement HTML des panneaux face à un fichier malveillant.

Le troisième banc est en Python, et c'est le seul : il porte sur la moitié de
la visionneuse IPC-2581 qui ne tourne pas dans le navigateur — le parseur
(`python/ipc2581_parser.py`) et le modèle JSON qu'il alimente. Il couvre l'empilage et
ses permittivités (celles qui vivent dans une `<Spec>` pointée par un
`<SpecRef>`, la forme des outils du commerce), le contour, les largeurs de
piste des deux écritures, pastilles, perçages, vias, composants et boîtiers,
l'index des couches et des nets du modèle, l'archive `.zip`, et les refus —
fichier vide, XML tronqué, archive illisible, archive sans IPC-2581.

Il porte sa propre carte d'essai, écrite dans le fichier : un IPC-2581 réel
pèse une dizaine de mégaoctets et n'a pas sa place dans l'historique, et une
carte de quarante lignes dont chaque valeur se vérifie à la main prouve
davantage. C'est elle qui a montré que le lien composant → empreinte suivait le
mauvais attribut — 282 composants sur 285 sans empreinte, donc sans broches,
sur une carte réelle.

Installer `canvas` (`npm i canvas`) est facultatif : sans lui, les quelques
essais qui rasterisent réellement le cuivre sont ignorés, les autres tournent.

L'intégration continue (`.github/workflows/ci.yml`) rejoue les trois bancs à
chaque poussée et à chaque demande de fusion, et passe au compilateur tous les
scripts Python du dépôt.

## Passer d'un outil à l'autre sans rien perdre

Le schéma, le PCB, la recherche de composants et la visionneuse IPC-2581 sont
quatre pages distinctes : y aller, c'est quitter la page en cours. Le travail
non enregistré les suit désormais. Les boutons d'entête — *Éditeur PCB*,
*Éditeur schématique*, *Composants*, *Accueil* — mettent le document de côté
avant de changer de page, et l'outil le reprend en arrivant, dans l'état exact
où il a été laissé : composants et fils, empreintes et pistes, cadrage, feuille
courante, requête en cours et son dernier résultat, carte importée et vue. Aller vérifier une valeur sur le schéma au
milieu d'un routage ne coûte donc plus rien, et on peut faire l'aller-retour
autant de fois qu'on veut.

La portée est **l'onglet** : c'est `sessionStorage` qui porte tout cela
(`commun/session.js`). Le travail survit à la navigation et à un rechargement
(F5), deux onglets ouverts sur deux projets ne se mélangent pas, et fermer
l'onglet efface tout — d'où l'avertissement qui reste posé à la fermeture d'un
document jamais enregistré. **Ce n'est pas un enregistrement** : un projet qu'on
veut garder passe toujours par *Enregistrer .json*.

Si la place manque (le stockage de session plafonne autour de 5 Mo pour les
quatre outils), l'éditeur le dit au lieu de laisser croire que c'est passé : la
recherche de composants abandonne d'abord le résultat pour ne garder que la
requête, les éditeurs demandent confirmation avant de changer d'outil, et la
visionneuse — dont une carte de fabrication dépasse souvent à elle seule ce
plafond — renonce à mettre la sienne de côté plutôt que d'en garder une moitié.
Le fichier, lui, se rouvre.

### Cross-probing schéma ↔ PCB

Un clic sur *Éditeur PCB* depuis un composant sélectionné au schéma y amène
directement dessus — même feuille retrouvée, même sélection, la carte cadrée
dessus. Dans l'autre sens aussi : un clic sur *Éditeur schématique* depuis une
piste ou un net mis en évidence au PCB va chercher ce même net au schéma. Rien
de sélectionné, et le bouton retombe sur la navigation simple d'avant.

C'est un second canal de `sessionStorage`, distinct du document transporté
ci-dessus et qui ne survit qu'à une seule navigation : `sessAller()` l'écrit au
départ si l'outil d'origine a une sélection à signaler (`pcbSonde()`,
`schSonde()`), l'outil d'arrivée le consomme une fois son document en place
(`pcbSonderCible()`, `schSonderCible()`, dans `18-reperage.js` et
`21-reperage.js`) en s'appuyant sur la recherche par repère déjà commune aux
deux éditeurs (`commun/reperage.js`) — c'est elle qui sait retrouver « ce R1 »
ou « ce net » et cadrer la vue dessus, cette fonctionnalité n'a eu qu'à
l'appeler depuis l'autre outil.

À l'arrivée, le PCB **allume un phare** sur la cible : deux traits qui
traversent la vue et se croisent dessus, un cercle qui se resserre, puis le
cadre de l'empreinte. Il s'éteint seul en 2,5 s, et n'apparaît pas dans le
`.png` exporté. Sans lui, la sélection d'une 0603 sur une carte dense se
cherchait autant que l'empreinte — c'est-à-dire ce qu'on venait d'éviter.

Deux choses à savoir, parce qu'elles ressemblent à une panne sans en être une :

- **Les deux documents sont indépendants.** Le saut cherche le repère dans la
  carte ouverte ; si la netlist du schéma n'y a jamais été importée, il n'y a
  rien à trouver. Le pied de page le dit alors en toutes lettres plutôt que de
  ne rien faire.
- **Ce canal-là est propre à l'onglet**, comme le reste de la session :
  `sessionStorage` ne franchit pas la frontière d'un onglet, et c'est ce qui
  évite que deux cartes ouvertes en parallèle se mélangent. Deux onglets côte
  à côte ont donc leur propre mécanisme, juste en dessous.

### Deux onglets côte à côte

L'autre façon de travailler : le schéma dans une fenêtre, le PCB dans l'autre,
et l'on veut désigner dans l'une ce qu'on regarde dans l'autre — sans quitter
ni l'une ni l'autre. C'est le bouton **⇱ Montrer au PCB** (ou *Montrer au
schéma*), touche `L` : l'onglet voisin saute sur le repère sélectionné et
reste ouvert, celui d'où part la demande ne bouge pas.

**Sur demande, et non en suivi permanent** : l'onglet voisin ne saute que
lorsqu'on le lui demande. Un suivi automatique le ferait bouger à chaque clic,
et il deviendrait impossible d'y travailler.

Le transport est un `BroadcastChannel` (`commun/session.js`) — pas de serveur,
pas de stockage, le message passe directement d'une page à l'autre. Il ne dit
jamais s'il a été entendu : l'onglet qui reçoit accuse donc réception, et le
pied de page distingue les quatre réponses possibles — *montré*, *ce repère
n'y est pas*, *aucun onglet ouvert sur cet outil*, *ce navigateur ne partage
rien entre onglets*. Une demande partie dans le vide ne reste jamais muette.

Une limite à connaître : **en double-clic sur les fichiers (`file://`), deux
onglets n'ont pas la même origine** au sens du navigateur, et le message ne
passe pas. Il faut alors servir le dépôt (`python serveur.py`), comme pour la
recherche de composants. Le bouton se désactive de lui-même là où le canal
n'existe pas, plutôt que de disparaître sans explication.

## Du schéma au PCB : le boîtier pose l'empreinte

Le boîtier choisi sur un composant (`0603`, `SOIC-8`, `TQFP-64`…) part dans la
netlist et pose l'empreinte à l'import côté PCB : style, pas, écartement et
brochage en découlent, sans rien replacer à la main. Réimporter une netlist
retouchée ne défait pas le travail fait sur la carte : seule une empreinte dont
le boîtier a changé est refaite, et sans bouger de place.

Quand le boîtier nommé ne suffit pas — languette de DPAK, pastille thermique de
QFN, connecteur maison — le bouton *Modifier l'empreinte…* du panneau
*Propriétés* ouvre une fenêtre d'édition : les pastilles se placent, se
retaillent et se percent une par une, comme les broches d'un symbole dans la
fenêtre de brochage du schématique. L'empreinte obtenue s'enregistre sous un
nom, se réapplique sur n'importe quel autre composant sans toucher à son
repère, sa position ni ses nets, et s'exporte en `.json` pour une autre machine
ou un autre projet. Détails dans
[editeur-pcb/README.md](editeur-pcb/README.md#dessiner-une-empreinte-à-la-main-lenregistrer-la-réutiliser).

## Les règles DRC, avec leurs figures

Le bouton *Règles…* ouvre une fenêtre bâtie comme les éditeurs de règles des
logiciels du métier : l'arbre des contraintes à gauche, la règle choisie à
droite — son nom, ce qu'elle vise, une **figure cotée** et ses champs. Huit
familles, dix-sept règles : classe de net, isolation, court-circuit, liaison non
routée, largeur de piste, angle des pistes, conduite face à un obstacle, écharde
de gravure, style de via, via à via / trou à trou, rapport d'aspect, bras
thermique, zone de cuivre, paires différentielles, masque et pâte, marge au
bord, dimensions et origine de la carte.

C'est le **seul** endroit où une règle s'écrit : les panneaux *Règles de tracé*
et *Paires différentielles* ont quitté le dock, qui ne garde que ce qu'on
regarde en routant — l'empilage, les propriétés, les listes. Et tout ce qui
ressemble à un champ s'y modifie : ce qui ne se règle pas (un compte de défauts,
une cote calculée, un seuil venu de l'empilage) se présente en valeur lue, sans
cadre de saisie, plutôt qu'en champ grisé.

Les figures sont dessinées à partir du document, à l'échelle, avec les couleurs
de la couche active : la piste, le via, la pastille percée, la coupe du
stratifié, la cote fléchée entre les deux. Elles bougent quand on change un
champ — c'est ce qui permet de voir qu'on a écrit 2,5 au lieu de 0,25 avant que
le contrôle le dise. Chaque page porte le nombre de défauts que le dernier
contrôle a relevés *pour cette règle*, l'arbre en montre le compte, et
*Contrôler maintenant* relance le DRC sans quitter la fenêtre.

La page *Isolation* ajoute ce que les classes de net ne savaient pas dire : une
**matrice des natures de cuivre** — piste, pastille CMS, pastille traversante,
via, cuivre plein, trou. Chaque case est un minimum qui s'ajoute à la classe,
jamais un remplacement ; une case vide laisse la classe seule maîtresse, si bien
qu'un document écrit avant elle se contrôle à l'identique. La case choisie est
celle que la figure dessine. Le routeur applique la même cote que le contrôle :
un via qu'il refuse de poser est un via que le contrôle aurait signalé, et il
dit les deux cotes — celle qu'on a, celle que la règle exige.

Détails dans [editeur-pcb/README.md](editeur-pcb/README.md#les-règles-de-conception-et-leurs-figures).

## Le routeur pousse le cuivre

Face à un obstacle, une piste qu'on tire ne bute plus : elle demande au cuivre
gênant de s'écarter, et celui-ci pousse à son tour ses propres voisins, aussi
loin qu'il faut. C'est la méthode du routeur de KiCad — le **PNS**, *Push and
Shove* — réimplémentée dans l'éditeur.

Trois conduites, au choix dans *Règles de tracé*, ligne **Face à un obstacle** :
**pousser le cuivre** (le défaut), **contourner** — la piste se faufile, rien
d'autre ne bouge — ou **signaler**, l'ancienne conduite de l'éditeur, où le
trajet fautif s'affiche en rouge et refuse de se poser. Les trois se rabattent
l'une sur l'autre : ce qui ne peut pas être poussé est contourné, ce qui ne peut
pas être contourné est signalé. Une pastille, elle, ne se pousse jamais.

Tant que la souris se déplace, le cuivre qui s'écarte n'est qu'un aperçu : le
clic seul l'installe, Échap remet tout en place, et un tracé entier — pistes
posées **et** cuivre poussé — ne fait qu'un seul Ctrl+Z. Les paires
différentielles y ont droit aussi.

Détails dans [editeur-pcb/README.md](editeur-pcb/README.md#le-routeur--pousser-contourner-signaler).

## Router une paire différentielle

USB, Ethernet, LVDS, CAN : deux nets qui portent le même signal en opposition ne
se routent pas l'un après l'autre. Sélectionnez les deux pistes, cliquez
*Créer depuis la sélection* dans le panneau **Paires différentielles** — ou
*Détecter*, qui lit les noms de net (`USB_DP`/`USB_DM`, `CAN_P`/`CAN_N`, `D+`/`D-`) —
puis routez la paire d'un seul geste avec la touche **P**.

Les deux pistes sortent des pastilles en éventail, se mettent au pas et le
gardent : l'écart est tenu dans les coudes comme dans les lignes droites, les
vias se posent par deux en s'écartant juste ce qu'il faut, et l'arrivée se
referme toute seule sur les pastilles d'en face. Le panneau règle les six cotes
— largeur et écart, mini, préféré, maxi —, couche par couche s'il le faut, et
calcule l'impédance différentielle sur l'empilage déclaré : choisissez un profil
(D90 pour l'USB 2.0, D100 pour l'Ethernet…) et l'éditeur résout la largeur ou
l'écart qui tombe dessus. Le contrôle DRC ajoute ce qui ne se voit pas à l'œil :
la longueur restée découplée, l'écart de longueur entre les deux pistes.

Détails dans [editeur-pcb/README.md](editeur-pcb/README.md#paires-différentielles).

## Chercher un repère, mesurer une distance

Deux gestes que les deux éditeurs partagent — mêmes touches, même boîte, même
lecture — parce qu'il n'y a aucune raison de les apprendre deux fois. Le
comportement tient dans `commun/reperage.js` ; chaque éditeur ne fournit que ce
que ce fichier ne peut pas deviner : l'aimant, la liste des cibles, le cadrage.

**Rechercher — `Ctrl+F`.** Un champ, une liste, `Entrée`. On tape un repère
(`C47`, `R1`) ou un nom de net, et la vue arrive dessus en le sélectionnant.
Le classement va du plus sûr au plus large : ce qu'on a tapé en entier d'abord,
puis ce qui commence par, puis ce qui contient — taper `R1` met donc `R1` avant
`R10` et `R100`, sans quoi la frappe la plus courte, qui est la plus fréquente,
serait la plus mal servie. Les flèches choisissent, `Échap` ferme.

Côté PCB, la recherche atteint les empreintes et les nets : un net trouvé sort
tout son cuivre, sélectionné et mis en avant. Côté schématique, elle
**traverse les feuilles** — c'est justement quand `R1` est ailleurs qu'on le
cherche : la ligne annonce sa feuille, et y aller change de feuille avant de
sélectionner. Le cadrage ne touche à l'échelle que s'il le faut : une cible qui
déborde de l'écran le fait reculer, une cible trop petite pour se voir le fait
s'approcher, et le reste du temps rien ne bouge — un zoom sans raison fait
croire que le document a changé.

**Mesurer — `K`.** Un clic pose le départ, le suivant fige l'arrivée, le
troisième repart d'ailleurs : on enchaîne les cotes sans repasser par un
bouton, et `Échap` efface. La cote se lit sur le plan de travail — la distance,
et sous elle ΔX et ΔY — avec le triangle rectangle qui dit d'un coup d'œil ce
que deux nombres seuls ne montrent pas. Le pied de page ajoute l'angle.

Les deux mesures ne disent pas la même chose, et l'éditeur ne fait pas semblant
du contraire :

- au **PCB**, c'est une cote de fabrication. Les pastilles, les vias et les
  sommets de piste de la couche active attirent le point — mesurer d'un centre
  de pastille à l'autre est le geste courant — et hors de leur portée c'est la
  grille qui prend la main, jamais le pixel visé : on ne relève pas 3,4712 mm
  là où on visait 3,5 ;
- au **schématique**, non. Une case vaut 1 mm par convention de dessin, pas par
  cote physique — un schéma n'a pas d'échelle. La mesure sert à aligner et à
  espacer, les broches attirent le point, et la lecture le dit en toutes
  lettres plutôt que de laisser prendre le nombre pour une dimension de carte.

La cote est une annotation de travail : elle ne va ni dans le `.png` exporté ni
dans les Gerber, et quitter le mode l'efface.

## Deux cartes d'exemple

L'éditeur schématique démarre sur un schéma de démonstration ; l'éditeur PCB,
lui, ouvre les siens à la demande, par le bouton **Exemples…**. Deux cartes
finies, à regarder plutôt qu'à décrire :

- **Commande 12 V**, 2 couches — la carte du schéma de démonstration :
  régulateur 12 V → 5 V et étage NPN, le dos entier en plan de masse, chaque
  pastille CMS qui y descend par son via ;
- **Interface USB 2.0**, 4 couches — connecteur micro-B, régulateur 3,3 V,
  TQFP-32 et connecteur SWD, avec les deux couches internes données à la masse
  et au 3,3 V, la **paire différentielle USB** tracée sur le dessus au-dessus du
  plan de masse — 0,25 mm de piste, 0,15 mm d'écart, sans changement de couche —
  et un bus SWD passé au dos par vias.

Elles se chargent comme un fichier ouvert : DRC, fenêtre des règles et export de
fabrication marchent dessus comme sur une carte à soi. Le banc d'essai les
vérifie à chaque poussée — routage complet, aucune remarque au contrôle.

Détails dans [editeur-pcb/README.md](editeur-pcb/README.md#exemples-de-routage).

## Bibliothèque de composants

`LIB_composants.csv` (séparateur point-virgule) alimente la recherche de
référence dans le panneau Propriétés du schématique. Colonnes attendues :
`Part Name`, `Value`, `Package type`, `Part Number`, `Description`,
`Reference designator Prefix`. Le fichier est chargé automatiquement quand la
page est servie par HTTP ; en `file://` un bouton permet de le désigner à la
main.

## Licence

MIT — voir [LICENSE](LICENSE).
