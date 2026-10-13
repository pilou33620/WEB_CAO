# Spec : classes d'interface (USB, Ethernet, LVDS, CAN / RS-485)

Origine : A-FAIRE.md, *Vérification de la carte entière → Reste à faire*, commit `fb326e3`.

## Objectif

Aujourd'hui une classe de net ne dit qu'une famille (Horloge, Rapide, RF,
Analogique, Lent, Découpage) : un seul front et une seule cadence par
famille, une seule Z_diff par carte. Conséquences :

- TRD1_N (Ethernet 100BASE-TX, fronts de 3 à 5 ns) est classé Rapide. Il est
  donc jugé à 1 ns et condamné par la règle des chemins de retour, alors qu'il
  tient jusqu'à 2,7 ns.
- Une paire USB à 90 Ω et une paire Ethernet à 100 Ω ne peuvent pas cohabiter
  sur la même carte.

On ajoute des **classes d'interface**. Chacune porte son front, sa cadence,
sa Z₀ et sa Z_diff, et appartient à une famille existante. La famille décide
quelles règles s'appliquent, par exemple « rapide » pour le retour ou
« tient une impédance ». Les valeurs propres de la classe décident à quel
front et face à quelle cible le net est jugé.

Utilisateur : le concepteur qui vérifie sa carte dans l'éditeur PCB ou la
visionneuse et qui classe ses nets dans le schéma, le PCB ou la visionneuse.
L'attribution se fait **à la main**. Les heuristiques de noms ne changent pas.

### Classes proposées (valeurs par défaut, réglables dans le panneau)

Noms courts (ils sont enregistrés dans les fichiers) ; le nom long sert
d'info-bulle.

| Classe | Nom long | Famille | t_r | Cadence | Z_diff | Source |
|---|---|---|---|---|---|---|
| USB FS | USB 2.0 Full Speed | Lent | 4 ns | 6 MHz | 90 Ω | USB 2.0 §7.1 : 4–20 ns ; 12 Mb/s |
| USB HS | USB 2.0 High Speed | Rapide | 500 ps | 200 MHz | 90 Ω | USB 2.0 : t_r ≥ 500 ps ; 480 Mb/s |
| ETH 100 | Ethernet 100BASE-TX | Rapide | 3 ns | 31,25 MHz | 100 Ω | ANSI X3.263 : 3–5 ns ; MLT-3 à 125 Mbd |
| ETH 1000 | Ethernet 1000BASE-T | Rapide | 2 ns | 50 MHz | 100 Ω | PAM-5 à 125 Mbd |
| LVDS | LVDS (TIA-644) | Rapide | 300 ps | 330 MHz | 100 Ω | TIA-644 : 655 Mb/s |
| CAN | CAN (ISO 11898) | Lent | 50 ns | 0,5 MHz | 120 Ω | ISO 11898 : 1 Mb/s |
| RS-485 | RS-485 (TIA-485) | Lent | 20 ns | 5 MHz | 120 Ω | TIA-485 : 10 Mb/s |

**Pas de Z₀ de brin par défaut.** La norme de chaque protocole fixe une
Z_diff, et c'est elle que l'on juge. Un net d'interface ne tient une Z₀ que
si le panneau lui en donne une (`z0_classes`) ; sinon, la règle
d'impédance le compare à sa propre impédance dominante, comme une classe
Analogique sans cible.

**Front jugé.** Le serveur prend min(t_r, 0,1 / cadence). Pour qu'un net
soit jugé au front de sa norme, la cadence par défaut vaut au plus
0,1 / t_r, comme pour les classes d'origine (un essai du banc PCB y
veille). C'est pourquoi l'USB HS est à 200 MHz et non à 240 MHz, son
fondamental, et le 1000BASE-T à 50 MHz et non à 62,5 MHz. Décidé le
13/10/2026.

## Comportement attendu (critères d'acceptation)

1. **Choix de la classe.** Les sept classes apparaissent dans le menu de
   classe des trois outils :
   - schéma : `netClassSelect` ;
   - PCB : `classOptionsHtml`, groupe « Nouvelle classe » ;
   - visionneuse : `pnlSelNature`.

   Le choix est enregistré comme une classe ordinaire. Il passe du schéma au
   PCB par le même chemin (`S.netClasses` → `publierClasses` → `autoClass`).
2. **Front et cadence.** Un net « ETH 100 » est jugé à
   min(3 ns, 0,1 / 31,25 MHz) = 3 ns, et non plus à 1 ns. Sur le cas
   TRD1_N, la règle de retour ne le condamne plus.
3. **Famille.** `RAPIDES`, `CLASSES_Z`, `_signal` et
   `("Analogique", "Lent")` se testent sur la **famille** de la classe :
   - USB HS compte comme rapide pour le retour (règle 3) ;
   - CAN compte comme Lent dans le découplage.
4. **Z_diff par classe.** La règle *paires différentielles* juge une paire
   face à la Z_diff de sa classe : 90 Ω pour USB, 100 Ω pour Ethernet. Une
   paire de classe ordinaire garde la `zdiff` de la carte. Côté serveur, une
   nouvelle clé `zdiff_classes` suit le modèle de `z0_classes`.
5. **Z₀ par classe.** Une interface n'a pas de Z₀ par défaut. Le panneau
   offre un champ Z₀ vide, comme pour Analogique. Une valeur saisie part
   dans `z0_classes`, et le net se juge alors face à elle (`_tient_z`).
   Sinon, il ne tient aucune Z₀, même quand sa famille est Rapide.
