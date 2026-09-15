"use strict";
/* =============================================================================
   commun/explorateur-lib.js
   Explorateur visuel pop-up de bibliothèque (Schéma & PCB)
   - Recherche en direct et filtres par familles (R, C, L, Diodes, CI, Connecteurs...)
   - Galerie de vignettes miniatures Canvas 2D (Symboles & Empreintes)
   - Double prévisualisation interactive (Symbole électrique + Empreinte cuivre)
   - Insertion et placement direct au curseur sur la feuille ou la carte
   ============================================================================= */

const ELIB = {
  open: false,
  mode: "schema", // "schema" | "pcb"
  items: [],
  filtered: [],
  selected: null,
  query: "",
  category: "all",
  filterSpice: false,
  filterSmd: false,
  filterTht: false,
  onSelect: null,
  initialized: false
};

/* ---------- Catégories et Détection ---------- */
const ELIB_CATS = [
  { id: "all", label: "Toutes les catégories" },
  { id: "r", label: "Résistances (R)" },
  { id: "c", label: "Condensateurs (C)" },
  { id: "l", label: "Inductances (L)" },
  { id: "d", label: "Diodes & LEDs (D)" },
  { id: "q", label: "Transistors & FETs (Q)" },
  { id: "ic", label: "Circuits Intégrés (U/CI)" },
  { id: "conn", label: "Connecteurs (J/CON)" },
  { id: "pwr", label: "Alimentation & Régul." },
  { id: "other", label: "Divers / Autres" }
];

function elibClassifierItem(it) {
  if (!it) return "other";
  const p = String(it["Reference designator Prefix"] || "").trim().toUpperCase();
  const name = String(it["Part Name"] || "").toUpperCase();
  const desc = String(it["Description"] || "").toUpperCase();
  const type = String(it["Type"] || it["type"] || "").toUpperCase();

  if (p === "R" || p === "RV" || name.startsWith("RES") || desc.includes("RESISTOR") || desc.includes("RÉSISTANCE")) return "r";
  if (p === "C" || name.startsWith("CAP") || desc.includes("CAPACITOR") || desc.includes("CONDENSATEUR")) return "c";
  if (p === "L" || name.startsWith("IND") || desc.includes("INDUCTOR") || desc.includes("BOBINE") || desc.includes("SELF")) return "l";
  if (p === "D" || p === "LED" || p === "TVS" || desc.includes("DIODE") || desc.includes("LED") || desc.includes("SCHOTTKY")) return "d";
  if (p === "Q" || p === "T" || desc.includes("TRANSISTOR") || desc.includes("MOSFET") || desc.includes("BJT")) return "q";
  if (p === "U" || p === "IC" || desc.includes("MCU") || desc.includes("OPAMP") || desc.includes("AOP") || desc.includes("MICROCONTROLLER") || desc.includes("CIRCUIT")) return "ic";
  if (p === "J" || p === "P" || p === "CON" || desc.includes("HEADER") || desc.includes("CONNECTOR") || desc.includes("CONNECTEUR") || desc.includes("USB")) return "conn";
  if (p === "VR" || p === "REG" || desc.includes("LDO") || desc.includes("BUCK") || desc.includes("BOOST") || desc.includes("REGULATOR")) return "pwr";
  return "other";
}

function elibIsSmd(it) {
  const pkg = String(it["Package type"] || it["Empreinte PCB"] || "").toUpperCase();
  const desc = String(it["Description"] || "").toUpperCase();
  const str = pkg + " " + desc;
  return /01005|0201|0402|0603|0805|1206|1210|2512|SMD|CMS|SOIC|SOP|SSOP|TSSOP|QFP|LQFP|TQFP|QFN|DFN|SOT-?23|SOD-?|BGA|WLCSP/i.test(str);
}

function elibIsTht(it) {
  const pkg = String(it["Package type"] || it["Empreinte PCB"] || "").toUpperCase();
  const desc = String(it["Description"] || "").toUpperCase();
  const str = pkg + " " + desc;
  return /DIP|THT|THRU|PTH|TO-?220|TO-?92|RADIAL|AXIAL|HEADER|PIN|2\.54|TRAVERSANT/i.test(str);
}

function elibHasSpice(it) {
  const sim = String(it["Modèle Simulation"] || it["Modele Simulation"] || "").trim();
  return Boolean(sim && sim !== "-" && sim !== "xx");
}

