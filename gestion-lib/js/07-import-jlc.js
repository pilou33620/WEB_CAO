"use strict";
/* =============================================================================
   Gestion LIB — 07-import-jlc.js
   Importation directe JLCPCB / LCSC avec prévisualisation et respect strict des 39 colonnes
   ============================================================================= */

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLONNES_CATALOGUE_39 = [
  "Part Name",
  "Part Type",
  "Description",
  "Par class",
  "Reference designator Prefix",
  "Number Of pins",
  "Maximun Height",
  "Standoof Height",
  "Value",
  "Device type",
  "Part Number",
  "Manufacturer",
  "manufacturer part Number",
  "Vendor",
  "Dielectrique",
  "vendor reference",
  "Source alternative",
  "2nd source P/N",
  "2nd source Manufacturer",
  "3nd source P/N",
  "3nd source Manufacturer",
  "4nd source P/N",
  "4nd source Manufacturer",
  "tolerance",
  "wattage",
  "fréquency",
  "PPM",
  "Voltage Rating",
  "current Rating",
  "Maximum operating temperature",
  "Minimum operating temperature",
  "Package type",
  "Dimenssions",
  "terminal pitch",
  "mounting type",
  "gender",
  "Empreinte PCB",
  "Empreinte Schématique",
  "Modèle Simulation"
];

/* ---------- Extraction & Conversion vers les 39 colonnes strictes ---------- */

function infererClasseEtPrefixe(cat, subcat, model, desc) {
  const texte = `${cat || ""} ${subcat || ""} ${model || ""} ${desc || ""}`.toLowerCase();

  if (/resistor|résistance|chip resistor/i.test(texte)) {
    return { classe: "Resistor", prefix: "R", deviceType: "Passive", sym: "resistor.json" };
  }
  if (/capacitor|condensateur|mlcc/i.test(texte)) {
    return { classe: "Capacitor", prefix: "C", deviceType: "Passive", sym: "capacitor.json" };
  }
  if (/inductor|inductance|ferrite|choke|bobine/i.test(texte)) {
    return { classe: "Inductor", prefix: "L", deviceType: "Passive", sym: "inductor.json" };
  }
  if (/zener/i.test(texte)) {
    return { classe: "Diode", prefix: "D", deviceType: "Active", sym: "zener.json" };
  }
  if (/schottky/i.test(texte)) {
    return { classe: "Diode", prefix: "D", deviceType: "Active", sym: "schottky.json" };
  }
  if (/tvs|esd/i.test(texte)) {
    return { classe: "Diode", prefix: "D", deviceType: "Active", sym: "tvs_diode.json" };
  }
  if (/led|del/i.test(texte)) {
    return { classe: "Diode", prefix: "D", deviceType: "Active", sym: "led.json" };
  }
  if (/diode/i.test(texte)) {
    return { classe: "Diode", prefix: "D", deviceType: "Active", sym: "diode.json" };
  }
  if (/mosfet|n-channel|p-channel/i.test(texte)) {
    const isP = /p-channel|pmos/i.test(texte);
    return { classe: "Transistor", prefix: "Q", deviceType: "Active", sym: isP ? "pmos.json" : "nmos.json" };
  }
  if (/transistor|bjt|npn|pnp/i.test(texte)) {
    const isPnp = /pnp/i.test(texte);
    return { classe: "Transistor", prefix: "Q", deviceType: "Active", sym: isPnp ? "pnp.json" : "npn.json" };
  }
  if (/regulator|ldo|dc-dc|converter|buck|boost/i.test(texte)) {
    return { classe: "Voltage Regulator", prefix: "U", deviceType: "Active", sym: "regulator.json" };
  }
  if (/amplifier|opamp|aopl|comparator/i.test(texte)) {
    return { classe: "Integrated Circuit", prefix: "U", deviceType: "Active", sym: "opamp.json" };
  }
  if (/mcu|microcontroller|microprocesseur|dsp|fpga/i.test(texte)) {
    return { classe: "Integrated Circuit", prefix: "U", deviceType: "Active", sym: "ic.json" };
  }
  if (/switch|bouton|pushbutton/i.test(texte)) {
    return { classe: "Switch", prefix: "SW", deviceType: "Passive", sym: "switch.json" };
  }
  if (/connector|connecteur|header|usb|terminal block/i.test(texte)) {
    return { classe: "Connector", prefix: "J", deviceType: "Passive", sym: /usb/i.test(texte) ? "usb_c.json" : "header.json" };
  }
  if (/crystal|quartz|oscillator|resonator/i.test(texte)) {
    return { classe: "Crystal / Oscillator", prefix: "Y", deviceType: "Passive", sym: "crystal.json" };
  }
  if (/fuse|fusible/i.test(texte)) {
    return { classe: "Fuse", prefix: "F", deviceType: "Passive", sym: "fuse.json" };
  }

  return { classe: "Integrated Circuit", prefix: "U", deviceType: "Active", sym: "ic.json" };
}

