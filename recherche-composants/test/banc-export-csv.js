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

console.log("\n" + ok + " ok, " + ko + " KO");
process.exit(ko ? 1 : 0);
