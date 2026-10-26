#!/usr/bin/env node
/* =============================================================================
   Modèles 3D de la LIB : maillages légers et placement sur l'empreinte
   -----------------------------------------------------------------------------
     npm install occt-import-js        (une fois, à côté de ce script ou au-dessus)
     node python/maillages_3d.mjs <dossier LIB> [--recalculer]

   1. Chaque STEP de <LIB>/Models devient <LIB>/Models/maillages/<fichier>.json :
      triangles regroupés par couleur, coordonnées entières en µm. C'est ce que
      l'animation 3D du dossier de fabrication (editeur-pcb/js/41-animation-3d.js)
      charge par /api/lib/fichier?type=modele3d : le navigateur ne lit pas le STEP.
      Un maillage plus récent que son STEP n'est pas refait.
   2. Chaque ligne de LIB_composants.csv qui a un « Modèle 3D » reçoit sa
      « Position 3D » : comment poser le modèle sur son empreinte, qu'il ait été
      dessiné Z ou Y vers le haut, centré ou non. Le calcul essaie les 24
      orientations et garde celle dont les points d'appui (le bas du modèle)
      tombent sur les pastilles, aux dimensions du corps et à la hauteur de la
      LIB. Une position déjà écrite n'est jamais remplacée (sauf --recalculer) :
      la corriger à la main dans la LIB suffit.
   3. Une « Maximun Height » vide reçoit la hauteur du modèle posé.

   Position 3D : « haut=Y+ rot=90 x=0.125 y=-0.3 z=0 ». Dans le repère de
   l'empreinte, Y vers le haut (l'inverse du JSON de l'empreinte), Z hors de la
   carte : l'axe du modèle qui monte, puis une rotation autour de Z (degrés,
   sens trigonométrique), puis une translation en mm.
   ============================================================================= */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

/* l'axe du modèle qui devient Z, et le repère direct qui va avec : [u, v, w] = f(x, y, z) */
export const HAUTS = {
  "Z+": ([x, y, z]) => [x, y, z],
  "Z-": ([x, y, z]) => [x, -y, -z],
  "Y+": ([x, y, z]) => [x, -z, y],
  "Y-": ([x, y, z]) => [x, z, -y],
  "X+": ([x, y, z]) => [y, z, x],
  "X-": ([x, y, z]) => [y, -z, -x],
};
const ROTS = [0, 90, 180, 270];

export function lirePosition(s) {
  const o = {};
  for (const m of String(s || "").matchAll(/(haut|rot|x|y|z)\s*=\s*([^\s;]+)/gi)) o[m[1].toLowerCase()] = m[2];
  if (!(o.haut in HAUTS)) return null;
  const n = k => (Number.isFinite(+o[k]) ? +o[k] : 0);
  return { haut: o.haut, rot: n("rot"), x: n("x"), y: n("y"), z: n("z") };
}
const r3 = v => Math.round(v * 1000) / 1000 + 0;
export const ecrirePosition = p => `haut=${p.haut} rot=${p.rot} x=${r3(p.x)} y=${r3(p.y)} z=${r3(p.z)}`;

/* ---------- 1. STEP -> maillage ---------- */
function hex(c) {
  return c ? "#" + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("") : null;
}
export function maillage(occt, octets, source) {
  let r = null;
  for (const d of [0.002, 0.006, 0.02]) {      // plus grossier tant que c'est trop lourd pour la page HTML
    r = occt.ReadStepFile(octets, { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio",
                                    linearDeflection: d, angularDeflection: 0.5 });
    if (!r.success) throw new Error("STEP illisible");
    if (r.meshes.reduce((s, m) => s + m.index.array.length / 3, 0) <= 40000) break;
  }
  const groupes = new Map(), bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const m of r.meshes) {
    const P = m.attributes.position.array, I = m.index.array;
    const faces = m.brep_faces && m.brep_faces.length ? m.brep_faces : [{ first: 0, last: I.length / 3 - 1, color: null }];
    for (const f of faces) {
      const c = hex(f.color || m.color);
      if (!groupes.has(c)) groupes.set(c, { c, p: [], i: [], vu: new Map() });
      const g = groupes.get(c);
      for (let t = f.first; t <= f.last; t++)
        for (let k = 0; k < 3; k++) {
          const a = I[3 * t + k];
          if (!g.vu.has(a)) {
            g.vu.set(a, g.p.length / 3);
            for (let j = 0; j < 3; j++) {
              const v = P[3 * a + j];
              g.p.push(Math.round(v * 1000));
              bb[j] = Math.min(bb[j], v); bb[j + 3] = Math.max(bb[j + 3], v);
            }
          }
          g.i.push(g.vu.get(a));
        }
    }
    for (const g of groupes.values()) g.vu = new Map();   // indices propres à chaque maillage occt
  }
  return { format: "maillage3d-1", source, u: 0.001, bb: bb.map(r3),
           g: [...groupes.values()].filter(g => g.i.length).map(({ c, p, i }) => ({ c, p, i })) };
}