6. **Diaphonie.** `crosstalk.front_de_classe` connaît les fronts des
   interfaces. Une classe d'interface n'y tombe donc plus sur « Lent ».
7. **Panneau de vérification.** Il ajoute une ligne par classe d'interface,
   avec t_r, cadence, Z₀ et Z_diff, chacune dans son unité.
   - Les réglages déjà mémorisés par carte (`cao.carte.reglages.v1.*`) se
     complètent avec les valeurs par défaut des nouvelles classes.
   - Une carte qui n'utilise aucune classe d'interface rend le rapport
     d'avant **à l'identique**.
8. **Paires automatiques.** `autoPairs` (`vite=/^(Rapide|Horloge|RF)$/`)
   accepte les classes d'interface de famille rapide.

## Tech stack

- Code existant : JS sans framework dans les trois outils et `commun/`.
- Python 3.12 + numpy pour `analyse_carte.py` et `crosstalk.py`.
- Aucune dépendance ajoutée.

## Commandes

```
python python/test/banc-analyse-carte.py
python python/test/banc-crosstalk.py
python python/test/banc-serveur-routes.py
node editeur-pcb/test/harness.js
node editeur-schematique/test/harness.js
node visionneuse-ipc2581/test/harness-sim.js
python -m compileall -q web_CAO.py python
```

Les bundles monofichiers sont produits par `commun/outils/monofichier.py`.
Le plan précisera si un nouveau fichier `commun/` doit y être déclaré.

## Structure (où va le code)

- **Une table JS des interfaces.** Elle donne nom, famille, t_r, cadence, Z₀
  et Z_diff, et elle est lue par les trois outils. Les trois outils
  chargent `commun/session.js` et `commun/projet.js`, mais seuls le PCB et
  le schéma chargent `commun/contraintes.js`. Le plan doit donc choisir
  entre deux options :
  - un petit fichier `commun/classes-interface.js`, inclus dans les trois
    pages ;
  - la table dans un fichier déjà commun aux trois outils.
- **Une table Python miroir.** Elle va dans `crosstalk.py` (le module de plus
  bas niveau) et `analyse_carte.py` l'importe. Elle fournit
  `TR_CLASSES` / `CADENCES` étendus et la fonction `famille(classe)`.
- **Les essais.** Ils s'ajoutent aux bancs existants, sans nouveau banc.

## Style

Le même que celui du code existant :

- commentaires en français, avec le pourquoi en capitales en tête ;
- noms en français ;
- constantes en majuscules.

Exemple côté serveur :

```python
# UNE CLASSE D'INTERFACE APPARTIENT À UNE FAMILLE : la famille décide des
# règles, la classe donne son front, sa cadence et ses cibles.
INTERFACES = {"USB HS": {"nom": "USB 2.0 High Speed", "famille": "Rapide",
                         "tr": 5e-10, "cadence": 2.4e8, "zdiff": 90.0}, ...}
```

## Essais

- **`banc-analyse-carte.py`.** Trois cas :
  - un net ETH 100 jugé à 3 ns et non condamné, là où « Rapide » le
    condamne ;
  - une paire USB à 90 Ω jugée correcte face à 90 Ω ;
  - une paire Ethernet à 90 Ω signalée face à 100 Ω, sur la même carte.

  Un cas de non-régression vérifie qu'un rapport sans classe d'interface
  reste identique.
- **`banc-crosstalk.py`.** `front_de_classe("USB HS")` rend 500 ps.
- **`harness.js` du PCB.** Les classes d'interface apparaissent dans le menu,
  et `reglages` envoie `zdiff_classes` / `z0_classes`. On vérifie aussi que
  les réglages mémorisés sans ces classes se complètent.
- **`harness-sim.js` de la visionneuse.** La nature d'interface est choisie,
  mémorisée par fichier et envoyée.
- **`harness.js` du schéma.** La classe d'interface passe au PCB.

## Limites

- **Toujours :**
  - garder le rapport d'avant au bit près quand aucune classe d'interface
    n'est utilisée ;
  - faire tourner les bancs touchés avant chaque commit ;
  - mettre à jour A-FAIRE.md et l'*État des lieux*.
- **Demander d'abord :**
  - changer une valeur par défaut d'une classe existante ;
  - ajouter une classe hors des sept listées ;
  - toucher à `pattern_recognition.py` (heuristiques de noms) ;
  - recopier quoi que ce soit dans WEB_ANTENNA.
- **Jamais :**
  - deviner une classe d'interface d'après le nom du net ;
  - retirer ou affaiblir un essai existant.

## Critères de réussite

- Les critères 1 à 8 sont tenus et couverts par les essais ci-dessus.
- Tous les bancs de la CI passent.
- Le cas TRD1_N n'est plus condamné par la règle de retour.

## Décisions (questions ouvertes tranchées le 13/10/2026)

1. **Valeurs par défaut** : celles du tableau, revues face aux normes.
2. **Z₀ d'un brin** : aucune par défaut. On ne juge que la Z_diff de la
   norme du protocole. Une Z₀ saisie dans le panneau reste possible.
3. **Noms** : noms courts (USB FS, USB HS, ETH 100, ETH 1000, LVDS, CAN,
   RS-485), avec le nom long en info-bulle.
4. **Largeur côté PCB** : celle de la famille. La largeur calculée pour
   une cible d'impédance viendra plus tard.
