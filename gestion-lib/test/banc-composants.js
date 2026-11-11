"use strict";
/* =============================================================================
   gestion-lib/test/banc-composants.js
   Banc de commun/composants-lib.js : contrôles d'empreinte et de brochage,
   générateurs, conversion KiCad (module « composants » du MCP web_suite).
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
for (const f of ["commun/echappe.js", "commun/brochage.js", "gestion-lib/js/07-import-jlc.js", "commun/composants-lib.js"])
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

const traits = copie(SOT235);
traits.lines = [{ x1: -1, y1: -1, x2: 1, y2: -1, width: 0.15 }];
r = CL.verifierEmpreinte(traits, "SOT-23-5.json");
verifier(!r.erreurs.length && r.remarques.some(m => /lines/.test(m)), "traits de sérigraphie « lines » (écrits par Gestion LIB) : acceptés, remarque seulement");
refus(d => { d.lines = [{ x1: "a", y1: 0, x2: 1, y2: 0 }]; }, /trait 1/, "trait de sérigraphie à coordonnée non numérique");

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
/* 0603 : L 1,5-1,7, W 0,7-0,9, T 0,15-0,45 ; talon 0 (IPC-7351B relayé par KiCad) : Z 2,429, G 0,752, X 0,929 */
r = gen("chip", { code: "0603" });
verifier(r.cotes.Z === 2.429 && r.cotes.G === 0.752 && r.cotes.X === 0.929, "0603 : Z, G, X calculés à la main");
pastille(r, 1, -0.795, 0, 0.838, 0.929, "0603");
pastille(r, 2, 0.795, 0, 0.838, 0.929, "0603");
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

/* le formulaire de Gestion LIB : ses textes deviennent les mêmes paramètres que ceux de Claude */
{
  const lu = CL.lireParametres("soic", { broches: "8", pas: "1,27", empattement: "5,8 / 6,2", corps: "3,9 x 4,9", pied: " " });
  verifier(!lu.erreurs.length && JSON.stringify(lu.parametres) === '{"broches":8,"pas":1.27,"empattement":[5.8,6.2],"corps":[3.9,4.9]}',
    "formulaire : virgule décimale, min et max, largeur × longueur, champ vide omis (" + JSON.stringify(lu) + ")");
  verifier(JSON.stringify(CL.genererEmpreinte("soic", lu.parametres).empreinte) ===
           JSON.stringify(CL.genererEmpreinte("soic", { broches: 8, pas: 1.27, empattement: [5.8, 6.2], corps: [3.9, 4.9] }).empreinte),
    "formulaire : même empreinte que l'appel direct");
  const faux = CL.lireParametres("soic", { broches: "8,5", empattement: "5.8 6.0 6.2", corps: "3.9", pas: "1.27mm" });
  verifier(faux.erreurs.length === 4 && !Object.keys(faux.parametres).length, "formulaire : entier, trois nombres, paire incomplète, unité collée refusés");
  verifier(CL.lireParametres("chip", { code: "9999" }).erreurs.length === 1 && CL.lireParametres("chip", { code: "0603" }).parametres.code === "0603",
    "formulaire : un choix hors liste est refusé");
  verifier(CL.lireParametres("bga", {}).erreurs.length === 1, "formulaire : famille inconnue refusée");
  /* chaque champ du formulaire est un paramètre que les familles lisent (la liste de
     lanceur/mcp_composants.py, PARAMETRES, côté web_suite) */
  const permis = ["code", "variante", "densite", "nom", "broches", "pas", "rangee", "rangees", "diametre", "longueur",
                  "largeur", "terminaison", "empattement", "pied", "languette", "corps", "thermique"];
  const champs = [].concat(...Object.values(CL.CHAMPS)).map(c => c[0]);
  verifier(champs.every(c => permis.includes(c)), "formulaire : aucun champ hors des paramètres connus");
}

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
/* LES MÊMES COTES DE BOÎTIER QUE KICAD (kicad-footprint-generator, data/SMD_2terminal_chip_molded,
   data/package/no_lead) : l'écart ne vient plus que de son arrondi au 0,05 (0,02 pour les < 0603) */
function auCentieme(res, n, x, w, h, tol, libelle) {
  const p = res.empreinte.pads.find(o => o.n === n);
  verifier(proche(Math.abs(p.x), x, tol) && proche(p.w, w, tol) && proche(p.h, h, tol),
    libelle + " à " + tol + " mm (" + p.x + ", " + p.w + " × " + p.h + ")");
}
auCentieme(CL.genererEmpreinte("chip", { code: "0603", longueur: [1.5, 1.7], largeur: [0.7, 0.95], terminaison: [0.15, 0.4] }),
           2, 0.825, 0.8, 0.95, 0.025, "0603 ↔ KiCad R_0603_1608Metric, mêmes cotes");
auCentieme(CL.genererEmpreinte("chip", { code: "0402", longueur: [1.0, 1.1], largeur: [0.48, 0.6], terminaison: [0.1, 0.3] }),
           2, 0.51, 0.54, 0.64, 0.01, "0402 ↔ KiCad R_0402_1005Metric, mêmes cotes");
auCentieme(CL.genererEmpreinte("chip", { code: "0201" }), 2, 0.32, 0.46, 0.40, 0.01, "0201 ↔ KiCad R_0201_0603Metric");
auCentieme(CL.genererEmpreinte("qfn", { broches: 16, pas: 0.5, corps: [2.85, 3.15], pied: [0.3, 0.5], largeur: [0.18, 0.3], thermique: [0.8, 0.8] }),
           1, 1.4375, 0.875, 0.25, 0.025, "QFN-16 ↔ KiCad Texas_RTE0016D_WQFN-16-1EP_3x3mm_P0.5mm, mêmes cotes");

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
/* QFN rectangulaire : haut et bas sur la cote Y (corps 3 × 4 : Z/G de la cote Y = celles du
   QFN 3×3 décalées de 0,5 mm) ; angles qui se toucheraient : refusés */
r = gen("qfn", { broches: 16, pas: 0.5, corps: [2.9, 3.1], longueur: [3.9, 4.1], pied: [0.3, 0.5], largeur: [0.18, 0.30] });
pastille(r, 1, -1.43, -0.75, 0.86, 0.26, "QFN 3×4");
pastille(r, 5, -0.75, 1.93, 0.26, 0.86, "QFN 3×4 (bas, cote Y)");
pastille(r, 13, 0.75, -1.93, 0.26, 0.86, "QFN 3×4 (haut, cote Y)");
r = CL.genererEmpreinte("qfn", { broches: 20, pas: 0.5, corps: [2.9, 3.1], pied: [0.3, 0.5], largeur: [0.18, 0.30] });
verifier(!r.empreinte && r.erreurs.some(e => /côté voisin/.test(e)), "QFN-20 3×3 : pastilles d'angle qui se toucheraient, refusé (" + r.erreurs.join(" | ") + ")");
refus(d => { d.pads[1].y = -0.7; }, /se recouvrent.*1\/2/, "deux pastilles qui se recouvrent");