/* ---------- Rendu Visuel Canvas 2D ---------- */

/* Rendu miniature de symbole schématique */
function elibDessinerSymbole(canvas, it, opt) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cat = elibClassifierItem(it);
  const cx = w / 2, cy = h / 2;

  ctx.save();
  ctx.lineWidth = opt && opt.large ? 2.5 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#93c5fd"; // bleu clair schématique
  ctx.fillStyle = "rgba(59, 130, 246, 0.18)";

  if (cat === "r") {
    // Résistance (boîte ou zigzag)
    const rw = Math.min(w * 0.45, 50), rh = Math.min(h * 0.35, 18);
    // Fils
    ctx.beginPath();
    ctx.moveTo(cx - rw / 2 - 16, cy); ctx.lineTo(cx - rw / 2, cy);
    ctx.moveTo(cx + rw / 2, cy); ctx.lineTo(cx + rw / 2 + 16, cy);
    ctx.stroke();
    // Corps
    ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
    ctx.fillRect(cx - rw / 2, cy - rh / 2, rw, rh);
  } else if (cat === "c") {
    // Condensateur
    const ch = Math.min(h * 0.5, 34), gap = 7;
    ctx.beginPath();
    // Fil gauche
    ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - gap / 2, cy);
    // Barre gauche
    ctx.moveTo(cx - gap / 2, cy - ch / 2); ctx.lineTo(cx - gap / 2, cy + ch / 2);
    // Fil droit
    ctx.moveTo(cx + gap / 2, cy); ctx.lineTo(cx + 24, cy);
    // Barre droite
    ctx.moveTo(cx + gap / 2, cy - ch / 2); ctx.lineTo(cx + gap / 2, cy + ch / 2);
    ctx.stroke();
  } else if (cat === "l") {
    // Inductance (arches)
    const r = 8, n = 3;
    const startX = cx - (n * r);
    ctx.beginPath();
    ctx.moveTo(startX - 12, cy); ctx.lineTo(startX, cy);
    for (let i = 0; i < n; i++) {
      ctx.arc(startX + (i * 2 * r) + r, cy, r, Math.PI, 0, false);
    }
    ctx.lineTo(startX + (n * 2 * r) + 12, cy);
    ctx.stroke();
  } else if (cat === "d") {
    // Diode
    const dw = 16, dh = 20;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy); ctx.lineTo(cx - dw / 2, cy);
    ctx.moveTo(cx + dw / 2, cy); ctx.lineTo(cx + 22, cy);
    // Triangle
    ctx.moveTo(cx - dw / 2, cy - dh / 2);
    ctx.lineTo(cx + dw / 2, cy);
    ctx.lineTo(cx - dw / 2, cy + dh / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    // Barre cathode
    ctx.beginPath();
    ctx.moveTo(cx + dw / 2, cy - dh / 2);
    ctx.lineTo(cx + dw / 2, cy + dh / 2);
    ctx.stroke();
  } else if (cat === "q") {
    // Transistor
    const r = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Base
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy); ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx - 6, cy - 12); ctx.lineTo(cx - 6, cy + 12);
    // Collecteur / Emetteur
    ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 12, cy - 16); ctx.lineTo(cx + 24, cy - 16);
    ctx.moveTo(cx - 6, cy + 6); ctx.lineTo(cx + 12, cy + 16); ctx.lineTo(cx + 24, cy + 16);
    ctx.stroke();
  } else {
    // Circuit Intégré / Boîtier générique multi-broches
    const bw = Math.min(w * 0.52, 60), bh = Math.min(h * 0.56, 50);
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);

    // Encoche détrompeur pin 1
    ctx.beginPath();
    ctx.arc(cx, cy - bh / 2, 4, 0, Math.PI);
    ctx.stroke();

    // Broches gauches et droites
    const np = 4;
    const step = bh / (np + 1);
    ctx.beginPath();
    for (let i = 1; i <= np; i++) {
      const py = cy - bh / 2 + (i * step);
      ctx.moveTo(cx - bw / 2 - 10, py); ctx.lineTo(cx - bw / 2, py);
      ctx.moveTo(cx + bw / 2, py); ctx.lineTo(cx + bw / 2 + 10, py);
    }
    ctx.stroke();

    // Texte interne si grand aperçu
    if (opt && opt.large) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const txt = String(it["Part Name"] || it["Value"] || "IC").slice(0, 8);
      ctx.fillText(txt, cx, cy);
    }
  }

  // Broches / Points de contact
  ctx.fillStyle = "#ef4444";
  ctx.restore();
}

