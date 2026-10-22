# Tests à faire

Les essais encore à faire pour WEB_CAO, au 22/10/2026 : ce que les bancs automatiques
(`editeur-pcb/test/harness.js`, `python/test/banc-*.py`, CI) ne peuvent pas vérifier seuls.
Chaque essai a sa spec dans web_suite (`tasks/essais/`) : qui le fait, comment, et la consigne à
donner à Claude in Chrome. Le code à écrire est dans [A-FAIRE.md](A-FAIRE.md).

## Sur du réel (carte, pièce, fichier)

- [ ] **Yamaichi IC51-0484-806, broche 1** : non marquée sur le plan 48 broches, à lire sur le
  repère moulé du support. *22/10/2026* : les cotes du plan et du perçage concordent avec la
  LIB ; aucun document ne marque la broche 1. Reste, support en main : où est le repère moulé
  par rapport à la charnière ? Et vérifier que l'empreinte porte bien le perçage de 0,8 mm sous
  ses pastilles — [ESSAI-cao-yamaichi-broche1.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-yamaichi-broche1.md)
- [ ] **Empreinte SOT-89-5 (Torex)** : calculée depuis le contour, à poser sur une vraie carte.
  *22/10/2026* : numérotation et brochage du XC6231 justes ; les pastilles s'écartent de Torex
  (correction dans [A-FAIRE.md](A-FAIRE.md)). Reste : vérifier l'empreinte corrigée sur la
  carte réelle —
  [ESSAI-cao-sot89-5.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-sot89-5.md)
- [ ] **LED RVB, sens et couleurs** : pastilles d'après OSRAM, vue déduite du schéma.
  *22/10/2026* : concordant avec la datasheet (vue de dessus, trois paires couleur) ; le coin
  coupé du boîtier est du côté de la pastille 4, pas de la 1. Reste : allumer la LED, bleu entre
  les pastilles 1 et 4, vert entre 2 et 5, rouge entre 3 et 6 —
  [ESSAI-cao-led-rvb.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-led-rvb.md)
- [ ] **eCADSTAR** : un fichier IPC-2581 porte-t-il `<Package><Outline>` et `height` ? Sinon les
  corps restent estimés d'après les pastilles — [ESSAI-cao-ecadstar-package.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-ecadstar-package.md)
- [ ] **Carte TRD1_N en « ETH 100 »** — [ESSAI-cao-trd1n-eth100.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-trd1n-eth100.md)
- [ ] **Simulation RF de P01x274** : la mesure à comparer au S21 simulé, avec tes réponses (voir
  [A-FAIRE.md](A-FAIRE.md)) — [ESSAI-cao-rf-p01x274.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-rf-p01x274.md)
- [ ] **Dossier mécanique** : télécharger le zip et importer le DXF dans la CAO méca —
  [ESSAI-cao-dossier-meca-import.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-dossier-meca-import.md) ; une IA lit le JSON (critère 6) —
  [ESSAI-cao-dossier-meca-ia.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-dossier-meca-ia.md)

## Sur le Raspberry Pi

- [ ] **`cao_chemin`, durée de 20 liaisons** : sur le PC (22/10/2026) 493 / 462 / 543 ms,
  19 routes, routeur 274 ms, plus aucune piste dans U3.2 ; à refaire sur le Pi avec ces chiffres
  pour référence —
  [ESSAI-pi-chemin-auto-duree.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-pi-chemin-auto-duree.md)
- [ ] **Animation 3D de `fabrication.zip`** : format de vidéo retenu par son Chromium et images
  par seconde (la barre d'état les donne) — [ESSAI-pi-animation-3d.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-pi-animation-3d.md)
- [ ] **Tutoriel et mémoire de la Gestion LIB** : sur le PC avec la vraie LIB (22/10/2026) les
  neuf étapes passent, 7 pastilles « ? », tas JavaScript sous 20 Mo, aucune erreur. Reste : le
  chiffre « Empreinte mémoire » du gestionnaire de tâches de Chrome (Maj+Échap), seul
  comparable aux 890 Mo, puis le même essai sur le Pi — [ESSAI-pi-tutoriel-gestion-lib.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-pi-tutoriel-gestion-lib.md)

## Contre les normes et documents

- [x] **USB 2.0 Template 2** (22/10/2026) : lu dans la copie officielle ; les six points et
  les ±525 mV sont justes. Corrigé dans `oeil.py` 2.4.1 : figure 7-14 (pas 7-15), Template 4
  figure 7-16 (pas 7-17), mention « TP3 d'un hub » retirée ; la fiche passe « lu dans la
  norme » — [ESSAI-cao-norme-usb2-template2.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-norme-usb2-template2.md)
- [x] **Rugosité de Huray** (22/10/2026) : formules de Simonovich retrouvées avec son exemple
  chiffré ; SR y vaut toujours 4,887, contre 1,5 et 0,6 dans le code. Décision : passer à
  Simonovich (dans [A-FAIRE.md](A-FAIRE.md)) — [ESSAI-cao-huray.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-huray.md)
- [x] **Sections IBIS** (22/10/2026) : la norme 8.0 (p. 184) dit qu'une description de
  boîtier commence côté puce ; le sens de `ibis.py` (puce → broche) est confirmé — [ESSAI-cao-norme-ibis-sections.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-norme-ibis-sections.md)
- [ ] **IPC-7351B, constantes des puces** : alignées sur KiCad, à confirmer dans la norme —
  [ESSAI-cao-norme-ipc7351b-puces.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-norme-ipc7351b-puces.md)
- [ ] **HDMI 1.4b, masque à TP2** : repris de ngscopeclient, à confirmer dans la norme —
  [ESSAI-cao-norme-hdmi-tp2.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-norme-hdmi-tp2.md)

## Relectures de code (ton verdict)

- [ ] **Classes d'interface** — [ESSAI-cao-relecture-classes-interface.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-relecture-classes-interface.md)
- [ ] **Dossier mécanique** — [ESSAI-cao-relecture-dossier-meca.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-relecture-dossier-meca.md)

Le canal de pilotage depuis l'iPad et Claude Code avec le MCP (Pi, Windows) concernent toute la
suite : ils sont dans le
[TESTS-A-FAIRE de web_suite](https://github.com/pilou33620/web_suite/blob/main/TESTS-A-FAIRE.md).
