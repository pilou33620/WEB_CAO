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

/* La LIB réelle, comme web_CAO.dossier_lib_defaut() la trouve : WEB_CAO_LIB,
   sinon LIB/ à côté de l'outil, sinon celle de WEB_SUITE (../PROJETS/LIB_CAO,
   clonée à cet endroit par ci.yml). Lecture seule. */
const RACINE = path.join(__dirname, "..", "..");
const LIB = [process.env.WEB_CAO_LIB, path.join(RACINE, "LIB"),
             path.join(RACINE, "..", "PROJETS", "LIB_CAO")]
  .find(d => d && fs.existsSync(path.join(d, "LIB_composants.csv")));
if (!LIB) throw new Error("LIB introuvable : clonez WEB_SUITE_PROJETS en ../PROJETS");
const csv = fs.readFileSync(path.join(LIB, "LIB_composants.csv"), "utf8");
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

/* Auto-association : l'ordre des tests de boîtier. « TSSOP8 » et « MSOP8 »
   contiennent « SOP8 » et recevaient l'empreinte SOIC-8. */
const candidate = vm.runInContext("empreinteCandidate", sandbox);
const norm = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
for (const [boitier, attendu] of [["TSSOP-8", "TSSOP-8.json"], ["MSOP-8", "MSOP-8.json"],
                                  ["TSSOP-14", "TSSOP-14.json"], ["TSSOP-16", "TSSOP-16.json"],
                                  ["SOIC-8", "SOIC-8.json"], ["SOP-8", "SOIC-8.json"],
                                  ["SOT-223", "SOT-223.json"], ["SOT-23-5", "SOT-23-5.json"],
                                  ["SOT-23", "SOT-23.json"], ["D2PAK", "TO-263.json"],
                                  ["DPAK", "TO-252.json"], ["0603", "0603.json"]]) {
  assert(candidate(norm(boitier), "U") === attendu, "Boîtier " + boitier + " -> " + attendu);
}

/* Créer un composant n'auto-associe que lui : l'appel avec une liste ne doit
   rien écrire sur les autres lignes du catalogue. */
etat.fichiers.pcb = ["TSSOP-8.json", "0603.json"];
etat.fichiers.simulation = ["resistor.sub"];
const autre = { "Part Name": "AUTRE", "Reference designator Prefix": "U", "Package type": "TSSOP-8" };
const neuf = { "Part Name": "NEUF", "Reference designator Prefix": "R", "Package type": "0603" };
etat.composants.push(autre, neuf);
vm.runInContext("autoAssocierCatalogue", sandbox)([neuf]);
assert(neuf["Empreinte PCB"] === "0603.json", "Le nouveau composant reçoit son empreinte");
assert(neuf["Modèle Simulation"] === "resistor.sub", "…et son modèle de simulation existant");
assert(!autre["Empreinte PCB"] && !autre["Empreinte Schématique"],
  "Les autres composants du catalogue ne sont pas touchés");
etat.fichiers.simulation = ["autre.sub"];
const sansModele = { "Part Name": "C?", "Reference designator Prefix": "C", "Package type": "0603" };
vm.runInContext("autoAssocierCatalogue", sandbox)([sansModele]);
assert(!sansModele["Modèle Simulation"], "Pas de modèle de simulation inexistant associé");

/* Brochages connus : sur la LIB réelle, seules les familles normalisées et
   les références relevées sur datasheet reçoivent une colonne Brochage, et
   chaque valeur se relit sans erreur (commun/brochage.js). */
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "commun", "brochage.js"), "utf8"), sandbox);
const lire = vm.runInContext("brochageLire", sandbox);
const reels = JSON.parse(JSON.stringify(etat.composants.filter(c => c["Part Name"] && c._id != null)));
const parNom = n => reels.find(c => c["Part Name"] === n);
vm.runInContext("autoAssocierCatalogue", sandbox)(reels);
const br = n => (parNom(n) || {})["Brochage"] || "";
assert(br("TRAN_NPN_BC847B_185") === "B=1,E=2,C=3", "BC847B en SOT-23 : B=1,E=2,C=3");
assert(br("TRAN_PNP_BC857C") === "B=1,E=2,C=3", "BC857C en SOT-23 : B=1,E=2,C=3");
assert(br("TRAN_MOS-BSS123") === "G=1,S=2,D=3", "BSS123 en SOT-23 : G=1,S=2,D=3");
assert(br("AOP_OPA369AIDCKT") === "OUT=1,V-=2,IN+=3,IN-=4,V+=5", "OPA369 : brochage de la datasheet");
assert(br("REG_LM78L05ACMX") === "OUT=1,GND=2/3/6/7,IN=8,NC=4/5", "LM78L05 en SO-8 : masses multiples");
assert(br("REG_LP2980AIM5X-3.3") === "IN=1/3,GND=2,OUT=5,NC=4", "LP2980 : ON/OFF relié à l'entrée");
assert(!br("TRAN_DNPN_DTC144EKAT146"), "Transistor numérique : brochage laissé à la main");
assert(!br("TRAN_MOS-SI4463CDY-T1-GE3"), "SOIC-8 : pas de règle de famille");
assert(!br("TRAN_MOS-SI2301CDS"), "MOSFET rangé sous le symbole NPN : symbole à revoir, pas de brochage");
const remplis = reels.filter(c => c["Brochage"]);
assert(remplis.length >= 15, "Au moins quinze références complétées (" + remplis.length + ")");
assert(remplis.every(c => { const l = lire(c["Brochage"]); return l && !l.erreurs.length; }),
  "Chaque brochage proposé se relit sans erreur");
assert(etat.colonnes.includes("Brochage"), "La colonne Brochage rejoint le catalogue");
const deja = { "Part Name": "X", "Reference designator Prefix": "Q", "Package type": "SOT-23",
  "Empreinte Schématique": "npn.json", "Brochage": "B=2,E=1,C=3" };
vm.runInContext("autoAssocierCatalogue", sandbox)([deja]);
assert(deja["Brochage"] === "B=2,E=1,C=3", "Un brochage déjà saisi n'est jamais remplacé");

console.log("\nRésultat : " + reussis + "/" + total + " tests réussis.");
