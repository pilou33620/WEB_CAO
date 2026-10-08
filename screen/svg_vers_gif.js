// Convertit une animation SVG du dossier screen/ en GIF, pour les endroits qui
// n'affichent pas les SVG animés (messagerie, réseaux, diaporama).
//
//   node screen/svg_vers_gif.js screen/pcb-4-couches.svg screen/pcb-4-couches.gif
//
// Outil facultatif, hors de la suite : il demande Node, Playwright (Chromium)
// et ffmpeg. Chaque image est prise en arrêtant les animations CSS du SVG à
// l'instant voulu, puis ffmpeg assemble le GIF avec une palette calculée sur
// l'ensemble des images.
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(execFileSync("npm", ["root", "-g"]).toString().trim(), "playwright"))); }

const [src, dst, fpsArg] = process.argv.slice(2);
if (!src || !dst) {
  console.error("usage : node svg_vers_gif.js entree.svg sortie.gif [images/s]");
  process.exit(1);
}
const FPS = +fpsArg || 12;
const DUREE = 10;                       // durée d'une boucle des animations, en s

(async () => {
  const svg = fs.readFileSync(src, "utf8");
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svg-gif-"));
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: w, height: h } });
  await page.goto("file://" + path.resolve(src));
  const n = Math.round(DUREE * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }),
                        i * 1000 / FPS);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, "0")}.png`) });
  }
  await nav.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS),
    "-i", path.join(dir, "f%04d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none",
    "-loop", "0", dst]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${dst} : ${n} images, ${(fs.statSync(dst).size / 1e6).toFixed(2)} Mo`);
})();