function infererEmpreintePcb(pkgRaw) {
  if (!pkgRaw) return "";
  const p = String(pkgRaw).trim().toUpperCase();

  // Correspondances directes standard
  const normalises = {
    "SOT-223": "SOT-223.json",
    "SOT223": "SOT-223.json",
    "SOT-23": "SOT-23.json",
    "SOT23": "SOT-23.json",
    "SOT-23-3": "SOT-23.json",
    "SOT-23-5": "SOT-23-5.json",
    "SOT-23-6": "SOT-23-6.json",
    "SOT-89": "SOT-89.json",
    "SOIC-8": "SOIC-8.json",
    "SOP-8": "SOIC-8.json",
    "SOIC-14": "SOIC-14.json",
    "SOIC-16": "SOIC-16.json",
    "TSSOP-8": "TSSOP-8.json",
    "TSSOP-14": "TSSOP-14.json",
    "TSSOP-16": "TSSOP-16.json",
    "TSSOP-20": "TSSOP-20.json",
    "LQFP-48": "LQFP-48.json",
    "QFP-48": "LQFP-48.json",
    "LQFP-64": "LQFP-64.json",
    "LQFP-100": "LQFP-100.json",
    "QFN-16": "QFN-16.json",
    "QFN-20": "QFN-20.json",
    "QFN-24": "QFN-24.json",
    "QFN-32": "QFN-32.json",
    "0402": "0402.json",
    "0603": "0603.json",
    "0805": "0805.json",
    "1206": "1206.json",
    "1210": "1210.json",
    "1812": "1812.json",
    "2512": "2512.json",
    "SMA": "SMA.json",
    "SMB": "SMB.json",
    "SMC": "SMC.json",
    "SOD-123": "SOD-123.json",
    "SOD-323": "SOD-323.json",
    "SOD-523": "SOD-523.json",
    "DIP-8": "DIP-8.json",
    "DIP-14": "DIP-14.json",
    "DIP-16": "DIP-16.json",
    "TO-92": "TO-92.json",
    "TO-220": "TO-220.json",
    "TO-252": "TO-252.json",
    "TO-263": "TO-263.json"
  };

  if (normalises[p]) return normalises[p];

  // Recherche dans les fichiers PCB de la LIB si disponible
  if (typeof LIB_STATE !== "undefined" && Array.isArray(LIB_STATE.fichiers.pcb)) {
    const fTrouve = LIB_STATE.fichiers.pcb.find(f => f.replace(/\.json$/i, "").toUpperCase() === p);
    if (fTrouve) return fTrouve;
  }

  return p.endsWith(".json") ? p : (p + ".json");
}

