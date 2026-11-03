"""Banc du synoptique : charge chaque schématique de PROJETS/CAO dans l'éditeur (Chromium sans
écran), applique Ranger et imprime une ligne de bilan par projet : blocs, liaisons, alims,
liaisons non routées (traits directs), blocs sans titre deviné, blocs isolés.

    python3 editeur-schematique/test/banc-synoptique.py [--captures]

Prérequis : dist/ régénéré (outils/build-monofichier.py) et la commande chromium.
--captures : une capture PNG par projet dans le dossier de travail affiché à la fin."""
import glob, html, os, re, subprocess, sys, tempfile
ICI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ICI, "..", "dist", "editeur-schematique.html")
PROJETS = os.path.join(ICI, "..", "..", "..", "PROJETS", "CAO")
OUT = tempfile.mkdtemp(prefix="banc-synoptique-")
JS = r'''window.addEventListener("load",()=>setTimeout(()=>{
let r;
try{
  loadDoc(%s); gotoPage(0); arrangeSheetBlocks();
  const R=sheetRoutes(), B=sheetBlocks(), L=sheetLinks(), lie=new Set(L.flatMap(l=>[l.a,l.b]));
  r={blocs:B.length, liens:L.length, alims:L.filter(l=>l.isPower).length, direct:R.filter(r=>r.direct).length,
     sansTitre:B.filter(b=>b.name===b.key).map(b=>b.key), isoles:B.filter(b=>!lie.has(b.key)).map(b=>b.key),
     centre:(B.find(b=>b.big)||{}).key||"-"};
}catch(e){r={erreur:String(e&&e.stack||e).slice(0,300)};}
const pre=document.createElement("pre");pre.id="OUT";pre.textContent=JSON.stringify(r);document.body.appendChild(pre);
},300));'''

def chromium(args):
    return subprocess.run(["timeout", "180", "chromium", "--headless", "--no-sandbox", "--disable-gpu",
        "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1700,1000",
        "--virtual-time-budget=60000"] + args, capture_output=True, text=True).stdout

if not os.path.exists(DIST):
    sys.exit("dist/editeur-schematique.html absent : lancer outils/build-monofichier.py")
page_src = open(DIST, encoding="utf-8").read()
fichiers = sorted(glob.glob(os.path.join(PROJETS, "*", "*-SCH.json")))
if not fichiers:
    sys.exit("aucune schématique dans " + os.path.abspath(PROJETS))
ko = 0
for f in fichiers:
    nom = re.sub(r"\W+", "_", os.path.basename(os.path.dirname(f)))
    open(os.path.join(OUT, nom + ".js"), "w", encoding="utf-8").write(JS % open(f, encoding="utf-8").read())
    page = os.path.join(OUT, nom + ".html")
    open(page, "w", encoding="utf-8").write(page_src.replace("</body>", f'<script src="{nom}.js"></script></body>'))
    m = re.search(r'<pre id="OUT">(.*?)</pre>', chromium(["--dump-dom", "file://" + page]), re.S)
    bilan = html.unescape(m.group(1)) if m else '{"erreur":"pas de bilan (délai ou plantage)"}'
    ko += '"erreur"' in bilan or '"direct":0' not in bilan
    print(f"{nom[:22]:22s} {bilan[:300]}")
    if "--captures" in sys.argv:
        chromium([f"--screenshot={os.path.join(OUT, nom + '.png')}", "file://" + page])
print(f"\n{len(fichiers)} projets, {ko} avec erreur ou liaison non routée. Fichiers : {OUT}")
sys.exit(1 if ko else 0)