/* Rendu miniature d'empreinte PCB */
function elibDessinerEmpreinte(canvas, it, opt) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const pkg = String(it["Package type"] || it["Empreinte PCB"] || "").trim().toUpperCase();
  const cat = elibClassifierItem(it);
  const isTht = elibIsTht(it);

  ctx.save();
  // Sérigraphie (Silkscreen blanche/grise)
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;

  // Pastilles cuivre
  const cSmd = "#f59e0b"; // Or cuivre
  const cTht = "#eab308";
  const cDrill = "#090a0d"; // Trou de perçage

  if (cat === "r" || cat === "c" || cat === "l" || /0402|0603|0805|1206|2512/i.test(pkg)) {
    // Puce 2 pastilles SMD (type 0402/0603/0805)
    let pw = 16, ph = 24, dist = 28;
    if (pkg.includes("0402")) { pw = 12; ph = 16; dist = 20; }
    else if (pkg.includes("0805") || pkg.includes("1206")) { pw = 20; ph = 28; dist = 36; }

    // Contour sérigraphie
    ctx.strokeRect(cx - dist / 2 - pw / 2 - 3, cy - ph / 2 - 3, dist + pw + 6, ph + 6);

    // Pastille 1
    ctx.fillStyle = cSmd;
    ctx.fillRect(cx - dist / 2 - pw / 2, cy - ph / 2, pw, ph);
    // Pastille 2
    ctx.fillRect(cx + dist / 2 - pw / 2, cy - ph / 2, pw, ph);

    // Repère broche 1 (point rouge)
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(cx - dist / 2 - pw / 2 - 6, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (pkg.includes("SOT-23") || (cat === "q" && !isTht)) {
    // SOT-23 (3 pastilles)
    const pw = 14, ph = 10;
    // Contour corps
    ctx.strokeRect(cx - 16, cy - 12, 32, 24);
    ctx.fillStyle = cSmd;
    // 2 en haut, 1 en bas
    ctx.fillRect(cx - 14, cy - 20, pw, ph);
    ctx.fillRect(cx + 2, cy - 20, pw, ph);
    ctx.fillRect(cx - pw / 2, cy + 10, pw, ph);
  } else if (isTht || pkg.includes("DIP")) {
    // Traversant DIP ou Barrette
    const np = 4; // par rangée
    const step = 16;
    const span = 36;
    const padR = 6, drillR = 2.5;

    // Contour
    ctx.strokeRect(cx - span / 2 - padR - 3, cy - ((np - 1) * step) / 2 - padR - 4, span + (padR * 2) + 6, (np - 1) * step + (padR * 2) + 8);
    // Encoche
    ctx.beginPath();
    ctx.arc(cx, cy - ((np - 1) * step) / 2 - padR - 4, 4, 0, Math.PI);
    ctx.stroke();

    for (let i = 0; i < np; i++) {
      const py = cy - ((np - 1) * step) / 2 + (i * step);
      for (const px of [cx - span / 2, cx + span / 2]) {
        // Cuivre
        ctx.fillStyle = cTht;
        ctx.beginPath();
        if (px < cx && i === 0) {
          // Pastille 1 carrée
          ctx.fillRect(px - padR, py - padR, padR * 2, padR * 2);
        } else {
          ctx.arc(px, py, padR, 0, Math.PI * 2);
          ctx.fill();
        }
        // Perçage
        ctx.fillStyle = cDrill;
        ctx.beginPath();
        ctx.arc(px, py, drillR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Boîtier SOIC / QFP / QFN
    const bw = Math.min(w * 0.44, 46), bh = Math.min(h * 0.52, 46);
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);

    // Repère broche 1
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(cx - bw / 2 + 5, cy - bh / 2 + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Pastilles SMD latérales
    ctx.fillStyle = cSmd;
    const np = 4;
    const step = bh / (np + 1);
    const pw = 12, ph = 5;
    for (let i = 1; i <= np; i++) {
      const py = cy - bh / 2 + (i * step) - ph / 2;
      ctx.fillRect(cx - bw / 2 - pw, py, pw, ph);
      ctx.fillRect(cx + bw / 2, py, pw, ph);
    }
  }

  ctx.restore();
}

/* ---------- Construction du DOM Pop-up ---------- */
function elibBuildDom() {
  if (document.getElementById("elibModal")) return;

  const m = document.createElement("div");
  m.id = "elibModal";
  m.className = "elib-modal";
  m.hidden = true;

  m.innerHTML =
    '<div class="elib-box">' +
      '<!-- En-tête -->' +
      '<header class="elib-head">' +
        '<div class="elib-title-wrap">' +
          '<span class="elib-icon">📚</span>' +
          '<span class="elib-title" id="elibHeadTitle">Explorateur Visuel de Bibliothèque</span>' +
          '<span class="elib-subtitle" id="elibHeadSub">Sélectionnez un composant ou une empreinte</span>' +
        '</div>' +
        '<button class="elib-close" id="elibBtnClose" title="Fermer (Échap)">✕</button>' +
      '</header>' +

      '<!-- Barre d\'outils et filtres -->' +
      '<div class="elib-toolbar">' +
        '<div class="elib-search-wrap">' +
          '<span class="elib-search-ico">🔍</span>' +
          '<input id="elibSearch" class="elib-search-input" type="text" placeholder="Rechercher par référence, valeur, boîtier, MPN..." autocomplete="off" spellcheck="false">' +
          '<button id="elibSearchClear" class="elib-search-clear" title="Effacer">✕</button>' +
        '</div>' +
        '<select id="elibCategory" class="elib-select"></select>' +
        '<div class="elib-filters-row">' +
          '<label><input type="checkbox" id="elibFSpice"> Modèle SPICE</label>' +
          '<label><input type="checkbox" id="elibFSmd"> CMS / SMD</label>' +
          '<label><input type="checkbox" id="elibFTht"> Traversant / THT</label>' +
        '</div>' +
        '<span id="elibCount" class="elib-count">0 réf</span>' +
      '</div>' +

      '<!-- Corps split view -->' +
      '<div class="elib-body">' +
        '<!-- Galerie de cartes (gauche) -->' +
        '<div class="elib-left">' +
          '<div id="elibGrid" class="elib-grid"></div>' +
        '</div>' +

        '<!-- Volet inspection (droite) -->' +
        '<div class="elib-right" id="elibDetails">' +
          '<div class="elib-placeholder">' +
            '<div>👈 Sélectionnez un composant dans la galerie</div>' +
            '<div style="font-size:11px; margin-top:6px; opacity:0.8;">Aperçu du symbole schématique, de l\'empreinte PCB, des broches et des caractéristiques réelles.</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Pied de page -->' +
      '<footer class="elib-foot">' +
        '<div class="elib-foot-hint" id="elibFootHint">Double-clic pour poser immédiatement · Échap pour annuler</div>' +
        '<div class="elib-foot-acts">' +
          '<button class="elib-btn" id="elibBtnCancel">Annuler</button>' +
          '<button class="elib-btn elib-btn-primary" id="elibBtnApply" disabled>✔ Placer le composant</button>' +
        '</div>' +
      '</footer>' +
    '</div>';

  document.body.appendChild(m);

  // Remplir le sélecteur de catégories
  const catSel = document.getElementById("elibCategory");
  for (const c of ELIB_CATS) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    catSel.appendChild(opt);
  }

  // Brancher les événements
  document.getElementById("elibBtnClose").onclick = explorateurLibFermer;
  document.getElementById("elibBtnCancel").onclick = explorateurLibFermer;
  document.getElementById("elibBtnApply").onclick = elibValiderSelection;

  const searchInp = document.getElementById("elibSearch");
  const searchClr = document.getElementById("elibSearchClear");

  searchInp.oninput = () => {
    ELIB.query = searchInp.value.trim().toLowerCase();
    searchClr.classList.toggle("on", Boolean(ELIB.query));
    elibFiltrerEtAfficher();
  };

  searchClr.onclick = () => {
    searchInp.value = "";
    ELIB.query = "";
    searchClr.classList.remove("on");
    searchInp.focus();
    elibFiltrerEtAfficher();
  };

  catSel.onchange = () => {
    ELIB.category = catSel.value;
    elibFiltrerEtAfficher();
  };

  document.getElementById("elibFSpice").onchange = (e) => {
    ELIB.filterSpice = e.target.checked;
    elibFiltrerEtAfficher();
  };

  document.getElementById("elibFSmd").onchange = (e) => {
    ELIB.filterSmd = e.target.checked;
    elibFiltrerEtAfficher();
  };

  document.getElementById("elibFTht").onchange = (e) => {
    ELIB.filterTht = e.target.checked;
    elibFiltrerEtAfficher();
  };

  // Fermeture par clic sur l'arrière-plan
  m.onclick = (e) => {
    if (e.target === m) explorateurLibFermer();
  };

  // Clavier dans la modale
  m.onkeydown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      explorateurLibFermer();
    } else if (e.key === "Enter" && !e.target.matches("input, textarea")) {
      e.stopPropagation();
      elibValiderSelection();
    }
  };

  ELIB.initialized = true;
}

/* ---------- Filtrage et Affichage ---------- */
function elibFiltrerEtAfficher() {
  const q = String(ELIB.query || "").trim().toLowerCase();
  const cat = ELIB.category;
  const fSpice = ELIB.filterSpice;
  const fSmd = ELIB.filterSmd;
  const fTht = ELIB.filterTht;

  const res = [];
  for (const it of ELIB.items) {
    // Filtre catégorie
    if (cat !== "all" && elibClassifierItem(it) !== cat) continue;

    // Filtre SPICE
    if (fSpice && !elibHasSpice(it)) continue;

    // Filtre SMD / THT
    if (fSmd && !elibIsSmd(it)) continue;
    if (fTht && !elibIsTht(it)) continue;

    // Recherche texte
    if (q) {
      const part = String(it["Part Name"] || "").toLowerCase();
      const val = String(it["Value"] || "").toLowerCase();
      const desc = String(it["Description"] || "").toLowerCase();
      const pkg = String(it["Package type"] || it["Empreinte PCB"] || "").toLowerCase();
      const mpn = String(it["Part Number"] || it["Part Number "] || "").toLowerCase();
      const mfr = String(it["Manufacturer"] || "").toLowerCase();

      if (!part.includes(q) && !val.includes(q) && !desc.includes(q) &&
          !pkg.includes(q) && !mpn.includes(q) && !mfr.includes(q)) {
        continue;
      }
    }

    res.push(it);
  }

  ELIB.filtered = res;

  // Mise à jour compteur
  const countEl = document.getElementById("elibCount");
  if (countEl) countEl.textContent = res.length + (res.length > 1 ? " réf" : " réf");

  // Rendu de la grille
  const grid = document.getElementById("elibGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (res.length === 0) {
    grid.innerHTML =
      '<div class="elib-empty">' +
        '<span style="font-size:24px">🔍</span>' +
        '<span>Aucun composant ne correspond à ces critères.</span>' +
      '</div>';
    elibAfficherDetails(null);
    return;
  }

  // Limite pour fluidité de rendu DOM
  const LIMIT = 120;
  const slice = res.slice(0, LIMIT);

  slice.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "elib-card" + (ELIB.selected === it ? " selected" : "");
    card.dataset.idx = String(idx);

    const name = it["Part Name"] || "Composant";
    const val = it["Value"] || "";
    const pkg = it["Package type"] || (it["Empreinte PCB"] ? String(it["Empreinte PCB"]).replace(/^.*[\\\/]/, "").replace(/\.json$/i, "") : "") || "—";
    const hasSp = elibHasSpice(it);
    const isS = elibIsSmd(it);
    const isT = elibIsTht(it);

    card.innerHTML =
      '<div class="elib-card-thumb-wrap">' +
        '<canvas class="elib-card-thumb" width="160" height="90"></canvas>' +
      '</div>' +
      '<div class="elib-card-info">' +
        '<div class="elib-card-name" title="' + elibEsc(name) + '">' + elibEsc(name) + '</div>' +
        (val ? '<div class="elib-card-val">' + elibEsc(val) + '</div>' : '') +
        '<div class="elib-card-pkg" title="' + elibEsc(pkg) + '">' + elibEsc(pkg) + '</div>' +
        '<div class="elib-card-badges">' +
          (hasSp ? '<span class="elib-badge elib-badge-spice" title="Modèle SPICE inclus">SPICE</span>' : '') +
          (isS ? '<span class="elib-badge elib-badge-smd">CMS</span>' : (isT ? '<span class="elib-badge elib-badge-tht">THT</span>' : '')) +
        '</div>' +
      '</div>';

    // Rendu Canvas miniature
    const cvs = card.querySelector("canvas");
    if (ELIB.mode === "pcb") {
      elibDessinerEmpreinte(cvs, it);
    } else {
      elibDessinerSymbole(cvs, it);
    }

    card.onclick = () => {
      document.querySelectorAll(".elib-card.selected").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      ELIB.selected = it;
      elibAfficherDetails(it);
      const applyBtn = document.getElementById("elibBtnApply");
      if (applyBtn) applyBtn.disabled = false;
    };

    card.ondblclick = () => {
      ELIB.selected = it;
      elibValiderSelection();
    };

    grid.appendChild(card);
  });

  // Sélectionner le premier par défaut si rien n'est sélectionné
  if (!ELIB.selected && slice.length > 0) {
    ELIB.selected = slice[0];
    const firstCard = grid.querySelector(".elib-card");
    if (firstCard) firstCard.classList.add("selected");
    elibAfficherDetails(slice[0]);
    const applyBtn = document.getElementById("elibBtnApply");
    if (applyBtn) applyBtn.disabled = false;
  } else if (ELIB.selected) {
    elibAfficherDetails(ELIB.selected);
  }
}