function jlcVers39Colonnes(part, pinout) {
  const p = part || {};
  const specs = p.specs || {};
  const pins = pinout && Array.isArray(pinout.pins) ? pinout.pins : [];
  const nbPins = (pinout && pinout.pin_count) ? pinout.pin_count : (pins.length || "");

  const cat = p.category || "";
  const subcat = p.subcategory || "";
  const model = (p.model || "").trim();
  const desc = p.description || "";

  const classification = infererClasseEtPrefixe(cat, subcat, model, desc);
  const pkgNom = p.package || "";
  const empreintePcb = infererEmpreintePcb(pkgNom);

  // Déduction de la valeur principale
  let valeur = "";
  if (specs["Output Voltage"]) valeur = specs["Output Voltage"];
  else if (specs["Resistance"]) valeur = specs["Resistance"];
  else if (specs["Capacitance"]) valeur = specs["Capacitance"];
  else if (specs["Frequency"]) valeur = specs["Frequency"];
  else if (specs["Inductance"]) valeur = specs["Inductance"];
  else {
    // Essayer d'extraire la valeur du modèle ou de la description
    const mVal = model.match(/(\d+(\.\d+)?(k|M|u|n|p|R|V|mH|uH|µF|nF|pF|Ω|ohm))/i);
    if (mVal) valeur = mVal[0];
    else valeur = model;
  }

  // Températures d'utilisation
  let tMin = "", tMax = "";
  const tStr = specs["Operating Temperature"] || desc;
  const mTemp = tStr.match(/(-?\d+)\s*[°℃C]?\s*~\s*\+?(-?\d+)\s*[°℃C]?/);
  if (mTemp) {
    tMin = mTemp[1];
    tMax = mTemp[2];
  }

  // Tension nominale
  let voltageRating = specs["Voltage - Supply"] || specs["Voltage Rated"] || specs["Voltage - Rated"] || "";

  // Courant nominal
  let currentRating = specs["Output Current"] || specs["Current - Output"] || specs["Current Rating"] || "";

  // Puissance nominale
  let wattage = specs["Power (Watts)"] || specs["Power Rating"] || "";

  // Tolérance
  let tolerance = specs["Tolerance"] || "";

  // Diélectrique
  let dielectrique = specs["Dielectric Characteristic"] || specs["Temperature Coefficient"] || "";

  // Type de montage
  let mType = (p.mounting_type || "").toUpperCase() === "SMD" ? "SMD" : (p.mounting_type ? "Through Hole" : "SMD");

  // Nom de composant Part Name
  const partName = model || p.lcsc || "COMP_SANS_NOM";

  // Symbole schématique
  let symSch = classification.sym;
  if (pins.length > 4 && !["resistor.json", "capacitor.json", "diode.json"].includes(symSch)) {
    symSch = (model ? model.replace(/[^A-Za-z0-9_\-]/g, "_") : "ic") + ".json";
  }

  // Assemblage strict des 39 colonnes
  const row = {
    "Part Name": partName,
    "Part Type": "General",
    "Description": desc,
    "Par class": classification.classe,
    "Reference designator Prefix": classification.prefix,
    "Number Of pins": nbPins ? String(nbPins) : "",
    "Maximun Height": specs["Height - Seated (Max)"] || "",
    "Standoof Height": "",
    "Value": valeur,
    "Device type": classification.deviceType,
    "Part Number": model,
    "Manufacturer": p.manufacturer || "",
    "manufacturer part Number": model,
    "Vendor": "JLCPCB",
    "Dielectrique": dielectrique,
    "vendor reference": p.lcsc || "",
    "Source alternative": "",
    "2nd source P/N": "",
    "2nd source Manufacturer": "",
    "3nd source P/N": "",
    "3nd source Manufacturer": "",
    "4nd source P/N": "",
    "4nd source Manufacturer": "",
    "tolerance": tolerance,
    "wattage": wattage,
    "fréquency": specs["Frequency"] || "",
    "PPM": specs["Frequency Stability"] || specs["Frequency Tolerance"] || "",
    "Voltage Rating": voltageRating,
    "current Rating": currentRating,
    "Maximum operating temperature": tMax,
    "Minimum operating temperature": tMin,
    "Package type": pkgNom,
    "Dimenssions": specs["Size / Dimension"] || "",
    "terminal pitch": specs["Pitch"] || "",
    "mounting type": mType,
    "gender": specs["Gender"] || "",
    "Empreinte PCB": empreintePcb,
    "Empreinte Schématique": symSch,
    "Modèle Simulation": ""
  };

  return row;
}

