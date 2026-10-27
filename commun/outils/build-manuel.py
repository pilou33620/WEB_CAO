# -*- coding: utf-8 -*-
"""
Assemble les chapitres Markdown de docs/manuel/ en une page unique, docs/manuel/manuel.html.

Page autonome (styles et script en ligne) : elle s'ouvre en double-clic, sans serveur.
Sommaire à gauche, recherche plein texte. Les chapitres sont pris dans l'ordre alphabétique
de leur nom (01-…, 02-…) ; index.md est le seuil et passe toujours en premier.

Sous-ensemble de Markdown compris : titres, paragraphes, listes (une imbrication par
indentation), tableaux, blocs de code, citations (dont > [!NOTE]), règle, et en ligne
`code`, **gras**, *italique*, [lien](cible). Rien d'autre : un chapitre qui en demande
plus se réécrit.

Contrôle : un lien vers un autre chapitre (x.md, x.md#ancre) ou vers un fichier du dépôt
doit exister ; sinon le script liste les liens cassés et rend le code 1.

    python commun/outils/build-manuel.py
"""
import html
import io
import os
import re
import sys

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(RACINE, "docs", "manuel")
SORTIE = os.path.join(SRC, "manuel.html")


def slug(texte):
    t = re.sub(r"<[^>]+>", "", texte).lower()
    t = re.sub(r"[`*_]", "", t)
    t = re.sub(r"[^\w\s-]", "", t, flags=re.U)
    return re.sub(r"[\s_]+", "-", t.strip()) or "section"