/* ---------- 2. placement sur l'empreinte ---------- */
/* Les pastilles, repère Y vers le haut, en grille (pas de 0,05 mm) pour tester
   vite si un point d'appui tombe dessus. */
function grillePastilles(fp) {
  const rects = [];
  for (const p of fp.pads || []) {
    const a = ((p.rot || 0) * Math.PI) / 180, w = +p.w || +p.drill || 0, h = +p.h || +p.drill || 0;
    const L = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), H = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    const m = Math.max(0.15, 0.2 * Math.min(L, H));
    rects.push([+p.x - L / 2 - m, -p.y - H / 2 - m, +p.x + L / 2 + m, -p.y + H / 2 + m]);
  }
  if (!rects.length) return null;
  const pas = 0.05, B = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rects) { B[0] = Math.min(B[0], r[0]); B[1] = Math.min(B[1], r[1]); B[2] = Math.max(B[2], r[2]); B[3] = Math.max(B[3], r[3]); }
  const nx = Math.ceil((B[2] - B[0]) / pas) + 1, ny = Math.ceil((B[3] - B[1]) / pas) + 1;
  const g = new Uint16Array(nx * ny);       // le numéro de la pastille + 1, 0 hors pastille
  for (const [k, r] of rects.entries())
    for (let j = Math.floor((r[1] - B[1]) / pas); j <= Math.ceil((r[3] - B[1]) / pas) && j < ny; j++)
      for (let i = Math.floor((r[0] - B[0]) / pas); i <= Math.ceil((r[2] - B[0]) / pas) && i < nx; i++) g[j * nx + i] = k + 1;
  /* centre de l'ensemble des pastilles */
  const c = [(B[0] + B[2]) / 2, (B[1] + B[3]) / 2];
  return { c, n: rects.length,
           sous: (x, y) => { const i = Math.round((x - B[0]) / pas), j = Math.round((y - B[1]) / pas);
                             return i >= 0 && j >= 0 && i < nx && j < ny ? g[j * nx + i] : 0; } };
}

/* `M` : {pts, tri} du modèle (mm, son repère ; tri : indices de sommets par
   trois) ; `fp` : l'empreinte LIB (JSON pcbfp-1) ou null ; `h` : la hauteur de
   la LIB ou null. Rend la position et la hauteur du modèle posé. */
