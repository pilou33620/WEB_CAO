"use strict";
/* =============================================================================
   gestion-lib/test/banc-import-jlc.js
   Banc d'essai unitaire pour l'importation JLCPCB / LCSC et conformité 39 colonnes
   ============================================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error("  FAIL: " + message);
    throw new Error(message);
  }
  passedTests++;
  console.log("  OK: " + message);
}

// Charger 07-import-jlc.js dans un contexte VM
const codePath = path.join(__dirname, "..", "js", "07-import-jlc.js");
const code = fs.readFileSync(codePath, "utf8");

const sandbox = {
  console,
  document: {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild: () => {} }),
    body: { appendChild: () => {} },
    addEventListener: () => {}
  },
  window: { location: { search: "" } },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

console.log("— Démarrage des tests banc-import-jlc.js —");

// 1. Vérification des 39 colonnes
const cols = vm.runInContext("COLONNES_CATALOGUE_39", sandbox);
assert(Array.isArray(cols), "COLONNES_CATALOGUE_39 est un tableau");
assert(cols.length === 39, "Le catalogue comporte exactement 39 colonnes (obtenu: " + cols.length + ")");
assert(cols[0] === "Part Name", "La 1ère colonne est 'Part Name'");
assert(cols[38] === "Modèle Simulation", "La 39ème colonne est 'Modèle Simulation'");

// 2. Inférence des classes et préfixes
const infererClasse = vm.runInContext("infererClasseEtPrefixe", sandbox);
const resR = infererClasse("Chip Resistor", "Surface Mount", "10k 0805", "10k resistor");
assert(resR.classe === "Resistor" && resR.prefix === "R" && resR.deviceType === "Passive", "Inférence résistance correcte");

const resC = infererClasse("Capacitor", "MLCC", "100nF", "100nF ceramic capacitor");
assert(resC.classe === "Capacitor" && resC.prefix === "C" && resC.deviceType === "Passive", "Inférence condensateur correcte");

const resLdo = infererClasse("Linear Voltage Regulators", "LDO", "AMS1117-3.3", "1A LDO");
assert(resLdo.classe === "Voltage Regulator" && resLdo.prefix === "U" && resLdo.deviceType === "Active", "Inférence régulateur LDO correcte");

const resMcu = infererClasse("Microcontroller Units", "ARM Cortex-M3", "STM32F103C8T6", "32-bit MCU");
assert(resMcu.classe === "Integrated Circuit" && resMcu.prefix === "U" && resMcu.deviceType === "Active", "Inférence microcontrôleur correcte");

// 3. Inférence des empreintes PCB
const infererFp = vm.runInContext("infererEmpreintePcb", sandbox);
assert(infererFp("0805", "Resistor", 2) === "0805.json", "Empreinte 0805");
assert(infererFp("SOT-223", "Regulator", 3) === "SOT-223.json", "Empreinte SOT-223");
assert(infererFp("LQFP-48", "MCU", 48) === "LQFP-48.json", "Empreinte LQFP-48");

// 4. Conversion JLCPCB vers 39 colonnes complètes (AMS1117-3.3)
const jlcVers39 = vm.runInContext("jlcVers39Colonnes", sandbox);
const partAMS = {
  lcsc: "C6186",
  model: "AMS1117-3.3",
  manufacturer: "Advanced Monolithic Systems",
  category: "Linear Voltage Regulators",
  subcategory: "LDO",
  package: "SOT-223",
  description: "1A 3.3V Linear Voltage Regulator LDO SOT-223",
  datasheet: "https://datasheet.lcsc.com/lcsc/xxx.pdf",
  pin_count: 3
};
const pinoutAMS = {
  pins: [
    { number: "1", name: "GND/ADJ", electrical_type: "power" },
    { number: "2", name: "VOUT", electrical_type: "output" },
    { number: "3", name: "VIN", electrical_type: "input" }
  ]
};

const compAMS = jlcVers39(partAMS, pinoutAMS);
const clesComp = Object.keys(compAMS);
assert(clesComp.length === 39, "Le composant généré contient exactement 39 colonnes (obtenu: " + clesComp.length + ")");
cols.forEach(c => {
  assert(c in compAMS, "Colonne présente: " + c);
});
assert(compAMS["Part Name"] === "AMS1117-3.3", "Part Name conforme");
assert(compAMS["Par class"] === "Voltage Regulator", "Par class conforme");
assert(compAMS["Reference designator Prefix"] === "U", "Prefix conforme");
assert(compAMS["Number Of pins"] === "3", "Number Of pins conforme");
assert(compAMS["Device type"] === "Active", "Device type conforme");
assert(compAMS["vendor reference"] === "C6186", "vendor reference conforme (C6186)");
assert(compAMS["Package type"] === "SOT-223", "Package type conforme");
assert(compAMS["Empreinte PCB"] === "SOT-223.json", "Empreinte PCB conforme");
assert(compAMS["Empreinte Schématique"] === "regulator.json", "Empreinte Schématique conforme");

// 5. Génération de symbole schématique custom (STM32F103 avec pinout)
const jlcGenererSym = vm.runInContext("jlcGenererSymbole", sandbox);
const pinsMcu = [];
for (let i = 1; i <= 48; i++) {
  pinsMcu.push({ number: String(i), name: "PIN_" + i, electrical_type: i === 1 ? "power" : "io" });
}
const symMcu = jlcGenererSym("STM32F103C8T6.json", { pins: pinsMcu }, "U", "STM32F103C8T6");
assert(symMcu.format === "schsym-1", "Format de symbole schsym-1 valide");
assert(symMcu.id === "STM32F103C8T6", "ID de symbole conforme");
assert(symMcu.pinCount === 48, "Nombre de broches du symbole = 48");
assert(Array.isArray(symMcu.pins) && symMcu.pins.length === 48, "Tableau de 48 broches généré");
assert(Array.isArray(symMcu.primitives) && symMcu.primitives.length >= 1, "Primitives géométriques présentes");

console.log("\nRésultat : " + passedTests + "/" + totalTests + " tests réussis avec succès !");
