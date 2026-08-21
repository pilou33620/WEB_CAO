# Recherche de composants — organisation des fichiers

Troisième outil du dépôt, à côté des deux éditeurs : une interface au même
thème « dashboard nocturne » pour interroger [pcbparts.dev](https://pcbparts.dev/)
— stock JLCPCB, équivalences, brochages, modèles CAO, cartes de référence et
règles de conception.

Contrairement aux éditeurs, **cette page a besoin d'un serveur** : le
navigateur ne peut pas appeler le serveur MCP de pcbparts.dev directement (ni
le CORS ni le protocole ne le permettent). `../serveur.py` fait le relais —
c'est le même serveur que celui des éditeurs, aucune dépendance à installer.

```
recherche-composants/
├── recherche-composants.html     structure de la page + ordre de chargement
├── css/
│   └── recherche.css             thème « dashboard nocturne »
└── js/                           7 modules, chargés dans l'ordre numéroté
```

Deux fichiers viennent du dossier partagé, identiques pour les deux éditeurs :

```
../commun/workspace.css           habillage de l'espace de travail
../commun/workspace.js            panneaux détachables, paramétré par WS_CONFIG
```

## Les modules

| Fichier | Lignes | Rôle |
|---|---:|---|
| `js/00-espace-config.js` | 21 | `WS_CONFIG` : clé de stockage local et disposition d'usine des trois panneaux |
| `js/01-api.js` | 94 | Découverte de la passerelle (origine courante, port 8420, adresse mémorisée), appels `/api/tools` et `/api/tool` |
| `../passerelle_mcp.py` | 200 | Client MCP partagé par les deux serveurs : session, liste blanche, déballage des réponses |
| `js/02-outils.js` | 284 | Catalogue des 14 outils : familles, libellés français, champs et colonnes de résultats |
| `js/03-formulaire.js` | 230 | Formulaire construit en croisant le catalogue et le schéma d'arguments du serveur ; lecture et validation des champs |
| `js/04-resultats.js` | 193 | Tableau, fiche ou bloc de texte selon la réponse ; exports `.csv` et `.json` |
| `js/05-details.js` | 146 | Panneau de détail, enchaînements (équivalences, brochage, KiCad, distributeurs), échappement systématique |
| `js/06-demarrage.js` | 211 | Câblage des boutons, liste des outils, historique, fenêtre « Serveur… » |

## Démarrage

```bash
python serveur.py
```

Puis l'adresse affichée au démarrage : la page d'accueil propose les deux
éditeurs et la recherche de composants, et la recherche passe par ce même
serveur. `--local` limite l'écoute à cette machine, `--port` change le port.

`serveur-composants.py` reste disponible pour qui préfère uvicorn
(`pip install fastapi uvicorn`, port 8420 par défaut). La page essaie dans
l'ordre : l'adresse mémorisée par le bouton **Serveur…**, l'origine qui la
sert, le port 8420 du même hôte, puis `http://127.0.0.1:8420`.

## Ce que fait l'interface

- **Panneau Outils** — les 14 outils groupés par famille ; `/` place le curseur
  dans le filtre.
- **Formulaire** — les champs courants sont visibles, les réglages fins sont
  derrière « Filtres avancés ». Les valeurs par défaut viennent du schéma du
  serveur ; un paramètre ajouté côté pcbparts.dev apparaît automatiquement.
- **Résultats** — tableau cliquable, colonnes choisies par outil (LCSC,
  référence, fabricant, boîtier, stock, prix, type de bibliothèque).
- **Panneau Détail** — la fiche du résultat sélectionné et les enchaînements :
  fiche complète, équivalences, brochage, modèle CAO, symbole KiCad,
  recoupement Mouser ou DigiKey, cartes utilisant le circuit.
- **Panneau Réponse brute** — le JSON renvoyé, replié par défaut.
- **Exports** — `.csv` (point-virgule, comme `LIB_composants.csv`) du tableau
  affiché, `.json` de la réponse complète.

Les panneaux se détachent, se replient et se déplacent comme dans les éditeurs ;
la disposition est conservée dans le stockage local.

## Sécurité

La passerelle n'accepte que les 14 outils de sa liste blanche
(`ALLOWED_TOOLS`), et l'interface échappe tout ce qui vient du réseau avant de
l'afficher : seuls les liens en `http(s)` sont rendus cliquables.
