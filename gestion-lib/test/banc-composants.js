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
refusLigne(l => { l["Description"] = '=HYPERLINK("http://x","y")'; }, /formule/, "formule de tableur");
refusLigne(l => { l["Manufacturer"] = "@SUM(1+1)"; }, /formule/, "formule « @ »");
refusLigne(l => { l["Part Name"] = "LDO\u200b_ESSAI"; }, /invisible/, "caractère invisible");
r = CL.verifierLigne(Object.assign({}, LDO, { "Minimum operating temperature": "-40", tolerance: "+/-20%" }), ctx);
verifier(!r.erreurs.length, "« -40 » et « +/-20% » restent permis");
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
const SRV = { parts: ["R0402_10K"], pcb: ["0603.json", "SOT-23-5.json"], ecrits: [], refusLigne: null, refusFichier: null };
Object.assign(bac, {
  LIB_STATE: { colonnes: ["Part Name"], composants: [{ _id: 0, "Part Name": "R0402_10K" }], selection: null,
               fichiers: { pcb: [] }, cacheFichiers: new Map() },
  apiGet: async url => url === "/api/lib/composants" ? { composants: SRV.parts.map(p => ({ "Part Name": p })) }
                     : url === "/api/lib/fichiers" ? { pcb: SRV.pcb.slice() } : null,
  apiPost: async (url, corps) => {
    if (SRV.refusLigne) throw Object.assign(new Error(SRV.refusLigne), { status: SRV.statutLigne });
    SRV.ecrits.push(["ligne", corps.ajouter]);
    SRV.parts.push(corps.ajouter["Part Name"]);
    return { ok: true };
  },
  obtenirFichierLib: async (type, nom) => nom === "SOT-23-5.json" ? SOT235 : null,
  sauvegarderFichierLib: async (type, nom, data, opt) => {
    if (SRV.refusFichier) throw new Error(SRV.refusFichier);
    SRV.ecrits.push(["empreinte", nom, opt]);
    SRV.pcb.push(nom);
  },
  fetch: async (url, opt) => { SRV.ecrits.push(["retrait", url, opt.method]); return { ok: true }; },
  libSuiteNoter() {}, rafraichirTout() {}, selectionnerComposant() {}
});
vm.runInContext(lire("gestion-lib/js/08-pilote-lib.js"), bac, { filename: "08-pilote-lib.js" });
const CMD = vm.runInContext("libPiloteCommandes()", bac);
const asyncTests = (async () => {
  const neuve = Object.assign(copie(SOT235), { name: "SOT-23-5-LDO" });
  const ligneLdo = Object.assign({}, LDO, { "Empreinte PCB": "SOT-23-5-LDO" });
  const C = CMD.lib_composant_creer;
  const prop = await C.proposer({ ligne: ligneLdo, empreinte: neuve });
  verifier(SRV.ecrits.length === 0, "proposer n'écrit rien");
  verifier(/Créer « LDO_ESSAI_3V3 »/.test(prop.titre) && /empreinte neuve SOT-23-5-LDO \(5 pastilles\)/.test(prop.apres),
    "la carte dit ce qui sera créé (" + prop.apres + ")");
  await C.appliquer({ ligne: ligneLdo, empreinte: neuve }, prop);
  verifier(JSON.stringify(SRV.ecrits.map(e => e.slice(0, 2))) === JSON.stringify([["empreinte", "SOT-23-5-LDO.json"], ["ligne", SRV.ecrits[1] && SRV.ecrits[1][1]]]) &&
           SRV.ecrits[0][2].si_absent === true, "au clic : empreinte (si_absent) puis ligne");
  verifier(SRV.ecrits[1][1]["Empreinte PCB"] === "lib/empreinte/SOT-23-5-LDO.json" && !("Description" in SRV.ecrits[1][1]),
    "ligne envoyée : chemins du catalogue, colonnes vides omises");
  verifier(bac.LIB_STATE.composants.some(c => c["Part Name"] === "LDO_ESSAI_3V3" && c._id === 1) &&
           bac.LIB_STATE.colonnes.includes("Brochage"), "le miroir de la page reçoit la ligne (un Enregistrer ne l'effacera pas)");

  // second essai, même nom : refusé sans rien écrire
  SRV.ecrits.length = 0;
  let refuse = null;
  try { await C.proposer({ ligne: ligneLdo, empreinte: Object.assign(copie(neuve), { name: "SOT-23-5-LDO" }) }); } catch (e) { refuse = e.message; }
  verifier(refuse && /déjà au catalogue/.test(refuse) && /déjà dans la LIB/.test(refuse) && !SRV.ecrits.length,
    "second essai du même composant : refusé, rien d'écrit (" + refuse + ")");

  // ligne refusée par le serveur au clic : l'empreinte créée par la carte est retirée
  const l2 = Object.assign({}, LDO, { "Part Name": "LDO_2", "Empreinte PCB": "SOT-23-5-B" });
  const n2 = Object.assign(copie(SOT235), { name: "SOT-23-5-B" });
  const p2 = await C.proposer({ ligne: l2, empreinte: n2 });
  SRV.refusLigne = "Colonne(s) inconnue(s) du catalogue : Brochage";
  SRV.statutLigne = 400;
  refuse = null;
  try { await C.appliquer({ ligne: l2, empreinte: n2 }, p2); } catch (e) { refuse = e.message; }
  SRV.refusLigne = null;
  verifier(refuse && /empreinte SOT-23-5-B.json retirée/.test(refuse) &&
           JSON.stringify(SRV.ecrits.map(e => e[0])) === JSON.stringify(["empreinte", "retrait"]) &&
           SRV.ecrits[1][1] === "/api/lib/fichier?type=pcb&nom=SOT-23-5-B.json" && SRV.ecrits[1][2] === "DELETE",
    "ligne refusée : empreinte retirée (" + refuse + ")");

  // réponse perdue (pas de statut HTTP) : la ligne a pu être écrite, l'empreinte reste
  SRV.ecrits.length = 0;
  SRV.pcb = SRV.pcb.filter(f => f !== "SOT-23-5-B.json");
  const p2b = await C.proposer({ ligne: l2, empreinte: n2 });
  SRV.refusLigne = "Failed to fetch";
  SRV.statutLigne = undefined;
  refuse = null;
  try { await C.appliquer({ ligne: l2, empreinte: n2 }, p2b); } catch (e) { refuse = e.message; }
  SRV.refusLigne = null;
  verifier(refuse && /gardée/.test(refuse) && JSON.stringify(SRV.ecrits.map(e => e[0])) === JSON.stringify(["empreinte"]),
    "réponse perdue : empreinte gardée, l'utilisateur prévenu (" + refuse + ")");

  // empreinte déjà là au clic (409) : rien d'autre n'est écrit
  SRV.ecrits.length = 0;
  SRV.pcb = SRV.pcb.filter(f => f !== "SOT-23-5-B.json");
  const l3 = Object.assign({}, l2, { "Part Name": "LDO_3" });
  const p3 = await C.proposer({ ligne: l3, empreinte: n2 });
  SRV.refusFichier = "Le fichier existe deja : SOT-23-5-B.json (jamais d'ecrasement)";
  refuse = null;
  try { await C.appliquer({ ligne: l3, empreinte: n2 }, p3); } catch (e) { refuse = e.message; }
  SRV.refusFichier = null;
  verifier(refuse && /Empreinte non écrite/.test(refuse) && !SRV.ecrits.length, "fichier existant : refus, rien d'écrit");

  // la LIB change entre la carte et le clic : refus au clic
  const l4 = Object.assign({}, LDO, { "Part Name": "LDO_4", "Empreinte PCB": "SOT-23-5" });
  const p4 = await C.proposer({ ligne: l4 });
  verifier(/empreinte existante SOT-23-5/.test(p4.apres), "empreinte existante désignée : pas de fichier à créer");
  SRV.parts.push("ldo_4");
  refuse = null;
  try { await C.appliquer({ ligne: l4 }, p4); } catch (e) { refuse = e.message; }
  verifier(refuse && /Refusé au clic/.test(refuse) && !SRV.ecrits.length, "Part Name prise entre la carte et le clic : refus au clic");

  // ligne qui ne désigne pas l'empreinte donnée
  refuse = null;
  try { await C.proposer({ ligne: Object.assign({}, l4, { "Part Name": "LDO_5" }), empreinte: Object.assign(copie(SOT235), { name: "AUTRE" }) }); }
  catch (e) { refuse = e.message; }
  verifier(refuse && /doit désigner l'empreinte créée/.test(refuse), "la ligne doit désigner l'empreinte créée");

  // calculs
  r = await CMD.lib_brochage_verifier.executer({ brochage: "IN=1,GND=2,OUT=9", empreinte: "SOT-23-5", symbole: "regulator" });
  verifier(r.erreurs.some(e => /absente/.test(e)), "lib_brochage_verifier : empreinte lue dans la LIB par son nom");
  r = await CMD.lib_empreinte_generer.executer({ famille: "chip", parametres: { code: "0603" } });
  verifier(r.empreinte && r.empreinte.name === "0603", "lib_empreinte_generer");
  r = await CMD.lib_empreinte_verifier.executer({ empreinte: SOT235 });
  verifier(!r.erreurs.length, "lib_empreinte_verifier : nom de fichier tiré du nom");
  r = await CMD.lib_kicad_convertir.executer({ texte: KICAD_SOT235 });
  verifier(r.empreinte && r.empreinte.pads.length === 5, "lib_kicad_convertir");

  /* lib_simulation_lier : un faux serveur qui tient le catalogue, lib_simulation et la liaison */
  const SIM = { fichiers: { "as179_a.s3p": "! broches : 5 3 1\n# GHz S DB R 50\n" }, ecrits: [], refusLier: null };
  const CAT = [{ "Part Name": "AS179", "Number Of pins": "6", "Brochage": "J3=1,GND=2,J2=3,V1=4,J1=5,V2=6",
                 "Modèle Simulation": "lib/simulation/as179_a.s3p" }, { "Part Name": "R1", "Number Of pins": "2" }];
  const sauve = { apiGet: bac.apiGet, apiPost: bac.apiPost, sauvegarderFichierLib: bac.sauvegarderFichierLib, fetch: bac.fetch };
  Object.assign(bac, {
    apiGet: async url => {
      if (url === "/api/lib/composants") return { composants: CAT.map(c => Object.assign({}, c)) };
      const nom = decodeURIComponent(url.replace(/^.*nom=/, ""));
      if (nom in SIM.fichiers) return { contenu: SIM.fichiers[nom] };
      throw Object.assign(new Error("introuvable"), { status: 404 });
    },
    apiPost: async (url, corps) => {
      if (SIM.refusLier) throw Object.assign(new Error(SIM.refusLier), { status: 404 });
      const l = corps.lier_simulation, c = CAT.find(x => x["Part Name"] === l.part);
      SIM.ecrits.push(["lier", l.part, l.modele]);
      c["Modèle Simulation"] = [c["Modèle Simulation"], l.modele].filter(Boolean).join(" | ");
      return { ok: true, modeles: c["Modèle Simulation"].split(" | ") };
    },
    sauvegarderFichierLib: async (type, nom, texte, opt) => { SIM.ecrits.push(["fichier", type, nom, opt.si_absent]); SIM.fichiers[nom] = texte; },
    fetch: async (url, opt) => { SIM.ecrits.push(["retrait", url, opt.method]); return { ok: true }; }
  });
  bac.LIB_STATE.colonnes = ["Part Name", "Modèle Simulation"];
  bac.LIB_STATE.composants = [{ _id: 0, "Part Name": "AS179", "Modèle Simulation": "lib/simulation/as179_a.s3p" }];
  bac.LIB_STATE.fichiers.simulation = ["as179_a.s3p"];
  const S3P_B = "! fabricant\n# GHz S DB R 50\n0.1 -20 0 -0.2 0 -40 0 -0.2 0 -20 0 -40 0 -40 0 -40 0 -1 0\n";
  const L = CMD.lib_simulation_lier;
  verifier(L.ecriture && L.clic && typeof L.irreversible === "string", "lib_simulation_lier : toujours au clic, irréversible");
  const argsB = { reference: "as179", fichier: "as179 b.s3p", texte: S3P_B, ports: ["J1", "J2", "J3"], masse: "GND" };
  const pB = await L.proposer(argsB);
  verifier(!SIM.ecrits.length && /Lier « as179_b\.s3p » à « AS179 »/.test(pB.titre) &&
           /pattes 5, 3, 1, masse 2/.test(pB.apres) && /as179_a\.s3p \| lib\/simulation\/as179_b\.s3p/.test(pB.apres),
    "proposer n'écrit rien ; la carte dit le fichier, les pattes et la case après (" + pB.apres + ")");
  const rB = await L.appliquer(argsB, pB);
  verifier(JSON.stringify(SIM.ecrits) === JSON.stringify([["fichier", "simulation", "as179_b.s3p", true],
                                                           ["lier", "AS179", "lib/simulation/as179_b.s3p"]]) &&
           SIM.fichiers["as179_b.s3p"].startsWith("! broches : 5 3 1\n! masse : 2\n! fabricant"),
    "au clic : fichier branché (si_absent), puis la liaison");
  verifier(rB.modeles.length === 2 && bac.LIB_STATE.composants[0]["Modèle Simulation"] === "lib/simulation/as179_a.s3p | lib/simulation/as179_b.s3p" &&
           bac.LIB_STATE.fichiers.simulation.includes("as179_b.s3p"), "le miroir de la page suit (un Enregistrer ne l'effacera pas)");
  const refusSim = async (a, motif, quoi) => {
    SIM.ecrits.length = 0;
    let m = null;
    try { await L.proposer(a); } catch (e) { m = e.message; }
    verifier(m && motif.test(m) && !SIM.ecrits.length, "lib_simulation_lier refusé : " + quoi + " (" + m + ")");
  };
  await refusSim(argsB, /déjà lié/, "déjà lié");
  await refusSim(Object.assign({}, argsB, { texte: S3P_B + "1 2 3\n" }), /autre contenu/, "même nom, autre contenu : jamais d'écrasement");
  await refusSim(Object.assign({}, argsB, { reference: "INCONNU" }), /pas au catalogue/, "référence inconnue");
  await refusSim(Object.assign({}, argsB, { fichier: "x.s3p", ports: ["J1", "J2"] }), /3 port/, "une patte par port");
  await refusSim(Object.assign({}, argsB, { fichier: "x.txt" }), /Touchstone.*SPICE/, "ni Touchstone ni SPICE");
  await refusSim({ reference: "R1", fichier: "r.sub", texte: ".SUBCKT R 1 2\n", ports: ["1"] }, /Touchstone seulement/, "ports pour un SPICE");
  // un SPICE se range tel quel ; la liaison refusée au clic retire le fichier que la carte vient d'écrire
  const argsS = { reference: "R1", fichier: "r.sub", texte: ".SUBCKT R 1 2\nR1 1 2 1k\n.ENDS\n" };
  const pS = await L.proposer(argsS);
  verifier(/modèle SPICE/.test(pS.apres) && /aucun modèle/.test(pS.avant), "SPICE : rangé tel quel (" + pS.apres + ")");
  SIM.ecrits.length = 0;
  SIM.refusLier = "« R1 » n'est pas au catalogue";
  let mS = null;
  try { await L.appliquer(argsS, pS); } catch (e) { mS = e.message; }
  SIM.refusLier = null;
  verifier(mS && /r\.sub retiré/.test(mS) && JSON.stringify(SIM.ecrits.map(e => e[0])) === JSON.stringify(["fichier", "retrait"]) &&
           /type=simulation&nom=r\.sub/.test(SIM.ecrits[1][1]), "liaison refusée : le fichier écrit par la carte est retiré (" + mS + ")");
  Object.assign(bac, sauve);
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

asyncTests.then(() => console.log("— " + total + " contrôles —"),
                e => { console.error("  ÉCHEC : " + e.message); process.exitCode = 1; });
