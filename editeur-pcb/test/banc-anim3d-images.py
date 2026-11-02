#!/usr/bin/env python3
"""Images de l'animation 3D, prises dans Chromium sans fenêtre.

    python3 outils/build-monofichier.py && node test/harness.js
    python3 test/banc-anim3d-images.py [page.html] [instants en s…]

Le banc d'essai écrit la page de la carte d'exemple dans dist/essai-anim3d/ ;
ici, chaque instant est figé (la boucle de la page remplacée par un seul rendu)
et photographié en 1280 × 720. Bilan court : une ligne par image (part de
pixels non noirs, erreurs JavaScript), les PNG à côté de la page.
"""
import json, pathlib, re, subprocess, sys, tempfile
from PIL import Image

ICI = pathlib.Path(__file__).resolve().parent.parent / "dist" / "essai-anim3d"
PAGE = ICI / "carte-ASSEMBLAGE-3D.html"
BOUCLE = re.compile(r"\(function boucle\(now\)\{.*?\}\)\(t0\);")


def image(html, t, png):
    fige = BOUCLE.sub(lambda _: "(function boucle(){A.rendre(%s);requestAnimationFrame(boucle);})();" % t, html, count=1)
    if fige == html:
        return "boucle introuvable dans la page"
    with tempfile.TemporaryDirectory() as d:
        f = pathlib.Path(d) / "p.html"
        f.write_text(fige + "<script>addEventListener('error',e=>console.error('ERREUR '+e.message))</script>",
                     encoding="utf-8")
        r = subprocess.run(["chromium", "--headless", "--no-sandbox", "--hide-scrollbars",
                            "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
                            "--enable-logging=stderr", "--v=0", "--window-size=1280,720",
                            "--virtual-time-budget=4000", "--screenshot=" + str(png), f.as_uri()],
                           capture_output=True, text=True, timeout=180)
    err = [l for l in r.stderr.splitlines() if "CONSOLE" in l and ("ERREUR" in l or "Error" in l)]
    return "; ".join(e.split("\"")[1] if "\"" in e else e for e in err[:3])


def main():
    args = sys.argv[1:]
    page = pathlib.Path(args.pop(0)) if args and args[0].endswith(".html") else PAGE   # une autre page (visionneuse…)
    if not page.exists():
        sys.exit("page absente : lancer d'abord node test/harness.js")
    html = page.read_text(encoding="utf-8")
    J = json.loads(re.search(r"const J=(\{.*?\});\n", html, re.S).group(1))
    V = J.get("vedettes", [])
    print("composants présentés :", ", ".join(v["ref"] + " " + v["nom"] for v in V) or "aucun")
    # shortcut: les instants de anim3dLancer recopiés (pose des composants, gros plans de 3,4 s) ; à revoir s'ils changent
    C = J["composants"]; nD = sum(1 for c in C if not c["face"]); nB = len(C) - nD
    pas = min(0.35, max(0.04, 7 / max(1, len(C)))); t0B = 6 + nD * pas + (1.4 if nB else 0)
    pose = (t0B + nB * pas if nB else 6 + nD * pas) + 0.9
    tour = pose + len(V) * 3.4 + 1.2 if V else pose
    defaut = [3, pose - 0.5] + [pose + i * 3.4 + 2.2 for i in range(min(2, len(V)))] + [tour + 3]
    instants = [float(a) for a in args] or [round(t, 1) for t in defaut]
    ok = True
    for t in instants:
        png = page.parent / ("%s-%05.1fs.png" % (page.stem, t))
        png.unlink(missing_ok=True)
        err = image(html, t, png)
        if not png.exists():
            print("t=%5.1f s  PAS D'IMAGE %s" % (t, err)); ok = False; continue
        im = Image.open(png).convert("L")
        clair = sum(1 for p in im.getdata() if p > 20) / (im.width * im.height)
        print("t=%5.1f s  %4.1f %% non noir%s" % (t, 100 * clair, ("  ERREUR " + err) if err else ""))
        ok = ok and not err and clair > 0.02
    print("bilan :", "ok" if ok else "ÉCHEC", "— images dans", page.parent)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
