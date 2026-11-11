"use strict";
/* =============================================================================
   commun/test/banc-kicad-pcb.js
   Banc de commun/kicad-pcb.js (carte KiCad ⇄ document pcbedit-1) :
   1. une petite carte écrite à la main (KiCad 9 et nets à la KiCad 10) → valeurs
      attendues de l'éditeur, pastilles au monde comprises ;
   2. chaque .kicad_pcb des démos KiCad : lecture, pastilles au monde KiCad =
      éditeur, puis écriture → relecture (composants, pastilles, nets, pistes,
      vias, aire du contour) ;
   3. normDoc et padsWorldCalc de l'éditeur (dist/pcb.js, s'il est construit) ;
   4. kicad-cli pcb drc sur la carte écrite, s'il est installé.
   node commun/test/banc-kicad-pcb.js [dossier-des-démos]   → n'imprime qu'un bilan
   ============================================================================= */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const RACINE = path.join(__dirname, "..", "..");
let total = 0;
function verifier(cond, message) {
  total++;
  if (!cond) { console.error("ÉCHEC : " + message); process.exit(1); }
}
const bac = { console, TextEncoder, TextDecoder, Blob, DecompressionStream };
vm.createContext(bac);
for (const f of ["commun/zip.js", "commun/composants-lib.js", "commun/kicad.js", "commun/kicad-pcb.js"])
  vm.runInContext(fs.readFileSync(path.join(RACINE, f), "utf8"), bac, { filename: f });
const K = vm.runInContext("KICAD", bac), P = vm.runInContext("KICAD_PCB", bac);

/* éditeur (facultatif) : normDoc et le vrai calcul des pastilles au monde */
let PCB = null;
const bundle = path.join(RACINE, "editeur-pcb", "dist", "pcb.js");
if (fs.existsSync(bundle)) {
  try {
    require(path.join(RACINE, "commun", "test", "dom-stub.js")).install({ panels: { props: "Propriétés" }, canvasId: "board" });
    global.BroadcastChannel = function () {};
    global.BroadcastChannel.prototype.postMessage = global.BroadcastChannel.prototype.close = function () {};
    (0, eval)(fs.readFileSync(bundle, "utf8").replace(/^"use strict";/, "") + "\nglobalThis.__pcb={normDoc,padsWorldCalc,fpDessinsMonde};");
    PCB = global.__pcb;
  } catch (e) { PCB = null; }
}

/* ---------- formules de référence ---------- */
const rk = (x, y, a) => { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [x * c + y * s, -x * s + y * c]; };
// fpXform (01-core.js) : miroir en X dessous, puis rotation horaire
const mondeOutil = (fp, x, y) => { const a = fp.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), m = fp.side ? -1 : 1;
  return [fp.x + m * x * c - y * s, fp.y + m * x * s + y * c]; };
const enf = (l, n) => l.find(e => Array.isArray(e) && e[0] === n);
const enfs = (l, n) => l.filter(e => Array.isArray(e) && e[0] === n);
/* pastilles de cuivre au monde selon KiCad, empreinte par empreinte (celles sans cuivre sautées) */
function padsKicad(arbre) {
  const out = [];
  for (const f of enfs(arbre, "footprint")) {
    const at = enf(f, "at"), X = +at[1], Y = +at[2], A = +(at[3] || 0);
    const l = [];
    for (const p of enfs(f, "pad")) {
      const ls = (enf(p, "layers") || []).slice(1);
      if (p[2] === "np_thru_hole" || !ls.some(c => /Cu$/.test(c))) continue;
      const a = enf(p, "at"), [u, v] = rk(+a[1], +a[2], A), P0 = +(a[3] || 0);
      const prim = enf(p, "primitives"), poly = prim && enf(prim, "gr_poly");
      const sommets = p[3] === "custom" && poly && prim.slice(1).filter(Array.isArray).length === 1 ? enf(poly, "pts").slice(1).map(c => { const [du, dv] = rk(+c[1], +c[2], P0); return [X + u + du, Y + v + dv]; }) : null;
      l.push({ x: X + u, y: Y + v, P: P0, sommets });
    }
    if (l.length) out.push(l);
  }
  return out;
}
const proche = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
const aire = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += P[j].x * P[i].y - P[i].x * P[j].y; return Math.abs(s / 2); };
const aireCarte = d => aire(d.board.pts) - (d.board.cutouts || []).reduce((s, c) => s + aire(c), 0);

/* chaque pastille de l'éditeur au monde = KiCad (position, angle modulo 180°, sommets d'un polygone) */
function comparerMonde(arbre, doc, quoi) {
  const ref = padsKicad(arbre), aCuivre = l => l.filter(f => f.pads.length);    // sans cuivre : rien à comparer
  verifier(ref.length === aCuivre(doc.fps).length, quoi + " : autant d'empreintes à cuivre (" + ref.length + " / " + aCuivre(doc.fps).length + ")");
  aCuivre(doc.fps).forEach((fp, i) => {
    verifier(ref[i].length === fp.pads.length, quoi + " " + fp.ref + " : nombre de pastilles");
    fp.pads.forEach((q, j) => {
      const k = ref[i][j], [x, y] = mondeOutil(fp, q.x, q.y);
      verifier(proche(x, k.x) && proche(y, k.y), quoi + " " + fp.ref + " pastille " + j + " : (" + x + ", " + y + ") ≠ KiCad (" + k.x + ", " + k.y + ")");
      const rotMonde = fp.rot + (fp.side ? -1 : 1) * q.rot;               // horaire, degrés
      const quart = q.slot && q.w === q.h ? 90 : 180;                      // fente en travers d'une pastille ronde ou carrée : un quart de tour la couche
      verifier(proche((((rotMonde + k.P) % quart) + quart) % quart, 0, 2e-3) || proche((((rotMonde + k.P) % quart) + quart) % quart, quart, 2e-3),
               quoi + " " + fp.ref + " pastille " + j + " : angle " + rotMonde + " ≠ −" + k.P);
      if (q.shape === "poly" && k.sommets) {
        const a = rotMonde * Math.PI / 180, m = fp.side ? -1 : 1;
        q.pts.forEach((p, s) => {
          const X = x + m * p.x * Math.cos(a) - p.y * Math.sin(a), Y = y + m * p.x * Math.sin(a) + p.y * Math.cos(a);
          verifier(proche(X, k.sommets[s][0]) && proche(Y, k.sommets[s][1]), quoi + " " + fp.ref + " polygone, sommet " + s);
        });
      }
    });
  });
  /* chaque fp_line de sérigraphie, Fab, Courtyard ou User d'une empreinte (avec ou sans cuivre) : au monde KiCad = dessin de l'éditeur, même couche */
  const COUCHE = { "F.SilkS": "silkT", "B.SilkS": "silkB", "F.Fab": "fabT", "B.Fab": "fabB", "F.CrtYd": "crtT", "B.CrtYd": "crtB", "Dwgs.User": "dwgs", "Cmts.User": "cmts" };
  const autre = l => /^(silk|fab|crt)[TB]$/.test(l) ? l.slice(0, -1) + (l.endsWith("B") ? "T" : "B") : l;
  const fpsK = enfs(arbre, "footprint");
  verifier(fpsK.length === doc.fps.length, quoi + " : une empreinte de l'éditeur par empreinte KiCad");
  const nf = PCB ? PCB.normDoc(JSON.parse(JSON.stringify(doc))).fps : null;
  let traits = 0;
  doc.fps.forEach((fp, i) => {
    const at = enf(fpsK[i], "at"), X = +at[1], Y = +at[2], A = +(at[3] || 0);
    const lignes = (fp.dessins || []).filter(d => d.shape === "line").map(d => ({ l: fp.side ? autre(d.layer) : d.layer, a: mondeOutil(fp, d.x1, d.y1), b: mondeOutil(fp, d.x2, d.y2) }));
    const reel = nf ? PCB.fpDessinsMonde(nf[i]).filter(d => d.shape === "line") : null;
    for (const e of enfs(fpsK[i], "fp_line")) {
      const l = COUCHE[(enf(e, "layer") || [])[1]], s = enf(e, "start"), f = enf(e, "end");
      if (!l || (+s[1] === +f[1] && +s[2] === +f[2])) continue;
      const [u1, v1] = rk(+s[1], +s[2], A), [u2, v2] = rk(+f[1], +f[2], A), a = [X + u1, Y + v1], b = [X + u2, Y + v2];
      const ok = g => g.l === l && proche(g.a[0], a[0]) && proche(g.a[1], a[1]) && proche(g.b[0], b[0]) && proche(g.b[1], b[1]);
      verifier(lignes.some(ok), quoi + " " + fp.ref + " : trait " + l + " au monde ≠ KiCad");
      if (reel) verifier(reel.some(d => ok({ l: d.layer, a: [d.x1, d.y1], b: [d.x2, d.y2] })), quoi + " " + fp.ref + " : trait " + l + " (fpDessinsMonde)");
      traits++;
    }
  });
  if (/fixture/.test(quoi)) verifier(traits === 4, quoi + " : traits d'empreinte comparés");
  if (PCB) {                                       // le vrai calcul de l'éditeur, sur le document normalisé
    const n = PCB.normDoc(JSON.parse(JSON.stringify(doc)));
    verifier(n.fps.length === doc.fps.length && n.tracks.length <= doc.tracks.length, quoi + " : normDoc garde les composants");
    verifier(n.fps.every((f, i) => f.pads.length === doc.fps[i].pads.length), quoi + " : normDoc n'invente aucune pastille");
    aCuivre(n.fps).forEach((fp, i) => PCB.padsWorldCalc(fp).forEach((q, j) => {
      const k = ref[i][j];
      verifier(proche(q.x, k.x, 1.5e-3) && proche(q.y, k.y, 1.5e-3), quoi + " " + fp.ref + " pastille " + j + " (padsWorldCalc)");
    }));
  }
}

