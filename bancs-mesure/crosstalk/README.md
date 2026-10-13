# Banc de mesure — crosstalk

Une carte d'essai à faire fabriquer, six couples agresseur / victime, et de quoi comparer **trois résultats** sur les mêmes cas :

1. **WEB_CAO** : l'onglet *Crosstalk* (niveau 2, `python/crosstalk.py`), par le même chemin que le bouton « Analyser la piste » ;
2. **ANSYS SIwave** : le *Crosstalk Scan* dans le domaine temporel, sur la même carte importée ;
3. **la mesure** : un générateur d'impulsions et un oscilloscope sur la carte réelle.

```
bancs-mesure/crosstalk/
  generer-carte.js          la carte, construite par le code de l'Éditeur PCB, puis DRC
  exporter-docs-sim.js      les documents de l'onglet Crosstalk, un par cas (Chromium)
  docs-sim/casN.json        ces documents, figés : le banc Python tourne sans navigateur
  sortie/banc-crosstalk-PCB.json   la carte générée (à ouvrir dans l'Éditeur PCB)
  banc-crosstalk-mesure.py  prévisions WEB_CAO + comparaison aux relevés
  releves.csv               à remplir : mesure et SIwave
```

Le projet correspondant (carte prête à ouvrir, notes de fabrication) est dans `WEB_SUITE_PROJETS/CAO/banc crosstalk/`.

---

## La carte

