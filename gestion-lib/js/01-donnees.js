"use strict";
/* =============================================================================
   Gestion LIB — 01-donnees.js
   Modèle de données, communication API et état global de la bibliothèque
   ============================================================================= */

const LIB_STATE = {
  colonnes: [],
  colonnesVisibles: [],
  composants: [],
  fichiers: {
    pcb: [],
    schematique: [],
    simulation: []
  },
  filtres: {
    recherche: "",
    prefix: "TOUS",
    statut: "TOUS"
  },
  tri: {
    colonne: "Part Name",
    asc: true
  },
  selection: null,
  sale: false,
  cacheFichiers: new Map()
};

/* ---------- Colonnes par défaut du catalogue ---------- */
const COLONNES_DEFAUT = [
  "Part Name",
  "Reference designator Prefix",
  "Package type",
  "Value",
  "Description",
  "Manufacturer",
  "Empreinte PCB",
  "Empreinte Schématique",
  "Modèle Simulation"
];

function initialiserColonnesVisibles() {
  const stocke = localStorage.getItem("cao_lib_colonnes_visibles");
  if (stocke) {
    try {
      const parsed = JSON.parse(stocke);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filtrer pour ne garder que les colonnes réellement existantes dans LIB_STATE.colonnes
        const valides = parsed.filter(c => LIB_STATE.colonnes.includes(c));
        if (valides.length > 0) {
          LIB_STATE.colonnesVisibles = valides;
          return;
        }
      }
    } catch (_) {}
  }
  // Sinon, colonnes par défaut présentes dans le CSV
  const def = COLONNES_DEFAUT.filter(c => LIB_STATE.colonnes.includes(c));
  if (def.length > 0) {
    LIB_STATE.colonnesVisibles = def;
  } else {
    LIB_STATE.colonnesVisibles = LIB_STATE.colonnes.slice(0, 8);
  }
}

function enregistrerColonnesVisibles(nouvellesColonnes) {
  LIB_STATE.colonnesVisibles = nouvellesColonnes;
  try {
    localStorage.setItem("cao_lib_colonnes_visibles", JSON.stringify(nouvellesColonnes));
  } catch (_) {}
}

/* ---------- Communication API ---------- */

async function apiGet(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    let err = "Erreur HTTP " + resp.status;
    try {
      const j = await resp.json();
      if (j.detail) err = j.detail;
    } catch (_) {}
    throw new Error(err);
  }
  return await resp.json();
}

async function apiPost(url, data) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!resp.ok) {
    let err = "Erreur HTTP " + resp.status;
    try {
      const j = await resp.json();
      if (j.detail) err = j.detail;
    } catch (_) {}
    throw new Error(err);
  }
  return await resp.json();
}

async function apiDelete(url) {
  const resp = await fetch(url, { method: "DELETE" });
  if (!resp.ok) {
    let err = "Erreur HTTP " + resp.status;
    try {
      const j = await resp.json();
      if (j.detail) err = j.detail;
    } catch (_) {}
    throw new Error(err);
  }
  return await resp.json();
}

// Chargement complet initial
async function chargerDonneesBibliotheque() {
  try {
    // 1. Liste des fichiers
    const fichiers = await apiGet("/api/lib/fichiers");
    LIB_STATE.fichiers = fichiers;

    // 2. Catalogue de composants
    const cat = await apiGet("/api/lib/composants");
    LIB_STATE.colonnes = cat.colonnes || [];
    initialiserColonnesVisibles();
    LIB_STATE.composants = (cat.composants || []).map((c, i) => {
      c._id = i;
      return c;
    });
    LIB_STATE.sale = false;

    return { ok: true, total: LIB_STATE.composants.length };
  } catch (err) {
    console.warn("Échec chargement API, tentative de chargement direct du CSV :", err.message);
    // Repli si le serveur API n'est pas utilisé (ex. mode statique ou hors-ligne)
    return await chargerRepliCsv();
  }
}