/* ---------- Affichage de la fiche d'inspection détaillée ---------- */
function elibAfficherDetails(it) {
  const panel = document.getElementById("elibDetails");
  if (!panel) return;

  if (!it) {
    panel.innerHTML =
      '<div class="elib-placeholder">' +
        '<div>👈 Sélectionnez un composant dans la galerie</div>' +
      '</div>';
    const applyBtn = document.getElementById("elibBtnApply");
    if (applyBtn) applyBtn.disabled = true;
    return;
  }

  const name = it["Part Name"] || "Composant";
  const val = it["Value"] || "";
  const pkg = it["Package type"] || (it["Empreinte PCB"] ? String(it["Empreinte PCB"]).replace(/^.*[\\\/]/, "").replace(/\.json$/i, "") : "") || "Non défini";
  const mfr = it["Manufacturer"] || "";
  const mpn = it["Part Number"] || it["Part Number "] || "";
  const desc = it["Description"] || "Aucune description détaillée disponible.";
  const sim = it["Modèle Simulation"] || it["Modele Simulation"] || "";
  const vRating = it["Voltage Rating"] || it["Voltage"] || "";
  const cRating = it["current Rating"] || it["Current Rating"] || "";
  const wRating = it["wattage"] || it["Wattage"] || "";
  const fRating = it["fréquency"] || it["frequency"] || "";

  let html =
    '<div class="elib-detail-sect">' +
      '<div class="elib-detail-title">' + elibEsc(name) + (val ? ' · <span style="color:var(--yellow)">' + elibEsc(val) + '</span>' : '') + '</div>' +
      (mfr || mpn ? '<div class="elib-detail-mfr">' + elibEsc((mfr ? mfr + " " : "") + (mpn ? "· " + mpn : "")) + '</div>' : '') +
      '<div class="elib-detail-desc">' + elibEsc(desc) + '</div>' +
    '</div>' +

    '<!-- Double prévisualisation interactive (Symbole + Empreinte) -->' +
    '<div class="elib-dual-preview">' +
      '<div class="elib-preview-box">' +
        '<div class="elib-preview-label"><span>Symbole Schéma</span><span>⚡ 2D</span></div>' +
        '<canvas id="elibSymCanvas" class="elib-preview-cvs" width="180" height="130"></canvas>' +
      '</div>' +
      '<div class="elib-preview-box">' +
        '<div class="elib-preview-label"><span>Empreinte PCB</span><span>Cuivre</span></div>' +
        '<canvas id="elibPcbCanvas" class="elib-preview-cvs" width="180" height="130"></canvas>' +
      '</div>' +
    '</div>' +

    '<!-- Spécifications et caractéristiques techniques -->' +
    '<div class="elib-detail-sect">' +
      '<div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--txt-dim); letter-spacing:0.04em;">Caractéristiques</div>' +
      '<table class="elib-props-table">' +
        '<tbody>' +
          '<tr><td class="elib-props-k">Boîtier / Footprint</td><td class="elib-props-v">' + elibEsc(pkg) + '</td></tr>' +
          (val ? '<tr><td class="elib-props-k">Valeur</td><td class="elib-props-v" style="color:var(--yellow)">' + elibEsc(val) + '</td></tr>' : '') +
          (vRating && vRating !== "xx" && vRating !== "-" ? '<tr><td class="elib-props-k">Tension max</td><td class="elib-props-v">' + elibEsc(vRating) + '</td></tr>' : '') +
          (cRating && cRating !== "xx" && cRating !== "-" ? '<tr><td class="elib-props-k">Courant max</td><td class="elib-props-v">' + elibEsc(cRating) + '</td></tr>' : '') +
          (wRating && wRating !== "xx" && wRating !== "-" ? '<tr><td class="elib-props-k">Puissance</td><td class="elib-props-v">' + elibEsc(wRating) + '</td></tr>' : '') +
          (fRating && fRating !== "xx" && fRating !== "-" ? '<tr><td class="elib-props-k">Fréquence</td><td class="elib-props-v">' + elibEsc(fRating) + '</td></tr>' : '') +
          (sim && sim !== "-" && sim !== "xx" ? '<tr><td class="elib-props-k">Modèle SPICE</td><td class="elib-props-v" style="color:#4ade80">✅ ' + elibEsc(sim) + '</td></tr>' : '') +
        '</tbody>' +
      '</table>' +
    '</div>';

  panel.innerHTML = html;

  // Rendu des deux grands Canvas
  const symCvs = document.getElementById("elibSymCanvas");
  if (symCvs) elibDessinerSymbole(symCvs, it, { large: true });

  const pcbCvs = document.getElementById("elibPcbCanvas");
  if (pcbCvs) elibDessinerEmpreinte(pcbCvs, it, { large: true });
}