r = CL.genererEmpreinte("chip", { code: "0603", nom: "../0603" });
verifier(r.erreurs.some(e => /« name »/.test(e)), "nom imposé illisible : refusé par les contrôles");

/* ---------- conversion KiCad ---------- */
console.log("— conversion KiCad —");
const KICAD_SOT235 = `(footprint "SOT-23-5" (version 20221018) (generator pcbnew)
  (layer "F.Cu")
  (descr "SOT, 5 Pin (https://www.jedec.org/sites/default/files/docs/Mo-178c.PDF variant AA), generated with kicad-footprint-generator ipc_gullwing_generator.py")
  (tags "SOT TO_SOT_SMD")
  (attr smd)
  (fp_text reference "REF**" (at 0 -2.4) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
  (fp_text value "SOT-23-5" (at 0 2.4) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
  (fp_line (start 0 -1.56) (end -1.8 -1.56) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
  (fp_line (start -2.05 -1.7) (end 2.05 -1.7) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))
  (fp_line (start -0.4 -1.45) (end 0.8 -1.45) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (fp_line (start 0.8 -1.45) (end 0.8 1.45) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (fp_line (start 0.8 1.45) (end -0.8 1.45) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (fp_line (start -0.8 1.45) (end -0.8 -1.05) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (fp_line (start -0.8 -1.05) (end -0.4 -1.45) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (fp_arc (start 0 0) (mid 0.1 0.1) (end 0.2 0) (stroke (width 0.1) (type solid)) (layer "F.SilkS"))
  (fp_text user "\${REFERENCE}" (at 0 0 90) (layer "F.Fab") (effects (font (size 0.4 0.4) (thickness 0.06))))
  (pad "1" smd roundrect (at -1.1375 -0.95) (size 1.325 0.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (pad "2" smd roundrect (at -1.1375 0) (size 1.325 0.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (pad "3" smd roundrect (at -1.1375 0.95) (size 1.325 0.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (pad "4" smd roundrect (at 1.1375 0.95) (size 1.325 0.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (pad "5" smd roundrect (at 1.1375 -0.95) (size 1.325 0.6) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))
  (model "\${KICAD6_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23-5.wrl"
    (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
)`;
r = CL.convertirKicad(KICAD_SOT235);
verifier(r.empreinte && !r.erreurs.length, "SOT-23-5 KiCad converti sans erreur (" + r.erreurs.join(" | ") + ")");
const e = r.empreinte;
verifier(e.name === "SOT-23-5" && e.pins === 5 && e.style === "sop" && e.pads.length === 5, "nom, 5 broches, style sop");
verifier(JSON.stringify(e.pads[0]) === JSON.stringify({ n: 1, x: -1.1375, y: -0.95, w: 1.325, h: 0.6, shape: "rect", drill: 0, rot: 0 }),
  "pastille 1 : numéro, position, taille, roundrect → rect (" + JSON.stringify(e.pads[0]) + ")");
verifier(e.pads[4].n === 5 && e.pads[4].x === 1.1375 && e.pads[4].y === -0.95, "pastille 5 en haut à droite");
verifier(JSON.stringify(e.body) === JSON.stringify({ x1: -0.8, y1: -1.45, x2: 0.8, y2: 1.45 }), "corps = contour F.Fab");
verifier(/^SOT, 5 Pin/.test(e.description), "description reprise");
const nonRepris = r.remarques.find(m => /^non repris/.test(m)) || "";
verifier(/3 texte/.test(nonRepris) && /1 modèle\(s\) 3D/.test(nonRepris) && /1 arc/.test(nonRepris) && /F\.SilkS/.test(nonRepris),
  "textes, modèle 3D, arc, sérigraphie : en remarque (" + nonRepris + ")");

/* traversant, forme rect, rotation de 90°, trou non métallisé, oblong, ancien format « module » */
r = CL.convertirKicad(`(module Essai_THT (layer F.Cu)
  (pad 1 thru_hole rect (at 0 0) (size 1.7 1.7) (drill 1) (layers *.Cu *.Mask))
  (pad 2 thru_hole oval (at 2.54 0 90) (size 1.7 2.2) (drill oval 1 1.4) (layers *.Cu *.Mask))
  (pad "" np_thru_hole circle (at 1.27 3) (size 3.2 3.2) (drill 3.2) (layers *.Cu *.Mask)))`);
verifier(r.empreinte && !r.erreurs.length, "ancien format « module » converti (" + r.erreurs.join(" | ") + ")");
verifier(r.empreinte.pads[0].shape === "sharp" && r.empreinte.pads[0].drill === 1, "rect KiCad → angles droits, perçage");
verifier(r.empreinte.pads[1].w === 2.2 && r.empreinte.pads[1].h === 1.7 && r.empreinte.pads[1].rot === 0 &&
         r.empreinte.pads[1].drill === 1 && r.empreinte.pads[1].slot === 1.4, "rotation 90° → largeur et hauteur échangées ; perçage oblong");
verifier(JSON.stringify(r.empreinte.holes) === JSON.stringify([{ x: 1.27, y: 3, d: 3.2 }]) && r.empreinte.style === "row",
  "trou non métallisé repris, style row");
verifier(r.remarques.some(m => /pas de corps/.test(m)), "pas de F.Fab : remarque « pas de corps »");

/* cercle F.Fab : le corps prend tout le disque ; pastille sans cuivre écartée ; trou oblong et
   sous-éléments de pastille signalés ; description coupée par caractères entiers */
r = CL.convertirKicad(`(footprint "CP_Radial" (layer "F.Cu") (descr "${"é😀".repeat(1500)}")
  (fp_circle (center 1.25 0) (end 3.75 0) (stroke (width 0.1) (type solid)) (layer "F.Fab"))
  (pad "1" thru_hole rect (at 0 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask") (solder_mask_margin 0.1))
  (pad "2" thru_hole circle (at 2.5 0) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask"))
  (pad "3" smd rect (at 0 3) (size 1 1) (layers "F.Mask"))
  (pad "" np_thru_hole oval (at 1 -3) (size 1 2) (drill oval 1 2) (layers "*.Cu")))`);
verifier(r.empreinte && JSON.stringify(r.empreinte.body) === JSON.stringify({ x1: -1.25, y1: -2.5, x2: 3.75, y2: 2.5 }),
  "cercle F.Fab : corps = disque entier (" + JSON.stringify(r.empreinte && r.empreinte.body) + ")");
verifier(r.empreinte.pins === 2 && r.remarques.some(m => /« 3 » sans cuivre/.test(m)), "pastille sans cuivre écartée, en remarque");
verifier(r.remarques.some(m => /oblong/.test(m)) && r.remarques.some(m => /solder_mask_margin/.test(m)),
  "trou oblong et sous-élément de pastille en remarque (" + r.remarques.join(" | ") + ")");
verifier(!/[\ud800-\udbff]$/.test(r.empreinte.description) && Array.from(r.empreinte.description).length === 2000,
  "description coupée sans trancher un caractère");
