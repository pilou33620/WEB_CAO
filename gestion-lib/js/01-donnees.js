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
  const cleanNom = String(nom || "").replace(/^.*[\\\/]/, "");
  const cle = `${type}:${cleanNom}`;
  if (LIB_STATE.cacheFichiers.has(cle)) {
    return LIB_STATE.cacheFichiers.get(cle);
  }
  try {
    const data = await apiGet(`/api/lib/fichier?type=${encodeURIComponent(type)}&nom=${encodeURIComponent(cleanNom)}`);
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
/* Les colonnes où cherche la barre de recherche. Les références fabricant y
   sont toutes : « Part Number » (la référence Murata, par exemple), le MPN et
   les secondes sources. Les noms sont ceux, exacts, de l'en-tête du CSV —
   une espace de trop après « Part Number » suffisait à ne jamais rien y
   trouver. */
const COLONNES_RECHERCHE = [
  "Part Name", "Description", "Value", "Package type", "Manufacturer",
  "Part Number", "manufacturer part Number", "vendor reference",
  "Source alternative", "2nd source P/N", "3nd source P/N", "4nd source P/N"
];

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
      const match = COLONNES_RECHERCHE.concat([colPcb, colSch])
        .some(col => String(c[col] || "").toLowerCase().includes(q));
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

/* Boîtier normalisé (lettres et chiffres seuls) -> empreinte candidate.
   L'ORDRE COMPTE : on teste du plus spécifique au plus général, parce que les
   tests sont des « contient ». « TSSOP8 » et « MSOP8 » contiennent « SOP8 » :
   testés après SOIC/SOP, ils recevaient l'empreinte SOIC-8 (pas 1,27 mm au
   lieu de 0,65). Même piège pour SOT-223 / SOT-23 et SOT-23-5/6 / SOT-23. */
const AUTO_PCB_BOITIERS = [
  [["0603"], "0603.json"], [["0805"], "0805.json"], [["0402"], "0402.json"],
  [["0201"], "0201.json"], [["1206"], "1206.json"], [["1210"], "1210.json"],
  [["1812"], "1812.json"], [["2512"], "2512.json"],
  [["SOD123"], "SOD-123.json"], [["SOD323"], "SOD-323.json"], [["SOD523"], "SOD-523.json"],
  [["SOT236"], "SOT-23-6.json"], [["SOT235"], "SOT-23-5.json"],
  [["SOT223"], "SOT-223.json"], [["SOT89"], "SOT-89.json"], [["SOT23"], "SOT-23.json"],
  [["TO252", "DPAK"], "TO-252.json"], [["TO263", "D2PAK"], "TO-263.json"],
  [["TO92"], "TO-92.json"], [["TO220"], "TO-220.json"], [["TO247"], "TO-247.json"],
  [["TSSOP8"], "TSSOP-8.json"], [["TSSOP14"], "TSSOP-14.json"], [["TSSOP16"], "TSSOP-16.json"],
  [["MSOP8"], "MSOP-8.json"],
  [["SOIC8", "SO8", "SOP8"], "SOIC-8.json"], [["SOIC14", "SOP14"], "SOIC-14.json"],
  [["SOIC16", "SOP16"], "SOIC-16.json"],
  [["DIP8"], "DIP-8.json"], [["DIP14"], "DIP-14.json"], [["DIP16"], "DIP-16.json"],
  [["DIP28"], "DIP-28.json"],
  [["QFN24"], "QFN-24.json"], [["QFN16"], "QFN-16.json"], [["QFN32"], "QFN-32.json"],
  [["QFN48"], "QFN-48.json"], [["LQFP48"], "LQFP-48.json"],
  [["SMA"], "SMA.json"], [["SMB"], "SMB.json"], [["SMC"], "SMC.json"]
];

function empreinteCandidate(pkg, pref) {
  for (const [motifs, fichier] of AUTO_PCB_BOITIERS) {
    if (motifs.some(m => pkg.includes(m))) return fichier;
  }
  if (!pkg && (pref === "R" || pref === "C")) return "0603.json";
  return "";
}

// Auto-association automatique basée sur préfixe et boîtier. Sans argument,
// tout le catalogue ; avec une liste, ces composants-là seulement (un
// composant qu'on vient de créer ne doit pas réécrire les autres).
/* ---------- Brochages connus ----------
   La colonne « Brochage » (commun/brochage.js) dit, pour une référence, sur
   quelle patte de l'empreinte tombe chaque broche du symbole. On ne la
   remplit d'office que là où il n'y a pas de doute :
     · une famille entière suit le même brochage normalisé : transistors
       bipolaires en SOT-23 / SOT-323 (JEDEC TO-236 : base 1, émetteur 2,
       collecteur 3), MOSFET en SOT-23 / SOT-323 (grille 1, source 2,
       drain 3) ;
     · une référence précise, relevée sur sa datasheet.
   Le reste — diodes dont l'empreinte ne marque pas la cathode, boîtiers dont
   la numérotation diffère d'un fabricant à l'autre — se saisit à la main.
   Une valeur déjà saisie n'est jamais remplacée. */
const BROCHAGES_REFERENCES = [
  // OPA369AIDCK, SC70-5 (DCK) : OUT 1, V− 2, +IN 3, −IN 4, V+ 5
  [/^OPA369A?IDCK/i, "opamp", "OUT=1,V-=2,IN+=3,IN-=4,V+=5"],
  // LM78Lxx en SO-8 : sortie 1, masse 2-3-6-7, entrée 8, 4 et 5 libres
  [/^LM78L\d+A?CM/i, "regulator", "OUT=1,GND=2/3/6/7,IN=8,NC=4/5"],
  // LP2980 en SOT-23-5 : VIN 1, GND 2, ON/OFF 3 (relié à l'entrée : toujours
  // en marche), NC 4, VOUT 5
  [/^LP2980A?IM5/i, "regulator", "IN=1/3,GND=2,OUT=5,NC=4"]
];
const BROCHAGE_SOT23_3 = /^(SOT-?23(-?3)?|SOT-?323(-?3)?|SC-?70(-?3)?|TO-?236(AB)?)$/;
function brochageConnu(c, sym) {
  const mpn = String(c["Part Number"] || c["manufacturer part Number"] || "").trim();
  const mpn2 = String(c["manufacturer part Number"] || "").trim();
  for (const [re, s, br] of BROCHAGES_REFERENCES)
    if (s === sym && (re.test(mpn) || re.test(mpn2))) return br;
  const nomPcb = String(c["Empreinte PCB"] || "").replace(/^.*[\\\/]/, "").replace(/\.json$/i, "");
  const boitier = String(c["Package type"] || "").toUpperCase().replace(/\s+/g, "");
  const sot23 = BROCHAGE_SOT23_3.test(boitier) || /^(SOT-23|SC-70)$/i.test(nomPcb);
  const pattes = parseInt(c["Number Of pins"], 10);
  if (!sot23 || (pattes && pattes !== 3)) return "";
  // transistors « numériques » (résistances intégrées) : brochage propre au fabricant
  if (/^DT[ACB]/i.test(mpn)) return "";
  /* un MOSFET rangé sous un symbole bipolaire (ou l'inverse) : le symbole est
     à revoir d'abord, le brochage ne doit pas masquer l'erreur */
  const texte = (c["Part Name"] || "") + " " + (c["Description"] || "");
  if ((sym === "npn" || sym === "pnp") && /MOS/i.test(texte)) return "";
  if ((sym === "nmos" || sym === "pmos") && /\b(NPN|PNP|BJT)\b/i.test(texte)) return "";
  if (sym === "npn" || sym === "pnp") return "B=1,E=2,C=3";
  if (sym === "nmos" || sym === "pmos") return "G=1,S=2,D=3";
  return "";
}

function autoAssocierCatalogue(liste) {
  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  let modifs = 0;
  const pcbFiles = LIB_STATE.fichiers.pcb;
  const simFiles = LIB_STATE.fichiers.simulation || [];

  for (const c of (Array.isArray(liste) ? liste : LIB_STATE.composants)) {
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
      const pcbCandidate = empreinteCandidate(pkg, pref);

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
      // comme pour le PCB : n'associer qu'un modèle qui existe vraiment
      if (c[colSim] && simFiles.length && !simFiles.includes(c[colSim])) c[colSim] = "";
      if (c[colSim]) modifs++;
    }
  }

  // 4. Brochage : symbole → empreinte, seulement là où il est certain
  const colBr = "Brochage";
  for (const c of (Array.isArray(liste) ? liste : LIB_STATE.composants)) {
    if (String(c[colBr] || "").trim()) continue;
    const sym = String(c[colSch] || "").replace(/^.*[\\\/]/, "").replace(/\.json$/i, "").toLowerCase();
    const br = brochageConnu(c, sym);
    if (!br) continue;
    if (!LIB_STATE.colonnes.includes(colBr)) LIB_STATE.colonnes.push(colBr);
    c[colBr] = br;
    modifs++;
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
