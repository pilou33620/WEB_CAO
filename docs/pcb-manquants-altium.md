# Éditeur PCB — ce qui manque par rapport à Altium Designer

Relevé du 09/11/2026, fait sur le ruban (`editeur-pcb/editeur-pcb.html`), les menus
construits en JS (`06-panels.js`) et une recherche dans `editeur-pcb/js/`. Un « non
trouvé » veut dire absent du ruban et du code, pas vérifié à l'usage.

> **Mise à jour du 09/11/2026 — fait.** Tout ce qui figurait dans la demande
> (dessin, couches, zones, édition) est codé dans `editeur-pcb/js/46-edition.js` à
> `51-bus.js`, avec ses essais dans `test/harness.js`. Les lignes faites portent ✅ ;
> les limites connues sont dites à la fin.

Effort : **P** = petit (quelques heures, réutilise l'existant), **M** = moyen (un
fichier ou une fonction nouvelle), **G** = gros (touche le modèle, le rendu, le Gerber et
l'IPC-2581). Priorité : **1** = gêne au quotidien, **2** = attendu d'un outil pro,
**3** = confort ou cas particulier.

## Ce qui existe déjà (pour situer)

Dessin : piste (45°, 90°, libre, arrondie), via, trou NPTH, contour et découpes de carte,
miter, sérigraphie (trait, rectangle, aplat, texte), zone cuivre polygonale, découpe de
zone, zone interdite (pattes traversantes, hauteur). Cuivre : priorité de zone, liaison des
pastilles par zone et par pastille (bras thermiques réglables par pastille), retrait du
cuivre mort et des lanières, plan pleine carte par rôle de couche (GND, PWR, blindage),
larmes. Routage : routeur interactif (poussée, contournement), paires différentielles,
serpentins, chemin auto, groupes, copier-coller. Le reste (DRC, contraintes, simulation,
fabrication, Draftsman, STEP, IPC-2581) est au niveau d'Altium ou au-delà.

## 1. Outils de dessin

| Manque | Ce que fait Altium | Prio | Effort |
|---|---|---|---|
| ✅ Arcs et cercles (centre, bord, 3 points, cercle plein) sur toute couche : cuivre, sérigraphie, contour | Place Arc / Full Circle | 1 | M |
| ✅ Fill : rectangle de cuivre plein, avec ou sans net | Place Fill | 1 | P |
| ✅ Région pleine statique (polygone de cuivre qui ne se recalcule pas, pour les pastilles spéciales, antennes) | Solid Region | 1 | P |
| ✅ Texte sur cuivre, texte inversé (en réserve dans un aplat), et chaînes spéciales (`.Designator`, révision, date, nom de couche) | String, Inverted, Special Strings | 1 | M |
| ✅ Pastille libre hors empreinte (point de test, fiducial, plot de soudure) | Place Pad | 2 | P |
| ✅ Cotes posées sur la carte (linéaire, angulaire, rayon, coordonnée), dans une couche mécanique | Place Dimension | 2 | M |
| Import DXF / DWG : contour, découpes, logos | Import DXF | 2 | G |
| Import d'une image (PNG, SVG) en logo de sérigraphie ou de cuivre | PCB Logo Creator | 3 | M |
| Ligne de cuivre sans net (antenne, repère) hors routeur | Line sur couche signal | 3 | P |

## 2. Couches

| Manque | Ce que fait Altium | Prio | Effort |
|---|---|---|---|
| ✅ Couches mécaniques libres (Mécanique 1…N) avec un type (assemblage, cotes, forme de carte, corps 3D) et des paires dessus/dessous qui suivent le retournement | Mechanical layers, Layer pairs | 1 | M |
| ✅ Keep-out cuivre : interdit aux pistes, vias, zones, par couche ou toutes couches (la zone interdite actuelle ne vise que les pattes et la hauteur) | Keep-Out layer / Keepout objects | 1 | M |
| ✅ Plans négatifs (couche plan écrite en négatif, plus légère, Gerber en polarité inverse) | Internal Plane | 2 | G |
| ✅ Plans divisés : partager un plan entre plusieurs nets par une ligne de séparation | Split Plane | 1 | M |
| Jeux de couches (signal seuls, plans seuls, dessus seul, dessous seul) et mode couche unique | Layer Sets, Single Layer Mode | 2 | P |
| Couleurs et transparence par couche, réglables et rangées dans le profil | View Configuration | 3 | P |

## 3. Cuivre, zones et plans

| Manque | Ce que fait Altium | Prio | Effort |
|---|---|---|---|
| ✅ Isolement propre à une zone (aujourd'hui pris de la classe du net) | Polygon clearance rule par polygone | 1 | P |
| ✅ Bras thermiques réglés une fois sur la zone (nombre, largeur, écart, 45°/90°) pour toutes ses pastilles | Polygon Connect Style | 1 | P |
| ✅ Gestionnaire de zones : liste de toutes les zones, ordre de remplissage, nom, re-remplir tout ou la sélection | Polygon Pour Manager | 1 | M |
| ✅ Vias de couture en réseau sur une zone (pas X/Y, net, retrait du bord, évite le cuivre) | Via Stitching | 1 | M |
| ✅ Clôture de vias le long d'une piste ou d'un bord (RF, blindage) | Via Shielding | 2 | M |
| ✅ Remplissage hachuré (pas, largeur, angle) et zone en contour seul | Hatched / None pour fill mode | 2 | M |
| ✅ Seuils réglables : aire min d'un îlot, largeur min d'un col (retirés ou gardés au choix) | Remove islands / necks less than | 2 | P |
| Zones gelées (non recalculées) pour garder l'éditeur rapide sur une grosse carte | Shelve / Restore | 3 | P |
| Équilibrage de cuivre (thieving) dans les vides des couches | Copper thieving | 3 | M |
| Convertir zone ↔ région ↔ fill, changer le net de plusieurs zones d'un coup | Convert, Find Similar | 3 | P |

## 4. Édition et placement

| Manque | Ce que fait Altium | Prio | Effort |
|---|---|---|---|
| ✅ Aligner et répartir les composants (gauche, droite, haut, bas, centres, espacement égal) | Align / Distribute | 1 | P |
| ✅ Verrouiller composants, pistes, vias, zones (aujourd'hui seuls les trous NPTH ont `locked`) | Locked | 1 | P |
| ✅ Filtre de sélection (ne prendre que pistes, vias, zones, composants, sérigraphie…) | Selection Filter | 1 | P |
| ✅ Sélectionner les objets semblables puis les modifier ensemble (même largeur, même net, même couche) | Find Similar Objects | 2 | M |
| ✅ Collage en réseau linéaire ou circulaire | Paste Array | 2 | P |
| Repositionner les repères de sérigraphie de toute la sélection (au-dessus, au centre…) | Position Component Text | 2 | P |
| ✅ Changer de largeur (W) ou de via (Maj+V) en cours de tracé, passer à la couche suivante au clavier | Shift+W, Shift+V, `*` | 2 | P |
| ✅ Routage de plusieurs pistes à la fois (bus) | Interactive Multi-Routing | 2 | G |
| ✅ Fanout automatique des BGA et CMS (via en éventail sous chaque broche) | Fanout | 2 | M |
| ✅ Unité mm / mil basculable (aucune trace dans le code) | Q | 3 | P |

## 5. Affichage et vérification

| Manque | Ce que fait Altium | Prio | Effort |
|---|---|---|---|
| Vue 3D en direct dans l'éditeur, qui suit les retouches (three.js est déjà chargé pour l'animation 3D) | 3D mode (touche 3) | 2 | M |
| Inspecteur au survol : net, couche, largeur, isolement de l'objet sous le pointeur | Board Insight | 3 | P |

## 6. Fabrication

| Manque | Ce que fait Altium | Prio | Effort |
|---|---|---|---|
| Panélisation : mise en panneau, rails, fiducials, V-cut ou languettes | Embedded Board Array | 2 | G |
| Export ODB++ | ODB++ | 3 | G |
| Export DXF (contour, couches) pour la mécanique | Export DXF | 3 | M |
| Demi-trous (castellations) dessinés et vérifiés, pas seulement cités dans les capabilités | Plated edge / castellated pads | 3 | M |

## Par où commencer

Lot 1, petits et quotidiens : aligner/répartir, verrouiller, filtre de sélection,
isolement et bras thermiques par zone, fill et région pleine. Lot 2 : arcs et cercles,
texte cuivre, keep-out cuivre, couches mécaniques, gestionnaire de zones, vias de couture.
Lot 3 : plans divisés, hachures, vue 3D en direct, fanout. Les gros (plans négatifs, bus,
panélisation, DXF, ODB++) après.

## Limites levées le 09/11/2026

Les limites relevées après la première livraison sont corrigées :

- keep-out cuivre respecté par le routeur interactif (tracé, poussée, contournement),
  la touche V et le chemin auto ;
- arcs natifs sur la sérigraphie et les couches de dessin (angle réglable dans les
  Propriétés), exportés en cordes fines au Gerber et à l'IPC-2581, en `gr_arc` vers KiCad ;
- hachures à angle libre (0°, 45°…), le cadre tenu au bord exact de la zone ;
- région pleine recoupée par une zone prioritaire : ses trous partent au Gerber ;
- unité mil aussi dans le panneau Propriétés (affichage et saisie) ;
- Maj+V : taille de via suivante en plein tracé ;
- cadenas dessiné sur la carte au coin de chaque objet verrouillé ;
- DRC de la région pleine et du keep-out : un arc jugé sur ses cordes, plus sur sa corde.