/* ---------- Génération automatique de symbole schématique avec vraies broches ---------- */

function jlcGenererSymbole(nomSym, pinout, prefix, partName) {
  const pins = pinout && Array.isArray(pinout.pins) ? pinout.pins : [];
  const nbPins = pins.length || 8;
  const moitie = Math.ceil(nbPins / 2);
  const pinSpacing = 20;
  const boxHeight = Math.max(60, (moitie + 1) * pinSpacing);
  const boxWidth = 120;
  const pinLength = 30;

  const pinsData = [];
  const primitives = [
    {
      op: "rect",
      x: -boxWidth / 2,
      y: -boxHeight / 2,
      w: boxWidth,
      h: boxHeight,
      r: 4,
      fill: true
    },
    {
      op: "text",
      txt: partName || "U",
      x: 0,
      y: 0,
      font: "bold 13px sans-serif",
      align: "center",
      fill: "#e6e8ec"
    }
  ];

  // Colonne gauche (broches 1 .. moitie)
  for (let i = 0; i < moitie; i++) {
    const p = pins[i] || { number: String(i + 1), name: `P${i + 1}` };
    const y = -boxHeight / 2 + (i + 1) * pinSpacing;
    const px = -boxWidth / 2 - pinLength;
    pinsData.push({
      n: parseInt(p.number) || (i + 1),
      x: px,
      y: y,
      name: p.name || String(i + 1)
    });
    primitives.push({
      op: "line",
      x1: px,
      y1: y,
      x2: -boxWidth / 2,
      y2: y
    });
    primitives.push({
      op: "text",
      txt: p.name || String(i + 1),
      x: -boxWidth / 2 + 5,
      y: y + 4,
      font: "10px monospace",
      align: "left",
      fill: "#9ca3af"
    });
  }

  // Colonne droite (broches moitie+1 .. nbPins)
  for (let i = moitie; i < nbPins; i++) {
    const idxDroite = i - moitie;
    const p = pins[i] || { number: String(i + 1), name: `P${i + 1}` };
    const y = -boxHeight / 2 + (idxDroite + 1) * pinSpacing;
    const px = boxWidth / 2 + pinLength;
    pinsData.push({
      n: parseInt(p.number) || (i + 1),
      x: px,
      y: y,
      name: p.name || String(i + 1)
    });
    primitives.push({
      op: "line",
      x1: boxWidth / 2,
      y1: y,
      x2: px,
      y2: y
    });
    primitives.push({
      op: "text",
      txt: p.name || String(i + 1),
      x: boxWidth / 2 - 5,
      y: y + 4,
      font: "10px monospace",
      align: "right",
      fill: "#9ca3af"
    });
  }

  return {
    format: "schsym-1",
    id: nomSym.replace(/\.json$/i, ""),
    name: partName,
    category: "Importé JLCPCB",
    prefix: prefix || "U",
    defaultValue: partName,
    pinCount: nbPins,
    pins: pinsData,
    ext: [-boxWidth / 2 - pinLength, -boxHeight / 2 - 10, boxWidth / 2 + pinLength, boxHeight / 2 + 10],
    primitives: primitives
  };
}

/* ---------- Communication API ---------- */

async function jlcRechercher(query) {
  const payload = {
    name: "jlc_search",
    arguments: {
      query: query.trim(),
      limit: 25
    }
  };
  const resp = await fetch("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    let err = "Erreur HTTP " + resp.status;
    try { const j = await resp.json(); if (j.detail) err = j.detail; } catch (_) {}
    throw new Error(err);
  }
  const j = await resp.json();
  const data = j.data || {};
  return Array.isArray(data.results) ? data.results : [];
}