class Convertisseur:
    def __init__(self, stem, chapitres, erreurs):
        self.stem, self.chapitres, self.erreurs = stem, chapitres, erreurs
        self.ancres = set()
        self.titres = []  # (niveau, id, texte)

    # ---- en ligne ----
    def lien(self, m):
        texte, cible = m.group(1), m.group(2).strip()
        if re.match(r"[a-z]+://|mailto:", cible):
            return '<a href="%s" target="_blank" rel="noopener">%s</a>' % (cible, texte)
        chemin, _, frag = cible.partition("#")
        if not chemin:
            return '<a href="#%s--%s">%s</a>' % (self.stem, frag, texte)
        cible_abs = os.path.normpath(os.path.join(SRC, chemin))
        if chemin.endswith(".md") and os.path.dirname(cible_abs) == SRC:
            autre = os.path.basename(chemin)[:-3]
            self.chapitres.append((self.stem, autre, frag, cible))
            return '<a href="#%s%s">%s</a>' % (autre, "--" + frag if frag else "", texte)
        if not os.path.exists(cible_abs):
            self.erreurs.append("%s : fichier introuvable : %s" % (self.stem, cible))
        return '<a href="%s">%s</a>' % (html.escape(cible, quote=True), texte)

    def en_ligne(self, s):
        codes = []

        def garde(m):
            codes.append("<code>%s</code>" % html.escape(m.group(1)))
            return "\x00%d\x00" % (len(codes) - 1)

        s = re.sub(r"`([^`]+)`", garde, s)
        s = html.escape(s, quote=False)
        s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", self.lien, s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", s)
        return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], s)

    # ---- blocs ----
    def convertir(self, texte):
        lignes = texte.splitlines()
        sortie, i, n = [], 0, len(lignes)
        while i < n:
            l = lignes[i]
            if not l.strip():
                i += 1
            elif l.startswith("```"):
                j = i + 1
                while j < n and not lignes[j].startswith("```"):
                    j += 1
                sortie.append("<pre><code>%s</code></pre>" % html.escape("\n".join(lignes[i + 1:j])))
                i = j + 1
            elif re.match(r"#{1,4} ", l):
                niv = len(l) - len(l.lstrip("#"))
                brut = l[niv:].strip()
                id_ = "%s--%s" % (self.stem, slug(brut))
                while id_ in self.ancres:
                    id_ += "-2"
                self.ancres.add(id_)
                corps = self.en_ligne(brut)
                self.titres.append((niv, id_, re.sub(r"<[^>]+>", "", corps)))
                sortie.append('<h%d id="%s">%s</h%d>' % (niv, id_, corps, niv))
                i += 1
            elif re.match(r"-{3,}\s*$", l):
                sortie.append("<hr>")
                i += 1
            elif l.lstrip().startswith(">"):
                j = i
                while j < n and lignes[j].lstrip().startswith(">"):
                    j += 1
                bloc = [re.sub(r"^\s*> ?", "", x) for x in lignes[i:j]]
                classe = ""
                m = re.match(r"\[!(\w+)\]\s*$", bloc[0])
                if m:
                    classe, bloc = ' class="%s"' % m.group(1).lower(), bloc[1:]
                sortie.append("<blockquote%s>%s</blockquote>" % (classe, self.convertir("\n".join(bloc))))
                i = j
            elif l.lstrip().startswith("|") and i + 1 < n and re.match(r"\s*\|[\s:|-]+\|\s*$", lignes[i + 1]):
                j = i + 2
                while j < n and lignes[j].lstrip().startswith("|"):
                    j += 1
                cases = lambda x: [c.strip() for c in re.sub(r"^\s*\||\|\s*$", "", x).split("|")]
                tete = "".join("<th>%s</th>" % self.en_ligne(c) for c in cases(lignes[i]))
                corps = "".join(
                    "<tr>%s</tr>" % "".join("<td>%s</td>" % self.en_ligne(c) for c in cases(x))
                    for x in lignes[i + 2:j])
                sortie.append('<div class="tab"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (tete, corps))
                i = j
            elif re.match(r"\s*([-*]|\d+\.) ", l):
                j = i
                while j < n and (re.match(r"\s*([-*]|\d+\.) ", lignes[j]) or
                                 (lignes[j].startswith("  ") and lignes[j].strip())):
                    j += 1
                sortie.append(self.liste(lignes[i:j]))
                i = j
            else:
                j = i
                while j < n and lignes[j].strip() and not re.match(r"(#{1,4} |```|\s*>|\s*\||\s*([-*]|\d+\.) )", lignes[j]):
                    j += 1
                if j == i:  # ligne qui ressemble à un début de bloc sans en être un
                    j = i + 1
                sortie.append("<p>%s</p>" % self.en_ligne(" ".join(x.strip() for x in lignes[i:j])))
                i = j
        return "\n".join(sortie)

    def liste(self, lignes):
        base = len(lignes[0]) - len(lignes[0].lstrip())
        ordonnee = bool(re.match(r"\s*\d+\.", lignes[0]))
        items = []
        for l in lignes:
            ind = len(l) - len(l.lstrip())
            m = re.match(r"\s*([-*]|\d+\.) (.*)", l)
            if m and ind <= base:
                items.append([m.group(2)])
            elif items:
                items[-1].append(l)
        rendu = []
        for it in items:
            propre, sous = [it[0]], []
            for l in it[1:]:
                (sous if (re.match(r"\s*([-*]|\d+\.) ", l) or sous) else propre).append(l)
            if sous and not re.match(r"\s*([-*]|\d+\.) ", sous[0]):
                propre, sous = propre + sous, []
            rendu.append("<li>%s%s</li>" % (self.en_ligne(" ".join(x.strip() for x in propre)),
                                           self.liste(sous) if sous else ""))
        t = "ol" if ordonnee else "ul"
        return "<%s>%s</%s>" % (t, "".join(rendu), t)


STYLE = """
:root{--fond:#14161a;--panel:#1c1f25;--bord:#2e333b;--txt:#d9dde3;--dim:#8d95a1;--jaune:#f2c230;--code:#0f1115}
@media(prefers-color-scheme:light){:root{--fond:#fff;--panel:#f4f5f7;--bord:#d5d9df;--txt:#1d2127;--dim:#5b6570;--jaune:#9a6b00;--code:#eef0f3}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:12px}
body{margin:0;background:var(--fond);color:var(--txt);font:15px/1.55 system-ui,sans-serif;display:flex;min-height:100vh}
nav{position:sticky;top:0;align-self:flex-start;width:300px;height:100vh;overflow:auto;background:var(--panel);border-right:1px solid var(--bord);padding:12px 10px;flex:none}
nav input{width:100%;padding:7px 9px;border-radius:6px;border:1px solid var(--bord);background:var(--code);color:var(--txt);font:inherit;margin-bottom:8px}
nav a{display:block;color:var(--txt);text-decoration:none;padding:2px 6px;border-radius:4px;font-size:13px}
nav a:hover{background:var(--code)}nav a.c{font-weight:700;margin-top:8px}nav a.s{padding-left:18px;color:var(--dim)}
nav .acc{font-size:12px;margin-bottom:6px}
main{flex:1;min-width:0;max-width:980px;padding:20px 32px 80px;margin:0 auto}
h1{border-bottom:2px solid var(--jaune);padding-bottom:6px;margin-top:2.2em}h1:first-child{margin-top:0}
h2{margin-top:1.8em;border-bottom:1px solid var(--bord);padding-bottom:3px}h3{margin-top:1.4em}h4{color:var(--dim)}
a{color:var(--jaune)}code{background:var(--code);padding:1px 5px;border-radius:4px;font:13px ui-monospace,monospace}
pre{background:var(--code);padding:10px 12px;border-radius:6px;overflow:auto}pre code{padding:0;background:none}
.tab{overflow-x:auto}table{border-collapse:collapse;margin:.8em 0;font-size:14px}
th,td{border:1px solid var(--bord);padding:5px 9px;text-align:left;vertical-align:top}th{background:var(--panel)}
blockquote{margin:1em 0;padding:2px 14px;border-left:4px solid var(--jaune);background:var(--panel)}
blockquote.warning,blockquote.caution,blockquote.important{border-color:#e5534b}
hr{border:0;border-top:1px solid var(--bord)}mark{background:var(--jaune);color:#000}
.cache{display:none}#vide{display:none;color:var(--dim)}
@media(max-width:800px){body{display:block}nav{position:static;width:auto;height:auto;max-height:40vh}main{padding:14px}}
@media print{nav{display:none}main{max-width:none}}
"""

SCRIPT = """
(function(){
 var q=document.getElementById('q'),secs=[].slice.call(document.querySelectorAll('main section')),
     liens=[].slice.call(document.querySelectorAll('nav a[data-s]')),vide=document.getElementById('vide');
 function norme(s){return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');}
 secs.forEach(function(s){s._t=norme(s.textContent);});
 q.addEventListener('input',function(){
  var mots=norme(q.value).split(/\\s+/).filter(Boolean),reste=0;
  secs.forEach(function(s){var ok=mots.every(function(m){return s._t.indexOf(m)>=0;});
   s.classList.toggle('cache',!ok);if(ok)reste++;});
  liens.forEach(function(a){var s=document.getElementById(a.dataset.s);a.classList.toggle('cache',s.classList.contains('cache'));});
  vide.style.display=reste?'none':'block';
 });
})();
"""


def main():
    fichiers = sorted(f for f in os.listdir(SRC) if f.endswith(".md"))
    fichiers.sort(key=lambda f: (f != "index.md", f))
    chapitres, erreurs, corps, nav = [], [], [], []
    ancres = {}
    for f in fichiers:
        stem = f[:-3]
        with io.open(os.path.join(SRC, f), encoding="utf-8") as fh:
            texte = fh.read()
        cv = Convertisseur(stem, chapitres, erreurs)
        morceaux = re.split(r"(?m)^(?=#{1,2} )", texte)  # une section par titre de niveau 1 ou 2
        for k, morceau in enumerate(m for m in morceaux if m.strip()):
            cv.titres = []
            sec = "s-%s-%d" % (stem, k)
            corps.append('<section id="%s">%s</section>' % (sec, cv.convertir(morceau)))
            for niv, id_, titre in cv.titres:
                if niv <= 2:
                    nav.append('<a class="%s" href="#%s" data-s="%s">%s</a>'
                               % ("c" if niv == 1 else "s", id_, sec, titre))
        ancres[stem] = cv.ancres
    html_corps = "\n".join(corps)
    for src, stem, frag, brut in chapitres:
        if stem not in ancres:
            erreurs.append("%s : chapitre introuvable : %s" % (src, brut))
        elif frag and "%s--%s" % (stem, frag) not in ancres[stem]:
            erreurs.append("%s : ancre introuvable : %s" % (src, brut))
    if erreurs:
        print("%d lien(s) cassé(s) :" % len(erreurs))
        print("\n".join("  " + e for e in sorted(set(erreurs))))
        return 1
    page = ('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Manuel WEB_CAO</title><style>%s</style></head><body>'
            '<nav><a class="acc" href="../../index.html">← Accueil WEB_CAO</a>'
            '<input id="q" type="search" placeholder="Rechercher dans le manuel…" autocomplete="off">%s</nav>'
            '<main>%s<p id="vide">Aucun passage ne contient tous ces mots.</p></main><script>%s</script></body></html>'
            % (STYLE, "\n".join(nav), html_corps, SCRIPT))
    with io.open(SORTIE, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    print("%d chapitre(s), %d section(s) -> %s" % (len(fichiers), len(corps), os.path.relpath(SORTIE, RACINE)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
