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
editeur-pcb/                   routage, empilage, DRC, Gerber, Excellon
recherche-composants/          recherche de références via pcbparts.dev
commun/                        code partagé par les éditeurs
├── workspace.js               panneaux détachables et dockables
├── workspace.css              habillage de l'espace de travail
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
couche, l'empilage physique et ses contrôles de perçage, le Gerber, l'Excellon et l'import défensif d'un document ; le schématique couvre la
découpe des fils, l'extraction des nets, les nets globaux entre feuilles, la
netlist, la nomenclature et l'analyse du CSV de bibliothèque. Les deux
vérifient l'espace de travail commun et l'échappement HTML des panneaux face à
un fichier malveillant.

Installer `canvas` (`npm i canvas`) est facultatif : sans lui, les quelques
essais qui rasterisent réellement le cuivre sont ignorés, les autres tournent.

L'intégration continue (`.github/workflows/ci.yml`) rejoue les deux bancs à
chaque poussée et à chaque demande de fusion.

## Bibliothèque de composants

`LIB_composants.csv` (séparateur point-virgule) alimente la recherche de
référence dans le panneau Propriétés du schématique. Colonnes attendues :
`Part Name`, `Value`, `Package type`, `Part Number`, `Description`,
`Reference designator Prefix`. Le fichier est chargé automatiquement quand la
page est servie par HTTP ; en `file://` un bouton permet de le désigner à la
main.

## Licence

MIT — voir [LICENSE](LICENSE).