/* écriture → relecture : ce qui doit survivre */
function allerRetour(doc, quoi) {
  const rap = K.rapport(), out = P.ecrire(doc, "essai", rap, new Map([[doc.fps[0] && doc.fps[0].ref, "/a/b"]]));
  const arbre2 = K.lire(out.texte, "kicad_pcb");
  const doc2 = P.lire(arbre2, JSON.parse(JSON.stringify(out.pro)), K.rapport()).doc;
  verifier(doc2.fps.length === doc.fps.length, quoi + " retour : nombre de composants " + doc2.fps.length + " / " + doc.fps.length);
  doc.fps.forEach((fp, i) => {
    const f2 = doc2.fps[i];
    verifier(f2.ref === fp.ref && f2.side === fp.side && f2.pads.length === fp.pads.length, quoi + " retour : " + fp.ref);
    fp.pads.forEach((q, j) => {
      const a = mondeOutil(fp, q.x, q.y), b = mondeOutil(f2, f2.pads[j].x, f2.pads[j].y);
      verifier(proche(a[0], b[0]) && proche(a[1], b[1]), quoi + " retour : " + fp.ref + " pastille " + j + " déplacée");
      verifier((fp.nets[q.n] || "") === (f2.nets[f2.pads[j].n] || ""), quoi + " retour : " + fp.ref + " pastille " + j + " net");
    });
    // dessins d'empreinte : autant par couche et par forme, aux mêmes places ; le corps écrit en Fab s'ajoute s'il n'y en avait pas
    const compte = f => { const m = {}; for (const g of f.dessins || []) m[g.layer + g.shape] = (m[g.layer + g.shape] || 0) + 1; return m; };
    const c1 = compte(fp), c2 = compte(f2);
    for (const k of new Set(Object.keys(c1).concat(Object.keys(c2))))
      verifier((c1[k] || 0) === (c2[k] || 0) || (k === "fabTrect" && !Object.keys(c1).some(x => /^fab/.test(x)) && c2[k] === 1),
               quoi + " retour : " + fp.ref + " dessins " + k + " " + (c1[k] || 0) + " / " + (c2[k] || 0));
    const l1 = (fp.dessins || []).find(g => g.shape === "line"), l2 = l1 && (f2.dessins || []).find(g => g.shape === "line" && g.layer === l1.layer);
    if (l1) verifier(l2 && proche(mondeOutil(fp, l1.x1, l1.y1)[0], mondeOutil(f2, l2.x1, l2.y1)[0]) && proche(mondeOutil(fp, l1.x1, l1.y1)[1], mondeOutil(f2, l2.x1, l2.y1)[1]),
                     quoi + " retour : " + fp.ref + " premier trait déplacé");
  });
  verifier(doc2.drawings.length === doc.drawings.length && doc.drawings.every((g, i) => g.layer === doc2.drawings[i].layer), quoi + " retour : dessins de carte");
  verifier(doc2.tracks.length === doc.tracks.length && doc.tracks.every((t, i) => t.net === doc2.tracks[i].net && t.l === doc2.tracks[i].l &&
           Math.abs((t.ca || 0) - (doc2.tracks[i].ca || 0)) * Math.hypot(t.x2 - t.x1, t.y2 - t.y1) <= 1e-3), quoi + " retour : pistes");
  verifier(doc2.vias.length === doc.vias.length && doc.vias.every((v, i) => v.net === doc2.vias[i].net && v.a === doc2.vias[i].a && v.b === doc2.vias[i].b), quoi + " retour : vias");
  verifier(doc2.zones.length === doc.zones.length && doc2.cuts.length === doc.cuts.length, quoi + " retour : zones et découpes");
  verifier(Math.abs(aireCarte(doc2) - aireCarte(doc)) <= 0.005 * aireCarte(doc), quoi + " retour : aire du contour");
  verifier(JSON.stringify(doc2.netClass) === JSON.stringify(doc.netClass) && doc2.classes.length === doc.classes.length, quoi + " retour : classes de nets");
  verifier(out.librairie.size >= new Set(doc.fps.map(f => f.ref)).size - 0 && out.empreintes.every(e => /^\(footprint "/.test(e.texte)), quoi + " retour : bibliothèque");
  for (const e of out.empreintes) K.lire(e.texte, "kicad_mod");
  verifier(out.texte.includes('(path "/a/b")') || !doc.fps.length, quoi + " retour : chemin du symbole");
  return out;
}

/* ---------- 1. carte écrite à la main ---------- */
function fixture(k10) {
  const NETS = ["", "GND", "VCC", "SIG"];
  const n = (k, avecNom) => k10 ? (k ? '(net "' + NETS[k] + '")' : "") : avecNom ? '(net ' + k + ' "' + NETS[k] + '")' : "(net " + k + ")";
  return `(kicad_pcb (version 20241229) (generator "banc")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "B.SilkS" user) (25 "Edge.Cuts" user) (35 "F.Fab" user) (33 "B.Fab" user))
  (setup (stackup (layer "F.Mask" (type "Top Solder Mask") (color "Red") (thickness 0.02)) (layer "F.Cu" (type "copper") (thickness 0.035))
    (layer "dielectric 1" (type "core") (thickness 1.5) (material "FR4") (epsilon_r 4.4) (loss_tangent 0.02)) (layer "B.Cu" (type "copper") (thickness 0.07))
    (copper_finish "HAL lead-free")) (pad_to_mask_clearance 0.04))
  ${k10 ? "" : NETS.map((s, i) => '(net ' + i + ' "' + s + '")').join(" ")}
  (footprint "Resistor_SMD:R_0603_1608Metric" (layer "F.Cu") (uuid "u1") (at 10 10 90)
    (property "Reference" "R1" (at 0 -1.5 90) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "10k" (at 0 1.5 90) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
    (fp_line (start -0.8 -0.4) (end 0.8 -0.4) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
    (fp_line (start -0.8 0.4) (end 0.8 0.4) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
    (fp_line (start -0.2 -0.7) (end 0.2 -0.7) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
    (fp_rect (start -1.5 -0.75) (end 1.5 0.75) (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (fp_circle (center 0 0) (end 0.3 0) (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
    (pad "1" smd roundrect (at -0.825 0 90) (size 0.8 0.95) (layers "F.Cu" "F.Mask" "F.Paste") (roundrect_rratio 0.25) ${n(2, true)})
    (pad "2" smd roundrect (at 0.825 0 90) (size 0.8 0.95) (layers "F.Cu" "F.Mask" "F.Paste") (roundrect_rratio 0.25) ${n(3, true)}))
  (footprint "Package_TO_SOT_SMD:SOT-23" (layer "B.Cu") (at 20 10 30)
    (property "Reference" "Q1" (at 0 -2.5 30) (layer "B.SilkS") (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "BSS138" (at 0 2.5 30) (layer "B.Fab"))
    (fp_rect (start -0.7 -1.5) (end 0.7 1.5) (stroke (width 0.1) (type solid)) (fill no) (layer "B.Fab"))
    (fp_poly (pts (xy -1 -2) (xy 1 -2) (xy 1 2) (xy -1 2)) (stroke (width 0.05) (type solid)) (fill no) (layer "B.CrtYd"))
    (fp_line (start -0.5 -1.8) (end 0.5 -1.6) (stroke (width 0.12) (type solid)) (layer "B.SilkS"))
    (fp_text user "\${REFERENCE}" (at 0 0.5 30) (layer "B.Fab") (effects (font (size 0.5 0.5) (thickness 0.08)) (justify mirror)))
    (pad "1" smd rect (at -0.95 -1.1 30) (size 0.6 0.7) (layers "B.Cu" "B.Mask" "B.Paste") ${n(3, true)})
    (pad "2" smd rect (at 0.95 -1.1 30) (size 0.6 0.7) (layers "B.Cu" "B.Mask" "B.Paste") ${n(1, true)})
    (pad "3" smd rect (at 0 1.1 75) (size 0.6 0.7) (layers "B.Cu" "B.Mask" "B.Paste") ${n(2, true)}))
  (footprint "Connector:Header_1x02" (layer "F.Cu") (at 30 10)
    (property "Reference" "J1" (at 0 -2 0) (layer "F.SilkS") (hide yes))
    (property "Value" "CONN" (at 0 4 0) (layer "F.Fab"))
    (pad "1" thru_hole rect (at 0 0) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${n(2, true)})
    (pad "2" thru_hole oval (at 0 2.54) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") ${n(1, true)})
    (pad "MP" thru_hole circle (at 0 5.08) (size 2 2) (drill 1.2) (layers "*.Cu" "*.Mask"))
    (pad "" np_thru_hole circle (at 2 5.08) (size 1 1) (drill 1) (layers "*.Cu" "*.Mask")))
  (footprint "MountingHole:MountingHole_3.2mm_M3" (layer "B.Cu") (at 5 20 90)
    (property "Reference" "H1" (at 0 -4 90) (layer "B.SilkS") (hide yes))
    (property "Value" "MountingHole" (at 0 4 90) (layer "B.Fab"))
    (attr exclude_from_pos_files exclude_from_bom)
    (pad "" np_thru_hole oval (at 0 1) (size 3.2 4) (drill oval 3.2 4) (layers "*.Cu" "*.Mask")))
  (segment (start 10 10.825) (end 18.627276 9.522372) (width 0.25) (layer "F.Cu") ${n(2)})
  (arc (start 30 0) (mid 31 1) (end 32 0) (width 0.3) (layer "B.Cu") ${n(1)})
  (via (at 15 12) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") ${n(1)})
  (zone ${k10 ? "" : "(net 1)"} (net_name "GND") (layer "B.Cu") (priority 2) (connect_pads (clearance 0.3)) (min_thickness 0.25)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.4)) (polygon (pts (xy 0 0) (xy 40 0) (xy 40 20) (xy 0 20))))
  (zone (net 0) (net_name "") (layers "F&B.Cu") (keepout (tracks not_allowed) (vias allowed) (pads allowed) (copperpour not_allowed) (footprints allowed))
    (polygon (pts (xy 1 1) (xy 3 1) (xy 3 3))))
  (gr_line (start 0 0) (end 40 0) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 0 25) (end 0 0) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts"))
  (gr_arc (start 40 15) (mid 37.0710678 22.0710678) (end 30 25) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 40 0) (end 40 15) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts"))
  (gr_line (start 30 25) (end 0 25) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts"))
  (gr_rect (start 5 5) (end 8 8) (stroke (width 0.05) (type solid)) (fill no) (layer "Edge.Cuts"))
  (gr_text "TEST" (at 20 20 90) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.2))))
  (gr_line (start 2 22) (end 10 22) (stroke (width 0.1) (type solid)) (layer "Cmts.User"))
  (gr_rect (start 1 18) (end 4 20) (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
  (gr_text "NOTE" (at 5 23) (layer "User.3") (effects (font (size 1 1) (thickness 0.15))))
)`;
}
const PRO = { board: { design_settings: { rules: { min_copper_edge_clearance: 0.3, min_hole_to_hole: 0.2 } } },
  net_settings: { classes: [{ name: "pwr", track_width: 0.5, clearance: null, via_diameter: 0.8, via_drill: 0.4 },
                            { name: "Default", track_width: 0.2, clearance: 0.15, via_diameter: 0.6, via_drill: 0.3 }],
                  netclass_assignments: { SIG: ["pwr"] }, netclass_patterns: [{ netclass: "pwr", pattern: "V?C" }, { netclass: "pwr", pattern: "G*" }] } };

/* KiCad 10 nomme les nets sans table : un net nommé d'un nombre (« 5 ») reste un nom ;
   avec une table (KiCad 9), un numéro qui n'y est pas ne désigne rien */
{
  const lu = (texte) => P.lire(K.lire(texte, "kicad_pcb"), PRO, K.rapport()).doc;
  verifier(lu(fixture(true).split('(net "SIG")').join('(net "5")')).fps[0].nets[2] === "5", "KiCad 10 : net nommé « 5 » gardé");
  verifier(lu(fixture(false).split('(net 3 "SIG")').join('(net 7)')).fps[0].nets[2] === undefined, "KiCad 9 : numéro hors table → sans net");
}

for (const k10 of [false, true]) {
  const quoi = k10 ? "fixture KiCad 10" : "fixture KiCad 9";
  const arbre = K.lire(fixture(k10), "kicad_pcb"), rap = K.rapport();
  const { doc, empreintes } = P.lire(arbre, PRO, rap);
  const [r1, q1, j1] = doc.fps;
  verifier(doc.fps.length === 4 && doc.cu === 2, quoi + " : quatre composants, deux couches");
  const h1 = doc.fps[3];
  verifier(h1.ref === "H1" && h1.pads.length === 0 && h1.pins === 0 && h1.side === 1 && h1.holes.length === 1 && h1.holes[0].y === -1 && h1.holes[0].w === 4 &&
           !h1.holes[0].rot && h1.body.y1 === -3 && doc.holes.length === 0 && !rap.liste().some(e => /sans pastille/.test(e)), quoi + " : H1 sans cuivre gardé, trou oblong dans son repère");
  verifier(r1.ref === "R1" && r1.pkg === "R_0603_1608Metric" && r1.value === "10k" && r1.x === 10 && r1.y === 10 && r1.rot === 270 && r1.side === 0,
           quoi + " : R1 dessus, tourné de 90° KiCad → 270° éditeur");
  verifier(r1.pads[0].x === -0.825 && r1.pads[0].y === 0 && r1.pads[0].rot === 0 && r1.pads[0].shape === "rect" && r1.nets[1] === "VCC" && r1.nets[2] === "SIG",
           quoi + " : pastilles de R1 dans le repère de l'empreinte, angle propre nul");
  const p1 = mondeOutil(r1, r1.pads[0].x, r1.pads[0].y);
  verifier(proche(p1[0], 10) && proche(p1[1], 10.825), quoi + " : R1 pastille 1 au monde (10, 10.825)");
  verifier(q1.side === 1 && q1.rot === 150 && q1.pads[0].x === -0.95 && q1.pads[0].y === 1.1 && q1.pads[0].rot === 0 && q1.pads[2].rot === 45 && q1.pads[0].shape === "sharp",
           quoi + " : Q1 dessous à 30° → côté 1, 150°, repère vu de dessus (y opposé), angle propre P − A");
  const p2 = mondeOutil(q1, q1.pads[0].x, q1.pads[0].y);
  verifier(proche(p2[0], 18.627276) && proche(p2[1], 9.522372), quoi + " : Q1 pastille 1 au monde (18.627, 9.522)");
  verifier(q1.body.x1 === -0.7 && q1.body.y1 === -1.5 && q1.body.y2 === 1.5 && r1.body.y1 === -0.4 && r1.body.x2 === 0.8, quoi + " : corps tirés de F.Fab / B.Fab");
  verifier(j1.pads.map(q => q.n).join() === "1,2,3" && j1.pads[2].nom === "MP" && j1.pads[0].drill === 1 && j1.pads[0].shape === "sharp" &&
           j1.pads[2].shape === "circ" && j1.holes.length === 1 && j1.holes[0].x === 2 && j1.style === "row", quoi + " : J1 traversant, « MP » renuméroté 3, trou NPTH");
  verifier(doc.tracks.length === 2 && doc.tracks[0].net === "VCC" && doc.tracks[1].l === 1 && proche(doc.tracks[1].ca, -Math.PI, 1e-4) && doc.tracks[1].net === "GND",
           quoi + " : piste droite et arc (balayage −π, sens trigonométrique à l'écran)");
  verifier(doc.vias.length === 1 && doc.vias[0].net === "GND" && doc.vias[0].a === 0 && doc.vias[0].b === 1 && doc.vias[0].d === 0.6, quoi + " : via");
  verifier(doc.zones.length === 1 && doc.zones[0].l === 1 && doc.zones[0].net === "GND" && doc.zones[0].priorite === 2 && !rap.liste().some(e => /priorité/.test(e)) && doc.cuts.length === 2 && doc.cuts[1].l === 1, quoi + " : zone et zone interdite (deux couches)");
  verifier(proche(aire(doc.board.pts), 1000 - 100 + Math.PI * 25, 0.1) && doc.board.cutouts.length === 1 && proche(aire(doc.board.cutouts[0]), 9),
           quoi + " : contour avec un arc, découpe intérieure");
  const couche = (fp, l) => (fp.dessins || []).filter(d => d.layer === l);
  verifier(couche(r1, "silkT").some(d => d.shape === "line" && d.width === 0.12 && d.x1 === -0.2 && d.y1 === -0.7) &&
           couche(r1, "silkT").some(d => d.text === "${REFERENCE}" && d.rot === 0) && couche(r1, "fabT").some(d => d.text === "${VALUE}") &&
           couche(r1, "crtT").length === 1 && couche(r1, "crtT")[0].shape === "rect" && couche(r1, "fabT").filter(d => d.shape === "line").length > 10,
           quoi + " : sérigraphie, Fab (cercle en cordes) et Courtyard de R1 dans ses dessins, repère local");
  verifier(couche(q1, "silkT").some(d => d.text === "${REFERENCE}" && d.rot === 180) && couche(q1, "fabT").some(d => d.shape === "rect" && d.y1 === 1.5 && d.y2 === -1.5) &&
           couche(q1, "fabT").some(d => d.text === "${REFERENCE}" && d.size === 0.5) && couche(q1, "crtT").filter(d => d.shape === "line").length === 4 &&
           !q1.dessins.some(d => /B$/.test(d.layer)) && !j1.dessins.some(d => d.text === "${REFERENCE}"),
           quoi + " : Q1 dessous, dessins vus posé dessus (y opposé, faces échangées) ; repère caché de J1 écarté");
  verifier(doc.drawings.some(d => d.text === "TEST" && d.rot === 270 && d.size === 1.2) && doc.drawings.some(d => d.layer === "cmts" && d.shape === "line") &&
           doc.drawings.some(d => d.layer === "fabT" && d.shape === "rect") && doc.drawings.some(d => d.layer === "mec2" && d.text === "NOTE") &&
           doc.drawings.length === 4 && !rap.liste().some(m => /regroupées/.test(m)) && !rap.liste().some(m => /Fab, Courtyard/.test(m)),
           quoi + " : dessins de carte sur leurs couches, écarts à jour");
  /* dessins au monde = KiCad : le trait de sérigraphie de Q1 (dessous, 30°) et le texte de R1 */
  const sq = couche(q1, "silkT").find(d => d.shape === "line"), [ka, kb] = [rk(-0.5, -1.8, 30), rk(0.5, -1.6, 30)];
  const [wa, wb] = [mondeOutil(q1, sq.x1, sq.y1), mondeOutil(q1, sq.x2, sq.y2)];
  verifier(proche(wa[0], 20 + ka[0]) && proche(wa[1], 10 + ka[1]) && proche(wb[0], 20 + kb[0]) && proche(wb[1], 10 + kb[1]), quoi + " : trait de Q1 au monde = KiCad");
  verifier(doc.fps.every(f => f.silk === false), quoi + " : sérigraphie automatique coupée");
  verifier(doc.classes[0].name === "Default" && doc.classes[1].clr === 0.15 && doc.classes[1].w === 0.5 &&
           doc.netClass.SIG === "pwr" && doc.netClass.VCC === "pwr" && doc.netClass.GND === "pwr" && doc.rule.edge === 0.3 && doc.rule.hole === 0.2,
           quoi + " : classes du .kicad_pro (valeur nulle → Default, motifs, rattachements), règles");
  verifier(doc.stack.cu[1].t === 0.07 && doc.stack.di[0].er === 4.4 && doc.stack.maskColor === "rouge" && doc.stack.finish === "HASL sans plomb" && doc.rule.mask === 0.04 &&
           doc.rule.thermal === 0.4, quoi + " : empilage, vernis, finition, règles de zone");
  verifier(empreintes.length === 3 && empreintes.every(e => vm.runInContext("COMPOSANTS_LIB", bac).verifierEmpreinte(e, e.name + ".json").erreurs.length === 0),
           quoi + " : trois empreintes de LIB valides");
  comparerMonde(arbre, doc, quoi);
  const out = allerRetour(doc, quoi);
  const d2 = P.lire(K.lire(out.texte, "kicad_pcb"), null, K.rapport()).doc, h2 = d2.fps[3];
  verifier(/\(priority 2\)/.test(out.texte) && d2.zones[0].priorite === 2 && h2.ref === "H1" && h2.pads.length === 0 && JSON.stringify(h2.holes) === JSON.stringify(h1.holes) &&
           /\(attr board_only exclude_from_pos_files exclude_from_bom\)/.test(out.texte) &&
           /\(attr exclude_from_pos_files exclude_from_bom\)/.test(P.ecrire(doc, "essai", K.rapport(), new Map([["H1", "/h"]])).texte), quoi + " : priorité de zone et empreinte sans cuivre au retour");
  verifier(/\(footprint "essai:R_0603_1608Metric"/.test(out.texte) && out.librairie.get("Q1") === "essai:SOT-23" && out.empreintes.length === 4 &&
           out.pro.net_settings.classes[0].name === "Default" && out.pro.board.design_settings.rules.min_copper_edge_clearance === 0.3,
           quoi + " : identifiants de bibliothèque et .kicad_pro partiel");
  verifier(P.ecrire(doc, "essai", K.rapport(), null).texte === out.texte.replace('\n\t\t(path "/a/b")', ""), quoi + " : écriture déterministe");
}
/* ---------- ce qu'un aller-retour doit garder : couches mécaniques, fentes, zones, verrous, pastilles, arcs ---------- */
{
  const J = JSON.stringify;
  const carte = (corps, cuivres) => `(kicad_pcb (version 20241229) (generator "pcbnew")
    (layers (0 "F.Cu" signal) ${cuivres || ""} (2 "B.Cu" signal) (25 "Edge.Cuts" user))
    (net 0 "") (net 1 "GND")
    (gr_rect (start 0 0) (end 50 50) (stroke (width 0.05) (type solid)) (fill no) (layer "Edge.Cuts"))
    ${corps})`;
  const lire = t => { const rap = K.rapport(), doc = P.lire(K.lire(t, "kicad_pcb"), null, rap).doc; return { doc, rap: rap.liste() }; };
  const ecrire = doc => { const rap = K.rapport(), o = P.ecrire(doc, "x", rap, null); return { t: o.texte, rap: rap.liste(), mods: o.empreintes }; };
  const base = () => ({ format: "pcbedit-1", cu: 2, board: { x: 0, y: 0, w: 50, h: 50 }, fps: [], tracks: [], vias: [], zones: [], cuts: [], holes: [], drawings: [] });
  const fpDe = (pads, plus) => Object.assign({ id: 1, ref: "J1", pkg: "J", pins: pads.length, style: "row", x: 5, y: 5, rot: 0, side: 0, nets: {}, silk: false, pads }, plus);
  const norm = d => PCB ? PCB.normDoc(JSON.parse(J(d))) : d;       // ce que l'éditeur en garde, s'il est construit
  let d, e, r;

  /* 1. couches mécaniques mec1…mec8 = User.2…User.9, sur la carte et dans une empreinte (dessus et dessous) */
  d = base();
  d.drawings = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: i, shape: "line", layer: "mec" + i, x1: 0, y1: i, x2: 5, y2: i, width: 0.1 }))
    .concat([{ id: 9, shape: "text", layer: "mec3", text: "M", x1: 1, y1: 1, size: 1, rot: 0, width: 0.15 }]);
  d.fps = [0, 1].map(side => fpDe([{ n: 1, x: 0, y: 0, w: 1, h: 1, shape: "rect", drill: 0, rot: 0 }],
    { id: 20 + side, ref: "R" + side, side, dessins: [{ shape: "line", layer: "mec2", x1: -1, y1: 1, x2: 1, y2: 1, width: 0.12 }] }));
  e = ecrire(d); r = lire(e.t);
  verifier([2, 3, 4, 5, 6, 7, 8, 9].every(i => e.t.includes('(' + (37 + 2 * i) + ' "User.' + i + '" user)')) && !/"F\.SilkS"\)\n?\s*\(uuid "[^"]*"\)\s*\)\s*\(gr_line/.test(e.t) &&
           (e.t.match(/\(layer "User\.\d"\)/g) || []).length === 11, "mécanique : écrite sur User.2 à User.9, couches déclarées");
  verifier(J(r.doc.drawings.map(g => g.layer)) === J(d.drawings.map(g => g.layer)) && r.doc.fps.every(f => f.dessins.some(g => g.layer === "mec2" && g.shape === "line")) &&
           !r.rap.some(m => /regroupées|inconnue/.test(m)) && norm(r.doc).drawings.length === 9, "mécanique : relue sur ses couches, carte et empreintes");
  r = lire(carte(`(gr_line (start 0 0) (end 5 0) (stroke (width 0.1) (type solid)) (layer "Eco1.User")) (gr_line (start 0 1) (end 5 1) (stroke (width 0.1) (type solid)) (layer "User.12"))`));
  verifier(r.doc.drawings.every(g => g.layer === "user") && r.rap.some(m => /regroupées/.test(m)), "Eco1 et User.12 : regroupées sur la couche utilisateur, dit au rapport");

  /* 2. fente verticale dans une pastille ronde ou carrée : un quart de tour, la fente reste verticale au monde */
  const axe = (fp, q) => { const a = (fp.rot + (fp.side ? -1 : 1) * q.rot + (q.h > q.w ? 90 : 0)) * Math.PI / 180; return [Math.abs(Math.cos(a)), Math.abs(Math.sin(a))]; };
  r = lire(carte(`(footprint "L:J" (layer "F.Cu") (at 5 5 30)
    (pad "1" thru_hole circle (at 0 0) (size 3 3) (drill oval 1 2) (layers "*.Cu"))
    (pad "2" thru_hole rect (at 5 0 30) (size 3 3) (drill oval 1 2) (layers "*.Cu"))
    (pad "3" thru_hole circle (at 10 0 30) (size 3 3) (drill oval 2 1) (layers "*.Cu"))
    (pad "4" thru_hole oval (at 15 0) (size 2 4) (drill oval 0.8 1.4) (layers "*.Cu"))
    (pad "5" thru_hole oval (at 20 0) (size 4 2) (drill oval 0.8 1.4) (layers "*.Cu")))`));
  {
    const f = r.doc.fps[0], [a1, a2, a3, a4] = f.pads.map(q => axe(f, q)), c30 = Math.cos(Math.PI / 6);
    // KiCad : fente le long de l'axe Y de la pastille (1, 2, 4), X pour la 3 ; angle de pastille absolu au fichier (0°, 30°, 30°, 0°)
    verifier(f.pads[0].slot === 2 && f.pads[0].drill === 1 && proche(a1[0], 0) && proche(a1[1], 1) && proche(a2[0], 0.5) && proche(a2[1], c30) &&
             proche(a3[0], c30) && proche(a3[1], 0.5) && proche(a4[0], 0) && proche(a4[1], 1), "fente : axe au monde = KiCad, pastille ronde ou carrée tournée d'un quart de tour");
    verifier(r.rap.filter(m => /oblong en travers/.test(m)).length === 1 && !/×/.test(r.rap.find(m => /oblong en travers/.test(m))), "fente : seule l'ovale en travers reste un écart");
    const r2 = lire(ecrire(r.doc).t), f2 = r2.doc.fps[0];
    verifier(f2.pads.every((q, i) => q.slot === f.pads[i].slot && q.w === f.pads[i].w && q.h === f.pads[i].h && proche(axe(f2, q)[0], axe(f, f.pads[i])[0]) && proche(axe(f2, q)[1], axe(f, f.pads[i])[1])) &&
             norm(r.doc).fps[0].pads[0].rot === f.pads[0].rot, "fente : aller-retour stable");
  }

  /* 3. réglages de zone */
  d = base();
  d.rule = { thermal: 0.5 };          // la règle de la carte suit la première zone du fichier : celle sans réglage passe devant
  d.zones = [{ id: 2, l: 1, net: "GND", pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
             { id: 1, l: 0, net: "GND", pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], isol: 0.7, brasLarg: 0.9, brasEcart: 0.4, hachure: { pas: 1, larg: 0.3, angle: 45 }, connexion: "cms-directe", locked: true }];
  e = ecrire(d); r = lire(e.t);
  verifier(/\(connect_pads thru_hole_only\s*\(clearance 0\.7\)/.test(e.t) && /\(fill\s*\(mode hatch\)\s*\(thermal_gap 0\.4\)\s*\(thermal_bridge_width 0\.9\)\s*\(hatch_thickness 0\.3\)\s*\(hatch_gap 0\.7\)\s*\(hatch_orientation 135\)/.test(e.t) &&
           !e.rap.some(m => /CMS/.test(m)), "zone : isolement, bras, hachures et « traversantes seules » écrits");
  {
    const [z2, z1] = norm(r.doc).zones;
    verifier(z1.isol === 0.7 && z1.brasLarg === 0.9 && z1.brasEcart === 0.4 && J(z1.hachure) === J({ pas: 1, larg: 0.3, angle: 45 }) && z1.connexion === "cms-directe" && z1.locked === true,
             "zone : réglages et verrou relus " + J(z1));
    verifier(z2.isol == null && z2.brasLarg == null && z2.brasEcart == null && !z2.hachure && !z2.connexion && !z2.locked, "zone sans réglage : n'en gagne aucun " + J(z2));
  }
  r = lire(carte(`(zone (net 1) (net_name "GND") (layer "F.Cu") (connect_pads thru_hole_only (clearance 0.508)) (min_thickness 0.25)
    (fill yes (mode hatch) (thermal_gap 0.3) (thermal_bridge_width 0.6) (hatch_thickness 0.2) (hatch_gap 0.8) (hatch_orientation 0)) (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10))))
   (zone (net 1) (net_name "GND") (layer "B.Cu") (connect_pads (clearance 0.2)) (fill yes (thermal_gap 0.2) (thermal_bridge_width 0.8)) (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10))))`));
  verifier(r.doc.zones[0].isol === 0.508 && r.doc.zones[0].brasEcart === 0.3 && r.doc.zones[0].brasLarg == null && r.doc.rule.thermal === 0.6 && J(r.doc.zones[0].hachure) === J({ pas: 1, larg: 0.2 }) &&
           r.doc.zones[0].connexion === "cms-directe" && r.doc.zones[1].isol == null && r.doc.zones[1].brasEcart == null && r.doc.zones[1].brasLarg === 0.8 && !r.rap.some(m => /hachur|traversantes/.test(m)),
           "zone KiCad : isolement et bras propres gardés, ceux de la classe et de la règle laissés à elles");

  /* 4. verrous : empreinte, piste, arc, via, zone, dessins ; écriture de KiCad 7 (mot nu) comme de KiCad 9 */
  d = base();
  d.fps = [fpDe([{ n: 1, x: 0, y: 0, w: 1, h: 1, shape: "rect", drill: 0, rot: 0 }], { locked: true }), fpDe([{ n: 1, x: 0, y: 0, w: 1, h: 1, shape: "rect", drill: 0, rot: 0 }], { id: 2, ref: "J2", x: 9 })];
  d.tracks = [{ l: 0, net: "A", w: 0.2, x1: 0, y1: 0, x2: 5, y2: 0, locked: true }, { l: 0, net: "A", w: 0.2, x1: 5, y1: 0, x2: 7, y2: 2, ca: 1, locked: true }, { l: 0, net: "A", w: 0.2, x1: 0, y1: 3, x2: 5, y2: 3 }];
  d.vias = [{ id: 3, x: 5, y: 0, d: 0.6, drill: 0.3, a: 0, b: 1, net: "A", locked: true }, { id: 4, x: 8, y: 0, d: 0.6, drill: 0.3, a: 0, b: 1, net: "A" }];
  d.drawings = [{ id: 5, shape: "line", layer: "silkT", x1: 0, y1: 8, x2: 5, y2: 8, width: 0.1, locked: true }, { id: 6, shape: "text", layer: "silkT", text: "locked", x1: 1, y1: 9, size: 1, rot: 0, width: 0.15 },
                { id: 7, shape: "text", layer: "silkT", text: "T", x1: 1, y1: 12, size: 1, rot: 0, width: 0.15, locked: true },
                { id: 8, shape: "poly", layer: "silkT", pts: [{ x: 20, y: 20 }, { x: 22, y: 20 }, { x: 22, y: 22 }], locked: true }, { id: 9, shape: "rect", layer: "silkT", x1: 30, y1: 30, x2: 32, y2: 32, width: 0.1, locked: true }];
  d.holes = [{ id: 10, x: 40, y: 40, d: 3.2, locked: true }];
  e = ecrire(d); r = lire(e.t);
  {
    const n = norm(r.doc), v = l => J(l.map(o => !!o.locked));
    verifier(v(n.fps) === "[true,false,true]" && v(n.tracks) === "[true,true,false]" && v(n.vias) === "[true,false]" && v(n.drawings) === "[true,false,true,true,true]" &&
             (e.t.match(/\(locked yes\)/g) || []).length === 9, "verrous : écrits et relus, objet par objet (texte « locked » non verrouillé)");
  }
  r = lire(carte(`(footprint "L:R" locked (layer "F.Cu") (at 5 5) (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))
    (footprint "L:R" (locked) (layer "F.Cu") (at 9 5) (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))
    (footprint "locked" (layer "F.Cu") (at 13 5) (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))
    (segment locked (start 0 0) (end 5 0) (width 0.2) (layer "F.Cu") (net 1)) (segment (start 0 1) (end 5 1) (width 0.2) (layer "F.Cu") (net 1) (locked no))
    (via locked (at 3 3) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1)) (gr_line locked (start 0 9) (end 5 9) (stroke (width 0.1) (type solid)) (layer "F.SilkS"))`));
  verifier(J(r.doc.fps.map(f => !!f.locked)) === "[true,true,false]" && J(r.doc.tracks.map(t => !!t.locked)) === "[true,false]" && r.doc.vias[0].locked === true && r.doc.drawings[0].locked === true,
           "verrous : mot nu de KiCad 7, (locked), (locked no), empreinte nommée « locked »");

  /* 5. réglages de pastille : liaison aux zones, bras, géométrie par couche */
  d = base(); d.cu = 4;
  d.fps = [fpDe([{ n: 1, x: 0, y: 0, w: 2, h: 2, shape: "circ", drill: 1, rot: 0, connexion: "thermique", thermalWidth: 0.9, thermalGap: 0.35, parCouche: { int: { shape: "sharp", w: 1.5, h: 1.5 }, bas: { shape: "oval", w: 3, h: 2 } } },
                     { n: 2, x: 3, y: 0, w: 2, h: 2, shape: "circ", drill: 1, rot: 0, connexion: "aucune", parCouche: { 2: { shape: "rect", w: 2.4, h: 1.6 } } },
                     { n: 3, x: 6, y: 0, w: 2, h: 2, shape: "circ", drill: 1, rot: 0, connexion: "directe", parCouche: { int: { shape: "aucune" } } },
                     { n: 4, x: 9, y: 0, w: 2, h: 2, shape: "circ", drill: 1, rot: 0 }])];
  e = ecrire(d); r = lire(e.t);
  {
    const q = norm(r.doc).fps[0].pads;
    verifier(/\(padstack\s*\(mode front_inner_back\)\s*\(layer "Inner"\s*\(shape rect\)\s*\(size 1\.5 1\.5\)\s*\)\s*\(layer "B\.Cu"\s*\(shape oval\)\s*\(size 3 2\)/.test(e.t) &&
             /\(padstack\s*\(mode custom\)\s*\(layer "In1\.Cu"\s*\(shape circle\)\s*\(size 2 2\)\s*\)\s*\(layer "In2\.Cu"\s*\(shape roundrect\)\s*\(size 2\.4 1\.6\)\s*\(roundrect_rratio 0\.22\)\s*\)\s*\(layer "B\.Cu"\s*\(shape circle\)/.test(e.t) &&
             (e.t.match(/\(padstack/g) || []).length === 3 && (e.t.match(/\(remove_unused_layers yes\)/g) || []).length === 1 && e.rap.some(m => /retirée d'une couche/.test(m)) &&
             e.mods.some(m => /\(padstack/.test(m.texte)), "pastille : géométrie par couche écrite (padstack), retrait d'une couche dit au rapport");
    verifier(q[0].connexion === "thermique" && q[0].thermalWidth === 0.9 && q[0].thermalGap === 0.35 && J(q[0].parCouche) === J({ int: { shape: "sharp", w: 1.5, h: 1.5 }, bas: { shape: "oval", w: 3, h: 2 } }) &&
             q[1].connexion === "aucune" && J(q[1].parCouche) === J({ 2: { shape: "rect", w: 2.4, h: 1.6 } }) && q[2].connexion === "directe" && !q[2].parCouche &&
             !q[3].connexion && !q[3].parCouche && q[3].thermalWidth == null, "pastille : liaison, bras et géométrie par couche relus " + J(q));
  }
  r = lire(carte(`(footprint "L:R" (layer "F.Cu") (at 5 5) (zone_connect 2)
    (pad "1" smd roundrect (at 0 0) (size 1 2) (layers "F.Cu") (roundrect_rratio 0.5) (zone_connect 1))
    (pad "2" smd roundrect (at 3 0) (size 1 2) (layers "F.Cu") (roundrect_rratio 0) (zone_connect 3))
    (pad "3" thru_hole circle (at 6 0) (size 2 2) (drill 1) (layers "*.Cu") (zone_connect 3) (thermal_bridge_width 0.8) (thermal_gap 0.45) (clearance 0.5))
    (pad "4" thru_hole circle (at 9 0) (size 2 2) (drill 1) (layers "*.Cu") (remove_unused_layers yes) (keep_end_layers yes)
      (padstack (mode front_inner_back) (layer "Inner" (shape circle) (size 1.4 1.4)) (layer "B.Cu" (shape roundrect) (size 2 3) (roundrect_rratio 0.25))))
    (pad "5" smd roundrect (at 12 0) (size 1 2) (layers "F.Cu") (roundrect_rratio 0.25)))`, `(4 "In1.Cu" signal) (6 "In2.Cu" signal)`));
  {
    const q = r.doc.fps[0].pads;
    verifier(J(q.map(x => x.shape)) === J(["oval", "sharp", "circ", "circ", "rect"]) && J(q.map(x => x.connexion)) === J(["thermique", "directe", "thermique", "directe", "directe"]) &&
             q[2].thermalWidth === 0.8 && q[2].thermalGap === 0.45 && J(q[3].parCouche) === J({ int: { shape: "circ", w: 1.4, h: 1.4 }, bas: { shape: "rect", w: 2, h: 3 } }) &&
             r.rap.some(m => /isolement propre à une pastille/.test(m)) && !r.rap.some(m => /arrondi/.test(m)),
             "pastille KiCad : arrondi demi → oblong, nul → droit ; zone_connect 1 et 3, celui de l'empreinte ; padstack ; isolement propre dit au rapport " + J(q));
  }

  /* 6. pastilles sans numéro : le numéro reste vide au retour */
  r = lire(carte(`(footprint "L:J" (layer "F.Cu") (at 5 5) (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "GND")) (pad "" smd rect (at 3 0) (size 1 1) (layers "F.Cu"))
    (pad "" smd rect (at 6 0) (size 1 1) (layers "F.Cu")) (pad "EP" smd rect (at 9 0) (size 1 1) (layers "F.Cu")))`));
  e = ecrire(norm(r.doc));
  verifier(J((e.t.match(/\(pad "[^"]*"/g) || []).slice(0, 4)) === J(['(pad "1"', '(pad ""', '(pad ""', '(pad "EP"']) && e.mods.every(m => (m.texte.match(/\(pad ""/g) || []).length === 2) &&
           J(lire(e.t).doc.fps[0].pads.map(q => [q.n, q.nom])) === J(r.doc.fps[0].pads.map(q => [q.n, q.nom])), "pastilles sans numéro : écrites sans numéro, carte et bibliothèque");

  /* 7. arcs : gr_arc de la carte gardé en arc ; trait en arc d'une empreinte écrit en fp_arc (dessus et dessous) */
  r = lire(carte(`(gr_arc (start 10 0) (mid 7.0710678 7.0710678) (end 0 10) (stroke (width 0.2) (type solid)) (layer "F.SilkS"))
    (gr_arc locked (start 30 0) (mid 31 1) (end 32 0) (stroke (width 0.2) (type solid)) (layer "Dwgs.User"))`));
  {
    const [a, b] = norm(r.doc).drawings;
    verifier(r.doc.drawings.length === 2 && a.shape === "line" && a.x1 === 10 && a.y2 === 10 && proche(a.ca, Math.PI / 2, 1e-4) && proche(b.ca, -Math.PI, 1e-4) && b.locked === true && a.width === 0.2,
             "arc de sérigraphie : un trait en arc, balayage signé " + J(r.doc.drawings));
    e = ecrire(r.doc);
    const m = e.t.match(/\(gr_arc\s*\(start 10 0\)\s*\(mid ([\d.-]+) ([\d.-]+)\)\s*\(end 0 10\)/), r2 = lire(e.t);
    verifier(m && proche(+m[1], 7.0710678) && proche(+m[2], 7.0710678) && (e.t.match(/\(gr_arc/g) || []).length === 2 && !/\(gr_line/.test(e.t) &&
             r2.doc.drawings.every((g, i) => proche(g.ca, r.doc.drawings[i].ca, 1e-3)), "arc de sérigraphie : écrit en gr_arc, relu identique");
  }
  d = base();
  d.fps = [0, 1].map(side => fpDe([{ n: 1, x: 0, y: 0, w: 1, h: 1, shape: "rect", drill: 0, rot: 0 }],
    { id: 1 + side, ref: "R" + side, side, rot: 30, dessins: [{ shape: "line", layer: "silkT", x1: 2, y1: 0, x2: 0, y2: 2, width: 0.12, ca: Math.PI / 2 }] }));
  e = ecrire(d); r = lire(e.t);
  verifier((e.t.match(/\(fp_arc/g) || []).length === 2 && e.mods.every(m => /\(fp_arc\s*\(start 2 0\)\s*\(mid 1\.414214 1\.414214\)\s*\(end 0 2\)/.test(m.texte)), "arc d'empreinte : écrit en fp_arc");
  r.doc.fps.forEach((f, i) => {
    // relu en cordes (l'éditeur ne dessine pas d'arc dans une empreinte) : chaque bout reste sur le cercle d'origine, au monde
    const c = mondeOutil(d.fps[i], 0, 0), L = f.dessins.filter(g => g.layer === "silkT" && g.shape === "line");
    verifier(L.length > 8 && L.every(g => [[g.x1, g.y1], [g.x2, g.y2]].every(([x, y]) => { const w = mondeOutil(f, x, y); return proche(Math.hypot(w[0] - c[0], w[1] - c[1]), 2, 2e-3); })) &&
             [[2, 0], [0, 2], [Math.SQRT2, Math.SQRT2]].every(([x, y]) => { const w = mondeOutil(d.fps[i], x, y); return L.some(g => { const u = mondeOutil(f, g.x1, g.y1), v = mondeOutil(f, g.x2, g.y2);
               return Math.hypot((u[0] + v[0]) / 2 - w[0], (u[1] + v[1]) / 2 - w[1]) < 0.2; }); }), "arc d'empreinte " + (i ? "dessous" : "dessus") + " : même quart de cercle au monde");
  });
}

/* entrées hostiles : refusées proprement ou bornées */
const refuse = (f, motif) => { try { f(); return false; } catch (e) { return e instanceof K.Refus && motif.test(e.message); } };
verifier(refuse(() => P.lire(K.lire("(kicad_sch (version 20250114))", "x"), null, K.rapport()), /pas une carte KiCad/), "hostile : schéma refusé");
verifier(refuse(() => P.lire(K.lire("(kicad_pcb (version 20171130))", "x"), null, K.rapport()), /antérieure/), "hostile : format KiCad 5 refusé");
{
  const d = P.lire(K.lire('(kicad_pcb (version 20241229) (layers (0 "F.Cu" signal) (2 "B.Cu" signal)) (footprint "x" (layer "F.Cu") (at 1e300 -1e300 nan)' +
    ' (pad "99999" smd rect (at 0 0) (size 1e9 -5) (layers "F.Cu"))) (segment (start 0 0) (end 1e99 0) (width -3) (layer "In7.Cu")) (net 1 "' + "N".repeat(300) + '"))', "x"),
    { net_settings: { classes: "x", netclass_patterns: [{ netclass: "x", pattern: "*".repeat(150) + "a" }] } }, K.rapport()).doc;
  verifier(d.fps.length === 1 && d.fps[0].x === 1e5 && d.fps[0].y === -1e5 && d.fps[0].rot === 0 && d.fps[0].pads[0].n === 1 && d.fps[0].pads[0].nom === "99999" &&
           d.fps[0].pads[0].w === 200 && d.fps[0].pads[0].h === 0.05 && d.tracks.length === 0, "hostile : nombres absurdes bornés, couche inconnue écartée");
}
console.log("fixtures : OK (" + total + " contrôles)");

/* ---------- 2. démos KiCad ---------- */
const dossier = process.argv[2] || path.join(os.homedir(), "kicad-essais", "src", "demos");
const kicadCli = (() => { try { return execFileSync("which", ["kicad-cli"], { encoding: "utf8" }).trim(); } catch (e) { return ""; } })();
let exportee = null;
if (fs.existsSync(dossier)) {
  const cartes = [];
  (function parcourir(d, prof) {
    if (prof > 6) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p, prof + 1);
      else if (e.name.endsWith(".kicad_pcb")) cartes.push(p);
    }
  })(dossier, 0);
  for (const f of cartes.sort()) {
    const nom = path.relative(dossier, f), taille = fs.statSync(f).size;
    if (taille > 128 * 1024 * 1024) { console.log(nom + " : plus de 128 Mo (limite de l'archive), sauté"); continue; }
    const t0 = Date.now();
    let arbre;
    try { arbre = K.lire(fs.readFileSync(f, "utf8"), "kicad_pcb"); }
    catch (e) { if (!(e instanceof K.Refus)) throw e; console.log(nom + " : fichier mal formé, refusé par le lecteur (" + e.message + ")"); continue; }
    const fpro = f.replace(/\.kicad_pcb$/, ".kicad_pro");
    const pro = fs.existsSync(fpro) ? JSON.parse(fs.readFileSync(fpro, "utf8")) : null;
    const rap = K.rapport(), { doc, empreintes } = P.lire(arbre, pro, rap);
    const t1 = Date.now();
    comparerMonde(arbre, doc, nom);
    const out = allerRetour(doc, nom);
    if (!exportee || /pic_programmer/.test(nom)) exportee = out;
    console.log(nom + " : " + doc.fps.length + " comp. (" + doc.fps.filter(x => x.side).length + " dessous), " + doc.tracks.length + " pistes, " +
                doc.vias.length + " vias, " + doc.zones.length + " zones, " + empreintes.length + " empr. LIB, " + rap.liste().length + " écarts, " +
                (t1 - t0) + " ms : OK");
  }
} else console.log("démos absentes (" + dossier + ") : sautées");

/* ---------- 4. kicad-cli ---------- */
if (!kicadCli) console.log("kicad-cli absent : contrôle sauté");
else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "banc-kicad-pcb-"));
  const out = exportee || P.ecrire(P.lire(K.lire(fixture(false), "kicad_pcb"), PRO, K.rapport()).doc, "essai", K.rapport(), null);
  fs.writeFileSync(path.join(dir, "essai.kicad_pcb"), out.texte);
  fs.mkdirSync(path.join(dir, "essai.pretty"));
  for (const e of out.empreintes) fs.writeFileSync(path.join(dir, "essai.pretty", e.nom + ".kicad_mod"), e.texte);
  let rapport = null;
  try {
    execFileSync(kicadCli, ["pcb", "drc", "--format", "json", "-o", path.join(dir, "drc.json"), path.join(dir, "essai.kicad_pcb")], { stdio: "pipe", timeout: 300000 });
    rapport = JSON.parse(fs.readFileSync(path.join(dir, "drc.json"), "utf8"));
  } catch (e) { verifier(false, "kicad-cli pcb drc n'a pas lu la carte écrite : " + String(e.stderr || e.message).slice(0, 300)); }
  verifier(rapport && Array.isArray(rapport.violations), "kicad-cli : rapport DRC lisible");
  console.log("kicad-cli : carte lue, " + rapport.violations.length + " violations DRC, " + (rapport.unconnected_items || []).length + " non connectés");
}
console.log((PCB ? "" : "normDoc : dist/pcb.js absent, contrôle sauté\n") + "OK (" + total + " contrôles)");
process.exit(0);