![La carte dans l'Éditeur PCB](carte.png)

**130 × 204 mm, 4 couches, empilage JLCPCB JLC04161H-7628** (1,6 mm) :

| Couche | Rôle | Épaisseur |
|---|---|---|
| Top | les pistes, **et rien d'autre** (pas de cuivre coulé) | 35 µm |
| prépreg 7628 | εr 4,4 | 0,2104 mm |
| L2 | masse pleine | 15,2 µm |
| âme | εr 4,6 | 1,065 mm |
| L3 | masse pleine | 15,2 µm |
| prépreg 7628 | εr 4,4 | 0,2104 mm |
| Bottom | masse pleine + pattes des SMA | 35 µm |

- **Pistes de 0,35 mm** : environ 50 Ω en microruban vernis (MoM de WEB_CAO : 50,5 Ω avec 10 µm de vernis). Commander **avec contrôle d'impédance** (50 Ω, couche Top, référence L2) : JLC ajuste la largeur et donne son εr.
- **Longueur couplée : 100 mm**, pour environ 620 ps de retard. Le NEXT atteint son plateau avec les fronts jusqu'à 1,2 ns.
- **Embases SMA bord de carte** : Cinch / Johnson **142-0701-801**, la référence `CONN_Embase_SMA_CI_Bord_de_carte` de la LIB. Repère **J{cas}{port}** :

| Port | Repère | Rôle |
|---|---|---|
| 1 | J{n}1, gauche, haut | **source** de l'agresseur (générateur) |
| 2 | J{n}2, gauche, bas | victime côté source : **NEXT** |
| 3 | J{n}3, droite, haut | **charge** de l'agresseur (50 Ω), et mesure de son amplitude et de son front |
| 4 | J{n}4, droite, bas | victime côté charge : **FEXT** |

> [!WARNING]
> **Avant de commander, vérifiez l'empreinte de la SMA sur la datasheet de la 142-0701-801.** Ses cotes n'ont pas pu être relues sur le dessin du fabricant : elles sont regroupées en tête de `generer-carte.js` (`SMA = {…}` : retrait, longueur des pastilles, largeur de l'âme, entraxe et largeur des pattes de masse). Corrigez-les si besoin, puis relancez le générateur : toute la carte suit.

### Les cas

| Cas | Configuration | Ce qu'il teste | Ce qu'on attend |
|---|---|---|---|
| **0** | deux pistes à 12 mm, sans rapprochement | **le plancher de mesure** : connecteurs, câbles, masse du montage | tout ce qui sort ici est du bruit de montage, à retrancher en esprit des autres cas |
| **1** | microruban couplé, **S = W** = 0,35 mm | un couplage fort, bien mesurable | les trois sources d'accord, à l'εr près |
| **2** | microruban couplé, **S = 3W** = 1,05 mm | la règle des 3W, la sensibilité à l'écart | idem, à un niveau 5 fois plus bas |
| **3** | S = 3W, **piste de garde** de 0,35 mm au milieu, cousue tous les 5 mm | l'efficacité d'une garde | **cas 3 contre cas 2 = effet de la garde seule** |
| **4** | S = 3W, **fente de 2 mm** dans L2, L3 et Bottom, en travers des deux pistes au milieu du couplage | le couplage par le chemin de retour (impédance commune) | **cas 4 contre cas 2 = effet de la fente seule**. Le calcul 2D ne le voit pas ; depuis `crosstalk` 4.6.0, WEB_CAO y ajoute l'**impédance commune du détour, le courant de retour résolu sur l'image des plans** (PEEC) : ≈ +3,7 % à 1 ns ; le modèle d'Ott (4.5.0, ≈ +11 %) tient la borne haute de la fourchette, 3,7 à 16,7 % |
| **4b** (repère J5x) | S = 3W, **la même fente de 2 mm, sur L2 seulement** ; L3 et Bottom restent pleins | le cas le plus courant : un plan découpé, un autre dessous. Le courant de retour change de plan au lieu de contourner la fente | **cas 4b contre cas 4** : détour contre report sur l'autre plan. depuis `crosstalk` 4.6.0, WEB_CAO résout le retour dans les deux cas : le 4b a son terme de détour (≈ +1 % à 1 ns), plus petit que celui du 4 parce qu'une part du retour passe par L3 |

Plus deux lignes d'étalonnage, de même largeur et avec les mêmes embases :
- **CAL_LONG** (J91 → J92, 126,50 mm) et **CAL_COURT** (J93 → J94, sur le bord du haut, 57,18 mm). La différence de longueur vaut **69,32 mm**. La différence de leurs retards mesurés donne l'**εr effectif réel**, connecteurs et câbles retranchés : `εeff = (c · Δt / 69,32 mm)²`. WEB_CAO attend environ 3,4, soit Δt ≈ 425 ps.

### Prévisions de WEB_CAO

`python bancs-mesure/crosstalk/banc-crosstalk-mesure.py` (rampe linéaire de durée t_r, sans pertes ; NEXT / FEXT en % de l'agresseur) :

| Cas | t_r 0,5 ns | 1 ns | 2,5 ns | 5 ns | 10 ns |
|---|---|---|---|---|---|
| 1 | 4,44 / 3,64 | 4,44 / 1,82 | 2,20 / 0,73 | 1,10 / 0,36 | 0,55 / 0,18 |
| 2 | 0,90 / 1,41 | 0,90 / 0,70 | 0,45 / 0,28 | 0,22 / 0,14 | 0,11 / 0,07 |
| 3 | 0,58 / 0,86 | 0,58 / 0,43 | 0,29 / 0,17 | 0,14 / 0,09 | 0,07 / 0,04 |
| 4 | 8,43 / 8,91 | 4,56 / 4,35 | 1,89 / 1,73 | 0,95 / 0,86 | 0,47 / 0,43 |
| 4b | 4,61 / 3,38 | 2,31 / 1,69 | 0,92 / 0,68 | 0,46 / 0,34 | 0,23 / 0,17 |

Le cas 4 est la somme des lignes couplées (celles du cas 2, 0,90 / 0,69 à 1 ns) et du **terme d'impédance commune de la fente**. Depuis `crosstalk` 4.6.0 (option B), la page envoie l'image du cuivre des plans autour du franchissement, et le serveur y **résout** le courant de retour (PEEC quasi statique au genou du front : selfs partielles des mailles, capacité entre plans, vias de masse) : self du détour ≈ 4,3 nH, d'où **+3,66 % en NEXT comme en FEXT à 1 ns**, inversement proportionnel au front. Le modèle d'Ott de la 4.5.0 (self ≈ 17 nH, +10,97 %, fourchette 9,2 à 16,7 %) suppose un détour en demi-boucle ; sur une fente étroite, les deux bords portent des courants opposés qui se compensent, et il surestime d'un facteur trois. Il reste la **borne haute de la fourchette (3,7 à 16,7 %)** : la mesure départagera les deux modèles. Pour le **4b**, une part du retour passe par L3 (couplage des deux plans, capacité de la cavité, vias de masse voisins) : le terme existe, **+0,97 % à 1 ns**, et s'ajoute aux lignes calculées sur L3.

L'image des plans des cas 4 et 4b (`docs-sim/cas4.json`, `cas5.json`) a été calculée depuis les zones et les découpes de la carte, avec la règle de la page (cuivre de masse moins découpes), faute de Playwright sur le poste ; `exporter-docs-sim.js` la produit d'elle-même au prochain export.

Avec 1 V sur l'agresseur, 0,1 % fait 1 mV. Les cas 2 à 4 demandent donc de **moyenner** (voir plus bas), et un front lent les fait vite descendre sous le plancher.

---

## Mesure à l'oscilloscope

### Matériel

- un générateur à sortie **50 Ω**, en mode impulsion ou carré, avec le **front le plus raide** qu'il sache faire ;
- un oscilloscope à **2 voies au moins**, avec entrée 50 Ω, ou à défaut une **traversée 50 Ω** (« feed-through » BNC) par voie ;
- des câbles SMA (ou SMA → BNC), **deux charges SMA 50 Ω**, et un adaptateur SMA femelle-femelle (pour mesurer les câbles seuls).

Bande passante : le temps de montée propre de l'oscilloscope (≈ 0,35 / BP) doit rester sous le tiers du front mesuré. Un oscilloscope de 200 MHz (1,75 ns) ne lit correctement que des fronts de plus de 5 ns.

### Montage, pour le cas n

**Les quatre ports sont toujours fermés sur 50 Ω.** Un port en l'air renvoie le NEXT dans le FEXT, et inversement.

| Port | Branché sur |
|---|---|
| J{n}1 | le générateur |
| J{n}3 | voie 1 (50 Ω) : amplitude et front 10-90 % de l'agresseur. Elle sert aussi de charge |
| J{n}2 | voie 2 (50 Ω) : NEXT |
| J{n}4 | voie 3 (50 Ω) : FEXT, ou une charge 50 Ω si l'oscilloscope n'a que 2 voies (on refait alors la mesure en permutant la voie 2 et la charge) |

Réglages :
- cadence basse (100 kHz à 1 MHz) : chaque front doit s'éteindre avant le suivant ;
- amplitude maximale du générateur ;
- **moyennage 64 à 256 coups** : sans cela, les cas 2 à 4 se noient dans le bruit ;
- déclenchement sur la voie 1.

Ce qu'on lit :
- **V_agresseur** : le palier sur J{n}3. **t_10_90** : son temps de montée ;
- **NEXT** : la crête sur J{n}2. Elle commence avec le front et dure environ 2 × 620 ps. Au-delà, ce sont les réflexions des embases du bout opposé ;
- **FEXT** : la crête (souvent négative) sur J{n}4, environ 620 ps après le départ. Prendre la valeur absolue.

Commencer par le **cas 0** : il donne le plancher. Si le cas 3 ne sort pas nettement au-dessus, le relevé n'est pas exploitable à ce front.

Reporter chaque relevé dans `releves.csv`, source `MESURE`.

---

## Crosstalk Scan dans SIwave

Les noms de menus changent d'une version à l'autre : ce qui suit donne **les réglages à reproduire**. Les intitulés exacts sont à retrouver dans votre version.

1. **Exporter la carte depuis WEB_CAO** : ouvrir le projet dans l'Éditeur PCB, *Fichier → Fabrication*. On obtient les Gerber (`.GTL`, `.GL2`, `.GL3`, `.GBL`), le perçage Excellon, le contour (`.GM1`), la netlist **IPC-D-356** (`.ipc`) et `EMPILAGE.txt`.
2. **Importer dans SIwave** (ou dans HFSS 3D Layout, puis ouvrir l'`.aedb` dans SIwave) par l'import Gerber, avec le perçage et la netlist IPC-356 pour retrouver les noms de nets (`XT1_A`, `XT1_V`… `GND`).
3. **L'empilage**, recopié de `EMPILAGE.txt` : Top 35 µm, 7628 0,2104 mm εr 4,4 tan δ 0,02, L2 15,2 µm, âme 1,065 mm εr 4,6, L3 15,2 µm, 7628 0,2104 mm, Bottom 35 µm, vernis 10 µm εr 3,8. Cuivre lisse : WEB_CAO calcule sans rugosité par défaut. **Une fois la carte reçue, remplacer les εr par ceux que JLC a mesurés, ou par l'εeff des lignes d'étalonnage**, dans les deux simulateurs.
4. **Les extrémités des nets** : déclarer un composant (ou un groupe de broches) sur la pastille d'âme de chaque SMA, avec `GND` en référence. Le **driver** est en J{n}1, les **récepteurs** en J{n}2, J{n}3 et J{n}4, tous en **50 Ω**.
5. **Le scan, dans le domaine temporel** : agresseurs `XT*_A`, victimes `XT*_V`, **Rise Time** égal au t_10_90 mesuré sur la carte, amplitude de la source (1 V sur 50 Ω, par exemple), impédances driver / récepteur de 50 Ω.
6. Relever pour chaque victime le **NEXT** (côté J{n}2) et le **FEXT** (côté J{n}4) en mV, et les reporter dans `releves.csv`, source `SIWAVE`, avec l'amplitude de la source sur 50 Ω dans `V_agresseur_mV`.

Le cas 4 est celui à regarder de près. Si le scan SIwave travaille, comme celui de WEB_CAO, sur des sections droites 2D le long des nets, il ne verra pas davantage la fente : seule la mesure, ou une extraction pleine onde (SIwave SYZ, HFSS), la chiffrera.

---

## Comparer

```bash
python bancs-mesure/crosstalk/banc-crosstalk-mesure.py            # tableau + comparaison
python bancs-mesure/crosstalk/banc-crosstalk-mesure.py --tr 2.5   # tableau à un front donné
```

Pour chaque relevé, WEB_CAO est recalculé **au front de ce relevé**, sous deux lectures :
- `t_r = t_10-90 / 0,8`, la rampe linéaire équivalente ;
- `t_r = t_10-90`, la borne haute du FEXT.

Le NEXT saturé n'en dépend pas, le FEXT varie de 25 % entre les deux. Le script donne l'écart en dB au milieu de la fourchette, et dit si le relevé y tombe (± 2 dB).

Ordre de lecture conseillé :
1. **les lignes d'étalonnage** : l'εeff mesuré contre 3,4. Un écart se reporte sur tout le reste : à corriger d'abord ;
2. **le cas 0** : le plancher ;
3. **les cas 1 et 2** : le moteur MoM et les formules du niveau 2. Les trois sources doivent s'accorder à 1 ou 2 dB près ;
4. **le cas 3 contre le cas 2** : ce que la garde retire. WEB_CAO prévoit −3,8 dB ;
5. **le cas 4 contre le cas 2** : ce que la fente ajoute. WEB_CAO prévoit **+3,7 % à 1 ns** par le retour résolu (option B, PEEC), et Ott **+11 %** : la fourchette va de l'un à l'autre. C'est ce que la mesure doit trancher ; un écart de plus de 3 dB aux deux appelle la référence pleine onde (option D d'`A-FAIRE.md`).
6. **le cas 4b contre le cas 4** : fente sur un seul plan contre sur les trois. WEB_CAO prévoit pour le 4b 2,31 % de NEXT à 1 ns : le Kb local de la portion où le retour passe sur L3 (1,34 %) **et**, depuis `crosstalk` 4.6.0, le terme du détour résolu avec L3 dessous (+0,97 %), environ quatre fois plus petit que celui du 4. Si le 4b mesure autant que le 4, L3 ne ferme pas le retour aussi bien que le modèle le dit.

---

## Ce que le banc a déjà appris sur WEB_CAO

Avant même la fabrication, faire passer cette carte dans l'outil a mis au jour quatre comportements. Trois sont corrigés (crosstalk 4.4.1, 11/10/2026) ; ce qui reste est dit à chaque point :

1. **« Toute la carte » ignorait la piste de garde.** La règle *diaphonie* de la vérification de carte (`analyse_carte`) rendait pour le cas 3 exactement les chiffres du cas 2 (0,90 % / 0,70 % à 1 ns). Elle pose maintenant dans la section du couple tout ce qui le longe — la garde à 0 V quand ses vias la cousent, flottante sinon — et rend, comme « Analyser la piste », **0,58 % / 0,43 %**.
2. **Le cas S = 3W tombait pile sur le seuil de présélection** (`3 × max(W, H)` = 1,05 mm) et était écarté sans chiffre. L'égalité est maintenant retenue (et 2 % au-dessus), et un couple écarté de peu est nommé avec son écart. Le banc garde une *distance max* de 3 mm pour voir aussi les voisines lointaines.
3. **Une fente de moins de 1,5 mm sous la piste n'était pas vue.** La sonde du plan avançait par pas de 0,5 mm et écartait tout trou plus court que 1,5 pas (`simXtFentes`, `simXtFentesIpc`). Elle sonde maintenant aussi les arêtes des plans que le parcours coupe : une fente de 0,2 mm est vue, à sa largeur et sa position exactes. La fente du cas 4 reste à 2 mm, pour être mesurable. Une fois vue, l'outil dit que la section n'est pas résoluble sur sa largeur et, **depuis `crosstalk` 4.5.0, chiffre l'effet du détour du courant de retour** : la page mesure les détours d1 / d2 autour de la fente et les plans qui ferment encore le retour, le serveur ajoute l'impédance commune d'Ott avec sa fourchette (le cas 4 passe de 0,9 % à ≈ 12 % à 1 ns). Avant cette version, NEXT et FEXT restaient ceux du cas 2. C'est précisément ce terme que la mesure doit trancher.
4. **Une classe nommée « RF … » impose un front de 100 ps** (`tr_classes`) quand aucun front n'est saisi : le FEXT du cas 1 sort alors à 18 %. La fiche le dit maintenant en réserve, en tête des hypothèses et en alerte à côté du t_r, et propose la porteuse RF du panneau (t_r = 0,35 / f). Toujours saisir le front de la mesure.