r = CL.convertirKicad('(footprint "X" (pad "1" thru_hole circle (at 0 0) (size 1.6 1.6) (layers "*.Cu")))');
verifier(!r.empreinte && r.erreurs.some(e => /sans perçage/.test(e)), "traversante sans perçage : refusé");

/* BGA : noms de pattes renumérotés, nom gardé */
r = CL.convertirKicad(`(footprint "BGA-4" (layer "F.Cu")
  (pad "A1" smd circle (at -0.4 -0.4) (size 0.3 0.3) (layers "F.Cu"))
  (pad "A2" smd circle (at 0.4 -0.4) (size 0.3 0.3) (layers "F.Cu"))
  (pad "B1" smd circle (at -0.4 0.4) (size 0.3 0.3) (layers "F.Cu"))
  (pad "B2" smd circle (at 0.4 0.4) (size 0.3 0.3) (layers "F.Cu")))`);
verifier(r.empreinte && r.empreinte.pads.map(q => q.n + q.nom).join() === "1A1,2A2,3B1,4B2", "noms de pattes : numéros 1 à 4, nom gardé");

for (const [texte, motif, libelle] of [
  ['(footprint "X" (pad "1" smd custom (at 0 0) (size 1 1) (layers "F.Cu")))', /personnalisée/, "pastille personnalisée"],
  ['(footprint "X" (pad "1" smd trapezoid (at 0 0) (size 1 1) (layers "F.Cu")))', /forme de pastille inconnue/, "trapèze"],
  ['(footprint "X" (pad "1" smd rect (at 0 0) (size 1 1)', /non fermée/, "parenthèse non fermée"],
  ['bonjour', /commencer par/, "texte illisible"],
  ['(symbol "X")', /ni « footprint »/, "pas une empreinte"],
  ['(footprint "X" (pad "1" smd rect (at a b) (size 1 1)))', /position/, "nombre illisible"],
  ['(footprint "X" (fp_text reference "R"))', /sans pastille/, "sans pastille"],
  ['(footprint "X"' + "(a".repeat(60) + ")".repeat(61), /profonde/, "imbrication trop profonde"],
  ['(footprint "X" (descr "' + "x".repeat(210 * 1024) + '"))', /200 Ko/, "plus de 200 Ko"],
  [42, /vide/, "pas un texte"]]) {
  const res = CL.convertirKicad(texte);
  verifier(!res.empreinte && res.erreurs.some(m => motif.test(m)), libelle + " : refusé (" + res.erreurs.join(" | ") + ")");
}
r = CL.convertirKicad('(footprint "a/../b c" (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))');
verifier(r.empreinte && r.empreinte.name === "a_.._b_c" && r.remarques.some(m => /ramené/.test(m)), "nom ramené aux caractères permis");

/* ---------- commandes de Gestion LIB (08-pilote-lib.js), faux serveur ---------- */
console.log("— commandes de Gestion LIB —");
bac.obtenirFichierLib = async (type, nom) => nom === "SOT-23-5.json" ? SOT235 : null;
vm.runInContext(lire("gestion-lib/js/08-pilote-lib.js"), bac, { filename: "08-pilote-lib.js" });
const CMD = vm.runInContext("libPiloteCommandes()", bac);
const asyncTests = (async () => {
  verifier(Object.keys(CMD).sort().join() === "lib_brochage_verifier,lib_empreinte_generer,lib_empreinte_verifier,lib_kicad_convertir" &&
           Object.values(CMD).every(c => !c.ecriture), "les commandes ne font que calculer : aucune n'écrit");
  r = await CMD.lib_brochage_verifier.executer({ brochage: "IN=1,GND=2,OUT=9", empreinte: "SOT-23-5", symbole: "regulator" });
  verifier(r.erreurs.some(e => /absente/.test(e)), "lib_brochage_verifier : empreinte lue dans la LIB par son nom");
  r = await CMD.lib_empreinte_generer.executer({ famille: "chip", parametres: { code: "0603" } });
  verifier(r.empreinte && r.empreinte.name === "0603", "lib_empreinte_generer");
  r = await CMD.lib_empreinte_verifier.executer({ empreinte: SOT235 });
  verifier(!r.erreurs.length, "lib_empreinte_verifier : nom de fichier tiré du nom");
  r = await CMD.lib_kicad_convertir.executer({ texte: KICAD_SOT235 });
  verifier(r.empreinte && r.empreinte.pads.length === 5, "lib_kicad_convertir");
})();

/* ---------- esc (commun/echappe.js) : protège ?nom= avant innerHTML dans l'éditeur ---------- */
{
  const esc = vm.runInNewContext(lire("commun/echappe.js") + ";esc");
  verifier(esc(`<img src=x onerror="a('1')">&`) === "&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;&amp;" && esc(null) === "" && esc(0) === "0",
    "esc échappe < > & \" ' et rend vide pour null, « 0 » pour 0");
}

/* ---------- un Touchstone lié à une référence (inspecteur de Gestion LIB) ---------- */
console.log("— Touchstone —");
{
  const S3P = "! fabricant\n# GHz S DB R 50\n0.1 -20 0 -0.2 0 -40 0 -0.2 0 -20 0 -40 0 -40 0 -40 0 -1 0\n";
  const AS179 = "J3=1,GND=2,J2=3,V1=4,J1=5,V2=6";
  verifier(CL.portsTouchstone("a.s3p") === 3 && CL.portsTouchstone("A.S2P") === 2 && CL.portsTouchstone("a.sub") === 0,
    "Touchstone : le nombre de ports se lit dans l'extension");
  let r = CL.brancherTouchstone(S3P, "as179.s3p", { broches: ["J1", "J2", "J3"], masse: "gnd", brochage: AS179, pins: 6 });
  verifier(!r.erreurs.length && r.texte.startsWith("! broches : 5 3 1\n! masse : 2\n! fabricant\n# GHz"),
    "Touchstone : noms du brochage → pattes, lignes « ! broches » et « ! masse » en tête");
  /* la page RF relit ce qu'on écrit (même syntaxe que simRfBrochesSnp) */
  const b = CL.lireBranchement(r.texte);
  verifier(b && b.broches.join(" ") === "5 3 1" && b.masse === "2", "Touchstone : le branchement écrit se relit");
  const r2 = CL.brancherTouchstone(r.texte, "as179.s3p", { broches: ["5", "1", "3"], masse: "", pins: 6 });
  verifier(!r2.erreurs.length && r2.texte.startsWith("! broches : 5 1 3\n! fabricant") && !/masse/.test(r2.texte),
    "Touchstone : relié une deuxième fois, l'ancien branchement est remplacé");
  const refus = (s, nom, motif, quoi) => {
    const x = CL.brancherTouchstone(S3P, nom || "a.s3p", s);
    verifier(!x.texte && x.erreurs.some(e => motif.test(e)), "Touchstone refusé : " + quoi + " (" + x.erreurs[0] + ")");
  };
  refus({ broches: ["5", "3"], pins: 6 }, null, /3 port/, "une patte par port");
  refus({ broches: ["5", "3", "9"], pins: 6 }, null, /hors de 1 à 6/, "patte hors de l'empreinte");
  refus({ broches: ["5", "3", "5"], pins: 6 }, null, /deux fois/, "même patte deux fois");
  refus({ broches: ["5", "3", "1"], masse: "5", pins: 6 }, null, /deux fois/, "la masse est aussi un port");
  refus({ broches: ["J1", "J2", "X9"], brochage: AS179 }, null, /X9/, "nom inconnu du brochage");
  refus({ broches: ["IN", "OUT", "GND"], brochage: "IN=1,OUT=2,GND=3/4" }, null, /plusieurs pattes/, "broche sur plusieurs pattes");
  refus({ broches: ["1"] }, "a.sub", /Touchstone/, "pas un .sNp");
  verifier(!CL.brancherTouchstone("1 2 3", "a.s1p", { broches: ["1"] }).texte, "Touchstone refusé : sans ligne « # »");
}

