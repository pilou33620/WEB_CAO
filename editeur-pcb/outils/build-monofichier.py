#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
    python3 outils/build-monofichier.py   -> dist/editeur-pcb.html et dist/pcb.js

Utile pour distribuer l'éditeur : un seul fichier à envoyer, à archiver ou à
ouvrir en double-clic. Le développement, lui, se fait sur les fichiers séparés.
dist/pcb.js est le bundle JavaScript seul, chargé par test/harness.js.

La mécanique est dans commun/outils/monofichier.py, partagée avec l'éditeur
schématique.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(ROOT), "commun", "outils"))

import monofichier

monofichier.build(
    root=ROOT,
    page="editeur-pcb.html",
    dst_html=os.path.join(ROOT, "dist", "editeur-pcb.html"),
    dst_js=os.path.join(ROOT, "dist", "pcb.js"),
)
