# Tests à faire

Les essais encore à faire pour WEB_CAO, au 22/10/2026 : ce que les bancs automatiques
(`editeur-pcb/test/harness.js`, `python/test/banc-*.py`, CI) ne peuvent pas vérifier seuls.
Chaque essai a sa spec dans web_suite (`tasks/essais/`) : qui le fait, comment, et la consigne à
donner à Claude in Chrome. Le code à écrire est dans [A-FAIRE.md](A-FAIRE.md).

## Sur du réel (carte, pièce, fichier)

- [ ] **Yamaichi IC51-0484-806, broche 1** : non marquée sur le plan 48 broches, à lire sur le
  repère moulé du support — [ESSAI-cao-yamaichi-broche1.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-yamaichi-broche1.md)
- [ ] **Empreinte SOT-89-5 (Torex)** : calculée depuis le contour, à poser sur une vraie carte —
  [ESSAI-cao-sot89-5.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-sot89-5.md)
- [ ] **LED RVB, sens et couleurs** : pastilles d'après OSRAM, vue déduite du schéma —
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

- [ ] **`cao_chemin`, durée de 20 liaisons** (0,5 s sous Linux, à mesurer sur le Pi) —
  [ESSAI-pi-chemin-auto-duree.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-pi-chemin-auto-duree.md)
- [ ] **Animation 3D de `fabrication.zip`** : format de vidéo retenu par son Chromium et images
  par seconde (la barre d'état les donne) — [ESSAI-pi-animation-3d.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-pi-animation-3d.md)
- [ ] **Tutoriel et mémoire de la Gestion LIB** : confirmer sur la vraie LIB que le chargement ne
  monte plus vers 890 Mo et que les neuf étapes passent — [ESSAI-pi-tutoriel-gestion-lib.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-pi-tutoriel-gestion-lib.md)

## Contre les normes et documents

- [ ] **USB 2.0 Template 2** : ±175 mV retrouvé, les positions 12,5 / 35 / 65 / 87,5 % UI à
  relire dans la figure 7-15 (`oeil.py`) — [ESSAI-cao-norme-usb2-template2.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-norme-usb2-template2.md)
- [ ] **Rugosité de Huray** : a et SR à tirer des fiches de feuillard (méthode « cannonball ») ;
  jeux actuels STD a 0,5 µm SR 1,5, HVLP a 0,3 µm SR 0,6 — [ESSAI-cao-huray.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-huray.md)
- [ ] **Sections IBIS** : lues du die vers la broche d'après des sources secondaires, texte
  normatif à lire (`ibis.py`) — [ESSAI-cao-norme-ibis-sections.md](https://github.com/pilou33620/web_suite/blob/main/tasks/essais/ESSAI-cao-norme-ibis-sections.md)
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