/* ---------- case du catalogue ---------- */
console.log("— case du catalogue —");
for (const [col, v, motif, quoi] of [
  ["Value", '=HYPERLINK("http://x")', /formule/, "formule ="], ["Value", "@SUM(1)", /formule/, "formule @"],
  ["Value", "+cmd|' /C calc'!A0", /formule/, "formule +lettre"], ["Value", "AMS1117\u200b-3.3", /invisible/, "caractère invisible"],
  ["Value", "x".repeat(501), /500/, "501 caractères"], ["Value", "a\tb", /contrôle/, "tabulation"],
  ["Reference designator Prefix", "", /préfixe/, "préfixe vide"], ["Reference designator Prefix", "R1", /préfixe/, "préfixe à chiffre"],
  ["Number Of pins", "0", /entier/, "zéro patte"], ["Number Of pins", "8a", /entier/, "pattes non entières"]])
  verifier(motif.test(CL.verifierCase(col, v) || ""), "case refusée : " + quoi);
for (const [col, v] of [["Value", "-40"], ["tolerance", "+/-20%"], ["Description", "sur\ndeux lignes"], ["Value", ""],
                        ["Reference designator Prefix", "U"], ["Number Of pins", "8"]])
  verifier(CL.verifierCase(col, v) === null, "case acceptée : " + col + " = " + JSON.stringify(v));

/* ---------- les contrôles de la page ----------
   Les vraies fonctions de Gestion LIB, sur un faux DOM et un faux serveur : ce que chaque contrôle
   envoie, écrit et affiche. Pas de navigateur. */
