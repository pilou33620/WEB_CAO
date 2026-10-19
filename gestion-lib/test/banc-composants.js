"use strict";
/* =============================================================================
   gestion-lib/test/banc-composants.js
   Banc de commun/composants-lib.js : contrôles d'empreinte, de ligne de
   catalogue et de brochage (module « composants » du MCP web_suite).
   ============================================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.join(__dirname, "..", "..");
let total = 0;
function verifier(cond, message) {
  total++;
  if (!cond) { console.error("  ÉCHEC : " + message); process.exitCode = 1; throw new Error(message); }
  console.log("  OK : " + message);
}
const lire = f => fs.readFileSync(path.join(RACINE, f), "utf8");

const bac = {
  console,
  document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }),
              body: { appendChild() {} }, addEventListener() {} },
  window: { location: { search: "" } },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
};
vm.createContext(bac);
for (const f of ["commun/brochage.js", "gestion-lib/js/07-import-jlc.js", "commun/composants-lib.js"])
  vm.runInContext(lire(f), bac, { filename: f });
const CL = vm.runInContext("COMPOSANTS_LIB", bac);
const copie = o => JSON.parse(JSON.stringify(o));

/* ---------- empreintes ---------- */
console.log("— empreintes —");
const SOT235 = {
  format: "pcbfp-1", name: "SOT-23-5", pkg: "SOT-23-5", pins: 5, style: "sop", pitch: 0.95, span: 2.6,
  pads: [[-1.3, -0.95], [-1.3, 0], [-1.3, 0.95], [1.3, 0.95], [1.3, -0.95]].map(([x, y], i) =>
    ({ n: i + 1, x, y, w: 1.1, h: 0.6, shape: "rect", drill: 0, rot: 0 })),
  body: { x1: -0.8, y1: -1.5, x2: 0.8, y2: 1.5 }
};
let r = CL.verifierEmpreinte(SOT235, "SOT-23-5.json");
verifier(r.erreurs.length === 0, "SOT-23-5 juste : aucune erreur (" + r.erreurs.join(" | ") + ")");
verifier(r.remarques.some(m => /dépassent du corps/.test(m)), "pattes hors du corps : une remarque, pas une erreur");

function refus(modif, motif, libelle, fichier) {
  const d = copie(SOT235);
  modif(d);
  const res = CL.verifierEmpreinte(d, fichier || d.name + ".json");
  verifier(res.erreurs.some(e => motif.test(e)), libelle + " : refusé (" + res.erreurs.join(" | ") + ")");
}
const TRAVERSANT = d => { d.style = "dip"; d.pads.forEach(q => { q.w = q.h = 1.6; }); };
refus(d => { TRAVERSANT(d); d.pads[0].drill = 1.7; }, /perçage .* plus grand/, "perçage plus grand que la pastille");
refus(d => { TRAVERSANT(d); d.pads[0].drill = 1.45; }, /couronne de 0\.08 mm/, "couronne trop fine");
refus(d => { d.pads[0].n = 6; d.pins = 5; }, /pas de pastille 1/, "pas de pastille 1");
refus(d => { d.style = "soic"; }, /style.* inconnu/, "style inconnu");
refus(d => {}, /≠ nom du fichier/, "nom ≠ fichier", "SOT23-5.json");
refus(d => { d.name = "../x"; }, /« name »/, "nom avec un chemin");
refus(d => { d.pads[2].w = 0.01; }, /largeur et hauteur/, "pastille minuscule");
refus(d => { d.pads[2].shape = "etoile"; }, /forme inconnue/, "forme inconnue");
refus(d => { d.pads[2].n = 2.5; }, /entier/, "numéro non entier");
refus(d => { d.pads[4].n = 7; d.pins = 5; }, /numérotation à trous/, "numérotation à trous");
refus(d => { d.pins = 6; }, /« pins »/, "pins faux");
refus(d => { d.pads[0].x = 150; }, /±100/, "coordonnée hors bornes");
refus(d => { d.format = "autre"; }, /format/, "format");
refus(d => { d.script = "x"; }, /clé\(s\) inconnue/, "clé inconnue");
refus(d => { d.pads[1].shape = "poly"; }, /polygone/, "polygone sans points");
refus(d => { d.body = { x1: 1, y1: 0, x2: 0, y2: 1 }; }, /body/, "corps inversé");
refus(d => { d.pads = []; }, /au moins une pastille/, "sans pastille");
refus(d => { d.description = "a\u0000b"; }, /description/, "caractère de contrôle dans la description");
verifier(CL.verifierEmpreinte(null).erreurs.length === 1, "pas un objet : refusé");