// Repli de chargement direct du CSV si l'API échoue
async function chargerRepliCsv() {
  const paths = [
    "../LIB/LIB_composants.csv",
    "../../LIB/LIB_composants.csv",
    "/LIB/LIB_composants.csv",
    "../LIB_composants.csv"
  ];
  for (const p of paths) {
    try {
      const resp = await fetch(p);
      if (resp.ok) {
        const text = await resp.text();
        parserCsvBrut(text);
        return { ok: true, total: LIB_STATE.composants.length };
      }
    } catch (_) {}
  }
  throw new Error("Impossible de charger la bibliothèque de composants.");
}

function parseCSVLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        result.push(cur);
        cur = "";
      } else {
        cur += char;
      }
    }
  }
  result.push(cur);
  return result;
}

function parserCsvBrut(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return;
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  
  if (!headers.includes("Empreinte PCB")) headers.push("Empreinte PCB");
  if (!headers.includes("Empreinte Schématique") && !headers.includes("Empreinte Schematique")) {
    headers.push("Empreinte Schématique");
  }
  if (!headers.includes("Modèle Simulation") && !headers.includes("Modele Simulation")) {
    headers.push("Modèle Simulation");
  }

  const list = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const obj = { _id: i - 1 };
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] !== undefined ? row[j].trim() : "";
    }
    list.push(obj);
  }
  LIB_STATE.colonnes = headers;
  initialiserColonnesVisibles();
  LIB_STATE.composants = list;
}

// Lecture d'un fichier d'empreinte ou symbole avec cache
async function obtenirFichierLib(type, nom) {
  if (!nom) return null;
  const cle = `${type}:${nom}`;
  if (LIB_STATE.cacheFichiers.has(cle)) {
    return LIB_STATE.cacheFichiers.get(cle);
  }
  try {
    const data = await apiGet(`/api/lib/fichier?type=${encodeURIComponent(type)}&nom=${encodeURIComponent(nom)}`);
    const contenu = data.data !== undefined ? data.data : data.contenu;
    LIB_STATE.cacheFichiers.set(cle, contenu);
    return contenu;
  } catch (err) {
    console.warn(`Impossible de lire ${type}/${nom} :`, err.message);
    return null;
  }
}

// Sauvegarde d'un fichier d'empreinte ou symbole sur le serveur
async function sauvegarderFichierLib(type, nom, dataOuContenu) {
  if (!type || !nom) throw new Error("Type et nom de fichier requis");
  if (!nom.endsWith(".json") && (type === "pcb" || type === "schematique")) {
    nom += ".json";
  }

  const payload = {
    type: type,
    nom: nom
  };
  if (typeof dataOuContenu === "object") {
    payload.data = dataOuContenu;
  } else {
    payload.contenu = String(dataOuContenu);
  }

  const res = await apiPost("/api/lib/fichier", payload);

  // Mettre à jour le cache
  const cle = `${type}:${nom}`;
  LIB_STATE.cacheFichiers.set(cle, dataOuContenu);

  // Mettre à jour la liste des fichiers locaux si nouveau
  if (Array.isArray(LIB_STATE.fichiers[type])) {
    if (!LIB_STATE.fichiers[type].includes(nom)) {
      LIB_STATE.fichiers[type].push(nom);
      LIB_STATE.fichiers[type].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    }
  }

  // Diffuser la modification vers les autres outils ouverts (Schéma, PCB)
  if (typeof sessDiffuserLibModif === "function") {
    sessDiffuserLibModif({
      genre: "fichier",
      typeFichier: type,
      nom: nom,
      data: dataOuContenu,
      action: "sauvegarde"
    });
  }

  return res;
}

// Suppression d'un fichier d'empreinte ou symbole
async function supprimerFichierLib(type, nom) {
  if (!type || !nom) throw new Error("Type et nom de fichier requis");
  const res = await apiDelete(`/api/lib/fichier?type=${encodeURIComponent(type)}&nom=${encodeURIComponent(nom)}`);

  // Nettoyer cache
  const cle = `${type}:${nom}`;
  LIB_STATE.cacheFichiers.delete(cle);

  // Retirer de la liste
  if (Array.isArray(LIB_STATE.fichiers[type])) {
    LIB_STATE.fichiers[type] = LIB_STATE.fichiers[type].filter(f => f !== nom);
  }

  if (typeof sessDiffuserLibModif === "function") {
    sessDiffuserLibModif({
      genre: "fichier",
      typeFichier: type,
      nom: nom,
      action: "suppression"
    });
  }

  return res;
}

