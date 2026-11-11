"use strict";
/* Banc de l'export CSV de la recherche de composants (js/04-resultats.js, exportCsv).
   Les sources sont lues telles quelles dans une vm, sans navigateur : seuls le
   téléchargement et l'info-bulle sont remplacés, pour relire le texte écrit.

     node recherche-composants/test/banc-export-csv.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ICI = path.join(__dirname, "..");
const sources = [path.join(ICI, "..", "commun", "echappe.js"),
                 path.join(ICI, "js", "02-outils.js"),
                 path.join(ICI, "js", "04-resultats.js")]
  .map(f => fs.readFileSync(f, "utf8").replace(/^"use strict";/, "")).join("\n;\n");

function exporter(colonnes, lignes) {
  const ctx = vm.createContext({ console, document: {}, window: {} });
  vm.runInContext(sources + `
    ;var ECRIT = null;
    telecharger = (nom, texte) => { ECRIT = texte; };
    hint = () => {};
    RESULTAT = { outil: "jlc_search", args: {}, data: {}, colonnes: ${JSON.stringify(colonnes)},
                 lignes: ${JSON.stringify(lignes)}, index: -1 };
    exportCsv();`, ctx);
  return ctx.ECRIT;
}

let ok = 0, ko = 0;
function verifier(nom, cond, detail) {
  if (cond) { ok++; console.log("  ok  " + nom); }
  else { ko++; console.log("  KO  " + nom + (detail ? " → " + detail : "")); }
}

const texte = exporter(["mpn", "description"], [
  { mpn: "=HYPERLINK(\"http://x\";\"clic\")", description: "+cmd" },
  { mpn: "@SOMME(A1)", description: "-x" },
  { mpn: "-5", description: "-.5" },
  { mpn: "a;b", description: "dit \"oui\"" },
  { mpn: "\tTAB", description: "ligne\nsuite" },
  { mpn: "LM358DR", description: "Ampli op" }
]);
verifier("le texte est écrit", typeof texte === "string" && texte.length > 0);
const lignes = (texte || "").replace(/^﻿/, "").split("\r\n");
verifier("BOM UTF-8 en tête (Excel lit les accents)", (texte || "").charCodeAt(0) === 0xFEFF);
verifier("en-tête puis une ligne par résultat", lignes.length === 7, lignes.length);
const L = lignes.slice(1);
verifier("« = » neutralisé, cellule entre guillemets (« ; » dedans)",
         L[0].startsWith("\"'=HYPERLINK(\"\"http://x\"\";\"\"clic\"\")\";"), L[0]);
verifier("« + » neutralisé", L[0].endsWith(";'+cmd"), L[0]);
verifier("« @ » et « -texte » neutralisés", L[1] === "'@SOMME(A1);'-x", L[1]);
verifier("un nombre négatif reste un nombre", L[2] === "-5;-.5", L[2]);
verifier("« ; » et guillemets échappés", L[3] === "\"a;b\";\"dit \"\"oui\"\"\"", L[3]);
verifier("tabulation neutralisée, saut de ligne entre guillemets",
         L[4] === "'\tTAB;\"ligne\nsuite\"", L[4]);
verifier("une valeur ordinaire passe telle quelle", L[5] === "LM358DR;Ampli op", L[5]);

/* ---------- fiche et lancement (03, 05, 06), sur un document factice ---------- */
(async () => {
  const el = () => ({ value: "", textContent: "", innerHTML: "", dataset: {}, classList: { toggle() {} },
                      querySelectorAll: () => [], querySelector: () => null, focus() {} });
  const els = {};
  let repondre = null;
  const ctx = vm.createContext({
    console, window: {}, location: { origin: "http://x" }, navigator: {}, ENTETE_WEB: {},
    document: { getElementById: id => els[id] || (els[id] = el()), querySelectorAll: () => [], addEventListener() {} },
    sessBrancher: () => null, sessTient: () => true, sessEffacer() {},
    fetch: async url => /\/api\/tools$/.test(url)
      ? { ok: true, json: async () => ({ tools: [] }) }
      : new Promise(r => { repondre = d => r({ ok: true, json: async () => ({ data: d }) }); })
  });
  const lire = f => fs.readFileSync(path.join(ICI, "js", f), "utf8").replace(/^"use strict";/, "");
  vm.runInContext(sources + "\n;\n" + ["01-api.js", "03-formulaire.js", "05-details.js", "06-demarrage.js"].map(lire).join("\n;\n"), ctx);
  await new Promise(r => setTimeout(r, 0));

  /* une réponse du réseau avec un élément nul dans une liste ne fait pas tomber la fiche */
  let h = "";
  try { h = vm.runInContext('ficheHTML({ model: "X", prices: [null, { qty: 10, price: 0.5 }] })', ctx); } catch (e) { h = "LEVÉE : " + e.message; }
  verifier("fiche : un élément nul dans une liste n'empêche pas l'affichage", /det-titre/.test(h) && !/LEVÉE/.test(h), h.slice(0, 80));

  /* l'outil est changé pendant que la requête court : la réponse reste celle de l'outil interrogé */
  vm.runInContext('OUTIL_COURANT = "jlc_search"; lireFormulaire = () => ({ query: "10k" });', ctx);
  const p = vm.runInContext("lancer()", ctx);
  await new Promise(r => setTimeout(r, 0));
  vm.runInContext('OUTIL_COURANT = "board_get";', ctx);
  repondre({ results: [{ lcsc: "C1", model: "R" }] });
  await p;
  const r = vm.runInContext("RESULTAT", ctx);
  verifier("lancer : la réponse est rangée sous l'outil interrogé, pas sous celui choisi entre-temps",
           r.outil === "jlc_search" && r.lignes.length === 1, r.outil + ", " + r.lignes.length + " ligne(s)");

  console.log("\n" + ok + " ok, " + ko + " KO");
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