/* ---------- Validation & Placement ---------- */
function elibValiderSelection() {
  if (!ELIB.selected) return;
  const it = ELIB.selected;
  explorateurLibFermer();

  if (typeof ELIB.onSelect === "function") {
    ELIB.onSelect(it);
  }
}

/* ---------- API Publique ---------- */
async function explorateurLibOuvrir(options) {
  const opt = options || {};
  ELIB.mode = opt.mode === "pcb" ? "pcb" : "schema";
  ELIB.onSelect = opt.onSelect || null;

  elibBuildDom();

  // Adapter les intitulés selon le mode
  const headTitle = document.getElementById("elibHeadTitle");
  const headSub = document.getElementById("elibHeadSub");
  const applyBtn = document.getElementById("elibBtnApply");

  if (ELIB.mode === "pcb") {
    if (headTitle) headTitle.textContent = opt.title || "Bibliothèque d'Empreintes PCB";
    if (headSub) headSub.textContent = opt.subtitle || "Choisissez une empreinte à implanter sur le circuit";
    if (applyBtn) applyBtn.textContent = opt.actionLabel || "✔ Placer sur la carte";
  } else {
    if (headTitle) headTitle.textContent = opt.title || "Explorateur Visuel de Bibliothèque";
    if (headSub) headSub.textContent = opt.subtitle || "Choisissez un composant à insérer sur le schéma";
    if (applyBtn) applyBtn.textContent = opt.actionLabel || "✔ Placer sur le schéma";
  }

  // Chargement des données de bibliothèque
  if (typeof window !== "undefined" && window.CSV_LIB && window.CSV_LIB.length > 0) {
    ELIB.items = window.CSV_LIB;
  } else if (typeof pcbChargerCsvLib === "function") {
    ELIB.items = await pcbChargerCsvLib();
  } else if (typeof fetch === "function") {
    try {
      const resp = await fetch("/api/lib/composants");
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.composants)) {
          ELIB.items = data.composants;
          if (typeof window !== "undefined") window.CSV_LIB = data.composants;
        }
      }
    } catch (_) {}
  }

  // Affichage du modal
  const m = document.getElementById("elibModal");
  if (m) {
    m.hidden = false;
    ELIB.open = true;
    const inp = document.getElementById("elibSearch");
    if (inp) {
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    }
  }

  elibFiltrerEtAfficher();
}

function explorateurLibFermer() {
  const m = document.getElementById("elibModal");
  if (m) m.hidden = true;
  ELIB.open = false;
}

function elibEsc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (typeof window !== "undefined") {
  window.ELIB = ELIB;
  window.explorateurLibOuvrir = explorateurLibOuvrir;
  window.explorateurLibFermer = explorateurLibFermer;
}
