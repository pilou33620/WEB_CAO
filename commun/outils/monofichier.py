# -*- coding: utf-8 -*-
"""
Recomposition d'un fichier HTML unique à partir d'une version découpée.

Module commun aux deux éditeurs : chacun n'a qu'un script d'appel de trois
lignes dans son dossier outils/. Aucune minification, aucune transformation :
le contenu est recopié tel quel, dans l'ordre déclaré par les balises
<link rel="stylesheet"> et <script src> de la page.

Les chemins relatifs sont résolus depuis le dossier de l'éditeur, ce qui permet
d'inliner les ressources partagées (« ../commun/workspace.js »).
"""
import io
import os
import re
import sys

LINK_RE = re.compile(r'<link rel="stylesheet" href="([^"]+)">')
SRC_RE = re.compile(r'<script src="([^"]+)"></script>')


def _read(root, rel):
    path = os.path.normpath(os.path.join(root, rel))
    with io.open(path, encoding="utf-8") as f:
        return f.read()


def build(root, page, dst_html, dst_js=None):
    """Inline les styles et scripts de `page` (relatif à `root`).

    Écrit le HTML autonome dans `dst_html` et, si `dst_js` est fourni, le
    bundle JavaScript seul — c'est lui que le banc d'essai charge.
    Renvoie (n_css, n_scripts).
    """
    html = _read(root, page)

    html, n_css = LINK_RE.subn(
        lambda m: "<style>\n" + _read(root, m.group(1)).rstrip("\n") + "\n</style>",
        html)

    scripts = SRC_RE.findall(html)
    if not scripts:
        sys.exit("aucune balise <script src> trouvée dans %s : le gabarit a changé ?" % page)

    parts = []
    for rel in scripts:
        code = _read(root, rel)
        if "</script" in code.lower():
            sys.exit("« </script » présent dans %s : impossible d'inliner tel quel." % rel)
        parts.append("/* ---------- %s ---------- */\n%s" % (rel, code.rstrip("\n")))

    js_bundle = "\n\n".join(parts)

    # la première balise devient le bloc complet, les suivantes disparaissent
    state = {"first": True}

    def repl(m):
        if state["first"]:
            state["first"] = False
            return "<script>\n" + js_bundle + "\n</script>"
        return ""

    html = re.sub(r'<script src="[^"]+"></script>\n?', repl, html)
    html = re.sub(r"\n{3,}", "\n\n", html)

    for path, text in ((dst_html, html), (dst_js, js_bundle)):
        if path is None:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(text)

    written = " et ".join(os.path.relpath(p, root) for p in (dst_html, dst_js) if p)
    print("écrit : %s  (%d Ko, %d feuille(s) de style, %d scripts)"
          % (written, os.path.getsize(dst_html) // 1024, n_css, len(scripts)))
    return n_css, len(scripts)
