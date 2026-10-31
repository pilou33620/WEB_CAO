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
    (0, eval)(fs.readFileSync(bundle, "utf8").replace(/^"use strict";/, "") + "\nglobalThis.__pcb={normDoc,padsWorldCalc};");
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
  const ref = padsKicad(arbre);
  verifier(ref.length === doc.fps.length, quoi + " : autant d'empreintes à cuivre (" + ref.length + " / " + doc.fps.length + ")");
  doc.fps.forEach((fp, i) => {
    verifier(ref[i].length === fp.pads.length, quoi + " " + fp.ref + " : nombre de pastilles");
    fp.pads.forEach((q, j) => {
      const k = ref[i][j], [x, y] = mondeOutil(fp, q.x, q.y);
      verifier(proche(x, k.x) && proche(y, k.y), quoi + " " + fp.ref + " pastille " + j + " : (" + x + ", " + y + ") ≠ KiCad (" + k.x + ", " + k.y + ")");
      const rotMonde = fp.rot + (fp.side ? -1 : 1) * q.rot;               // horaire, degrés
      verifier(proche((((rotMonde + k.P) % 180) + 180) % 180 % 180, 0, 2e-3) || proche((((rotMonde + k.P) % 180) + 180) % 180, 180, 2e-3),
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
  if (PCB) {                                       // le vrai calcul de l'éditeur, sur le document normalisé
    const n = PCB.normDoc(JSON.parse(JSON.stringify(doc)));
    verifier(n.fps.length === doc.fps.length && n.tracks.length <= doc.tracks.length, quoi + " : normDoc garde les composants");
    n.fps.forEach((fp, i) => PCB.padsWorldCalc(fp).forEach((q, j) => {
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
  });
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
    (pad "1" smd roundrect (at -0.825 0 90) (size 0.8 0.95) (layers "F.Cu" "F.Mask" "F.Paste") (roundrect_rratio 0.25) ${n(2, true)})
    (pad "2" smd roundrect (at 0.825 0 90) (size 0.8 0.95) (layers "F.Cu" "F.Mask" "F.Paste") (roundrect_rratio 0.25) ${n(3, true)}))
  (footprint "Package_TO_SOT_SMD:SOT-23" (layer "B.Cu") (at 20 10 30)
    (property "Reference" "Q1" (at 0 -2.5 30) (layer "B.SilkS") (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "BSS138" (at 0 2.5 30) (layer "B.Fab"))
    (fp_rect (start -0.7 -1.5) (end 0.7 1.5) (stroke (width 0.1) (type solid)) (fill no) (layer "B.Fab"))
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
  (segment (start 10 10.825) (end 18.627276 9.522372) (width 0.25) (layer "F.Cu") ${n(2)})
  (arc (start 30 0) (mid 31 1) (end 32 0) (width 0.3) (layer "B.Cu") ${n(1)})
  (via (at 15 12) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") ${n(1)})
  (zone ${k10 ? "" : "(net 1)"} (net_name "GND") (layer "B.Cu") (connect_pads (clearance 0.3)) (min_thickness 0.25)
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
)`;
}
const PRO = { board: { design_settings: { rules: { min_copper_edge_clearance: 0.3, min_hole_to_hole: 0.2 } } },
  net_settings: { classes: [{ name: "pwr", track_width: 0.5, clearance: null, via_diameter: 0.8, via_drill: 0.4 },
                            { name: "Default", track_width: 0.2, clearance: 0.15, via_diameter: 0.6, via_drill: 0.3 }],
                  netclass_assignments: { SIG: ["pwr"] }, netclass_patterns: [{ netclass: "pwr", pattern: "V?C" }, { netclass: "pwr", pattern: "G*" }] } };

for (const k10 of [false, true]) {
  const quoi = k10 ? "fixture KiCad 10" : "fixture KiCad 9";
  const arbre = K.lire(fixture(k10), "kicad_pcb"), rap = K.rapport();
  const { doc, empreintes } = P.lire(arbre, PRO, rap);
  const [r1, q1, j1] = doc.fps;
  verifier(doc.fps.length === 3 && doc.cu === 2, quoi + " : trois composants, deux couches");
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
  verifier(doc.zones.length === 1 && doc.zones[0].l === 1 && doc.zones[0].net === "GND" && doc.cuts.length === 2 && doc.cuts[1].l === 1, quoi + " : zone et zone interdite (deux couches)");
  verifier(proche(aire(doc.board.pts), 1000 - 100 + Math.PI * 25, 0.1) && doc.board.cutouts.length === 1 && proche(aire(doc.board.cutouts[0]), 9),
           quoi + " : contour avec un arc, découpe intérieure");
  verifier(doc.drawings.some(d => d.text === "TEST" && d.rot === 270 && d.size === 1.2) && doc.drawings.some(d => d.text === "R1" && d.layer === "silkT") &&
           doc.drawings.some(d => d.text === "Q1" && d.layer === "silkB") && !doc.drawings.some(d => d.text === "J1") && doc.drawings.some(d => d.shape === "line" && d.width === 0.12),
           quoi + " : sérigraphie des composants et de la carte dans les dessins");
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
  verifier(/\(footprint "essai:R_0603_1608Metric"/.test(out.texte) && out.librairie.get("Q1") === "essai:SOT-23" && out.empreintes.length === 3 &&
           out.pro.net_settings.classes[0].name === "Default" && out.pro.board.design_settings.rules.min_copper_edge_clearance === 0.3,
           quoi + " : identifiants de bibliothèque et .kicad_pro partiel");
  verifier(P.ecrire(doc, "essai", K.rapport(), null).texte === out.texte.replace('\n\t\t(path "/a/b")', ""), quoi + " : écriture déterministe");
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
    if (taille > 64 * 1024 * 1024) { console.log(nom + " : plus de 64 Mo (limite de l'archive), sauté"); continue; }
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