export function placer(M, fp, h) {
  const pads = fp ? grillePastilles(fp) : null;
  const tht = !!(fp && (fp.pads || []).some(p => +p.drill > 0));
  const b = fp && fp.body ? fp.body : null;
  const corps = b ? [Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1), (b.x1 + b.x2) / 2, -(b.y1 + b.y2) / 2] : null;
  const T = M.tri, aireTri = t => {
    const [A, B, C] = [M.pts[T[t]], M.pts[T[t + 1]], M.pts[T[t + 2]]];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  };
  let aireTot = 0;
  for (let t = 0; t < T.length; t += 3) aireTot += aireTri(t);
  let best = null;
  for (const haut of Object.keys(HAUTS)) {
    const Q = M.pts.map(HAUTS[haut]);
    for (const rot of ROTS) {
      const a = (rot * Math.PI) / 180, ca = Math.round(Math.cos(a)), sa = Math.round(Math.sin(a));
      const R = Q.map(([u, v, w]) => [u * ca - v * sa, u * sa + v * ca, w]);
      let x1 = Infinity, y1 = Infinity, z1 = Infinity, x2 = -Infinity, y2 = -Infinity, z2 = -Infinity;
      for (const [u, v, w] of R) { x1 = Math.min(x1, u); x2 = Math.max(x2, u); y1 = Math.min(y1, v); y2 = Math.max(y2, v); z1 = Math.min(z1, w); z2 = Math.max(z2, w); }
      /* le plan de pose : le bas du modèle ; un traversant a ses broches dessous,
         on le pose alors à sa hauteur LIB, ou sur son origine si elle est dans la pièce */
      const assises = [z1];
      if (tht && h != null && z2 - h > z1 + 0.2) assises.push(z2 - h);
      if (tht && z1 < -0.2 && z2 > 0.2) assises.push(0);
      for (const z0 of assises) {
        /* l'appui : les faces posées sur la carte (ou les broches dessous),
           pesées par leur aire -- un arrondi a beaucoup de sommets, un méplat peu */
        const sous = tht && z0 > z1 + 0.2;
        const appui = [];
        let ax1 = Infinity, ay1 = Infinity, ax2 = -Infinity, ay2 = -Infinity;
        for (let t = 0; t < T.length; t += 3) {
          const A = R[T[t]], B = R[T[t + 1]], C = R[T[t + 2]], wm = Math.max(A[2], B[2], C[2]);
          if (sous ? wm >= z0 - 0.3 : wm > z0 + 0.15) continue;
          const aire = aireTri(t);           // une rotation garde les aires
          if (!(aire > 0)) continue;
          appui.push([(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, aire]);
          for (const P of [A, B, C]) { ax1 = Math.min(ax1, P[0]); ax2 = Math.max(ax2, P[0]); ay1 = Math.min(ay1, P[1]); ay2 = Math.max(ay2, P[1]); }
        }
        /* sous la carte, un traversant n'a que ses broches : pas le quart de sa surface */
        if (sous && appui.reduce((a, q) => a + q[2], 0) > 0.25 * aireTot) continue;
        /* trois recalages : l'appui centré sur les pastilles, la boîte sur le corps,
           l'origine du modèle ; on garde celui qui pose le mieux sur les pastilles
           (un DPAK n'appuie que sur ses broches, son appui n'est pas centré) */
        const cible = pads ? pads.c : corps ? [corps[2], corps[3]] : [0, 0];
        const boite = corps ? [corps[2] - (x1 + x2) / 2, corps[3] - (y1 + y2) / 2] : [cible[0] - (x1 + x2) / 2, cible[1] - (y1 + y2) / 2];
        const essais = pads && appui.length ? [[cible[0] - (ax1 + ax2) / 2, cible[1] - (ay1 + ay2) / 2], boite, [0, 0]] : [boite];
        const pose = ([dx, dy]) => {
          if (!pads || !appui.length) return 0;
          /* l'aire d'appui posée sur les pastilles, et les pastilles qui portent quelque chose */
          let tot = 0, sur = 0;
          const touchees = new Set();
          for (const [u, v, aire] of appui) {
            const k = pads.sous(u + dx, v + dy);
            tot += aire;
            if (k) { sur += aire; touchees.add(k); }
          }
          return sur / tot + touchees.size / pads.n;
        };
        let [dx, dy] = essais[0], s = pose(essais[0]);
        for (const e of essais.slice(1)) { const q = pose(e); if (q > s + 0.05) { s = q; [dx, dy] = e; } }
        const appuye = pads && appui.length ? Math.min(1, s) : 1;   // posé à l'envers, l'origine ne prouve plus rien
        if (corps && corps[0] > 0 && corps[1] > 0)
          s -= 0.8 * Math.min(1, (Math.abs(x2 - x1 - corps[0]) + Math.abs(y2 - y1 - corps[1])) / (corps[0] + corps[1]));
        if (h != null && h > 0) s -= Math.min(1, Math.max(0, Math.abs(z2 - z0 - h) / Math.max(h, 0.5) - 0.25));   // la LIB donne un maximum, pas la cote exacte
        /* un modèle prêt pour la CAO a déjà son origine au centre de l'empreinte et sur le plan de pose */
        const pret = Math.abs(z0) < 0.5 && Math.hypot(...essais[0]) < 0.15 * Math.max(x2 - x1, y2 - y1, 0.5);
        if (Math.abs(z0) < 0.5) s += (pret ? 0.9 : 0.3) * appuye;
        if (haut !== "Z+") s -= 0.04;                // à égalité : la convention CAO (Z vers le haut, sans rotation)
        if (rot) s -= pret ? 0.3 : 0.02;             // un modèle prêt pour la CAO est aussi dans le bon sens
        if (!best || s > best.s + 1e-9)
          best = { s, pos: { haut, rot, x: dx, y: dy, z: -z0 }, h: z2 - z0 };
      }
    }
  }
  return best;
}

