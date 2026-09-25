"use strict";
/* =============================================================================
   gestion-lib/test/banc-catalogue.js
   Banc d'essai du catalogue de Gestion LIB : lecture du CSV réel et barre de
   recherche (obtenirComposantsFiltres), sans navigateur.

       node gestion-lib/test/banc-catalogue.js
   ============================================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let total = 0;
let reussis = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    console.error("  FAIL: " + message);
    process.exitCode = 1;
    return;
  }
  reussis++;
  console.log("  OK: " + message);
}

const sandbox = {
  console,
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild: () => {} }),
    body: { appendChild: () => {} },
    addEventListener: () => {}
  },
  window: { location: { search: "" } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  fetch: () => Promise.reject(new Error("pas de réseau dans le banc"))
};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "js", "01-donnees.js"), "utf8"),
  sandbox
);

const csv = fs.readFileSync(
  path.join(__dirname, "..", "..", "LIB", "LIB_composants.csv"), "utf8");
vm.runInContext("parserCsvBrut", sandbox)(csv);

const etat = vm.runInContext("LIB_STATE", sandbox);
const filtrer = vm.runInContext("obtenirComposantsFiltres", sandbox);
function chercher(q) {
  etat.filtres.recherche = q;
  etat.filtres.prefix = "TOUS";
  etat.filtres.statut = "TOUS";
  return filtrer();
}

console.log("— Démarrage des tests banc-catalogue.js —");

assert(etat.composants.length > 500,
  "Le catalogue réel se lit (" + etat.composants.length + " composants)");
assert(etat.colonnes.includes("Part Number"),
  "La colonne « Part Number » existe sous ce nom exact");

const tous = chercher("").length;
assert(tous === etat.composants.length, "Recherche vide : tout le catalogue");

/* Le défaut corrigé : la recherche lisait une colonne « Part Number » suivie
   d'une espace, qui n'existe pas. Aucune référence fabricant ne sortait. */
const attenduGcm = etat.composants.filter(c => /GCM155/i.test(c["Part Number"] || "")).length;
assert(attenduGcm > 0, "Le catalogue contient des références GCM155 (" + attenduGcm + ")");
assert(chercher("GCM155").length >= attenduGcm,
  "« GCM155 » trouve les références fabricant Murata (" + chercher("GCM155").length + ")");
assert(chercher("gcm1555c1hr70wa16d").length === 1,
  "Une référence fabricant complète, en minuscules, trouve son composant");

const avec2nde = etat.composants.find(c => (c["2nd source P/N"] || "").trim().length > 3);
assert(!!avec2nde, "Le catalogue contient une seconde source");
if (avec2nde) {
  const ref = avec2nde["2nd source P/N"].trim();
  assert(chercher(ref).some(c => c["Part Name"] === avec2nde["Part Name"]),
    "Une référence de seconde source (" + ref + ") trouve son composant");
}

// Les recherches qui marchaient déjà marchent toujours
assert(chercher("0402").length > 0, "Recherche par boîtier (0402)");
assert(chercher("murata").length > 0, "Recherche par fabricant (Murata)");
assert(chercher("zzzz_introuvable").length === 0, "Une recherche sans réponse ne rend rien");

console.log("\nRésultat : " + reussis + "/" + total + " tests réussis.");