const banc = (async () => {
  await asyncTests;
  console.log("— contrôles de la page —");
  const noeuds = {};
  const noeud = id => noeuds[id] || (noeuds[id] = {
    id, value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, style: {}, dataset: {}, onclick: null,
    classList: { toggle() {}, add() {}, remove() {} }, accept: "", champs: [], querySelectorAll() { return this.champs; },
    querySelector: q => noeud("q:" + q), addEventListener() {}, getAttribute: () => null, setAttribute() {}, appendChild() {}, focus() {} });
  const appels = [], fichiersLib = {}, confirmes = [];
  const serveur = { reponse: () => ({ ok: true, mtime_ms: 2, mtime_avant: 1, champs: {} }) };
  const page = {
    console,
    document: { getElementById: noeud, querySelector: () => null, querySelectorAll: () => [], createElement: () => noeud("?"),
                body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} } }, addEventListener() {} },
    window: { location: { search: "" }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    confirm: m => { confirmes.push(m); return false; },
    setTimeout: () => 0, clearTimeout() {},
    fetch: async (url, o) => {
      const corps = o && o.body ? JSON.parse(o.body) : null;
      if (!o || o.method !== "POST") {
        const u = new URL(url, "http://x"), nom = u.searchParams.get("nom");
        if (nom in fichiersLib) return { ok: true, json: async () => ({ data: fichiersLib[nom] }) };
        return { ok: false, status: 404, json: async () => ({ detail: "absent" }) };
      }
      appels.push({ url, corps });
      const r = serveur.reponse(url, corps);
      return r.status ? { ok: false, status: r.status, json: async () => ({ detail: r.detail }) } : { ok: true, json: async () => r };
    }
  };
  vm.createContext(page);
  for (const f of ["commun/echappe.js", "commun/csv.js", "commun/brochage.js", "gestion-lib/js/07-import-jlc.js", "commun/composants-lib.js",
                   "gestion-lib/js/01-donnees.js", "gestion-lib/js/04-ui.js", "gestion-lib/js/05-editeur-lib.js", "gestion-lib/js/09-audit.js"])
    vm.runInContext(lire(f), page, { filename: f });
  const ici = code => vm.runInContext(code, page);
  const etat = ici("LIB_STATE");
  etat.colonnes = ici("COLONNES_CATALOGUE_39").concat("Brochage");
  etat.mtime = 1;

  /* les ids que les fonctions et Claude visent existent dans la page */
  const html = lire("gestion-lib/gestion-lib.html");
  for (const id of ["bImportKicad", "kicadZone", "kicadTexte", "kicadFichier", "bKicadConvertir", "kicadMessage", "bBrochageVerifier",
                    "inspBrochageEcarts", "inspColonnes", "bColonnesEnregistrer", "inspColonnesMessage", "simModeleTexte",
                    "simModeleNom", "bSimModeleEcrire", "simModeleMessage", "inspSimFichier"])
    verifier(new RegExp('id="' + id + '"').test(html), "#" + id + " est dans la page");

  /* 1. import KiCad : remplit sans écrire ; un échec ne change rien */
  const data0 = { format: "pcbfp-1", name: "AVANT", pads: [] };
  const edit = ici("EDITEUR_LIB");
  edit.type = "pcb"; edit.data = data0; edit.historique = []; edit.pileRedo = [];
  noeud("editeurNomFichier").value = "AVANT.json";
  noeud("editeurCodeJson").value = "AVANT";
  noeud("kicadTexte").value = "(rien du tout)";
  ici("editeurKicadConvertir()");
  verifier(edit.data === data0 && noeud("editeurCodeJson").value === "AVANT" && noeud("editeurNomFichier").value === "AVANT.json" &&
           /Rien n'a changé/.test(noeud("kicadMessage").textContent), "KiCad illisible : éditeur inchangé, message (" + noeud("kicadMessage").textContent.replace(/\n/g, " ") + ")");
  noeud("kicadTexte").value = '(footprint "Lib:R<img src=x>" (fp_text reference R1 (at 0 0)) ' +
    '(pad 1 smd rect (at -1 0) (size 1 1) (layers F.Cu)) (pad 2 smd rect (at 1 0) (size 1 1) (layers F.Cu)))';
  ici("editeurKicadConvertir()");
  const conv = JSON.parse(noeud("editeurCodeJson").value);
  verifier(edit.data.pads.length === 2 && conv.pads.length === 2 && edit.historique.length === 1, "KiCad converti : l'éditeur reçoit les 2 pastilles, Ctrl+Z possible");
  verifier(/^[A-Za-z0-9_.+-]+\.json$/.test(noeud("editeurNomFichier").value), "KiCad : le nom de fichier suit (nettoyé) : " + noeud("editeurNomFichier").value);
  verifier(/ramené/.test(noeud("kicadMessage").textContent) && noeud("kicadMessage").innerHTML === "", "KiCad : remarques montrées, en texte seulement");
  verifier(!appels.length, "KiCad : rien n'est écrit sur le serveur");
  edit.type = "schematique"; edit.data = "SYM";
  ici("editeurKicadConvertir()");
  verifier(edit.data === "SYM", "KiCad : sans effet sur un symbole");

  /* 2. brochage face au symbole et à l'empreinte : lecture seule */
  fichiersLib["FP8.json"] = { pads: [1, 2, 3].map(n => ({ n })) };
  fichiersLib["MONSYM.json"] = { pins: [{ n: 1, name: "IN" }, { n: 2, name: "OUT" }] };
  const ecarts = (comp, texte) => ici("inspBrochageEcarts")(comp, texte);
  const nu = { "Empreinte Schématique": "lib/symbole/monsym.json", "Empreinte PCB": "lib/empreinte/FP8.json" };
  let l = await ecarts({ "Empreinte Schématique": "MONSYM.json", "Empreinte PCB": "FP8.json" }, "IN=1,OUT=2,NC=3");
  verifier(l.length === 1 && /Aucun écart/.test(l[0]), "brochage juste : aucun écart (" + l.join(" | ") + ")");
  l = await ecarts({ "Empreinte Schématique": "MONSYM.json", "Empreinte PCB": "FP8.json" }, "IN=1,XX=9");
  verifier(l.some(x => /⛔.*patte\(s\) absente.*9/.test(x)) && l.some(x => /⛔.*« XX »/.test(x)) && l.some(x => /ℹ️.*OUT/.test(x)), "brochage faux : patte et broche signalées (" + l.join(" | ") + ")");
  l = await ecarts({ "Empreinte Schématique": "ic.json", "Empreinte PCB": "" }, "A=1");
  verifier(l.length === 1 && /non associée.*non contrôlées/.test(l[0]), "symbole intégré sans empreinte : dit que les pattes ne sont pas contrôlées");
  l = await ecarts(nu, "IN=1");
  verifier(l.some(x => /« monsym » introuvable/.test(x)), "symbole absent de la LIB : dit, pas d'erreur inventée");
  verifier(!appels.length, "brochage : rien n'est écrit");

  /* 3. colonnes de la fiche : seules les cases changées partent, avec leur valeur lue */
  const COMP = { _id: 7, "Part Name": "U1", Value: "1k", Description: 'sur\r\ndeux "lignes"', Manufacturer: "<b>x</b>", "Number Of pins": "8" };
  etat.composants = [COMP];
  ici("inspColonnesAfficher")(COMP);
  const fiche = noeud("inspColonnes").innerHTML;
  verifier(fiche.includes('id="inspCol-Value"') && fiche.includes('id="inspCol-frequency"') && fiche.includes('data-col="manufacturer part Number"'), "fiche : #id stables");
  verifier(!fiche.includes("<b>x") && fiche.includes("&lt;b&gt;x"), "fiche : le contenu d'une case est échappé");
  verifier(/<textarea[^>]*data-col="Description"/.test(fiche), "fiche : la description garde ses lignes");
  const champ = (col, value) => ({ value, dataset: { col } });
  noeud("inspColonnes").champs = [champ("Value", " 2k "), champ("Description", 'sur\ndeux "lignes"'), champ("Manufacturer", "<b>x</b>"), champ("Vendor", "")];
  verifier(JSON.stringify(ici("inspColonnesChangees")(COMP)) === '{"Value":"2k"}', "fiche : seule la case changée part (fin de ligne et espaces ignorés)");

  serveur.reponse = () => ({ status: 409, detail: "La reference a change depuis sa lecture (Value) : relis-la" });
  await ici("inspColonnesEnregistrer")(COMP);
  const envoi = appels[appels.length - 1].corps.modifier;
  verifier(JSON.stringify(envoi) === '{"part":"U1","champs":{"Value":"2k"},"avant":{"Value":"1k"}}', "fiche : route « modifier » avec la valeur lue");
  verifier(/Rien n'est écrit.*a change.*Recharge/.test(noeud("inspColonnesMessage").textContent) && COMP.Value === "1k" && etat.mtime === 1 && !noeud("bColonnesEnregistrer").disabled,
           "fiche : conflit lisible, miroir et date inchangés");
  const diffuses = [], envois = [];
  page.sessDiffuserLibModif = m => diffuses.push(m);
  page.projdSuiteDispo = () => ({ then: f => { envois.push(1); f(false); } });
  serveur.reponse = (_, c) => ({ ok: true, champs: c.modifier.champs, mtime_avant: 1, mtime_ms: 2 });
  await ici("inspColonnesEnregistrer")(COMP);
  verifier(COMP.Value === "2k" && etat.mtime === 2, "fiche : le miroir et la date suivent l'écriture");
  verifier(diffuses.length === 1 && diffuses[0].genre === "catalogue" && envois.length === 1, "fiche : les autres pages sont prévenues (sessDiffuserLibModif, libSuiteNoter)");
  verifier(etat.sale !== true, "fiche : pas de modification en attente après l'écriture");
  serveur.reponse = (_, c) => ({ ok: true, champs: c.modifier.champs, mtime_avant: 99, mtime_ms: 100 });
  noeud("inspColonnes").champs = [champ("Value", "3k")];
  await ici("inspColonnesEnregistrer")(COMP);
  verifier(etat.mtime === 2, "fiche : quelqu'un d'autre a écrit entre-temps, la date reste périmée (l'enregistrement complet sera refusé)");
  const nb = appels.length;
  noeud("inspColonnes").champs = [champ("Value", "=1+1")];
  await ici("inspColonnesEnregistrer")(COMP);
  verifier(appels.length === nb && /formule/.test(noeud("inspColonnesMessage").textContent), "fiche : une formule est refusée avant d'appeler le serveur");
  noeud("inspColonnes").champs = [champ("Value", "3k")];
  await ici("inspColonnesEnregistrer")(COMP);
  verifier(appels.length === nb && /Aucune colonne/.test(noeud("inspColonnesMessage").textContent), "fiche : rien de modifié, rien d'envoyé");

  /* 4. une création suivie de l'édition couvre toutes les colonnes */
  etat.composants = [];
  etat.sale = false;
  etat.fichiers = { pcb: [], schematique: [], simulation: [] };
  noeud("newPartName").value = "NOUVEAU"; noeud("newPrefix").value = "u";
  ici("creerNouveauComposant()");
  const neuf = etat.composants[0];
  verifier(neuf["Part Name"] === "NOUVEAU" && etat.sale === true, "création : la ligne attend « Enregistrer »");
  serveur.reponse = () => ({ status: 404, detail: "« NOUVEAU » n'est pas au catalogue" });
  noeud("inspColonnes").champs = [champ("Part Type", "IC")];
  await ici("inspColonnesEnregistrer")(neuf);
  verifier(/clique d'abord « 💾 Enregistrer »/.test(noeud("inspColonnesMessage").textContent), "création puis édition sans enregistrer : le refus dit quoi faire");
  ici("inspColonnesAfficher")(neuf);
  const ouverte = noeud("inspColonnes").innerHTML, hors = ici("COLONNES_HORS_FICHE");
  const manque = etat.colonnes.filter(c => !hors.includes(c) && !ouverte.includes('data-col="' + c + '"'));
  verifier(!manque.length, "création puis édition : " + (etat.colonnes.length - hors.filter(c => etat.colonnes.includes(c)).length) + " colonnes dans la fiche" + (manque.length ? ", manquent " + manque : ""));
  const ui = lire("gestion-lib/js/04-ui.js");
  verifier(html.includes('id="newPartName"') && html.includes('id="inspBrochage"') && /selAssoc\(colPcb/.test(ui) && /selAssoc\(colSch/.test(ui) && /selAssoc\(colSim/.test(ui),
           "les colonnes hors fiche ont leur contrôle (Part Name : création ; associations : listes du tableau ; Brochage : inspecteur)");

  /* 5. modèle écrit dans la page : mêmes extensions, jamais d'écrasement, puis même liaison */
  noeud("inspSimFichier").accept = html.match(/id="inspSimFichier"[^>]*accept="([^"]+)"/)[1];
  const C5 = { _id: 9, "Part Name": "R1", "Number Of pins": "2", "Modèle Simulation": "lib/simulation/a.sub" };
  etat.composants = [C5];
  etat.colonnes = ["Part Name", "Number Of pins", "Modèle Simulation"];
  etat.sale = false;
  ici("inspSimAfficher")(C5);
  const a0 = appels.length;
  const ecrire = async (nom, texte) => { noeud("simModeleNom").value = nom; noeud("simModeleTexte").value = texte; ici("inspSimEcrire")(C5); await new Promise(r => setImmediate(r)); };
  await ecrire("x.html", ".subckt x");
  verifier(appels.length === a0 && /doit finir par/.test(noeud("simModeleMessage").textContent), "modèle : extension hors du sélecteur refusée");
  await ecrire("x.sub", "  ");
  verifier(appels.length === a0 && /texte du modèle/.test(noeud("simModeleMessage").textContent), "modèle : texte vide refusé");
  serveur.reponse = () => ({ status: 409, detail: "existe" });
  confirmes.length = 0;
  await ecrire("pris.sub", ".subckt x");
  const c5 = appels[appels.length - 1].corps;
  verifier(appels.length === a0 + 1 && c5.si_absent === true && c5.type === "simulation" && !confirmes.length && /existe déjà/.test(noeud("simModeleMessage").textContent) && !etat.sale,
           "modèle : nom pris refusé, sans proposer de remplacer ni lier");
  serveur.reponse = () => ({ ok: true });
  await ecrire("mon modele.sub", ".subckt m");
  const c6 = appels[appels.length - 1].corps;
  verifier(c6.nom === "mon_modele.sub" && c6.contenu === ".subckt m" && c6.si_absent === true, "modèle : rangé sous un nom nettoyé, en si_absent");
  verifier(C5["Modèle Simulation"] === "lib/simulation/a.sub | lib/simulation/mon_modele.sub" && etat.sale === true, "modèle : lié comme « Lier » (à la suite, à enregistrer)");
  verifier(noeud("simModeleTexte").value === "" && /à enregistrer|Enregistrer/.test(noeud("simModeleMessage").textContent), "modèle : la zone se vide, le message dit de quoi enregistrer");
  await ecrire("t.s2p", "# GHZ S MA R 50\n1 0 0 0 0 0 0 0 0");
  verifier(/Port 2/.test(noeud("inspSimForm").innerHTML) && !noeud("inspSimForm").hidden, "modèle : un Touchstone passe par le formulaire des ports");

  /* 6. zone d'encombrement dans l'éditeur : générée, vérifiée, retirée */
  edit.type = "pcb";
  edit.data = { format: "pcbfp-1", name: "C", pins: 2, style: "chip", pads: [{ n: 1, x: -1, y: 0, w: 1, h: 1, shape: "rect" }, { n: 2, x: 1, y: 0, w: 1, h: 1, shape: "rect" }] };
  noeud("edCrtMarge").value = "0.5";
  ici("editeurCourtyardAuto()");
  verifier(JSON.stringify(edit.data.courtyard) === JSON.stringify({ x1: -2, y1: -1, x2: 2, y2: 1 }) && noeud("edCrtX2").value === 2,
           "courtyard : généré avec la marge saisie, recopié dans les champs (" + JSON.stringify(edit.data.courtyard) + ")");
  verifier(/✓/.test(noeud("edCrtVerif").textContent), "courtyard : le contrôle l'approuve");
  ici("editeurCourtyardRetirer()");
  verifier(!edit.data.courtyard && noeud("edCrtX1").value === "" && /pas de zone/.test(noeud("edCrtVerif").textContent), "courtyard : retiré, la remarque revient");

  /* 7. audit du catalogue : les fichiers cités sont lus, les écarts sortent */
  etat.fichiers = { pcb: ["SOT-23.json"], schematique: [], simulation: [] };
  fichiersLib["SOT-23.json"] = { pads: [1, 2, 3].map(n => ({ n, x: n, y: 0, w: 0.5, h: 0.5 })) };
  etat.composants = [
    { _id: 0, "Part Name": "R1K", "Empreinte PCB": "SOT-23", "Empreinte Schématique": "resistor", "Datasheet": "d", "Modèle Simulation": "m" },
    { _id: 1, "Part Name": "LDO", "Empreinte PCB": "SOT-23", "Empreinte Schématique": "regulator", "Datasheet": "d", "Modèle Simulation": "m" },
    { _id: 2, "Part Name": "NU", "Empreinte PCB": "QFN-99" }];
  const audit = await ici("auditerCatalogue()");
  verifier(audit.length === 2 && audit[0].comp["Part Name"] === "R1K" && /2 broche\(s\), empreinte à 3/.test(audit[0].erreurs[0]) &&
           audit[1].erreurs.some(e => /QFN-99 » introuvable/.test(e)) && audit[1].erreurs.includes("sans symbole"),
           "audit : broches face aux pastilles, empreinte absente, symbole manquant (" + JSON.stringify(audit.map(r => r.erreurs)) + ")");

  /* 8. éditeur d'empreinte : un bord de corps à 0 reste à 0 */
  edit.type = "pcb";
  edit.data = { format: "pcbfp-1", name: "J", pins: 1, style: "chip", pads: [{ n: 1, x: 1, y: 0, w: 1, h: 1, shape: "rect" }] };
  for (const [id, v] of [["edBodyX1", "0"], ["edBodyY1", "-1.5"], ["edBodyX2", "4"], ["edBodyY2", ""]]) noeud(id).value = v;
  ici("editeurCollecterGeneralPcb()");
  verifier(JSON.stringify(edit.data.body) === JSON.stringify({ x1: 0, y1: -1.5, x2: 4, y2: 1 }), "corps : bord à 0 gardé, champ vide au défaut (" + JSON.stringify(edit.data.body) + ")");

  /* 9. éditeur de symbole : ce qu'il enregistre, le schéma l'accepte ; sinon il le dit */
  edit.type = "schematique"; edit.historique = []; edit.pileRedo = [];
  edit.data = ici("creerSymboleDefaut()");
  ici("editeurSupprimerPin(1); editeurAjouterPin()");
  verifier(edit.data.pins.map(q => q.n).sort().join() === "1,2,3,4", "symbole : « Ajouter broche » après une suppression reprend le numéro libre (" + edit.data.pins.map(q => q.n) + ")");
  verifier(ici("editeurNumero")(" 4 ") === 4 && ici("editeurNumero")("A1") === "A1", "tableau : un numéro saisi devient un entier");
  verifier(!ici("editeurControlerSymbole")(edit.data, "MON_SYM.json").length && edit.data.id === "MON_SYM", "symbole : id = nom du fichier, accepté par les règles du schéma");
  edit.data.pins[0].n = 3;                                   // doublon : le schéma le refuserait
  noeud("editeurNomFichier").value = "MON_SYM.json";
  confirmes.length = 0;
  const a9 = appels.length;
  await ici("editeurEnregistrer()");
  verifier(confirmes.length === 1 && /schéma refusera[\s\S]*broche 3 en double/.test(confirmes[0]) && appels.length === a9,
           "symbole fautif : l'enregistrement le dit et, refusé, n'écrit rien (" + confirmes.join(" | ").slice(0, 80) + ")");

  /* 10. catalogue lu en secours (API en panne au chargement) : lecture seule, jamais réécrit */
  const fetchPage = page.fetch;
  page.fetch = async () => ({ ok: true, text: async () => "Part Name;Description\nR1;R\ufffdsistance\n" });
  await ici("chargerRepliCsv()");
  page.fetch = fetchPage;
  ici("modifierComposant(0, 'Description', 'x')");
  const a10 = appels.length;
  const refus = await ici("enregistrerCatalogue()").then(() => "", e => e.message);
  verifier(/lecture seule/.test(refus) && appels.length === a10 && etat.sale, "catalogue de secours : enregistrement refusé, rien n'est envoyé (" + refus.slice(0, 60) + ")");

  /* 11. inspecteur : l'aperçu montre l'empreinte de la référence choisie, pas celle d'avant */
  const vus = [];
  let lacher = null;
  fichiersLib["A11.json"] = { name: "A11" }; fichiersLib["LENT11.json"] = { name: "LENT11" };
  page.fetch = async (url, o) => {
    if (/LENT11/.test(url)) await new Promise(r => { lacher = r; });
    return fetchPage(url, o);
  };
  ici("pcbRendererMain = { setFootprint: d => __vus.push(d && d.name) }; schRendererMain = null;");
  page.__vus = vus;
  etat.colonnes = ["Part Name", "Empreinte PCB", "Empreinte Schématique"];
  etat.composants = [{ _id: 0, "Part Name": "A", "Empreinte PCB": "A11.json" }, { _id: 1, "Part Name": "B", "Empreinte PCB": "ABSENTE11.json" },
                     { _id: 2, "Part Name": "L", "Empreinte PCB": "LENT11.json" }];
  await ici("selectionnerComposant(0)");
  await ici("selectionnerComposant(1)");
  verifier(vus[vus.length - 1] === null, "inspecteur : empreinte introuvable, l'aperçu se vide au lieu de garder la précédente (" + vus + ")");
  const lent = ici("selectionnerComposant(2)");
  await new Promise(r => setImmediate(r));
  await ici("selectionnerComposant(0)");
  lacher(); await lent;
  verifier(vus[vus.length - 1] === "A11", "inspecteur : une lecture lente d'une autre référence n'écrase pas l'aperçu courant (" + vus + ")");
  page.fetch = fetchPage;

  /* 12. « Nouveau composant » : une Part Name déjà au catalogue est refusée (deux lignes de même
     nom, et le serveur refuse ensuite toute modification de la référence) */
  const alertes = [];
  page.alert = m => alertes.push(m);
  etat.composants = []; etat.colonnes = ici("COLONNES_CATALOGUE_39").slice(); etat.lectureSeule = false;
  noeud("newPartName").value = "DOUBLE"; noeud("newPrefix").value = "R";
  ici("creerNouveauComposant()");
  noeud("newPartName").value = " double ";
  ici("creerNouveauComposant()");
  verifier(etat.composants.length === 1 && /déjà au catalogue/.test(alertes[0] || ""), "création : nom déjà pris refusé, pas de ligne en double (" + etat.composants.length + " ligne(s))");

  /* 13. choix des colonnes : chercher masque des cases, n'en retire aucune (« Appliquer » ne
     gardait que les colonnes affichées par la recherche) */
  const grille = noeud("gridColonnesPicker"), cherche = noeud("searchColonnes");
  let surSaisie = null;
  cherche.addEventListener = (_, f) => { surSaisie = f; };
  etat.colonnes = ["Part Name", "Description", "Value"]; etat.colonnesVisibles = ["Part Name", "Value"];
  ici("remplirGrilleColonnesPicker()");
  const complet = grille.innerHTML;
  const cases = etat.colonnes.map(c => ({ textContent: c, style: {} }));
  grille.champs = cases;
  cherche.value = "desc"; surSaisie();
  verifier(grille.innerHTML === complet && cases.map(l => l.style.display).join() === "none,,none",
           "colonnes : la recherche masque sans retirer (" + cases.map(l => l.style.display || "vue").join() + ")");

  /* 14. éditeur : un fichier de la LIB illisible (serveur en panne) n'ouvre pas une empreinte
     par défaut sous son nom, qu'un « Enregistrer » poserait à la place du vrai fichier */
  const toasts = [];
  page.afficherToast = (m, t) => toasts.push(t + ":" + m);
  etat.fichiers = { pcb: ["PANNE14.json", "OK14.json"], schematique: [], simulation: [] };
  fichiersLib["OK14.json"] = { format: "pcbfp-1", name: "OK14", pins: 1, style: "chip", pads: [{ n: 1, x: 0, y: 0, w: 1, h: 1, shape: "rect" }] };
  edit.actif = false; edit.data = null;
  page.PcbRenderer = class { setFootprint() {} render() {} };
  ici("initialiserInteractionsEditeur = () => {}");
  await ici("ouvrirEditeurPcb")("PANNE14.json");
  verifier(!edit.actif && toasts.some(t => /^error:.*PANNE14/.test(t)), "éditeur : fichier listé mais illisible, il ne s'ouvre pas et le dit (" + toasts.slice(-1) + ")");

  /* 15. éditeur : fermer avec des modifications non enregistrées demande confirmation */
  await ici("ouvrirEditeurPcb")("OK14.json");
  confirmes.length = 0;
  ici("fermerEditeurLib()");
  verifier(!edit.actif && !confirmes.length, "éditeur : fermé sans question quand rien n'a changé");
  await ici("ouvrirEditeurPcb")("OK14.json");
  edit.data.pads[0].x = 3;
  ici("fermerEditeurLib()");
  verifier(edit.actif && confirmes.length === 1 && /pas enregistrées/.test(confirmes[0]), "éditeur : modifié, la fermeture demande (refusée : il reste ouvert)");
  noeud("editeurNomFichier").value = "OK14.json";
  serveur.reponse = () => ({ ok: true });
  confirmes.length = 0;
  await ici("editeurEnregistrer()");
  verifier(!edit.actif && !confirmes.length, "éditeur : après « Enregistrer », il se ferme sans question");
})();

/* ---------- zone d'encombrement (courtyard) ---------- */
console.log("— zone d'encombrement —");
{
  const fp = { format: "pcbfp-1", name: "T", pins: 2, style: "chip",
               pads: [{ n: 1, x: -0.8, y: 0, w: 0.9, h: 1, shape: "rect" }, { n: 2, x: 0.8, y: 0, w: 0.9, h: 1, shape: "rect" }],
               body: { x1: -1, y1: -0.6, x2: 1, y2: 0.6 } };
  const c = CL.courtyardAuto(fp);
  verifier(JSON.stringify(c) === JSON.stringify({ x1: -1.5, y1: -0.85, x2: 1.5, y2: 0.85 }), "générée : pastilles et corps + 0,25 mm, au pas de 0,05 (" + JSON.stringify(c) + ")");
  verifier(CL.courtyardAuto(Object.assign({}, fp, { pads: [{ n: 1, x: 0, y: 0, w: 1, h: 2, shape: "rect", rot: 90 }], body: null }), 0).x2 === 1, "pastille tournée de 90° : largeur et hauteur échangées");
  verifier(CL.verifierEmpreinte(fp, "T.json").remarques.some(r => /pas de zone d'encombrement/.test(r)), "absente : une remarque");
  verifier(!CL.verifierEmpreinte(Object.assign({}, fp, { courtyard: c }), "T.json").erreurs.length, "générée : passe les contrôles");
  const serree = CL.verifierEmpreinte(Object.assign({}, fp, { courtyard: { x1: -1.3, y1: -0.6, x2: 1.3, y2: 0.6 } }), "T.json");
  verifier(!serree.erreurs.length && serree.remarques.some(r => /sous les 0,1 mm/.test(r)), "collée au cuivre : remarque de marge");
  const courte = CL.verifierEmpreinte(Object.assign({}, fp, { courtyard: { x1: -1, y1: -1, x2: 1, y2: 1 } }), "T.json");
  verifier(courte.erreurs.some(e => /pastille\(s\) hors de la zone d'encombrement : 1, 2/.test(e)), "trop petite : les pastilles dehors sont nommées");
  verifier(CL.verifierEmpreinte(Object.assign({}, fp, { courtyard: { x1: 1, y1: 0, x2: -1, y2: 1 } }), "T.json").erreurs.some(e => /« courtyard »/.test(e)), "rectangle à l'envers : refusé");
  const g = CL.genererEmpreinte("chip", { code: "0603", densite: "L" }).empreinte, gN = CL.genererEmpreinte("chip", { code: "0603" }).empreinte;
  verifier(g.courtyard && gN.courtyard && gN.courtyard.x2 - g.courtyard.x2 > 0.1, "générateur IPC : zone posée, plus large en densité N qu'en L");
  const k = CL.convertirKicad(`(footprint "R" (layer "F.Cu")
    (fp_rect (start -1.48 -0.73) (end 1.48 0.73) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))
    (pad "1" smd rect (at -0.8 0) (size 0.9 1) (layers "F.Cu"))
    (pad "2" smd rect (at 0.8 0) (size 0.9 1) (layers "F.Cu")))`);
  verifier(k.empreinte && JSON.stringify(k.empreinte.courtyard) === JSON.stringify({ x1: -1.48, y1: -0.73, x2: 1.48, y2: 0.73 }), "KiCad : F.CrtYd repris en zone d'encombrement");
}

/* ---------- audit d'une référence ---------- */
console.log("— audit du catalogue —");
{
  const fp3 = { pads: [1, 2, 3].map(n => ({ n, x: n, y: 0, w: 0.5, h: 0.5 })) };
  const vide = CL.auditerReference({ "Part Name": "X" }, {});
  verifier(vide.erreurs.join("|") === "sans empreinte PCB|sans symbole" && /modèle/.test(vide.remarques[0]) && /datasheet/.test(vide.remarques[1]), "référence nue : empreinte, symbole, modèle et datasheet manquent");
  const absente = CL.auditerReference({ "Empreinte PCB": "lib/pcb/SOT-23.json", "Empreinte Schématique": "resistor" }, { pcbConnues: ["0402.json"], schConnues: [] });
  verifier(absente.erreurs.some(e => /SOT-23» introuvable|« SOT-23 » introuvable/.test(e)), "empreinte citée mais absente de la LIB");
  const r3 = CL.auditerReference({ "Empreinte PCB": "SOT-23", "Empreinte Schématique": "resistor", "Datasheet": "http://x", "Modèle Simulation": "a.sub" },
                                 { empreinte: fp3, pcbConnues: ["SOT-23.json"] });
  verifier(r3.erreurs.length === 1 && /symbole à 2 broche\(s\), empreinte à 3 pastille\(s\)/.test(r3.erreurs[0]) && !r3.remarques.length, "2 broches face à 3 pastilles, sans brochage : erreur");
  const reg = CL.auditerReference({ "Empreinte PCB": "SOT-223", "Empreinte Schématique": "regulator", "Brochage": "GND=1,OUT=2/4,IN=3" },
                                  { empreinte: fp3, pcbConnues: ["SOT-223.json"] });
  verifier(reg.erreurs.some(e => /brochage : patte\(s\) absente\(s\) de l'empreinte : 4/.test(e)), "brochage qui cite une pastille inexistante");
  const ok = CL.auditerReference({ "Empreinte PCB": "SOT-23", "Empreinte Schématique": "regulator", "Brochage": "GND=1,OUT=2,IN=3", "Datasheet": "d", "Modèle Simulation": "m" },
                                 { empreinte: fp3, pcbConnues: ["SOT-23.json"] });
  verifier(!ok.erreurs.length && !ok.remarques.length, "référence complète et cohérente : rien à dire (" + ok.erreurs.concat(ok.remarques) + ")");
  verifier(!CL.auditerReference({ "Empreinte PCB": "QFN-32", "Empreinte Schématique": "ic", "Datasheet": "d", "Modèle Simulation": "m" }, { empreinte: fp3 }).erreurs.length, "CI à broches libres : pas de comptage");
}

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

banc.then(() => console.log("— " + total + " contrôles —"),
                e => { console.error("  ÉCHEC : " + e.message); process.exitCode = 1; });