/* ---------- le CSV de la LIB : on ne touche qu'à nos colonnes ---------- */
function champs(l) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const cellule = v => (/[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/* au plus `n` triangles, pris à intervalle régulier : le placement n'a pas besoin des détails */
export function echantillon(m, n) {
  const tous = [];
  for (const g of m.g) for (let k = 0; k < g.i.length; k += 3) tous.push([g, k]);
  const pas = Math.max(1, tous.length / n), pts = [], tri = [];
  for (let j = 0; j < tous.length; j += pas) {
    const [g, k] = tous[Math.floor(j)];
    for (let q = 0; q < 3; q++) { const i = 3 * g.i[k + q]; tri.push(pts.length); pts.push([g.p[i] * m.u, g.p[i + 1] * m.u, g.p[i + 2] * m.u]); }
  }
  return { pts, tri };
}

async function principal() {
  const args = process.argv.slice(2), lib = args.find(a => !a.startsWith("--")), forcer = args.includes("--recalculer");
  if (!lib || !fs.existsSync(path.join(lib, "LIB_composants.csv"))) {
    console.error("usage : node python/maillages_3d.mjs <dossier LIB> [--recalculer]");
    process.exit(2);
  }
  const occt = await createRequire(import.meta.url)("occt-import-js")();
  const dirM = path.join(lib, "Models"), dirJ = path.join(dirM, "maillages");
  fs.mkdirSync(dirJ, { recursive: true });
  const maillages = new Map(), echecs = [];
  for (const f of fs.readdirSync(dirM).filter(f => /\.(stp|step)$/i.test(f)).sort()) {
    const src = path.join(dirM, f), dst = path.join(dirJ, f + ".json");
    if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    try {
      fs.writeFileSync(dst, JSON.stringify(maillage(occt, new Uint8Array(fs.readFileSync(src)), f)));
      process.stdout.write(".");
    } catch (e) { echecs.push(f + " : " + e.message); }
  }
  console.log("");

  const csvF = path.join(lib, "LIB_composants.csv"), lignes = fs.readFileSync(csvF, "utf8").split("\n");
  const tete = champs(lignes[0]);
  const col = n => tete.indexOf(n);
  const ajout = col("Position 3D") < 0;
  if (ajout) { tete.push("Position 3D"); lignes[0] += ";Position 3D"; }
  const iM = col("Modèle 3D"), iP = col("Position 3D"), iH = col("Maximun Height"), iE = col("Empreinte PCB");
  if (iM < 0) throw new Error("colonne « Modèle 3D » absente");
  let poses = 0, hauteurs = 0;
  for (let n = 1; n < lignes.length; n++) {
    if (!lignes[n].trim()) continue;
    const c = champs(lignes[n]), avant = c.join("\u0000");
    while (c.length < tete.length) c.push("");
    const mod = c[iM].replace(/^Models\//, "");
    const hLib = /^\d/.test(c[iH] || "") && +c[iH] > 0 ? +c[iH] : null;
    if (mod && (forcer || !lirePosition(c[iP]) || (iH >= 0 && hLib == null))) {
      const fj = path.join(dirJ, mod + ".json");
      if (!maillages.has(mod)) maillages.set(mod, fs.existsSync(fj) ? echantillon(JSON.parse(fs.readFileSync(fj, "utf8")), 8000) : null);
      const M = maillages.get(mod);
      const fpF = c[iE] ? path.join(lib, "lib_empreinte_pcb", path.basename(c[iE])) : "";
      const fp = fpF && fs.existsSync(fpF) ? JSON.parse(fs.readFileSync(fpF, "utf8")) : null;
      if (M && M.tri.length) {
        const P = placer(M, fp, hLib);
        if (forcer || !lirePosition(c[iP])) { c[iP] = ecrirePosition(P.pos); poses++; }
        if (iH >= 0 && hLib == null && !/^0(\.0*)?$/.test(c[iH])) { c[iH] = (Math.round(P.h * 100) / 100).toFixed(5); hauteurs++; }
      }
    }
    /* une ligne inchangée reste octet pour octet (guillemets compris) */
    if (c.join("\u0000") !== avant + (ajout ? "\u0000" : "")) lignes[n] = c.map(cellule).join(";");
    else if (ajout) lignes[n] += ";";
  }
  fs.writeFileSync(csvF, lignes.join("\n"));
  console.log(`${fs.readdirSync(dirJ).length} maillages, ${poses} position(s) 3D calculée(s), ${hauteurs} hauteur(s) remplie(s).`);
  for (const e of echecs) console.log("ÉCHEC " + e);
}

if (import.meta.url === "file://" + path.resolve(process.argv[1] || "")) principal();
