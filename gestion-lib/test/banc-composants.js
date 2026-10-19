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
verifier(r.remarques.some(m => /hors du corps/.test(m)), "pattes hors du corps : une remarque, pas une erreur");

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