const fendue = copie(SOT235);
fendue.pads.push(Object.assign({}, fendue.pads[1], { y: 0.3, h: 0.2 }));
r = CL.verifierEmpreinte(fendue, "SOT-23-5.json");
verifier(!r.erreurs.length && r.remarques.some(m => /en double : 2/.test(m)),
  "numéro en double : remarque seulement (" + r.remarques.join(" | ") + ")");

/* ---------- symboles : la table suit le schéma ---------- */
console.log("— symboles —");
const sch = {};
vm.createContext(sch);
vm.runInContext(lire("editeur-schematique/js/02-bibliotheque.js") + ";this.__LIB = LIB;", sch);
const attendus = {};
for (const k of Object.keys(sch.__LIB)) {
  const d = sch.__LIB[k];
  attendus[k] = k === "ic" ? null : d.pn ? d.pn : d.pins.length;
}
const nos = {};
for (const k of Object.keys(CL.SYMBOLES)) nos[k] = CL.SYMBOLES[k] === Infinity ? null : CL.SYMBOLES[k];
verifier(JSON.stringify(Object.keys(nos).sort()) === JSON.stringify(Object.keys(attendus).sort()),
  "les symboles connus sont les clés de LIB du schéma");
for (const k of Object.keys(attendus))
  if (JSON.stringify(nos[k]) !== JSON.stringify(attendus[k]))
    verifier(false, "broches de « " + k + " » : " + JSON.stringify(nos[k]) + " ≠ " + JSON.stringify(attendus[k]));
verifier(true, "broches de chaque symbole identiques au schéma");