// Sauvegarde des modifications du catalogue vers le serveur
async function enregistrerCatalogue() {
  if (!LIB_STATE.sale) return { ok: true, message: "Aucune modification à enregistrer" };
  const payload = {
    colonnes: LIB_STATE.colonnes,
    composants: LIB_STATE.composants
  };
  const res = await apiPost("/api/lib/composants", payload);
  LIB_STATE.sale = false;

  if (typeof sessDiffuserLibModif === "function") {
    sessDiffuserLibModif({
      genre: "catalogue",
      action: "sauvegarde"
    });
  }

  return res;
}

// Filtrage et tri de la liste de composants
function obtenirComposantsFiltres() {
  const q = LIB_STATE.filtres.recherche.toLowerCase().trim();
  const pref = LIB_STATE.filtres.prefix;
  const stat = LIB_STATE.filtres.statut;

  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  let out = LIB_STATE.composants.filter(c => {
    // 1. Filtre préfixe / classe
    if (pref !== "TOUS") {
      const p = (c["Reference designator Prefix"] || "").toUpperCase().trim();
      if (p !== pref) return false;
    }

    // 2. Filtre statut d'association
    if (stat === "COMPLET") {
      if (!c[colPcb] || !c[colSch]) return false;
    } else if (stat === "SANS_PCB") {
      if (c[colPcb]) return false;
    } else if (stat === "SANS_SCH") {
      if (c[colSch]) return false;
    } else if (stat === "SANS_SIM") {
      if (c[colSim]) return false;
    } else if (stat === "NON_ASSOCIE") {
      if (c[colPcb] && c[colSch]) return false;
    }

    // 3. Filtre recherche texte
    if (q) {
      const match = (c["Part Name"] || "").toLowerCase().includes(q) ||
                    (c["Description"] || "").toLowerCase().includes(q) ||
                    (c["Value"] || "").toLowerCase().includes(q) ||
                    (c["Package type"] || "").toLowerCase().includes(q) ||
                    (c["Manufacturer"] || "").toLowerCase().includes(q) ||
                    (c["Part Number "] || "").toLowerCase().includes(q) ||
                    (c[colPcb] || "").toLowerCase().includes(q) ||
                    (c[colSch] || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Tri
  const tc = LIB_STATE.tri.colonne;
  const asc = LIB_STATE.tri.asc ? 1 : -1;
  out.sort((a, b) => {
    const va = (a[tc] || "").toString();
    const vb = (b[tc] || "").toString();
    return va.localeCompare(vb, "fr", { numeric: true }) * asc;
  });

  return out;
}

// Calcul des statistiques globales
function calculerStats() {
  const total = LIB_STATE.composants.length;
  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  let avecPcb = 0, avecSch = 0, avecSim = 0;
  for (const c of LIB_STATE.composants) {
    if (c[colPcb]) avecPcb++;
    if (c[colSch]) avecSch++;
    if (c[colSim]) avecSim++;
  }

  return {
    total,
    avecPcb,
    avecSch,
    avecSim,
    totalPcbDispo: LIB_STATE.fichiers.pcb.length,
    totalSchDispo: LIB_STATE.fichiers.schematique.length,
    totalSimDispo: LIB_STATE.fichiers.simulation.length,
    tauxPcb: total > 0 ? Math.round((avecPcb / total) * 100) : 0,
    tauxSch: total > 0 ? Math.round((avecSch / total) * 100) : 0,
    tauxSim: total > 0 ? Math.round((avecSim / total) * 100) : 0
  };
}

// Mettre à jour une valeur d'association pour un composant
function modifierComposant(id, champ, valeur) {
  const comp = LIB_STATE.composants.find(c => c._id === id);
  if (!comp) return false;
  if (comp[champ] !== valeur) {
    comp[champ] = valeur;
    LIB_STATE.sale = true;
    return true;
  }
  return false;
}

// Auto-association automatique basée sur préfixe et boîtier
function autoAssocierCatalogue() {
  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  let modifs = 0;
  const pcbFiles = LIB_STATE.fichiers.pcb;

  for (const c of LIB_STATE.composants) {
    const pkg = (c["Package type"] || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pref = (c["Reference designator Prefix"] || "").toUpperCase().trim();
    const desc = (c["Description"] || "").toUpperCase();

    // 1. Schéma
    if (!c[colSch]) {
      if (pref === "R") c[colSch] = "resistor.json";
      else if (pref === "RV") c[colSch] = "potentiometer.json";
      else if (pref === "C") c[colSch] = desc.includes("POLARIS") || desc.includes("CHIMIQUE") ? "cap_pol.json" : "capacitor.json";
      else if (pref === "L" || pref === "FB") c[colSch] = "inductor.json";
      else if (pref === "D" || pref === "LED" || pref === "ESD") {
        if (desc.includes("LED")) c[colSch] = "led.json";
        else if (desc.includes("ZENER")) c[colSch] = "zener.json";
        else if (desc.includes("SCHOTTKY")) c[colSch] = "schottky.json";
        else c[colSch] = "diode.json";
      }
      else if (pref === "Q") {
        if (desc.includes("MOSFET") || desc.includes("NMOS")) c[colSch] = "nmos.json";
        else if (desc.includes("PMOS")) c[colSch] = "pmos.json";
        else if (desc.includes("PNP")) c[colSch] = "pnp.json";
        else c[colSch] = "npn.json";
      }
      else if (pref === "U" || pref === "IC") {
        if (desc.includes("OPAMP") || desc.includes("AOP") || desc.includes("AMPLI")) c[colSch] = "opamp.json";
        else if (desc.includes("REGULAT") || desc.includes("LDO")) c[colSch] = "regulator.json";
        else c[colSch] = "ic.json";
      }
      else if (pref === "SW") c[colSch] = desc.includes("PUSH") ? "button.json" : "switch.json";
      else if (pref === "K") c[colSch] = "relay.json";
      else if (pref === "J" || pref === "JP" || pref === "CONN") c[colSch] = desc.includes("USB") ? "usb_c.json" : "header.json";
      else if (pref === "TP" || pref === "PTST") c[colSch] = "testpoint.json";
      else if (pref === "F") c[colSch] = "fuse.json";
      else if (pref === "Y") c[colSch] = "crystal.json";
      else if (pref === "BT" || pref === "BATT") c[colSch] = "battery.json";
      else if (pref === "MECA") c[colSch] = "hole.json";
      else if (pref === "BZ") c[colSch] = "buzzer.json";
      else c[colSch] = "ic.json";
      modifs++;
    }

    // 2. PCB
    if (!c[colPcb]) {
      let pcbCandidate = "";
      if (pkg.includes("0603")) pcbCandidate = "0603.json";
      else if (pkg.includes("0805")) pcbCandidate = "0805.json";
      else if (pkg.includes("0402")) pcbCandidate = "0402.json";
      else if (pkg.includes("0201")) pcbCandidate = "0201.json";
      else if (pkg.includes("1206")) pcbCandidate = "1206.json";
      else if (pkg.includes("1210")) pcbCandidate = "1210.json";
      else if (pkg.includes("1812")) pcbCandidate = "1812.json";
      else if (pkg.includes("2512")) pcbCandidate = "2512.json";
      else if (pkg.includes("SOD123")) pcbCandidate = "SOD-123.json";
      else if (pkg.includes("SOD323")) pcbCandidate = "SOD-323.json";
      else if (pkg.includes("SOD523")) pcbCandidate = "SOD-523.json";
      else if (pkg.includes("SOT236")) pcbCandidate = "SOT-23-6.json";
      else if (pkg.includes("SOT235")) pcbCandidate = "SOT-23-5.json";
      else if (pkg.includes("SOT23")) pcbCandidate = "SOT-23.json";
      else if (pkg.includes("SOT89")) pcbCandidate = "SOT-89.json";
      else if (pkg.includes("SOT223")) pcbCandidate = "SOT-223.json";
      else if (pkg.includes("TO252") || pkg.includes("DPAK")) pcbCandidate = "TO-252.json";
      else if (pkg.includes("TO263") || pkg.includes("D2PAK")) pcbCandidate = "TO-263.json";
      else if (pkg.includes("TO92")) pcbCandidate = "TO-92.json";
      else if (pkg.includes("TO220")) pcbCandidate = "TO-220.json";
      else if (pkg.includes("TO247")) pcbCandidate = "TO-247.json";
      else if (pkg.includes("SOIC8") || pkg.includes("SO8") || pkg.includes("SOP8")) pcbCandidate = "SOIC-8.json";
      else if (pkg.includes("SOIC14") || pkg.includes("SOP14")) pcbCandidate = "SOIC-14.json";
      else if (pkg.includes("SOIC16") || pkg.includes("SOP16")) pcbCandidate = "SOIC-16.json";
      else if (pkg.includes("TSSOP8")) pcbCandidate = "TSSOP-8.json";
      else if (pkg.includes("TSSOP14")) pcbCandidate = "TSSOP-14.json";
      else if (pkg.includes("TSSOP16")) pcbCandidate = "TSSOP-16.json";
      else if (pkg.includes("MSOP8")) pcbCandidate = "MSOP-8.json";
      else if (pkg.includes("DIP8")) pcbCandidate = "DIP-8.json";
      else if (pkg.includes("DIP14")) pcbCandidate = "DIP-14.json";
      else if (pkg.includes("DIP16")) pcbCandidate = "DIP-16.json";
      else if (pkg.includes("DIP28")) pcbCandidate = "DIP-28.json";
      else if (pkg.includes("QFN24")) pcbCandidate = "QFN-24.json";
      else if (pkg.includes("QFN16")) pcbCandidate = "QFN-16.json";
      else if (pkg.includes("QFN32")) pcbCandidate = "QFN-32.json";
      else if (pkg.includes("QFN48")) pcbCandidate = "QFN-48.json";
      else if (pkg.includes("LQFP48")) pcbCandidate = "LQFP-48.json";
      else if (pkg.includes("SMA")) pcbCandidate = "SMA.json";
      else if (pkg.includes("SMB")) pcbCandidate = "SMB.json";
      else if (pkg.includes("SMC")) pcbCandidate = "SMC.json";
      else if (!pkg && (pref === "R" || pref === "C")) pcbCandidate = "0603.json";

      if (pcbCandidate && pcbFiles.includes(pcbCandidate)) {
        c[colPcb] = pcbCandidate;
        modifs++;
      }
    }

    // 3. Simulation
    if (!c[colSim] && c[colSch]) {
      const symBase = c[colSch].replace(/\.json$/i, "");
      if (symBase === "resistor" || symBase === "potentiometer") c[colSim] = "resistor.sub";
      else if (symBase === "capacitor" || symBase === "cap_pol") c[colSim] = "capacitor.sub";
      else if (symBase === "inductor" || symBase === "ferrite_bead") c[colSim] = "inductor.sub";
      else if (symBase === "diode" || symBase === "led" || symBase === "zener" || symBase === "schottky") c[colSim] = "diode.sub";
      else if (symBase === "npn") c[colSim] = "bjt_npn.sub";
      else if (symBase === "pnp") c[colSim] = "bjt_pnp.sub";
      else if (symBase === "nmos") c[colSim] = "mosfet_n.sub";
      else if (symBase === "pmos") c[colSim] = "mosfet_p.sub";
      else if (symBase === "opamp") c[colSim] = "opamp_ideal.sub";
      if (c[colSim]) modifs++;
    }
  }

  if (modifs > 0) {
    LIB_STATE.sale = true;
  }
  return modifs;
}

// Export CSV déclenché côté navigateur
function telechargerCsv() {
  const escapeField = str => {
    if (str === null || str === undefined) return "";
    const s = String(str);
    if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [
    LIB_STATE.colonnes.map(escapeField).join(";")
  ];
  for (const c of LIB_STATE.composants) {
    const row = LIB_STATE.colonnes.map(col => escapeField(c[col] || ""));
    lines.push(row.join(";"));
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "LIB_composants.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
