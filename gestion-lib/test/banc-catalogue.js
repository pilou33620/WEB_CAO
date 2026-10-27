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
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "commun", "csv.js"), "utf8"), sandbox);
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
                                  ["DPAK", "TO-252.json"], ["0603", "0603.json"],
                                  ["SC70-5", "SC-70-5.json"], ["SOT-353", "SC-70-5.json"],
                                  ["SC-70-6", "SC-70-6.json"], ["SOT-323", "SC-70.json"],
                                  ["SC-70", "SC-70.json"]]) {
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
/* copies sans brochage : l'essai vaut que la LIB ait déjà la colonne ou non */
const reels = JSON.parse(JSON.stringify(etat.composants.filter(c => c["Part Name"] && c._id != null)));
for (const c of reels) delete c["Brochage"];
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
assert(!br("REG_LD39050PU25R"), "Boîtier sans règle de famille ni référence connue : rien");
const mosNpn = { "Part Name": "TRAN_MOS-X", "Description": "P-MOS SOT-23", "Reference designator Prefix": "Q",
  "Number Of pins": "3", "Package type": "SOT23-3", "Empreinte Schématique": "lib/symbole/npn.json" };
vm.runInContext("autoAssocierCatalogue", sandbox)([mosNpn]);
assert(!mosNpn["Brochage"], "MOSFET rangé sous le symbole NPN : symbole à revoir, pas de brochage");
const remplis = reels.filter(c => c["Brochage"]);
assert(remplis.length >= 15, "Au moins quinze références complétées (" + remplis.length + ")");
assert(remplis.every(c => { const l = lire(c["Brochage"]); return l && !l.erreurs.length; }),
  "Chaque brochage proposé se relit sans erreur");
assert(etat.colonnes.includes("Brochage"), "La colonne Brochage rejoint le catalogue");
const deja = { "Part Name": "X", "Reference designator Prefix": "Q", "Package type": "SOT-23",
  "Empreinte Schématique": "npn.json", "Brochage": "B=2,E=1,C=3" };
vm.runInContext("autoAssocierCatalogue", sandbox)([deja]);
assert(deja["Brochage"] === "B=2,E=1,C=3", "Un brochage déjà saisi n'est jamais remplacé");

/* Table du catalogue (04-ui.js) : une case « lib/empreinte/X.json » sélectionne « X.json » de la liste */
sandbox.window.addEventListener = () => {};
for (const f of ["commun/echappe.js", "gestion-lib/js/04-ui.js"])
  vm.runInContext(fs.readFileSync(path.join(RACINE, f), "utf8"), sandbox, { filename: f });
{
  const noeuds = {}, getAvant = sandbox.document.getElementById;
  sandbox.document.getElementById = id => noeuds[id] || (noeuds[id] = {
    textContent: "", innerHTML: "", classList: { toggle() {} }, querySelectorAll: () => [] });
  const sauve = [etat.composants, etat.colonnesVisibles, etat.fichiers.pcb];
  const chemin = { _id: 9001, "Part Name": "ESSAI_CHEMIN", "Empreinte PCB": "lib/empreinte/SOT-23-5.json" };
  const nu = { _id: 9002, "Part Name": "ESSAI_NU", "Empreinte PCB": "QFN-16" };
  const inconnu = { _id: 9003, "Part Name": "ESSAI_INCONNU", "Empreinte PCB": "lib/empreinte/ABSENT.json" };
  try {
    etat.composants = [chemin, nu, inconnu];
    etat.colonnesVisibles = ["Empreinte PCB"];
    etat.fichiers.pcb = ["QFN-16.json", "SOT-23-5.json"];
    chercher("");
    vm.runInContext("rafraichirTable", sandbox)();
    const html = noeuds.tableBodyComps.innerHTML;
    const ligne = id => html.split('<tr data-id="' + id + '"')[1].split("</tr>")[0];
    assert(/<option value="SOT-23-5\.json" selected>/.test(ligne(9001)), "Case « lib/empreinte/SOT-23-5.json » : SOT-23-5.json sélectionné");
    assert(/<option value="QFN-16\.json" selected>/.test(ligne(9002)), "Case « QFN-16 » (nom nu) : QFN-16.json sélectionné");
    assert(!/selected/.test(ligne(9003)), "Case vers un fichier absent de la LIB : rien de sélectionné");
    assert(chemin["Empreinte PCB"] === "lib/empreinte/SOT-23-5.json", "Le rendu ne réécrit pas la valeur stockée");
  } finally {
    [etat.composants, etat.colonnesVisibles, etat.fichiers.pcb] = sauve;
    sandbox.document.getElementById = getAvant;
  }
}

console.log("\nRésultat : " + reussis + "/" + total + " tests réussis.");
