# profils/

Un fichier par utilisateur, portant son nom : `Pilou.json`. Il contient la
façon dont cette personne se sert de la suite — panneaux, réglages
d'affichage, derniers documents — et rien du contenu des cartes ni des
schémas, qui vivent dans leurs propres fichiers.

Le fichier est écrit par `serveur.py` (routes `/api/profils` et `/api/profil`)
quand les pages sont ouvertes depuis le serveur. En double-clic (`file://`),
le navigateur ne peut rien écrire sur le disque : les préférences sont alors
gardées dans son stockage local, et le fichier se met à jour au prochain
passage par le serveur. Voir `commun/profils.js`.

Structure :

```json
{
 "format": "cao-profil-1",
 "nom": "Pilou",
 "t": 1756000000000,
 "sections": {
  "espace:pcb.espace-travail.v1": { "docks": {}, "order": {}, "panels": {} },
  "reglages:pcb":    { "grille": 0.1, "accroche": true },
  "reglages:schema": { "grille": 10, "nets": 2 },
  "recents:pcb":     [ { "nom": "carte.json", "t": 1756000000000 } ]
 }
}
```

`t` est la date de la dernière écriture, en millisecondes : c'est elle qui
départage le fichier et la copie du navigateur quand les deux ont bougé.

Pour effacer les préférences de quelqu'un, passez par la page d'accueil
(« Supprimer celui-ci ») : elle efface le fichier **et** la copie gardée par
le navigateur. Supprimer le fichier à la main ne suffit pas — le navigateur
qui en a une copie la réécrira à la prochaine visite, et c'est voulu : c'est
ce qui permet de travailler en double-clic, serveur éteint, sans rien perdre.

Un profil ne contient aucun schéma ni aucune carte : supprimer un utilisateur
ne touche à aucun travail.
