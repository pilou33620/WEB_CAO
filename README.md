# WEB_CAO

Chaîne de CAO électronique en HTML/JavaScript sans dépendance : on saisit le
schéma, on exporte la netlist, on route le circuit imprimé et on sort le
dossier de fabrication. Les deux éditeurs s'ouvrent par double-clic sur leur
fichier HTML — aucun serveur, aucun `npm install`, aucun outil de compilation.

S'y ajoute une recherche de composants (stock JLCPCB, équivalences, brochages,
modèles CAO), qui elle a besoin d'une petite passerelle Python.

## Structure du projet

```
index.html                     page d'accueil : schéma, PCB ou composants
serveur.py                     serveur HTTP local, pour ouvrir depuis un iPad
passerelle_mcp.py              relais vers pcbparts.dev (bibliothèque standard)
requirements.txt               aucune dépendance : le fichier le dit et l'explique
LIB_composants.csv             bibliothèque de références (optionnelle)

editeur-schematique/           saisie du schéma, netlist, nomenclature
editeur-pcb/                   routage, paires diff., empilage, DRC, Gerber
recherche-composants/          recherche de références via pcbparts.dev
commun/                        code partagé par les trois outils
├── workspace.js               panneaux détachables et dockables
├── workspace.css              habillage de l'espace de travail
├── session.js                 le travail suit l'utilisateur d'un outil à l'autre
├── session.css                habillage des boutons de navigation
├── outils/monofichier.py      assemblage en un HTML autonome
└── test/dom-stub.js           DOM minimal pour les bancs d'essai
```

Chaque outil a son propre `README.md` détaillant ses modules.

## Dépendances

Aucune, ni côté navigateur ni côté Python : `serveur.py` et `passerelle_mcp.py`
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
`--sans-navigateur` empêche l'ouverture automatique du navigateur.

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

Chaque banc reconstruit un DOM minimal (`commun/test/dom-stub.js`) et exécute
le bundle sans navigateur. Le PCB couvre la netlist, le chevelu multicouche,
les vias, les îlots de cuivre, les classes de net, le contour libre, les rôles de
couche, l'empilage physique et ses contrôles de perçage, le Gerber, l'Excellon,
les empreintes dessinées à la main avec leur bibliothèque, les paires
différentielles — tracé couplé, vias en éventail, longueur découplée,
impédance — et l'import défensif d'un document ; le schématique couvre la
découpe des fils, l'extraction des nets, les nets globaux entre feuilles, la
netlist, la nomenclature et l'analyse du CSV de bibliothèque. Les deux
vérifient l'espace de travail commun, la session d'onglet — document mis de
côté puis repris à l'identique, état illisible ou trop gros écarté, garde de
sortie qui se tait pour un changement d'outil mais pas pour une fermeture — et
l'échappement HTML des panneaux face à un fichier malveillant.

Installer `canvas` (`npm i canvas`) est facultatif : sans lui, les quelques
essais qui rasterisent réellement le cuivre sont ignorés, les autres tournent.

L'intégration continue (`.github/workflows/ci.yml`) rejoue les deux bancs à
chaque poussée et à chaque demande de fusion.

## Passer d'un outil à l'autre sans rien perdre

Le schéma, le PCB et la recherche de composants sont trois pages distinctes :
y aller, c'est quitter la page en cours. Le travail non enregistré les suit
désormais. Les boutons d'entête — *Éditeur PCB*, *Éditeur schématique*,
*Composants*, *Accueil* — mettent le document de côté avant de changer de page,
et l'outil le reprend en arrivant, dans l'état exact où il a été laissé :
composants et fils, empreintes et pistes, cadrage, feuille courante, requête en
cours et son dernier résultat. Aller vérifier une valeur sur le schéma au
milieu d'un routage ne coûte donc plus rien, et on peut faire l'aller-retour
autant de fois qu'on veut.

La portée est **l'onglet** : c'est `sessionStorage` qui porte tout cela
(`commun/session.js`). Le travail survit à la navigation et à un rechargement
(F5), deux onglets ouverts sur deux projets ne se mélangent pas, et fermer
l'onglet efface tout — d'où l'avertissement qui reste posé à la fermeture d'un
document jamais enregistré. **Ce n'est pas un enregistrement** : un projet qu'on
veut garder passe toujours par *Enregistrer .json*.

Si la place manque (le stockage de session plafonne autour de 5 Mo pour les
trois outils), l'éditeur le dit au lieu de laisser croire que c'est passé : la
recherche de composants abandonne d'abord le résultat pour ne garder que la
requête, et les éditeurs demandent confirmation avant de changer d'outil.

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

## Bibliothèque de composants

`LIB_composants.csv` (séparateur point-virgule) alimente la recherche de
référence dans le panneau Propriétés du schématique. Colonnes attendues :
`Part Name`, `Value`, `Package type`, `Part Number`, `Description`,
`Reference designator Prefix`. Le fichier est chargé automatiquement quand la
page est servie par HTTP ; en `file://` un bouton permet de le désigner à la
main.

## Licence

MIT — voir [LICENSE](LICENSE).