/* ---------- brochage ---------- */
console.log("— brochage —");
r = CL.verifierBrochage("IN=1,GND=2,OUT=5,NC=3/4", SOT235, "regulator");
verifier(!r.erreurs.length, "brochage d'un LDO en SOT-23-5 juste (" + r.erreurs.join(" | ") + ")");
r = CL.verifierBrochage("IN=1,GND=2,OUT=9", SOT235, "regulator");
verifier(r.erreurs.some(e => /absente\(s\) de l'empreinte : 9/.test(e)), "patte absente de l'empreinte : refusé");
r = CL.verifierBrochage("IN=1,GND=2,VOUT=5", SOT235, "regulator");
verifier(r.erreurs.some(e => /VOUT.*inconnue du symbole/.test(e)), "broche inconnue du symbole : refusé");
verifier(r.remarques.some(m => /sans patte : OUT/.test(m)), "broche du symbole oubliée : remarque");
r = CL.verifierBrochage("IN=1,GND=2,OUT=1", SOT235, "regulator");
verifier(r.erreurs.some(e => /patte 1 donnée à IN et à OUT/.test(e)), "erreurs de brochageLire reprises");
r = CL.verifierBrochage("1=1,2=2,3=3,4=4,5=5,6=6", null, "ic");
verifier(!r.erreurs.length, "ic : toutes les broches numérotées acceptées");
verifier(CL.verifierBrochage("A=1;K=2", SOT235, "diode").erreurs.length > 0, "point-virgule refusé");
verifier(CL.verifierBrochage("A=1", SOT235, "inconnu").erreurs.some(e => /inconnu/.test(e)), "symbole inconnu refusé");

/* ---------- ligne de catalogue ---------- */
console.log("— ligne de catalogue —");
const LDO = {
  "Part Name": "LDO_ESSAI_3V3", "Reference designator Prefix": "U", "Number Of pins": "5",
  "Value": "3V3", "Empreinte PCB": "SOT-23-5", "Empreinte Schématique": "regulator",
  "Brochage": "IN=1,GND=2,OUT=5,NC=3/4"
};
const ctx = { partNames: ["R0402_10K", "ldo_deja"], empreintes: ["0603", "SOT-23-5"], empreinteDef: SOT235 };
r = CL.verifierLigne(LDO, ctx);
verifier(!r.erreurs.length, "ligne juste (" + r.erreurs.join(" | ") + ")");
verifier(Object.keys(r.ligne).length === 40 && Object.keys(r.ligne)[39] === "Brochage", "39 colonnes + Brochage, dans l'ordre");
verifier(r.ligne["Empreinte PCB"] === "lib/empreinte/SOT-23-5.json" &&
         r.ligne["Empreinte Schématique"] === "lib/symbole/regulator.json", "chemins au format du catalogue");
function refusLigne(modif, motif, libelle, c) {
  const l = Object.assign({}, LDO);
  modif(l);
  const res = CL.verifierLigne(l, c || ctx);
  verifier(res.erreurs.some(e => motif.test(e)), libelle + " : refusé (" + res.erreurs.join(" | ") + ")");
}
refusLigne(l => { delete l["Reference designator Prefix"]; }, /obligatoire.*Prefix/, "colonne obligatoire manquante");
refusLigne(l => { l["Part Name"] = "LDO_DEJA"; }, /déjà au catalogue/, "Part Name déjà prise (casse ignorée)");
refusLigne(l => { l["Empreinte PCB"] = "SOT-89"; }, /absente de la LIB/, "empreinte absente");
refusLigne(l => { l["Empreinte Schématique"] = "lib/symbole/ldo.json"; }, /symbole intégré inconnu/, "symbole inconnu");
refusLigne(l => { l["Couleur"] = "bleu"; }, /colonne\(s\) inconnue/, "colonne inconnue");
refusLigne(l => { l["Value"] = "a\nb"; }, /une ligne/, "valeur sur deux lignes");
refusLigne(l => { l["Brochage"] = "IN=1,GND=2,OUT=8"; }, /absente\(s\) de l'empreinte/, "brochage incohérent");
refusLigne(l => { l["Number Of pins"] = "cinq"; }, /entier/, "nombre de broches illisible");
r = CL.verifierLigne(Object.assign({}, LDO, { "Empreinte PCB": "SOT-23-5-NEUF" }),
  Object.assign({}, ctx, { nouvelle: Object.assign(copie(SOT235), { name: "SOT-23-5-NEUF" }) }));
verifier(!r.erreurs.length, "empreinte créée par la même carte : acceptée");

/* ---------- générateurs IPC-7351B ---------- */
console.log("— générateurs —");
const gen = (f, p) => {
  const res = CL.genererEmpreinte(f, p);
  verifier(res.empreinte && !res.erreurs.length, f + " " + JSON.stringify(p) + " : généré sans erreur (" + res.erreurs.join(" | ") + ")");
  return res;
};
const proche = (a, b, tol) => Math.abs(a - b) <= tol;
/* pastille n : x, y, w, h attendus au centième (calcul à la main, IPC-7351B densité N, F 0,10, P 0,05) */
function pastille(res, n, x, y, w, h, libelle) {
  const q = res.empreinte.pads.find(p => p.n === n);
  verifier(q && proche(q.x, x, 0.006) && proche(q.y, y, 0.006) && proche(q.w, w, 0.006) && proche(q.h, h, 0.006),
    libelle + " pastille " + n + " = (" + x + ", " + y + ") " + w + " × " + h + " (obtenu " + JSON.stringify(q) + ")");
  return q;
}
/* 0603 : L 1,5-1,7, W 0,7-0,9, T 0,15-0,45 ; Z 2,429, G 0,852, X 0,929 */
r = gen("chip", { code: "0603" });
verifier(r.cotes.Z === 2.429 && r.cotes.G === 0.852 && r.cotes.X === 0.929, "0603 : Z, G, X calculés à la main");
pastille(r, 1, -0.82, 0, 0.79, 0.93, "0603");
pastille(r, 2, 0.82, 0, 0.79, 0.93, "0603");
/* SOT-23-5 : L 2,6-3,0, T 0,3-0,6, W 0,3-0,5, pas 0,95 ; Z 3,715, G 0,898, X 0,589 */
r = gen("sot", { variante: "SOT-23-5" });
pastille(r, 1, -1.15, -0.95, 1.41, 0.59, "SOT-23-5");
pastille(r, 3, -1.15, 0.95, 1.41, 0.59, "SOT-23-5");
pastille(r, 4, 1.15, 0.95, 1.41, 0.59, "SOT-23-5");
pastille(r, 5, 1.15, -0.95, 1.41, 0.59, "SOT-23-5");
verifier(r.empreinte.pins === 5 && r.empreinte.style === "sop", "SOT-23-5 : 5 broches, style sop");
/* SOIC-8 : L 5,8-6,2, T 0,4-1,27, W 0,31-0,51, pas 1,27 ; Z 6,915, G 2,978, X 0,599 */
r = gen("soic", { broches: 8, corps: [3.9, 4.9] });
pastille(r, 1, -2.47, -1.905, 1.97, 0.60, "SOIC-8");
pastille(r, 8, 2.47, -1.905, 1.97, 0.60, "SOIC-8");
pastille(r, 5, 2.47, 1.905, 1.97, 0.60, "SOIC-8");
/* QFN-16 3×3 : corps 2,9-3,1, T 0,3-0,5, W 0,18-0,30, pas 0,5 ; Z 3,729, G 2,009, X 0,264 ; EP 1,7 */
r = gen("qfn", { broches: 16, pas: 0.5, corps: [2.9, 3.1], pied: [0.3, 0.5], largeur: [0.18, 0.30], thermique: [1.7, 1.7] });
pastille(r, 1, -1.43, -0.75, 0.86, 0.26, "QFN-16");
pastille(r, 5, -0.75, 1.43, 0.26, 0.86, "QFN-16");
pastille(r, 9, 1.43, 0.75, 0.86, 0.26, "QFN-16");
pastille(r, 16, -0.75, -1.43, 0.26, 0.86, "QFN-16");
verifier(pastille(r, 17, 0, 0, 1.7, 1.7, "QFN-16").nom === "EP" && r.empreinte.pins === 17 && r.empreinte.name === "QFN-16-EP-3x3",
  "QFN-16 : pastille thermique n° 17 « EP », nom QFN-16-EP-3x3");
/* DIP-8 : patte 0,6 + jeu 0,20 → trou 0,8 ; pastille 0,8 + 2 × 0,35 = 1,5 */
r = gen("dip", { broches: 8 });
let q = pastille(r, 1, -3.81, -3.81, 1.5, 1.5, "DIP-8");
verifier(q.drill === 0.8 && q.shape === "rect" && r.empreinte.pads[1].shape === "circ", "DIP-8 : trou 0,8, pastille 1 carrée");
pastille(r, 8, 3.81, -3.81, 1.5, 1.5, "DIP-8");
pastille(r, 4, -3.81, 3.81, 1.5, 1.5, "DIP-8");
/* barrette 1×4 au pas de 2,54 : diagonale 0,905 + 0,20 → trou 1,15 ; pastille 1,85 */
r = gen("barrette", { broches: 4 });
q = pastille(r, 1, -3.81, 0, 1.85, 1.85, "1×4");
verifier(q.drill === 1.15, "1×4 : trou 1,15");
pastille(r, 4, 3.81, 0, 1.85, 1.85, "1×4");
r = gen("barrette", { broches: 5, rangees: 2 });
pastille(r, 2, -5.08, 1.27, 1.85, 1.85, "2×5");
verifier(r.empreinte.pins === 10 && r.empreinte.style === "dip", "2×5 : 10 broches, 1 et 2 face à face");
for (const [f, p] of [["sot", { variante: "SOT-23-3" }], ["sot", { variante: "SOT-23-6" }], ["sot", { variante: "SOT-223" }],
                      ["tssop", { broches: 14 }], ["msop", { broches: 10, pas: 0.5 }], ["chip", { code: "0402", densite: "M" }],
                      ["dfn", { broches: 8, pas: 0.65, corps: [2.9, 3.1], pied: [0.3, 0.5], largeur: [0.25, 0.35], thermique: [1.5, 2.4] }]])
  gen(f, p);
verifier(CL.genererEmpreinte("chip", { code: "0402", densite: "M" }).empreinte.name === "0402-M", "densité autre que N : dans le nom");

/* au dixième des empreintes de référence : KiCad (IPC-7351) et la LIB pour le 0603
   (le SOIC-8 et le SOT-23-5 de la LIB ne suivent pas l'IPC : 0,15 à 0,23 mm d'écart) */
function compare(res, n, x, w, h, libelle) {
  const p = res.empreinte.pads.find(o => o.n === n);
  verifier(proche(Math.abs(p.x), x, 0.1) && proche(p.w, w, 0.1) && proche(p.h, h, 0.1),
    libelle + " à moins de 0,1 mm (" + p.x + ", " + p.w + " × " + p.h + ")");
}
compare(CL.genererEmpreinte("chip", { code: "0603" }), 1, 0.825, 0.8, 0.95, "0603 ↔ KiCad R_0603_1608Metric");
compare(CL.genererEmpreinte("chip", { code: "0603" }), 1, 0.75, 0.825, 0.93, "0603 ↔ LIB 0603");
compare(CL.genererEmpreinte("sot", { variante: "SOT-23-5" }), 1, 1.1375, 1.325, 0.6, "SOT-23-5 ↔ KiCad SOT-23-5");
compare(CL.genererEmpreinte("soic", { broches: 8 }), 1, 2.475, 1.95, 0.6, "SOIC-8 ↔ KiCad SOIC-8_3.9x4.9mm_P1.27mm");

for (const [f, p, motif] of [
  ["soic", { broches: 8, pas: 0 }, /pas/], ["soic", { broches: 8, pas: -1 }, /pas/], ["soic", { broches: 7 }, /pair/],
  ["soic", { broches: 8, corps: [6.5, 4.9] }, /plus large que l'empattement/],
  ["soic", { broches: 8, empattement: [6.2, 5.8] }, /min ≤ max/],
  ["chip", { code: "9999" }, /code/], ["chip", {}, /longueur/],
  ["qfn", { broches: 16, pas: 0.5, corps: [2.9, 3.1], pied: [0.3, 0.5], largeur: [0.18, 0.30], thermique: [2.6, 2.6] }, /thermique trop grande/],
  ["qfn", { broches: 15, pas: 0.5, corps: [2.9, 3.1], pied: [0.3, 0.5], largeur: [0.18, 0.3] }, /multiple de 4/],
  ["qfn", { broches: 32, pas: 0.5, corps: [2.9, 3.1], pied: [0.3, 0.5], largeur: [0.18, 0.3] }, /ne tiennent pas/],
  ["soic", { broches: 8, pas: 0.5 }, /moins de 0,1 mm/], ["dip", { broches: 8, pas: 1 }, /moins de 0,2 mm/],
  ["chip", { longueur: [1, 1.1], largeur: 0.5, terminaison: [0.5, 0.6] }, /L − 2·T/],
  ["chip", { code: "0603", densite: "X" }, /densite/], ["triangle", {}, /famille inconnue/],
  ["sot", { variante: "SOT-89" }, /variante/], ["barrette", { broches: 4, rangees: 3 }, /rangees/]]) {
  const res = CL.genererEmpreinte(f, p);
  verifier(!res.empreinte && res.erreurs.some(e => motif.test(e)), f + " " + JSON.stringify(p) + " : refus clair (" + res.erreurs.join(" | ") + ")");
}
r = CL.genererEmpreinte("chip", { code: "0603", nom: "../0603" });
verifier(r.erreurs.some(e => /« name »/.test(e)), "nom imposé illisible : refusé par les contrôles");

/* ---------- la LIB réelle passe les contrôles ---------- */
const LIB = [process.env.WEB_CAO_LIB, path.join(RACINE, "LIB"), path.join(RACINE, "..", "PROJETS", "LIB_CAO")]
  .find(d => d && fs.existsSync(path.join(d, "lib_empreinte_pcb")));
if (!LIB) console.warn("  (LIB absente : contrôle des empreintes livrées sauté)");
else {
  const dossier = path.join(LIB, "lib_empreinte_pcb");
  const fautives = [];
  let n = 0;
  for (const f of fs.readdirSync(dossier).filter(f => f.endsWith(".json"))) {
    n++;
    const e = CL.verifierEmpreinte(JSON.parse(fs.readFileSync(path.join(dossier, f), "utf8")), f).erreurs;
    if (e.length) fautives.push(f + " : " + e[0]);
  }
  verifier(!fautives.length, n + " empreintes de la LIB passent les contrôles" + (fautives.length ? " — " + fautives.slice(0, 5).join(" ; ") : ""));
}

console.log("— " + total + " contrôles —");