async function jlcObtenirDetails(lcsc) {
  // 1. Fiche détaillée
  const respPart = await fetch("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ name: "jlc_get_part", arguments: { lcsc: lcsc } })
  });
  if (!respPart.ok) throw new Error("Impossible de récupérer la fiche " + lcsc);
  const jPart = await respPart.json();
  const part = jPart.data || {};

  // 2. Brochage (pinout)
  let pinout = null;
  try {
    const respPin = await fetch("/api/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ name: "jlc_get_pinout", arguments: { lcsc: lcsc } })
    });
    if (respPin.ok) {
      const jPin = await respPin.json();
      pinout = jPin.data || null;
    }
  } catch (_) {}

  return { part, pinout };
}

/* ---------- IHM : Modale d'importation JLCPCB ---------- */

let JLC_IMPORT_ETAT = {
  resultats: [],
  candidatActif: null,
  colonnesCalculees: null,
  pinoutActif: null
};

function ouvrirModalImportJlc(codeOptionnel) {
  let modal = document.getElementById("modalImportJlc");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "modalImportJlc";
    modal.className = "jlc-modal-overlay";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="jlc-modal-content">
      <div class="jlc-modal-header">
        <div class="jlc-title-row">
          <span style="font-size:20px;">⚡</span>
          <div>
            <h3>Importer un composant JLCPCB / LCSC</h3>
            <span class="jlc-sub">Catalogue mondial · Génération stricte des 39 colonnes normalisées</span>
          </div>
        </div>
        <button class="tb mini" onclick="fermerModalImportJlc()">✕</button>
      </div>

      <!-- Barre de recherche -->
      <div class="jlc-search-bar">
        <input type="text" id="inpJlcQuery" placeholder="Ex: C6186, STM32F103, AMS1117-3.3, 100nF 0805..." value="${codeOptionnel ? esc(codeOptionnel) : ""}">
        <button class="tb primary" id="btnJlcChercher" onclick="lancerRechercheJlc()">Rechercher</button>
      </div>

      <!-- Corps : Résultats ou Fiche de vérification -->
      <div id="jlcModalBody" class="jlc-modal-body">
        <div class="jlc-empty-hint">
          Saisissez un code LCSC direct (ex: <b>C6186</b>) ou une désignation pour trouver et importer un composant dans la bibliothèque.
        </div>
      </div>
    </div>
  `;

  modal.style.display = "flex";

  const inp = document.getElementById("inpJlcQuery");
  if (inp) {
    inp.focus();
    inp.onkeydown = (e) => {
      if (e.key === "Enter") lancerRechercheJlc();
    };
  }

  if (codeOptionnel) {
    lancerRechercheJlc();
  }
}

function fermerModalImportJlc() {
  const m = document.getElementById("modalImportJlc");
  if (m) m.style.display = "none";
}

async function lancerRechercheJlc() {
  const inp = document.getElementById("inpJlcQuery");
  const q = inp ? inp.value.trim() : "";
  if (!q) return;

  const body = document.getElementById("jlcModalBody");
  if (!body) return;

  body.innerHTML = '<div class="jlc-loading"><span class="jlc-spinner"></span> Recherche en cours sur JLCPCB...</div>';

  try {
    // Si format direct Cxxxx, interroger directement jlc_get_part
    if (/^C\d+$/i.test(q)) {
      const { part, pinout } = await jlcObtenirDetails(q.toUpperCase());
      if (part && part.model) {
        afficherFiche39Colonnes(part, pinout);
        return;
      }
    }

    // Sinon recherche textuelle
    const resultats = await jlcRechercher(q);
    JLC_IMPORT_ETAT.resultats = resultats;

    if (resultats.length === 0) {
      body.innerHTML = `
        <div class="jlc-empty-hint">
          Aucun composant trouvé pour "<b>${esc(q)}</b>".<br>
          Essayez un code LCSC précis ou un mot-clé plus court.
        </div>`;
      return;
    }

    let h = `
      <div class="jlc-results-header">
        <span><b>${resultats.length}</b> composant(s) trouvé(s)</span>
        <span style="font-size:11px;color:var(--txt-dim);">Cliquez sur un composant pour prévisualiser les 39 colonnes</span>
      </div>
      <div class="jlc-results-list">
    `;

    for (const r of resultats) {
      const isBasic = String(r.library_type || "").toLowerCase() === "basic";
      const stock = r.stock || 0;
      const stockBadge = stock > 0 
        ? `<span class="jlc-pill ok">${stock.toLocaleString()} pcs</span>` 
        : `<span class="jlc-pill warn">Rupture</span>`;
      const basicBadge = isBasic 
        ? `<span class="jlc-pill basic" title="Composant Basic : aucun frais de chargement en machine">Basic</span>` 
        : `<span class="jlc-pill extended">Extended</span>`;

      h += `
        <div class="jlc-card" onclick="selectionnerCandidatJlc('${esc(r.lcsc)}')">
          <div class="jlc-card-top">
            <div>
              <b class="jlc-card-model">${esc(r.model || r.lcsc)}</b>
              <span class="jlc-card-mfr">${esc(r.manufacturer || "")}</span>
            </div>
            <div class="jlc-card-tags">
              ${basicBadge}
              ${stockBadge}
            </div>
          </div>
          <div class="jlc-card-desc">${esc(r.description || "")}</div>
          <div class="jlc-card-footer">
            <span class="jlc-code">Code : <b>${esc(r.lcsc)}</b></span>
            <span>Boîtier : <b>${esc(r.package || "—")}</b></span>
            <span class="jlc-prix">${r.price ? (r.price.toFixed(3) + " $") : "—"}</span>
            <button class="tb mini primary" style="margin-left:auto;">Vérifier & Importer ➔</button>
          </div>
        </div>
      `;
    }

    h += `</div>`;
    body.innerHTML = h;

  } catch (err) {
    body.innerHTML = `
      <div class="jlc-err-box">
        <b>Erreur lors de la recherche :</b><br>
        ${esc(err.message)}
      </div>`;
  }
}

async function selectionnerCandidatJlc(lcsc) {
  const body = document.getElementById("jlcModalBody");
  if (!body) return;

  body.innerHTML = '<div class="jlc-loading"><span class="jlc-spinner"></span> Chargement des spécifications et du pinout (' + esc(lcsc) + ')...</div>';

  try {
    const { part, pinout } = await jlcObtenirDetails(lcsc);
    afficherFiche39Colonnes(part, pinout);
  } catch (err) {
    body.innerHTML = `
      <div class="jlc-err-box">
        <b>Impossible de récupérer les détails de ${esc(lcsc)} :</b><br>
        ${esc(err.message)}
      </div>
      <button class="tb" onclick="lancerRechercheJlc()">Retour aux résultats</button>
    `;
  }
}

function afficherFiche39Colonnes(part, pinout) {
  const body = document.getElementById("jlcModalBody");
  if (!body) return;

  const cols = jlcVers39Colonnes(part, pinout);
  JLC_IMPORT_ETAT.candidatActif = part;
  JLC_IMPORT_ETAT.pinoutActif = pinout;
  JLC_IMPORT_ETAT.colonnesCalculees = { ...cols };

  const nbPins = (pinout && pinout.pins) ? pinout.pins.length : 0;
  const pinoutResume = nbPins > 0 
    ? `<span style="color:#52c41a;font-weight:bold;">⚡ ${nbPins} broches identifiées</span>` 
    : `<span style="color:var(--txt-dim);">Aucun brochage personnalisé</span>`;

  let h = `
    <div class="jlc-fiche-wrapper">
      <div class="jlc-fiche-topbar">
        <button class="tb mini" onclick="lancerRechercheJlc()">← Retour aux résultats</button>
        <span class="jlc-code-badge">${esc(part.lcsc)} · ${esc(part.model)}</span>
        ${pinoutResume}
      </div>

      <div class="jlc-grid-props">
        <div class="jlc-prop-group">
          <label>1. Part Name (Référence CAO)</label>
          <input id="jlc_col_Part_Name" value="${esc(cols["Part Name"])}">
        </div>
        <div class="jlc-prop-group">
          <label>5. Préfixe Schématique</label>
          <input id="jlc_col_Reference_designator_Prefix" value="${esc(cols["Reference designator Prefix"])}">
        </div>
        <div class="jlc-prop-group">
          <label>9. Valeur Électrique</label>
          <input id="jlc_col_Value" value="${esc(cols["Value"])}">
        </div>
        <div class="jlc-prop-group">
          <label>4. Classe du composant</label>
          <input id="jlc_col_Par_class" value="${esc(cols["Par class"])}">
        </div>
        <div class="jlc-prop-group">
          <label>32. Boîtier (Package)</label>
          <input id="jlc_col_Package_type" value="${esc(cols["Package type"])}">
        </div>
        <div class="jlc-prop-group">
          <label>37. Empreinte PCB liée</label>
          <input id="jlc_col_Empreinte_PCB" value="${esc(cols["Empreinte PCB"])}">
        </div>
        <div class="jlc-prop-group">
          <label>38. Symbole Schéma lié</label>
          <input id="jlc_col_Empreinte_Schématique" value="${esc(cols["Empreinte Schématique"])}">
        </div>
        <div class="jlc-prop-group">
          <label>10. Type de composant</label>
          <select id="jlc_col_Device_type">
            <option value="Active" ${cols["Device type"] === "Active" ? "selected" : ""}>Active</option>
            <option value="Passive" ${cols["Device type"] === "Passive" ? "selected" : ""}>Passive</option>
          </select>
        </div>
      </div>

      <!-- Accordéon de toutes les 39 colonnes -->
      <details class="jlc-details-accord">
        <summary><b>📋 Voir et ajuster l'intégralité des 39 colonnes du CSV</b></summary>
        <div class="jlc-table-39-wrap">
          <table class="jlc-table-39">
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th style="width:200px;">Nom de colonne</th>
                <th>Valeur exportée</th>
              </tr>
            </thead>
            <tbody>
  `;

  COLONNES_CATALOGUE_39.forEach((col, idx) => {
    const val = cols[col] !== undefined ? cols[col] : "";
    const idInput = "jlc_input_col_" + idx;
    h += `
      <tr>
        <td style="color:var(--txt-dim);">${idx + 1}</td>
        <td><b>${esc(col)}</b></td>
        <td><input class="jlc-tbl-inp" id="${idInput}" data-col="${esc(col)}" value="${esc(val)}"></td>
      </tr>
    `;
  });

  h += `
            </tbody>
          </table>
        </div>
      </details>

      <div class="jlc-confirm-row">
        <button class="tb" onclick="fermerModalImportJlc()">Annuler</button>
        <button class="tb primary on" id="btnConfirmerImport" onclick="validerEtEnregistrerJlc()">
          📥 Confirmer et Enregistrer dans la Bibliothèque (39 colonnes)
        </button>
      </div>
    </div>
  `;

  body.innerHTML = h;

  // Lier les champs principaux avec les champs de la table 39
  lierChampsPrincipaux();
}

function lierChampsPrincipaux() {
  const sync = (idPrinc, colName) => {
    const p = document.getElementById(idPrinc);
    if (!p) return;
    p.oninput = () => {
      const tblInp = document.querySelector(`input.jlc-tbl-inp[data-col="${colName}"]`);
      if (tblInp) tblInp.value = p.value;
    };
  };

  sync("jlc_col_Part_Name", "Part Name");
  sync("jlc_col_Reference_designator_Prefix", "Reference designator Prefix");
  sync("jlc_col_Value", "Value");
  sync("jlc_col_Par_class", "Par class");
  sync("jlc_col_Package_type", "Package type");
  sync("jlc_col_Empreinte_PCB", "Empreinte PCB");
  sync("jlc_col_Empreinte_Schématique", "Empreinte Schématique");

  const devSel = document.getElementById("jlc_col_Device_type");
  if (devSel) {
    devSel.onchange = () => {
      const tblInp = document.querySelector(`input.jlc-tbl-inp[data-col="Device type"]`);
      if (tblInp) tblInp.value = devSel.value;
    };
  }
}

async function validerEtEnregistrerJlc() {
  const btn = document.getElementById("btnConfirmerImport");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="jlc-spinner"></span> Enregistrement...';
  }

  try {
    // 1. Récupérer les 39 colonnes depuis les inputs
    const composantFinal = {};
    COLONNES_CATALOGUE_39.forEach((col, idx) => {
      const tblInp = document.getElementById("jlc_input_col_" + idx);
      composantFinal[col] = tblInp ? tblInp.value.trim() : "";
    });

    const partName = composantFinal["Part Name"] || "COMPOSANT";
    const symName = composantFinal["Empreinte Schématique"] || "";

    // 2. Si le composant a un pinout et qu'un nouveau symbole est requis, l'enregistrer
    if (symName && JLC_IMPORT_ETAT.pinoutActif && Array.isArray(JLC_IMPORT_ETAT.pinoutActif.pins) && JLC_IMPORT_ETAT.pinoutActif.pins.length > 0) {
      const baseSym = symName.replace(/\.json$/i, "");
      // Si ce n'est pas un symbole générique d'usine (resistor, capacitor...)
      if (!["resistor", "capacitor", "diode", "switch", "header"].includes(baseSym)) {
        const symData = jlcGenererSymbole(
          symName, 
          JLC_IMPORT_ETAT.pinoutActif, 
          composantFinal["Reference designator Prefix"], 
          partName
        );
        try {
          await sauvegarderFichierLib("schematique", symName, symData);
        } catch (e) {
          console.warn("Avertissement : impossible d'enregistrer le symbole schématique généré :", e.message);
        }
      }
    }

    // 3. Insérer le composant dans LIB_STATE.composants
    composantFinal._id = LIB_STATE.composants.length;
    LIB_STATE.composants.push(composantFinal);
    LIB_STATE.sale = true;

    // S'assurer que LIB_STATE.colonnes contient l'ensemble des 39 colonnes
    if (!LIB_STATE.colonnes || LIB_STATE.colonnes.length === 0) {
      LIB_STATE.colonnes = [...COLONNES_CATALOGUE_39];
    }

    // 4. Enregistrer le catalogue CSV sur le serveur
    await enregistrerCatalogue();

    // 5. Diffuser la mise à jour via BroadcastChannel
    if (typeof sessDiffuserLibModif === "function") {
      sessDiffuserLibModif({
        genre: "catalogue",
        action: "ajout",
        nom: partName,
        t: Date.now()
      });
    }

    // 6. Fermer la modale et actualiser la vue
    fermerModalImportJlc();

    // Mettre à jour la recherche du catalogue sur le nouveau composant
    LIB_STATE.filtres.recherche = partName;
    const inpSearch = document.getElementById("searchComps");
    if (inpSearch) inpSearch.value = partName;

    if (typeof rafraichirVueComposants === "function") rafraichirVueComposants();
    if (typeof mettreAJourStats === "function") mettreAJourStats();

    afficherToast(`✅ Composant "${partName}" (${composantFinal["vendor reference"] || "JLCPCB"}) importé avec succès (39 colonnes validées)`, true);

  } catch (err) {
    alert("Erreur lors de l'enregistrement du composant : " + err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📥 Confirmer et Enregistrer dans la Bibliothèque";
    }
  }
}

/* ---------- Vérification des paramètres d'URL (?importer_lcsc=Cxxxx) ---------- */

function verifierUrlImportJlc() {
  try {
    const params = new URLSearchParams(window.location.search);
    const lcsc = params.get("importer_lcsc");
    if (lcsc) {
      ouvrirModalImportJlc(lcsc);
    }
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", function() {
  verifierUrlImportJlc();
});
