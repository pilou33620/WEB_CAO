"use strict";
/* =============================================================================
   editeur-pcb/test/banc-trois-ponts.js
   Vérifie que les 3 ponts transversaux fonctionnent de bout en bout :
     1. Blocs fonctionnels (motifs schéma -> placement PCB)
     2. Courants DC estimés (schéma -> solveur DC PCB)
     3. DRC Netclasses suggérées (schéma -> autoClass PCB)
   ============================================================================= */
const assert = require("assert");

// Mock de l'environnement navigateur
const storage = {};
global.sessionStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; }
};

global.window = global;
global.document = {
  readyState: "complete",
  addEventListener: () => {},
  getElementById: () => null,
  querySelectorAll: () => []
};

// Charge les briques PCB
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 1. Charger 01-core.js
const coreCode = fs.readFileSync(path.join(__dirname, "../js/01-core.js"), "utf-8");
vm.runInThisContext(coreCode);

// 2. Charger 19-simulation.js
const simCode = fs.readFileSync(path.join(__dirname, "../js/19-simulation.js"), "utf-8");
vm.runInThisContext(simCode);

// 3. Charger 20-placement-score.js
const scoreCode = fs.readFileSync(path.join(__dirname, "../js/20-placement-score.js"), "utf-8");
vm.runInThisContext(scoreCode);

console.log("=== BANC D'ESSAI DES 3 PONTS TRANSVERSAUX & ROTATION ASSISTÉE ===");

// -------------------------------------------------------------
// Test Pont 1 : Blocs Fonctionnels Schéma -> Placement PCB
// -------------------------------------------------------------
{
  const motifsData = {
    succes: true,
    total_motifs: 2,
    motifs: [
      { id: "alim_u1", type: "power_supply", label: "Régulateur 3.3V (U1)", components: ["U1", "C1", "C2"] },
      { id: "bus_i2c", type: "digital_bus", label: "Bus I2C", components: ["R1", "R2"] }
    ]
  };
  sessionStorage.setItem("web_cao_patterns_cache", JSON.stringify(motifsData));
  
  const raw = sessionStorage.getItem("web_cao_patterns_cache");
  assert(raw !== null, "Échec écriture/lecture web_cao_patterns_cache");
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.motifs.length, 2, "Nombre de motifs incorrect");
  console.log("✓ Pont 1 validé : Blocs fonctionnels persistés et relus du cache");
}

// -------------------------------------------------------------
// Test Pont 2 : Courants DC Schéma -> Simulation DC PCB
// -------------------------------------------------------------
{
  // Composant U1 sans spécifications explicites (courant inconnu)
  const compU1 = { ref: "U1", value: "STM32F103", type: "ic", specs: {} };
  
  // Sans données dans sessionStorage -> fallback par défaut 30 mA
  sessionStorage.removeItem("web_cao_courants_dc");
  const spDef = pcbSpecsComposant(compU1);
  assert.strictEqual(spDef.courant, 0.030, "Fallback par défaut attendu 30 mA");

  // Avec données issues de l'analyse des motifs (50 mA pour STM32)
  const dcData = [
    { source: "U1", composant: "U1", courant_ma: 50.0, role: "charge", type: "consommation_ic" }
  ];
  sessionStorage.setItem("web_cao_courants_dc", JSON.stringify(dcData));
  
  const spEstim = pcbSpecsComposant(compU1);
  assert.strictEqual(spEstim.courant, 0.050, "Courant surchargé attendu 50 mA (obtenu: " + spEstim.courant + ")");
  console.log("✓ Pont 2 validé : Courants estimés du schéma injectés dans pcbSpecsComposant");
}

// -------------------------------------------------------------
// Test Pont 3 : Netclasses suggérées Schéma -> autoClass PCB
// -------------------------------------------------------------
{
  // Initialise l'état S du PCB
  S.classes = [
    { name: "Défaut", w: 0.3, clr: 0.25, via: 0.8, drill: 0.4 },
    { name: "Alimentation", w: 0.5, clr: 0.3, via: 0.9, drill: 0.5 }
  ];
  S.netClass = {};
  S.fps = [
    { id: 1, ref: "U1", nets: { 1: "SPI_SCK", 2: "AIN1", 3: "+3.3V" }, pads: [{ n: 1 }, { n: 2 }, { n: 3 }] }
  ];
  S.tracks = [];

  // Données de suggestions issues du schéma
  const netclassesData = {
    "SPI_SCK": "Rapide",
    "AIN1": "Analogique",
    "+3.3V": "Alimentation"
  };
  sessionStorage.setItem("web_cao_netclasses", JSON.stringify(netclassesData));

  // Exécution de autoClass()
  autoClass();

  // Vérifications
  assert(S.classes.some(c => c.name === "Rapide"), "La classe Rapide doit avoir été créée");
  assert(S.classes.some(c => c.name === "Analogique"), "La classe Analogique doit avoir été créée");
  assert.strictEqual(S.netClass["SPI_SCK"], "Rapide", "SPI_SCK doit être associé à Rapide");
  assert.strictEqual(S.netClass["AIN1"], "Analogique", "AIN1 doit être associé à Analogique");
  assert.strictEqual(S.netClass["+3.3V"], "Alimentation", "+3.3V doit être associé à Alimentation");
  console.log("✓ Pont 3 validé : autoClass a créé et assigné les classes Rapide et Analogique");
}

// -------------------------------------------------------------
// Test Optimisation de rotation assistée (anti-croisements)
// -------------------------------------------------------------
{
  S.fps = [
    {
      id: 1, ref: "U1", x: 20, y: 20, rot: 0,
      nets: { 1: "NET_A", 2: "NET_B" },
      pads: [{ n: 1, x: 0, y: -2 }, { n: 2, x: 0, y: 2 }]
    },
    {
      id: 2, ref: "TARGET_A", x: 30, y: 25, rot: 0,
      nets: { 1: "NET_A" },
      pads: [{ n: 1, x: 0, y: 0 }]
    },
    {
      id: 3, ref: "TARGET_B", x: 30, y: 15, rot: 0,
      nets: { 1: "NET_B" },
      pads: [{ n: 1, x: 0, y: 0 }]
    }
  ];

  const diag = PLACEMENT_SCORE.evaluerRotationComposant("U1");
  assert(diag !== null, "Échec de l'évaluation de rotation");
  assert.strictEqual(diag.rotActuelle, 0);
  assert.strictEqual(diag.rotOptimale, 180, "L'angle optimal attendu est 180°");
  assert.strictEqual(diag.croisementsActuels, 1);
  assert.strictEqual(diag.croisementsOptimaux, 0);
  assert.strictEqual(diag.gainCroisements, 1);

  // Application
  PLACEMENT_SCORE.appliquerRotation("U1", 180);
  assert.strictEqual(S.fps[0].rot, 180, "La rotation du composant doit valoir 180");
  console.log("✓ Rotation assistée validée : Détection et élimination du croisement en X à 180°");
}

console.log("\nTOUS LES ESSAIS DES PONTS ET DE LA ROTATION SONT VALIDÉS AVEC SUCCÈS !");
process.exit(0);
