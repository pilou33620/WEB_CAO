#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Recompose un fichier HTML unique à partir de la version découpée.

    python3 outils/build-monofichier.py            -> dist/editeur-schematique.html

Utile pour distribuer l'éditeur : un seul fichier à envoyer, à archiver ou à
ouvrir en double-clic. Le développement, lui, se fait sur les fichiers séparés.
Aucune minification, aucune transformation : le contenu est recopié tel quel,
dans l'ordre déclaré par les balises <script> de la page.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "editeur-schematique.html")
DST = os.path.join(ROOT, "dist", "editeur-schematique.html")


def read(rel):
    with io.open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


html = read("editeur-schematique.html")

# ---- feuille de style -------------------------------------------------------
def inline_css(m):
    css = read(m.group(1))
    return "<style>\n" + css.rstrip("\n") + "\n</style>"

html, n_css = re.subn(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)

# ---- scripts ----------------------------------------------------------------
scripts = re.findall(r'<script src="([^"]+)"></script>', html)
if not scripts:
    sys.exit("aucune balise <script src> trouvée : le gabarit a changé ?")

parts = []
for rel in scripts:
    code = read(rel)
    if "</script" in code.lower():
        sys.exit("« </script » présent dans %s : impossible d'inliner tel quel." % rel)
    parts.append("/* ---------- %s ---------- */\n%s" % (rel, code.rstrip("\n")))

bundle = "<script>\n" + "\n\n".join(parts) + "\n</script>"

# la première balise devient le bloc complet, les suivantes disparaissent
first = True
def repl(m):
    global first
    if first:
        first = False
        return bundle
    return ""

html = re.sub(r'<script src="[^"]+"></script>\n?', repl, html)
html = re.sub(r"\n{3,}", "\n\n", html)

os.makedirs(os.path.dirname(DST), exist_ok=True)
with io.open(DST, "w", encoding="utf-8") as f:
    f.write(html)

print("écrit : %s  (%d Ko, %d feuille(s) de style, %d scripts)"
      % (os.path.relpath(DST, ROOT), os.path.getsize(DST) // 1024, n_css, len(scripts)))
