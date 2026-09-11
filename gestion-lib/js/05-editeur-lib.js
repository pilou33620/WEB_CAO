"use strict";
/* =============================================================================
   Gestion LIB — 05-editeur-lib.js
   Éditeur visuel et paramétrique d'empreintes PCB et de symboles schématiques
   ============================================================================= */

const EDITEUR_LIB = {
  actif: false,
  type: "pcb", // "pcb" | "schematique"
  nomFichier: "",
  estNouveau: false,
  data: null,
  vue: "visuel", // "visuel" | "json"
  sousOnglet: "general", // "general" | "elements" | "traits" | "generateur"
  selectionIndex: -1,
  survolIndex: -1,
  outilActif: "move", // "pan" | "move" | "line"
  grilleMm: 0.1,
  grillePx: 10,
  drag: null,
  ligneEnCours: null,
  historique: [],
  pileRedo: [],
  renderer: null
};

/**
 * Ouvre l'éditeur d'empreinte PCB
 * @param {string} nomFichier - ex: "0603.json" ou vide si nouveau
 * @param {object} [donneesExistantes] - objet JSON optionnel
 */
async function ouvrirEditeurPcb(nomFichier, donneesExistantes = null) {
  EDITEUR_LIB.type = "pcb";
  EDITEUR_LIB.nomFichier = nomFichier || "NOUVELLE_EMPREINTE.json";
  EDITEUR_LIB.estNouveau = !nomFichier || !donneesExistantes;
  EDITEUR_LIB.selectionIndex = -1;
  EDITEUR_LIB.survolIndex = -1;
  EDITEUR_LIB.outilActif = "move";
  EDITEUR_LIB.drag = null;
  EDITEUR_LIB.ligneEnCours = null;
  EDITEUR_LIB.grilleMm = 0.1;
  EDITEUR_LIB.vue = "visuel";
  EDITEUR_LIB.sousOnglet = "general";
  EDITEUR_LIB.historique = [];
  EDITEUR_LIB.pileRedo = [];

  if (donneesExistantes) {
    EDITEUR_LIB.data = JSON.parse(JSON.stringify(donneesExistantes));
  } else if (nomFichier) {
    const charge = await obtenirFichierLib("pcb", nomFichier);
    if (charge) {
      EDITEUR_LIB.data = JSON.parse(JSON.stringify(charge));
      EDITEUR_LIB.estNouveau = false;
    } else {
      EDITEUR_LIB.data = creerEmpreinteDefaut();
    }
  } else {
    EDITEUR_LIB.data = creerEmpreinteDefaut();
  }

  afficherModaleEditeur();
}

/**
 * Ouvre l'éditeur de symbole schématique
 * @param {string} nomFichier - ex: "resistor.json" ou vide si nouveau
 * @param {object} [donneesExistantes] - objet JSON optionnel
 */
async function ouvrirEditeurSch(nomFichier, donneesExistantes = null) {
  EDITEUR_LIB.type = "schematique";
  EDITEUR_LIB.nomFichier = nomFichier || "NOUVEAU_SYMBOLE.json";
  EDITEUR_LIB.estNouveau = !nomFichier || !donneesExistantes;
  EDITEUR_LIB.selectionIndex = -1;
  EDITEUR_LIB.survolIndex = -1;
  EDITEUR_LIB.outilActif = "move";
  EDITEUR_LIB.drag = null;
  EDITEUR_LIB.ligneEnCours = null;
  EDITEUR_LIB.grillePx = 10;
  EDITEUR_LIB.vue = "visuel";
  EDITEUR_LIB.sousOnglet = "general";
  EDITEUR_LIB.historique = [];
  EDITEUR_LIB.pileRedo = [];

  if (donneesExistantes) {
    EDITEUR_LIB.data = JSON.parse(JSON.stringify(donneesExistantes));
  } else if (nomFichier) {
    const charge = await obtenirFichierLib("schematique", nomFichier);
    if (charge) {
      EDITEUR_LIB.data = JSON.parse(JSON.stringify(charge));
      EDITEUR_LIB.estNouveau = false;
    } else {
      EDITEUR_LIB.data = creerSymboleDefaut();
    }
  } else {
    EDITEUR_LIB.data = creerSymboleDefaut();
  }

  afficherModaleEditeur();
}

function creerNouvelleEmpreintePcb() {
  ouvrirEditeurPcb("");
}

function creerNouveauSymboleSch() {
  ouvrirEditeurSch("");
}

/* ---------- Modèles par défaut ---------- */
function creerEmpreinteDefaut() {
  return {
    format: "pcbfp-1",
    name: "NOUVEAU_BOITIER",
    pkg: "CMS",
    pins: 2,
    style: "chip",
    pitch: 1.5,
    pads: [
      { n: 1, x: -1.0, y: 0, w: 0.9, h: 1.1, shape: "rect", drill: 0, rot: 0 },
      { n: 2, x: 1.0, y: 0, w: 0.9, h: 1.1, shape: "rect", drill: 0, rot: 0 }
    ],
    body: { x1: -1.6, y1: -0.8, x2: 1.6, y2: 0.8 },
    description: "Nouvelle empreinte CMS"
  };
}

function creerSymboleDefaut() {
  return {
    format: "schsym-1",
    id: "nouveau_symbole",
    name: "Nouveau Symbole",
    category: "Générique",
    prefix: "U",
    defaultValue: "DEV",
    defaultPkg: "SOIC-8",
    pinCount: 4,
    pins: [
      { n: 1, x: -40, y: -20 },
      { n: 2, x: -40, y: 20 },
      { n: 3, x: 40, y: -20 },
      { n: 4, x: 40, y: 20 }
    ],
    ext: [-40, -30, 40, 30],
    primitives: [
      { op: "rect", x: -25, y: -30, w: 50, h: 60, r: 3, fill: true },
      { op: "line", x1: -40, y1: -20, x2: -25, y2: -20 },
      { op: "line", x1: -40, y1: 20, x2: -25, y2: 20 },
      { op: "line", x1: 25, y1: -20, x2: 40, y2: -20 },
      { op: "line", x1: 25, y1: 20, x2: 40, y2: 20 },
      { op: "text", text: "DEV", x: 0, y: 0, size: 11 }
    ]
  };
}

/* ---------- Affichage de la modale ---------- */
function afficherModaleEditeur() {
  const modal = document.getElementById("modalEditeurLib");
  if (!modal) return;

  EDITEUR_LIB.actif = true;
  modal.hidden = false;
  modal.style.display = "flex";

  // Mise à jour de l'en-tête
  const isPcb = EDITEUR_LIB.type === "pcb";
  const icon = isPcb ? "📐" : "⚡";
  const typeLabel = isPcb ? "Empreinte PCB" : "Symbole Schématique";
  const titre = (EDITEUR_LIB.estNouveau ? "Création de : " : "Édition de : ") + EDITEUR_LIB.nomFichier;

  document.getElementById("editeurModalTitre").innerHTML = `<span>${icon} ${typeLabel}</span> — <small style="color:var(--txt-dim);">${titre}</small>`;
  const inpNom = document.getElementById("editeurNomFichier");
  if (inpNom) inpNom.value = EDITEUR_LIB.nomFichier;

  // Initialisation du canvas d'édition
  const canvas = document.getElementById("canvasEditeurLib");
  if (canvas) {
    if (isPcb) {
      EDITEUR_LIB.renderer = new PcbRenderer(canvas);
      EDITEUR_LIB.renderer.setFootprint(EDITEUR_LIB.data);
    } else {
      EDITEUR_LIB.renderer = new SymboleRenderer(canvas);
      EDITEUR_LIB.renderer.setSymbol(EDITEUR_LIB.data);
    }
    initialiserInteractionsEditeur();
  }

  basculerVueEditeur("visuel");
  basculerSousOngletEditeur("general");
  remplirFormulaireEditeur();
  editeurMettreAJourBoutonsHistorique();
}

function fermerEditeurLib() {
  const modal = document.getElementById("modalEditeurLib");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
  EDITEUR_LIB.actif = false;
  EDITEUR_LIB.renderer = null;
  EDITEUR_LIB.drag = null;
  EDITEUR_LIB.ligneEnCours = null;
  EDITEUR_LIB.selectionIndex = -1;
  EDITEUR_LIB.survolIndex = -1;
  EDITEUR_LIB.historique = [];
  EDITEUR_LIB.pileRedo = [];
  editeurMettreAJourBoutonsHistorique();
}

/* ---------- Bascules d'onglets de l'éditeur ---------- */
function basculerVueEditeur(vue) {
  EDITEUR_LIB.vue = vue;
  const btnVis = document.getElementById("btnEditeurVueVisuel");
  const btnJson = document.getElementById("btnEditeurVueJson");
  const splitPane = document.getElementById("editeurSplitVisuel");
  const jsonPane = document.getElementById("editeurPaneJson");

  if (btnVis) btnVis.classList.toggle("active", vue === "visuel");
  if (btnJson) btnJson.classList.toggle("active", vue === "json");

  if (splitPane) splitPane.hidden = (vue !== "visuel");
  if (jsonPane) jsonPane.hidden = (vue !== "json");

  if (vue === "json") {
    const txtArea = document.getElementById("editeurCodeJson");
    if (txtArea && EDITEUR_LIB.data) {
      txtArea.value = JSON.stringify(EDITEUR_LIB.data, null, 2);
    }
  } else {
    remplirFormulaireEditeur();
    if (EDITEUR_LIB.renderer) {
      if (EDITEUR_LIB.type === "pcb") {
        EDITEUR_LIB.renderer.setFootprint(EDITEUR_LIB.data);
      } else {
        EDITEUR_LIB.renderer.setSymbol(EDITEUR_LIB.data);
      }
      setTimeout(() => EDITEUR_LIB.renderer.autoFit(), 50);
    }
  }
}

function basculerSousOngletEditeur(onglet) {
  EDITEUR_LIB.sousOnglet = onglet;
  document.querySelectorAll(".editor-subtab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-subtab") === onglet);
  });

  const pGen = document.getElementById("editeurTabGeneral");
  const pElem = document.getElementById("editeurTabElements");
  const pTraits = document.getElementById("editeurTabTraits");
  const pGenOutil = document.getElementById("editeurTabGenerateur");

  if (pGen) pGen.hidden = (onglet !== "general");
  if (pElem) pElem.hidden = (onglet !== "elements");
  if (pTraits) pTraits.hidden = (onglet !== "traits");
  if (pGenOutil) pGenOutil.hidden = (onglet !== "generateur");

  if (onglet === "traits") {
    remplirTraitsEditeur();
  }
}

/* ---------- Historique des modifications (Annuler / Rétablir) ---------- */
const EDITEUR_HIST_MAX = 50;
let editeurInputSessionPushed = false;

function editeurHistoriquePush() {
  if (!EDITEUR_LIB.data) return;
  const snapshot = JSON.stringify(EDITEUR_LIB.data);
  const dernier = EDITEUR_LIB.historique[EDITEUR_LIB.historique.length - 1];
  if (dernier === snapshot) return;

  EDITEUR_LIB.historique.push(snapshot);
  if (EDITEUR_LIB.historique.length > EDITEUR_HIST_MAX) {
    EDITEUR_LIB.historique.shift();
  }
  EDITEUR_LIB.pileRedo.length = 0;
  editeurMettreAJourBoutonsHistorique();
}

function editeurUndo() {
  if (!EDITEUR_LIB.actif || !EDITEUR_LIB.historique || EDITEUR_LIB.historique.length === 0) return;
  const actuel = JSON.stringify(EDITEUR_LIB.data);
  EDITEUR_LIB.pileRedo.push(actuel);
  if (EDITEUR_LIB.pileRedo.length > EDITEUR_HIST_MAX) {
    EDITEUR_LIB.pileRedo.shift();
  }

  const prevSnapshot = EDITEUR_LIB.historique.pop();
  EDITEUR_LIB.data = JSON.parse(prevSnapshot);

  editeurRestaurerApresHistorique();
  afficherToast("Action annulée (Ctrl+Z)", "info");
}

function editeurRedo() {
  if (!EDITEUR_LIB.actif || !EDITEUR_LIB.pileRedo || EDITEUR_LIB.pileRedo.length === 0) return;
  const actuel = JSON.stringify(EDITEUR_LIB.data);
  EDITEUR_LIB.historique.push(actuel);
  if (EDITEUR_LIB.historique.length > EDITEUR_HIST_MAX) {
    EDITEUR_LIB.historique.shift();
  }

  const nextSnapshot = EDITEUR_LIB.pileRedo.pop();
  EDITEUR_LIB.data = JSON.parse(nextSnapshot);

  editeurRestaurerApresHistorique();
  afficherToast("Action rétablie (Ctrl+Y)", "info");
}

function editeurRestaurerApresHistorique() {
  if (EDITEUR_LIB.renderer) {
    if (EDITEUR_LIB.type === "pcb") {
      EDITEUR_LIB.renderer.setFootprint(EDITEUR_LIB.data);
    } else {
      EDITEUR_LIB.renderer.setSymbol(EDITEUR_LIB.data);
    }
    EDITEUR_LIB.renderer.render();
  }
  remplirFormulaireEditeur();
  if (EDITEUR_LIB.vue === "json") {
    const txtArea = document.getElementById("editeurCodeJson");
    if (txtArea) txtArea.value = JSON.stringify(EDITEUR_LIB.data, null, 2);
  }
  editeurMettreAJourBoutonsHistorique();
}

function editeurMettreAJourBoutonsHistorique() {
  const canUndo = EDITEUR_LIB.historique && EDITEUR_LIB.historique.length > 0;
  const canRedo = EDITEUR_LIB.pileRedo && EDITEUR_LIB.pileRedo.length > 0;

  ["btnEditeurUndo", "btnHeadUndo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canUndo;
  });
  ["btnEditeurRedo", "btnHeadRedo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !canRedo;
  });
}

function editeurInputBeforeChange() {
  if (!editeurInputSessionPushed) {
    editeurHistoriquePush();
    editeurInputSessionPushed = true;
  }
}

/* ---------- Interactions & Outils du Canvas (Déplacer, Tracer trait, Pan) ---------- */
function editeurChangerOutil(outil) {
  EDITEUR_LIB.outilActif = outil;

  const btnPan = document.getElementById("btnOutilPan");
  const btnMove = document.getElementById("btnOutilDeplacer");
  const btnLine = document.getElementById("btnOutilLigne");

  if (btnPan) btnPan.classList.toggle("active", outil === "pan");
  if (btnMove) btnMove.classList.toggle("active", outil === "move");
  if (btnLine) btnLine.classList.toggle("active", outil === "line");

  const canvas = document.getElementById("canvasEditeurLib");
  if (canvas) {
    if (outil === "pan") canvas.style.cursor = "grab";
    else if (outil === "line") canvas.style.cursor = "crosshair";
    else canvas.style.cursor = "default";
  }

  const isPcb = EDITEUR_LIB.type === "pcb";
  if (outil === "move") {
    editeurAfficherInfoCanvas(isPcb
      ? "Mode Déplacement : Glissez une pastille (pad) pour changer sa position avec magnétisme"
      : "Mode Déplacement : Glissez une broche (pin) pour changer sa position sur la grille");
  } else if (outil === "line") {
    editeurAfficherInfoCanvas(isPcb
      ? "Mode Trait : Cliquez pour le départ du trait sérigraphie, puis cliquez pour la fin (Échap pour annuler)"
      : "Mode Trait : Cliquez pour le départ du trait schématique, puis cliquez pour la fin (Échap pour annuler)");
  } else {
    editeurAfficherInfoCanvas("Mode Vue : Glissez le pointeur pour déplacer la vue dans le plan");
  }

  if (outil !== "line" && EDITEUR_LIB.ligneEnCours) {
    EDITEUR_LIB.ligneEnCours = null;
  }

  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurChangerPasGrille(val) {
  const step = parseFloat(val) || 0;
  if (EDITEUR_LIB.type === "pcb") {
    EDITEUR_LIB.grilleMm = step > 0 ? step : 0.1;
  } else {
    EDITEUR_LIB.grillePx = step > 0 ? step : 10;
  }
}

function editeurAfficherInfoCanvas(txt) {
  const info = document.getElementById("editeurCanvasInfo");
  if (info) info.textContent = txt;
}

function initialiserInteractionsEditeur() {
  const r = EDITEUR_LIB.renderer;
  if (!r) return;

  r.customPointerDown = editeurPointerDown;
  r.customPointerMove = editeurPointerMove;
  r.customPointerUp = editeurPointerUp;
  r.customOverlayDraw = editeurOverlayDraw;

  const isPcb = EDITEUR_LIB.type === "pcb";
  const btnDeplacer = document.getElementById("btnOutilDeplacer");
  if (btnDeplacer) {
    btnDeplacer.innerHTML = isPcb ? "🖐️ Déplacer pad" : "🖐️ Déplacer broche";
    btnDeplacer.title = isPcb ? "Déplacer manuellement une pastille (glisser-déposer avec magnétisme)" : "Déplacer manuellement une broche (glisser-déposer avec magnétisme)";
  }

  const selGrille = document.getElementById("editeurSelGrille");
  if (selGrille) {
    if (isPcb) {
      selGrille.innerHTML = `
        <option value="0.05">Pas: 0.05 mm</option>
        <option value="0.1" selected>Pas: 0.1 mm</option>
        <option value="0.5">Pas: 0.5 mm</option>
        <option value="1.0">Pas: 1.0 mm</option>
      `;
      EDITEUR_LIB.grilleMm = 0.1;
    } else {
      selGrille.innerHTML = `
        <option value="5">Pas: 5 px</option>
        <option value="10" selected>Pas: 10 px</option>
        <option value="20">Pas: 20 px (1 mm)</option>
      `;
      EDITEUR_LIB.grillePx = 10;
    }
  }

  editeurChangerOutil("move");
}

function editeurSnap(val, step) {
  if (!step || step <= 0) return val;
  return Math.round(val / step) * step;
}

function editeurHitPad(clientX, clientY) {
  if (!EDITEUR_LIB.data || !Array.isArray(EDITEUR_LIB.data.pads) || !EDITEUR_LIB.renderer) return -1;
  const r = EDITEUR_LIB.renderer;
  const cr = r.canvas.getBoundingClientRect();
  const sx = clientX - cr.left;
  const sy = clientY - cr.top;

  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < EDITEUR_LIB.data.pads.length; i++) {
    const p = EDITEUR_LIB.data.pads[i];
    const ps = r.worldToScreen(p.x, p.y);
    const dist = Math.hypot(sx - ps.x, sy - ps.y);
    const padScreenRadius = Math.max(12, Math.max((p.w || 1), (p.h || 1)) * r.zoom * 0.5 + 4);
    if (dist <= padScreenRadius && dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function editeurHitPin(clientX, clientY) {
  if (!EDITEUR_LIB.data || !Array.isArray(EDITEUR_LIB.data.pins) || !EDITEUR_LIB.renderer) return -1;
  const r = EDITEUR_LIB.renderer;
  const cr = r.canvas.getBoundingClientRect();
  const sx = clientX - cr.left;
  const sy = clientY - cr.top;

  let bestIdx = -1;
  let bestDist = 14; // tolérance 14 pixels écran comme 19-broches.js

  for (let i = 0; i < EDITEUR_LIB.data.pins.length; i++) {
    const p = EDITEUR_LIB.data.pins[i];
    const px = p.x !== undefined ? p.x : (p[0] || 0);
    const py = p.y !== undefined ? p.y : (p[1] || 0);
    const ps = r.worldToScreen(px, py);
    const dist = Math.hypot(sx - ps.x, sy - ps.y);
    if (dist <= bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function editeurPointerDown(e) {
  if (!EDITEUR_LIB.actif || !EDITEUR_LIB.renderer) return false;

  // Clic molette / bouton central : toujours vue pan
  if (e.button === 1) return false;

  // Clic droit : annuler ligne si en cours, ou laisser pan
  if (e.button === 2) {
    if (EDITEUR_LIB.ligneEnCours) {
      EDITEUR_LIB.ligneEnCours = null;
      editeurAfficherInfoCanvas("Tracé de trait annulé");
      EDITEUR_LIB.renderer.render();
      return true;
    }
    return false;
  }

  const isPcb = EDITEUR_LIB.type === "pcb";
  const tool = EDITEUR_LIB.outilActif;

  if (tool === "pan") {
    return false; // laisse le renderer exécuter son pan standard
  }

  if (tool === "move") {
    const hitIdx = isPcb ? editeurHitPad(e.clientX, e.clientY) : editeurHitPin(e.clientX, e.clientY);
    if (hitIdx >= 0) {
      EDITEUR_LIB.selectionIndex = hitIdx;
      const elem = isPcb ? EDITEUR_LIB.data.pads[hitIdx] : EDITEUR_LIB.data.pins[hitIdx];
      const origX = isPcb ? elem.x : (elem.x !== undefined ? elem.x : (elem[0] || 0));
      const origY = isPcb ? elem.y : (elem.y !== undefined ? elem.y : (elem[1] || 0));

      EDITEUR_LIB.drag = {
        index: hitIdx,
        startX: e.clientX,
        startY: e.clientY,
        origX: origX,
        origY: origY,
        hasMoved: false
      };

      try { EDITEUR_LIB.renderer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      editeurMettreAJourSelectionTable(hitIdx);
      EDITEUR_LIB.renderer.canvas.style.cursor = "grabbing";
      EDITEUR_LIB.renderer.render();
      return true;
    }

    // Clic dans le vide en mode move : désélectionne et permet le pan
    if (EDITEUR_LIB.selectionIndex >= 0) {
      EDITEUR_LIB.selectionIndex = -1;
      editeurMettreAJourSelectionTable(-1);
      EDITEUR_LIB.renderer.render();
    }
    return false;
  }

  if (tool === "line") {
    const w = EDITEUR_LIB.renderer.screenToWorld(e.clientX, e.clientY);
    const snapX = isPcb ? parseFloat((editeurSnap(w.x, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.x, EDITEUR_LIB.grillePx);
    const snapY = isPcb ? parseFloat((editeurSnap(w.y, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.y, EDITEUR_LIB.grillePx);

    if (!EDITEUR_LIB.ligneEnCours) {
      EDITEUR_LIB.ligneEnCours = {
        x1: snapX,
        y1: snapY,
        x2: snapX,
        y2: snapY,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startTime: Date.now()
      };
      try { EDITEUR_LIB.renderer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      EDITEUR_LIB.renderer.render();
      return true;
    } else {
      editeurFinaliserLigne(snapX, snapY);
      return true;
    }
  }

  return false;
}

function editeurPointerMove(e) {
  if (!EDITEUR_LIB.actif || !EDITEUR_LIB.renderer) return false;
  const isPcb = EDITEUR_LIB.type === "pcb";

  // 1. Déplacement actif d'une broche / pastille
  if (EDITEUR_LIB.drag) {
    if (!EDITEUR_LIB.drag.hasMoved) {
      editeurHistoriquePush();
    }
    const w = EDITEUR_LIB.renderer.screenToWorld(e.clientX, e.clientY);
    const newX = isPcb ? parseFloat((editeurSnap(w.x, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.x, EDITEUR_LIB.grillePx);
    const newY = isPcb ? parseFloat((editeurSnap(w.y, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.y, EDITEUR_LIB.grillePx);
    const idx = EDITEUR_LIB.drag.index;

    if (isPcb) {
      if (EDITEUR_LIB.data.pads[idx]) {
        EDITEUR_LIB.data.pads[idx].x = newX;
        EDITEUR_LIB.data.pads[idx].y = newY;
      }
    } else {
      if (EDITEUR_LIB.data.pins[idx]) {
        if (typeof EDITEUR_LIB.data.pins[idx] === "object") {
          EDITEUR_LIB.data.pins[idx].x = newX;
          EDITEUR_LIB.data.pins[idx].y = newY;
        } else {
          EDITEUR_LIB.data.pins[idx] = [newX, newY];
        }
      }
    }

    editeurSyncInputsTable(idx, newX, newY);
    editeurAfficherInfoCanvas(`${isPcb ? 'Pastille' : 'Broche'} #${idx + 1} : X = ${newX}${isPcb ? ' mm' : ' px'}, Y = ${newY}${isPcb ? ' mm' : ' px'}`);
    EDITEUR_LIB.drag.hasMoved = true;
    EDITEUR_LIB.renderer.render();
    return true;
  }

  // 2. Tracé actif d'un trait (ligne élastique)
  if (EDITEUR_LIB.ligneEnCours) {
    const w = EDITEUR_LIB.renderer.screenToWorld(e.clientX, e.clientY);
    EDITEUR_LIB.ligneEnCours.x2 = isPcb ? parseFloat((editeurSnap(w.x, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.x, EDITEUR_LIB.grillePx);
    EDITEUR_LIB.ligneEnCours.y2 = isPcb ? parseFloat((editeurSnap(w.y, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.y, EDITEUR_LIB.grillePx);

    const dx = EDITEUR_LIB.ligneEnCours.x2 - EDITEUR_LIB.ligneEnCours.x1;
    const dy = EDITEUR_LIB.ligneEnCours.y2 - EDITEUR_LIB.ligneEnCours.y1;
    const len = Math.hypot(dx, dy).toFixed(isPcb ? 2 : 1);
    editeurAfficherInfoCanvas(`Trait : (${EDITEUR_LIB.ligneEnCours.x1}, ${EDITEUR_LIB.ligneEnCours.y1}) ➔ (${EDITEUR_LIB.ligneEnCours.x2}, ${EDITEUR_LIB.ligneEnCours.y2}) · L = ${len}${isPcb ? ' mm' : ' px'}`);
    EDITEUR_LIB.renderer.render();
    return true;
  }

  // 3. Survol simple selon l'outil actif
  if (EDITEUR_LIB.outilActif === "move") {
    const hitIdx = isPcb ? editeurHitPad(e.clientX, e.clientY) : editeurHitPin(e.clientX, e.clientY);
    if (hitIdx !== EDITEUR_LIB.survolIndex) {
      EDITEUR_LIB.survolIndex = hitIdx;
      EDITEUR_LIB.renderer.canvas.style.cursor = hitIdx >= 0 ? "grab" : "default";
      EDITEUR_LIB.renderer.render();
    }
  } else if (EDITEUR_LIB.outilActif === "line") {
    EDITEUR_LIB.renderer.canvas.style.cursor = "crosshair";
    const w = EDITEUR_LIB.renderer.screenToWorld(e.clientX, e.clientY);
    const snapX = isPcb ? parseFloat((editeurSnap(w.x, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.x, EDITEUR_LIB.grillePx);
    const snapY = isPcb ? parseFloat((editeurSnap(w.y, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.y, EDITEUR_LIB.grillePx);
    editeurAfficherInfoCanvas(`Curseur : X = ${snapX}${isPcb ? ' mm' : ' px'}, Y = ${snapY}${isPcb ? ' mm' : ' px'} (cliquez pour démarrer le trait)`);
  }

  return false;
}

function editeurPointerUp(e) {
  if (!EDITEUR_LIB.actif || !EDITEUR_LIB.renderer) return false;

  if (EDITEUR_LIB.drag) {
    try { EDITEUR_LIB.renderer.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    EDITEUR_LIB.drag = null;
    EDITEUR_LIB.renderer.canvas.style.cursor = EDITEUR_LIB.survolIndex >= 0 ? "grab" : "default";
    EDITEUR_LIB.renderer.render();
    return true;
  }

  if (EDITEUR_LIB.ligneEnCours) {
    const dist = Math.hypot(e.clientX - EDITEUR_LIB.ligneEnCours.startScreenX, e.clientY - EDITEUR_LIB.ligneEnCours.startScreenY);
    // Si l'utilisateur a glissé de plus de 8 pixels, il s'agit d'un tracé par clic-glisser-relâcher
    if (dist > 8) {
      const isPcb = EDITEUR_LIB.type === "pcb";
      const w = EDITEUR_LIB.renderer.screenToWorld(e.clientX, e.clientY);
      const snapX = isPcb ? parseFloat((editeurSnap(w.x, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.x, EDITEUR_LIB.grillePx);
      const snapY = isPcb ? parseFloat((editeurSnap(w.y, EDITEUR_LIB.grilleMm)).toFixed(3)) : editeurSnap(w.y, EDITEUR_LIB.grillePx);
      try { EDITEUR_LIB.renderer.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      editeurFinaliserLigne(snapX, snapY);
      return true;
    }
  }

  return false;
}

function editeurFinaliserLigne(x2, y2) {
  if (!EDITEUR_LIB.ligneEnCours) return;
  const x1 = EDITEUR_LIB.ligneEnCours.x1;
  const y1 = EDITEUR_LIB.ligneEnCours.y1;
  const isPcb = EDITEUR_LIB.type === "pcb";

  if (x1 !== x2 || y1 !== y2) {
    editeurHistoriquePush();
    if (isPcb) {
      if (!Array.isArray(EDITEUR_LIB.data.lines)) EDITEUR_LIB.data.lines = [];
      EDITEUR_LIB.data.lines.push({
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        width: 0.15
      });
      afficherToast(`Trait sérigraphie ajouté (${x1}, ${y1}) ➔ (${x2}, ${y2})`, "success");
    } else {
      if (!Array.isArray(EDITEUR_LIB.data.primitives)) EDITEUR_LIB.data.primitives = [];
      EDITEUR_LIB.data.primitives.push({
        op: "line",
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        width: 2.5,
        stroke: "#cfe6fb" // SCH_COLORS.bodyStroke
      });
      afficherToast(`Trait schématique ajouté (${x1}, ${y1}) ➔ (${x2}, ${y2})`, "success");
    }

    if (EDITEUR_LIB.sousOnglet === "traits") {
      remplirTraitsEditeur();
    }
  }

  EDITEUR_LIB.ligneEnCours = null;
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurOverlayDraw(ctx, w, h) {
  if (!EDITEUR_LIB.renderer || !EDITEUR_LIB.data) return;
  const isPcb = EDITEUR_LIB.type === "pcb";

  // 1. Halo au survol (hover)
  if (EDITEUR_LIB.survolIndex >= 0 && EDITEUR_LIB.survolIndex !== EDITEUR_LIB.selectionIndex) {
    const elem = isPcb ? EDITEUR_LIB.data.pads[EDITEUR_LIB.survolIndex] : EDITEUR_LIB.data.pins[EDITEUR_LIB.survolIndex];
    if (elem) {
      const px = isPcb ? elem.x : (elem.x !== undefined ? elem.x : (elem[0] || 0));
      const py = isPcb ? elem.y : (elem.y !== undefined ? elem.y : (elem[1] || 0));
      const s = EDITEUR_LIB.renderer.worldToScreen(px, py);

      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, isPcb ? Math.max(14, (elem.w || 1) * EDITEUR_LIB.renderer.zoom * 0.5 + 4) : 11, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(63, 160, 234, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(63, 160, 234, 0.12)";
      ctx.fill();
      ctx.restore();
    }
  }

  // 2. Halo et étiquette de sélection
  if (EDITEUR_LIB.selectionIndex >= 0) {
    const elem = isPcb ? EDITEUR_LIB.data.pads[EDITEUR_LIB.selectionIndex] : EDITEUR_LIB.data.pins[EDITEUR_LIB.selectionIndex];
    if (elem) {
      const px = isPcb ? elem.x : (elem.x !== undefined ? elem.x : (elem[0] || 0));
      const py = isPcb ? elem.y : (elem.y !== undefined ? elem.y : (elem[1] || 0));
      const s = EDITEUR_LIB.renderer.worldToScreen(px, py);

      ctx.save();
      ctx.translate(s.x, s.y);
      if (isPcb && elem.rot) ctx.rotate((-elem.rot * Math.PI) / 180);

      const pw = isPcb ? (elem.w || 1) * EDITEUR_LIB.renderer.zoom : 20;
      const ph = isPcb ? (elem.h || 1) * EDITEUR_LIB.renderer.zoom : 20;
      const boxW = pw + 6;
      const boxH = ph + 6;

      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(56, 189, 248, 0.22)";

      if (isPcb && elem.shape === "circ") {
        ctx.beginPath();
        ctx.arc(0, 0, boxW / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (isPcb && elem.shape === "rect") {
        ctx.beginPath();
        ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Étiquette au-dessus
      const numLabel = elem.n !== undefined ? elem.n : (EDITEUR_LIB.selectionIndex + 1);
      const tagText = `${isPcb ? 'Pad' : 'Broche'} ${numLabel} (${px}, ${py})`;
      ctx.font = 'bold 10.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(tagText, s.x, s.y - (isPcb ? Math.max(ph / 2 + 5, 14) : 13));
    }
  }

  // 3. Aperçu en direct du trait en cours
  if (EDITEUR_LIB.ligneEnCours) {
    const s1 = EDITEUR_LIB.renderer.worldToScreen(EDITEUR_LIB.ligneEnCours.x1, EDITEUR_LIB.ligneEnCours.y1);
    const s2 = EDITEUR_LIB.renderer.worldToScreen(EDITEUR_LIB.ligneEnCours.x2, EDITEUR_LIB.ligneEnCours.y2);

    ctx.save();
    // Couleur identique à l'existant : blanc/gris silk pour PCB, bleu clair pour schématique
    ctx.strokeStyle = isPcb ? "#f3f4f6" : "#cfe6fb";
    ctx.lineWidth = Math.max(2, isPcb ? 0.15 * EDITEUR_LIB.renderer.zoom : 2.5);
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Poignées de points
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath(); ctx.arc(s1.x, s1.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s2.x, s2.y, 4, 0, Math.PI * 2); ctx.fill();

    // Pastille de longueur au centre
    const midX = (s1.x + s2.x) / 2;
    const midY = (s1.y + s2.y) / 2;
    const dx = EDITEUR_LIB.ligneEnCours.x2 - EDITEUR_LIB.ligneEnCours.x1;
    const dy = EDITEUR_LIB.ligneEnCours.y2 - EDITEUR_LIB.ligneEnCours.y1;
    const dist = Math.hypot(dx, dy).toFixed(isPcb ? 2 : 1);
    const badgeText = `${dist} ${isPcb ? 'mm' : 'px'}`;

    ctx.font = '10px "Segoe UI", sans-serif';
    const txtW = ctx.measureText(badgeText).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1;
    ctx.fillRect(midX - txtW / 2 - 4, midY - 17, txtW + 8, 15);
    ctx.strokeRect(midX - txtW / 2 - 4, midY - 17, txtW + 8, 15);
    ctx.fillStyle = "#38bdf8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, midX, midY - 9.5);
    ctx.restore();
  }
}

function editeurSyncInputsTable(idx, newX, newY) {
  const isPcb = EDITEUR_LIB.type === "pcb";
  const tbodyId = isPcb ? "tbodyPadsEditeur" : "tbodyPinsEditeur";
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const tr = tbody.querySelector(`tr[data-idx="${idx}"]`);
  if (!tr) return;
  const inpX = tr.querySelector('input[data-field="x"]');
  const inpY = tr.querySelector('input[data-field="y"]');
  if (inpX && document.activeElement !== inpX) inpX.value = newX;
  if (inpY && document.activeElement !== inpY) inpY.value = newY;
}

function editeurMettreAJourSelectionTable(idx) {
  const isPcb = EDITEUR_LIB.type === "pcb";
  const tbodyId = isPcb ? "tbodyPadsEditeur" : "tbodyPinsEditeur";
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.querySelectorAll("tr").forEach(tr => {
    const rIdx = parseInt(tr.getAttribute("data-idx"), 10);
    tr.classList.toggle("selected-row", rIdx === idx);
  });
  const selTr = tbody.querySelector(`tr[data-idx="${idx}"]`);
  if (selTr) {
    selTr.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/* ---------- Remplissage et liaison formulaire ---------- */
function remplirFormulaireEditeur() {
  const isPcb = EDITEUR_LIB.type === "pcb";
  const data = EDITEUR_LIB.data;
  if (!data) return;

  // 1. Général
  const contGen = document.getElementById("editeurTabGeneral");
  if (contGen) {
    if (isPcb) {
      contGen.innerHTML = `
        <div class="form-group">
          <label>Nom de l'empreinte</label>
          <input id="edFpNom" value="${escapeHtml(data.name || '')}">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Boîtier (Package)</label>
            <input id="edFpPkg" value="${escapeHtml(data.pkg || '')}">
          </div>
          <div class="form-group">
            <label>Style</label>
            <input id="edFpStyle" value="${escapeHtml(data.style || 'smd')}" placeholder="chip, dip, qfn, soic...">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Pitch / Pas (mm)</label>
            <input type="number" step="0.01" id="edFpPitch" value="${data.pitch || 0}">
          </div>
          <div class="form-group">
            <label>Nombre de broches</label>
            <input type="number" id="edFpPins" value="${data.pins || (data.pads ? data.pads.length : 0)}">
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edFpDesc" rows="2">${escapeHtml(data.description || '')}</textarea>
        </div>
        <div style="border-top:1px solid var(--border); padding-top:10px;">
          <label style="font-weight:600; font-size:11.5px; color:var(--txt);">Corps sérigraphie (mm)</label>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-top:6px;">
            <div class="form-group"><label>X1</label><input type="number" step="0.05" id="edBodyX1" value="${data.body ? data.body.x1 : -1}"></div>
            <div class="form-group"><label>Y1</label><input type="number" step="0.05" id="edBodyY1" value="${data.body ? data.body.y1 : -1}"></div>
            <div class="form-group"><label>X2</label><input type="number" step="0.05" id="edBodyX2" value="${data.body ? data.body.x2 : 1}"></div>
            <div class="form-group"><label>Y2</label><input type="number" step="0.05" id="edBodyY2" value="${data.body ? data.body.y2 : 1}"></div>
          </div>
          <button class="tb mini" style="margin-top:6px;" onclick="editeurAjusterCorpsAuto()">⊡ Calculer d'après les pastilles</button>
        </div>
      `;
      // Écouteurs sur les champs généraux
      ["edFpNom", "edFpPkg", "edFpStyle", "edFpPitch", "edFpPins", "edFpDesc", "edBodyX1", "edBodyY1", "edBodyX2", "edBodyY2"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener("focus", () => { editeurInputSessionPushed = false; });
          el.addEventListener("input", () => {
            editeurInputBeforeChange();
            editeurCollecterGeneralPcb();
          });
        }
      });
    } else {
      // Symbole schématique
      contGen.innerHTML = `
        <div class="form-group">
          <label>ID Symbole</label>
          <input id="edSchId" value="${escapeHtml(data.id || '')}">
        </div>
        <div class="form-group">
          <label>Nom du symbole</label>
          <input id="edSchNom" value="${escapeHtml(data.name || '')}">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Préfixe de référence</label>
            <input id="edSchPrefix" value="${escapeHtml(data.prefix || 'U')}" maxlength="5">
          </div>
          <div class="form-group">
            <label>Catégorie</label>
            <input id="edSchCat" value="${escapeHtml(data.category || 'Générique')}">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Valeur par défaut</label>
            <input id="edSchDefVal" value="${escapeHtml(data.defaultValue || '')}">
          </div>
          <div class="form-group">
            <label>Boîtier par défaut</label>
            <input id="edSchDefPkg" value="${escapeHtml(data.defaultPkg || '')}">
          </div>
        </div>
      `;
      ["edSchId", "edSchNom", "edSchPrefix", "edSchCat", "edSchDefVal", "edSchDefPkg"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener("focus", () => { editeurInputSessionPushed = false; });
          el.addEventListener("input", () => {
            editeurInputBeforeChange();
            editeurCollecterGeneralSch();
          });
        }
      });
    }
  }

  // 2. Éléments (Pastilles ou Broches)
  remplirElementsEditeur();

  // 3. Traits / Lignes
  remplirTraitsEditeur();

  // 4. Générateur rapide
  remplirGenerateurEditeur();
}

function editeurCollecterGeneralPcb() {
  const d = EDITEUR_LIB.data;
  if (!d) return;
  d.name = (document.getElementById("edFpNom")?.value || "").trim();
  d.pkg = (document.getElementById("edFpPkg")?.value || "").trim();
  d.style = (document.getElementById("edFpStyle")?.value || "smd").trim();
  d.pitch = parseFloat(document.getElementById("edFpPitch")?.value) || 0;
  d.pins = parseInt(document.getElementById("edFpPins")?.value, 10) || (d.pads ? d.pads.length : 0);
  d.description = (document.getElementById("edFpDesc")?.value || "").trim();

  d.body = {
    x1: parseFloat(document.getElementById("edBodyX1")?.value) || -1,
    y1: parseFloat(document.getElementById("edBodyY1")?.value) || -1,
    x2: parseFloat(document.getElementById("edBodyX2")?.value) || 1,
    y2: parseFloat(document.getElementById("edBodyY2")?.value) || 1
  };

  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurCollecterGeneralSch() {
  const d = EDITEUR_LIB.data;
  if (!d) return;
  d.id = (document.getElementById("edSchId")?.value || "").trim();
  d.name = (document.getElementById("edSchNom")?.value || "").trim();
  d.prefix = (document.getElementById("edSchPrefix")?.value || "U").trim();
  d.category = (document.getElementById("edSchCat")?.value || "").trim();
  d.defaultValue = (document.getElementById("edSchDefVal")?.value || "").trim();
  d.defaultPkg = (document.getElementById("edSchDefPkg")?.value || "").trim();

  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurAjusterCorpsAuto(skipHistory = false) {
  const d = EDITEUR_LIB.data;
  if (!d || !Array.isArray(d.pads) || d.pads.length === 0) return;
  if (!skipHistory) {
    editeurHistoriquePush();
  }

  let minX = 999, minY = 999, maxX = -999, maxY = -999;
  d.pads.forEach(p => {
    const hw = (p.w || 1) / 2;
    const hh = (p.h || 1) / 2;
    minX = Math.min(minX, p.x - hw);
    maxX = Math.max(maxX, p.x + hw);
    minY = Math.min(minY, p.y - hh);
    maxY = Math.max(maxY, p.y + hh);
  });

  const marge = 0.4;
  d.body = {
    x1: Math.round((minX - marge) * 100) / 100,
    y1: Math.round((minY - marge) * 100) / 100,
    x2: Math.round((maxX + marge) * 100) / 100,
    y2: Math.round((maxY + marge) * 100) / 100
  };

  document.getElementById("edBodyX1").value = d.body.x1;
  document.getElementById("edBodyY1").value = d.body.y1;
  document.getElementById("edBodyX2").value = d.body.x2;
  document.getElementById("edBodyY2").value = d.body.y2;

  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

/* ---------- Table des éléments (Pastilles / Broches) ---------- */
function remplirElementsEditeur() {
  const cont = document.getElementById("editeurTabElements");
  if (!cont) return;
  const isPcb = EDITEUR_LIB.type === "pcb";
  const data = EDITEUR_LIB.data;

  if (isPcb) {
    const pads = Array.isArray(data.pads) ? data.pads : [];
    let rowsHtml = "";
    pads.forEach((p, idx) => {
      rowsHtml += `
        <tr data-idx="${idx}">
          <td style="width:38px;"><input type="text" data-field="n" value="${escapeHtml(p.n)}" style="text-align:center;"></td>
          <td><input type="number" step="0.05" data-field="x" value="${p.x}"></td>
          <td><input type="number" step="0.05" data-field="y" value="${p.y}"></td>
          <td><input type="number" step="0.05" data-field="w" value="${p.w || 1}"></td>
          <td><input type="number" step="0.05" data-field="h" value="${p.h || 1}"></td>
          <td style="width:55px;">
            <select data-field="shape">
              <option value="rect" ${p.shape === 'rect' ? 'selected' : ''}>Rect</option>
              <option value="circ" ${p.shape === 'circ' ? 'selected' : ''}>Rond</option>
              <option value="oval" ${p.shape === 'oval' ? 'selected' : ''}>Ovale</option>
            </select>
          </td>
          <td><input type="number" step="0.1" data-field="drill" value="${p.drill || 0}"></td>
          <td style="width:30px; text-align:center;">
            <button class="tb mini" style="color:var(--red); padding:1px 5px;" onclick="editeurSupprimerPad(${idx})" title="Supprimer">✕</button>
          </td>
        </tr>
      `;
    });

    cont.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:600; font-size:12px;">Pastilles (${pads.length})</span>
        <button class="tb mini primary" onclick="editeurAjouterPad()">➕ Ajouter pastille</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="editable-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>X</th>
              <th>Y</th>
              <th>W</th>
              <th>H</th>
              <th>Forme</th>
              <th>Perçage</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tbodyPadsEditeur">${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // Écouteurs inputs pads
    const tbody = document.getElementById("tbodyPadsEditeur");
    if (tbody) {
      tbody.querySelectorAll("input, select").forEach(inp => {
        inp.addEventListener("input", e => {
          editeurInputBeforeChange();
          const tr = e.target.closest("tr");
          const idx = parseInt(tr.getAttribute("data-idx"), 10);
          const fld = e.target.getAttribute("data-field");
          const val = (fld === "n" || fld === "shape") ? e.target.value : (parseFloat(e.target.value) || 0);
          if (EDITEUR_LIB.data.pads[idx]) {
            EDITEUR_LIB.data.pads[idx][fld] = val;
            if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
          }
        });
        inp.addEventListener("focus", () => {
          editeurInputSessionPushed = false;
          const tr = inp.closest("tr");
          if (tr) {
            const idx = parseInt(tr.getAttribute("data-idx"), 10);
            EDITEUR_LIB.selectionIndex = idx;
            editeurMettreAJourSelectionTable(idx);
            if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
          }
        });
      });

      tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("pointerdown", e => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "BUTTON") return;
          const idx = parseInt(tr.getAttribute("data-idx"), 10);
          EDITEUR_LIB.selectionIndex = idx;
          editeurMettreAJourSelectionTable(idx);
          if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
        });
      });
    }
  } else {
    // Broches de symbole schématique
    const pins = Array.isArray(data.pins) ? data.pins : [];
    let rowsHtml = "";
    pins.forEach((p, idx) => {
      const px = p.x !== undefined ? p.x : (p[0] || 0);
      const py = p.y !== undefined ? p.y : (p[1] || 0);
      const pn = p.n !== undefined ? p.n : (idx + 1);
      rowsHtml += `
        <tr data-idx="${idx}">
          <td style="width:45px;"><input type="text" data-field="n" value="${escapeHtml(pn)}" style="text-align:center;"></td>
          <td><input type="number" step="5" data-field="x" value="${px}"></td>
          <td><input type="number" step="5" data-field="y" value="${py}"></td>
          <td style="width:30px; text-align:center;">
            <button class="tb mini" style="color:var(--red); padding:1px 5px;" onclick="editeurSupprimerPin(${idx})" title="Supprimer">✕</button>
          </td>
        </tr>
      `;
    });

    cont.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:600; font-size:12px;">Broches (${pins.length})</span>
        <button class="tb mini primary" onclick="editeurAjouterPin()">➕ Ajouter broche</button>
      </div>
      <div style="overflow-x:auto;">
        <table class="editable-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>X</th>
              <th>Y</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tbodyPinsEditeur">${rowsHtml}</tbody>
        </table>
      </div>
    `;

    const tbody = document.getElementById("tbodyPinsEditeur");
    if (tbody) {
      tbody.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", e => {
          editeurInputBeforeChange();
          const tr = e.target.closest("tr");
          const idx = parseInt(tr.getAttribute("data-idx"), 10);
          const fld = e.target.getAttribute("data-field");
          const val = fld === "n" ? e.target.value : (parseFloat(e.target.value) || 0);
          if (EDITEUR_LIB.data.pins[idx]) {
            if (typeof EDITEUR_LIB.data.pins[idx] === "object") {
              EDITEUR_LIB.data.pins[idx][fld] = val;
            } else {
              EDITEUR_LIB.data.pins[idx] = [fld === "x" ? val : (EDITEUR_LIB.data.pins[idx][0] || 0), fld === "y" ? val : (EDITEUR_LIB.data.pins[idx][1] || 0)];
            }
            if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
          }
        });
        inp.addEventListener("focus", () => {
          editeurInputSessionPushed = false;
          const tr = inp.closest("tr");
          if (tr) {
            const idx = parseInt(tr.getAttribute("data-idx"), 10);
            EDITEUR_LIB.selectionIndex = idx;
            editeurMettreAJourSelectionTable(idx);
            if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
          }
        });
      });

      tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("pointerdown", e => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "BUTTON") return;
          const idx = parseInt(tr.getAttribute("data-idx"), 10);
          EDITEUR_LIB.selectionIndex = idx;
          editeurMettreAJourSelectionTable(idx);
          if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
        });
      });
    }
  }
}

function editeurAjouterPad() {
  editeurHistoriquePush();
  if (!EDITEUR_LIB.data.pads) EDITEUR_LIB.data.pads = [];
  const n = EDITEUR_LIB.data.pads.length + 1;
  EDITEUR_LIB.data.pads.push({
    n: n,
    x: 0,
    y: 0,
    w: 1.0,
    h: 1.2,
    shape: "rect",
    drill: 0,
    rot: 0
  });
  EDITEUR_LIB.data.pins = EDITEUR_LIB.data.pads.length;
  remplirElementsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurSupprimerPad(idx) {
  if (!EDITEUR_LIB.data.pads) return;
  editeurHistoriquePush();
  EDITEUR_LIB.data.pads.splice(idx, 1);
  EDITEUR_LIB.data.pins = EDITEUR_LIB.data.pads.length;
  if (EDITEUR_LIB.selectionIndex === idx) EDITEUR_LIB.selectionIndex = -1;
  remplirElementsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurAjouterPin() {
  editeurHistoriquePush();
  if (!EDITEUR_LIB.data.pins) EDITEUR_LIB.data.pins = [];
  const n = EDITEUR_LIB.data.pins.length + 1;
  EDITEUR_LIB.data.pins.push({
    n: n,
    x: -40,
    y: n * 10
  });
  remplirElementsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurSupprimerPin(idx) {
  if (!EDITEUR_LIB.data.pins) return;
  editeurHistoriquePush();
  EDITEUR_LIB.data.pins.splice(idx, 1);
  if (EDITEUR_LIB.selectionIndex === idx) EDITEUR_LIB.selectionIndex = -1;
  remplirElementsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

/* ---------- Table des traits / lignes (PCB Silk & Symbole Primitives) ---------- */
function remplirTraitsEditeur() {
  const cont = document.getElementById("editeurTabTraits");
  if (!cont) return;
  const isPcb = EDITEUR_LIB.type === "pcb";
  const data = EDITEUR_LIB.data;
  if (!data) return;

  if (isPcb) {
    const lines = Array.isArray(data.lines) ? data.lines : [];
    let rowsHtml = "";
    lines.forEach((l, idx) => {
      rowsHtml += `
        <tr data-idx="${idx}">
          <td style="width:30px; text-align:center; color:var(--txt-dim); font-size:11px;">#${idx + 1}</td>
          <td><input type="number" step="0.05" data-field="x1" value="${l.x1 !== undefined ? l.x1 : 0}"></td>
          <td><input type="number" step="0.05" data-field="y1" value="${l.y1 !== undefined ? l.y1 : 0}"></td>
          <td><input type="number" step="0.05" data-field="x2" value="${l.x2 !== undefined ? l.x2 : 0}"></td>
          <td><input type="number" step="0.05" data-field="y2" value="${l.y2 !== undefined ? l.y2 : 0}"></td>
          <td style="width:55px;"><input type="number" step="0.02" data-field="width" value="${l.width || 0.15}"></td>
          <td style="width:30px; text-align:center;">
            <button class="tb mini" style="color:var(--red); padding:1px 5px;" onclick="editeurSupprimerLigne(${idx})" title="Supprimer">✕</button>
          </td>
        </tr>
      `;
    });

    cont.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:600; font-size:12px;">Traits sérigraphie (${lines.length})</span>
        <div style="display:flex; gap:6px;">
          <button class="tb mini" onclick="editeurChangerOutil('line')">📏 Tracer au pointeur</button>
          <button class="tb mini primary" onclick="editeurAjouterLigne()">➕ Ajouter ligne</button>
        </div>
      </div>
      <div style="font-size:11px; color:var(--txt-dim); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <span>Couleur :</span>
        <span style="display:inline-block; width:12px; height:12px; background:#f3f4f6; border:1px solid #666; border-radius:2px;"></span>
        <code>PCB_COLORS.silk (#f3f4f6)</code>
      </div>
      <div style="overflow-x:auto;">
        <table class="editable-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>X1</th>
              <th>Y1</th>
              <th>X2</th>
              <th>Y2</th>
              <th>Ép.</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tbodyLinesEditeur">${rowsHtml || '<tr><td colspan="7" style="text-align:center; color:var(--txt-dim); padding:14px;">Aucun trait de sérigraphie. Cliquez sur "Tracer au pointeur" ou "Ajouter ligne".</td></tr>'}</tbody>
        </table>
      </div>
    `;

    const tbody = document.getElementById("tbodyLinesEditeur");
    if (tbody) {
      tbody.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("focus", () => { editeurInputSessionPushed = false; });
        inp.addEventListener("input", e => {
          editeurInputBeforeChange();
          const tr = e.target.closest("tr");
          const idx = parseInt(tr.getAttribute("data-idx"), 10);
          const fld = e.target.getAttribute("data-field");
          const val = parseFloat(e.target.value) || 0;
          if (EDITEUR_LIB.data.lines && EDITEUR_LIB.data.lines[idx]) {
            EDITEUR_LIB.data.lines[idx][fld] = val;
            if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
          }
        });
      });
    }
  } else {
    // Schématique
    if (!Array.isArray(data.primitives)) data.primitives = [];
    const linePrimitives = [];
    data.primitives.forEach((p, realIdx) => {
      if (p.op === "line") {
        linePrimitives.push({ prim: p, realIdx });
      }
    });

    let rowsHtml = "";
    linePrimitives.forEach((item, displayIdx) => {
      const p = item.prim;
      rowsHtml += `
        <tr data-realidx="${item.realIdx}">
          <td style="width:30px; text-align:center; color:var(--txt-dim); font-size:11px;">#${displayIdx + 1}</td>
          <td><input type="number" step="5" data-field="x1" value="${p.x1 !== undefined ? p.x1 : 0}"></td>
          <td><input type="number" step="5" data-field="y1" value="${p.y1 !== undefined ? p.y1 : 0}"></td>
          <td><input type="number" step="5" data-field="x2" value="${p.x2 !== undefined ? p.x2 : 0}"></td>
          <td><input type="number" step="5" data-field="y2" value="${p.y2 !== undefined ? p.y2 : 0}"></td>
          <td style="width:55px;"><input type="number" step="0.5" data-field="width" value="${p.width || 2.5}"></td>
          <td style="width:30px; text-align:center;">
            <button class="tb mini" style="color:var(--red); padding:1px 5px;" onclick="editeurSupprimerLigne(${item.realIdx})" title="Supprimer">✕</button>
          </td>
        </tr>
      `;
    });

    cont.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:600; font-size:12px;">Traits schématiques (${linePrimitives.length})</span>
        <div style="display:flex; gap:6px;">
          <button class="tb mini" onclick="editeurChangerOutil('line')">📏 Tracer au pointeur</button>
          <button class="tb mini primary" onclick="editeurAjouterLigne()">➕ Ajouter ligne</button>
        </div>
      </div>
      <div style="font-size:11px; color:var(--txt-dim); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <span>Couleur :</span>
        <span style="display:inline-block; width:12px; height:12px; background:#cfe6fb; border:1px solid #4a6a8c; border-radius:2px;"></span>
        <code>SCH_COLORS.bodyStroke (#cfe6fb)</code>
      </div>
      <div style="overflow-x:auto;">
        <table class="editable-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>X1</th>
              <th>Y1</th>
              <th>X2</th>
              <th>Y2</th>
              <th>Ép.</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tbodyLinesEditeur">${rowsHtml || '<tr><td colspan="7" style="text-align:center; color:var(--txt-dim); padding:14px;">Aucun trait. Cliquez sur "Tracer au pointeur" ou "Ajouter ligne".</td></tr>'}</tbody>
        </table>
      </div>
    `;

    const tbody = document.getElementById("tbodyLinesEditeur");
    if (tbody) {
      tbody.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("focus", () => { editeurInputSessionPushed = false; });
        inp.addEventListener("input", e => {
          editeurInputBeforeChange();
          const tr = e.target.closest("tr");
          const realIdx = parseInt(tr.getAttribute("data-realidx"), 10);
          const fld = e.target.getAttribute("data-field");
          const val = parseFloat(e.target.value) || 0;
          if (EDITEUR_LIB.data.primitives && EDITEUR_LIB.data.primitives[realIdx]) {
            EDITEUR_LIB.data.primitives[realIdx][fld] = val;
            if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
          }
        });
      });
    }
  }
}

function editeurAjouterLigne() {
  editeurHistoriquePush();
  const isPcb = EDITEUR_LIB.type === "pcb";
  if (isPcb) {
    if (!Array.isArray(EDITEUR_LIB.data.lines)) EDITEUR_LIB.data.lines = [];
    EDITEUR_LIB.data.lines.push({
      x1: -1.0,
      y1: -1.0,
      x2: 1.0,
      y2: -1.0,
      width: 0.15
    });
  } else {
    if (!Array.isArray(EDITEUR_LIB.data.primitives)) EDITEUR_LIB.data.primitives = [];
    EDITEUR_LIB.data.primitives.push({
      op: "line",
      x1: -20,
      y1: -20,
      x2: 20,
      y2: -20,
      width: 2.5,
      stroke: "#cfe6fb"
    });
  }
  remplirTraitsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

function editeurSupprimerLigne(idx) {
  editeurHistoriquePush();
  const isPcb = EDITEUR_LIB.type === "pcb";
  if (isPcb) {
    if (Array.isArray(EDITEUR_LIB.data.lines)) {
      EDITEUR_LIB.data.lines.splice(idx, 1);
    }
  } else {
    if (Array.isArray(EDITEUR_LIB.data.primitives)) {
      EDITEUR_LIB.data.primitives.splice(idx, 1);
    }
  }
  remplirTraitsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

/* ---------- Générateurs paramétriques ---------- */
function remplirGenerateurEditeur() {
  const cont = document.getElementById("editeurTabGenerateur");
  if (!cont) return;
  const isPcb = EDITEUR_LIB.type === "pcb";

  if (isPcb) {
    cont.innerHTML = `
      <!-- Générateur DIP / Traversant -->
      <div class="generator-card">
        <h4>📐 Boîtier DIP (Double rangée traversante)</h4>
        <div class="generator-grid">
          <div class="form-group"><label>Nb broches</label><input type="number" id="genDipPins" value="8" step="2"></div>
          <div class="form-group"><label>Pitch (mm)</label><input type="number" id="genDipPitch" value="2.54" step="0.01"></div>
          <div class="form-group"><label>Écartement rangées (mm)</label><input type="number" id="genDipRowSpan" value="7.62" step="0.01"></div>
          <div class="form-group"><label>Diamètre perçage (mm)</label><input type="number" id="genDipDrill" value="0.8" step="0.05"></div>
        </div>
        <button class="tb primary mini" style="align-self:flex-start;" onclick="editeurGenererDip()">Générer DIP</button>
      </div>

      <!-- Générateur SOIC / SOP CMS -->
      <div class="generator-card">
        <h4>📐 Boîtier SOIC / TSSOP (CMS Double rangée)</h4>
        <div class="generator-grid">
          <div class="form-group"><label>Nb broches</label><input type="number" id="genSoicPins" value="8" step="2"></div>
          <div class="form-group"><label>Pitch (mm)</label><input type="number" id="genSoicPitch" value="1.27" step="0.01"></div>
          <div class="form-group"><label>Écartement centre-centre (mm)</label><input type="number" id="genSoicSpan" value="5.4" step="0.1"></div>
          <div class="form-group"><label>Taille pad W x H (mm)</label><input type="text" id="genSoicPadSize" value="1.5 x 0.6"></div>
        </div>
        <button class="tb primary mini" style="align-self:flex-start;" onclick="editeurGenererSoic()">Générer SOIC / TSSOP</button>
      </div>

      <!-- Générateur Barrette Header -->
      <div class="generator-card">
        <h4>📐 Barrette de broches (Header 1xN)</h4>
        <div class="generator-grid">
          <div class="form-group"><label>Nb broches</label><input type="number" id="genHdrPins" value="4"></div>
          <div class="form-group"><label>Pitch (mm)</label><input type="number" id="genHdrPitch" value="2.54" step="0.01"></div>
        </div>
        <button class="tb primary mini" style="align-self:flex-start;" onclick="editeurGenererHeader()">Générer Barrette</button>
      </div>
    `;
  } else {
    // Générateur Symbole Schématique
    cont.innerHTML = `
      <div class="generator-card">
        <h4>⚡ Boîtier Circuit Intégré Symétrique (CI)</h4>
        <div class="generator-grid">
          <div class="form-group"><label>Nb broches total</label><input type="number" id="genSchPins" value="8" step="2"></div>
          <div class="form-group"><label>Espacement broches (px)</label><input type="number" id="genSchSpacing" value="20" step="5"></div>
          <div class="form-group"><label>Largeur corps (px)</label><input type="number" id="genSchWidth" value="50" step="5"></div>
          <div class="form-group"><label>Longueur broche (px)</label><input type="number" id="genSchPinLen" value="15" step="5"></div>
        </div>
        <button class="tb primary mini" style="align-self:flex-start;" onclick="editeurGenererCiSch()">Générer Symbole CI</button>
      </div>
    `;
  }
}

function editeurGenererDip() {
  editeurHistoriquePush();
  const pins = parseInt(document.getElementById("genDipPins")?.value, 10) || 8;
  const pitch = parseFloat(document.getElementById("genDipPitch")?.value) || 2.54;
  const rowSpan = parseFloat(document.getElementById("genDipRowSpan")?.value) || 7.62;
  const drill = parseFloat(document.getElementById("genDipDrill")?.value) || 0.8;

  const nSide = Math.floor(pins / 2);
  const pads = [];
  const startY = ((nSide - 1) * pitch) / 2;

  // Rangée gauche (pins 1 à nSide)
  for (let i = 0; i < nSide; i++) {
    pads.push({
      n: i + 1,
      x: -rowSpan / 2,
      y: startY - i * pitch,
      w: 1.5,
      h: 1.5,
      shape: i === 0 ? "rect" : "circ",
      drill: drill,
      rot: 0
    });
  }
  // Rangée droite (pins nSide+1 à pins) du bas vers le haut
  for (let i = 0; i < nSide; i++) {
    pads.push({
      n: nSide + 1 + i,
      x: rowSpan / 2,
      y: -startY + i * pitch,
      w: 1.5,
      h: 1.5,
      shape: "circ",
      drill: drill,
      rot: 0
    });
  }

  EDITEUR_LIB.data.pads = pads;
  EDITEUR_LIB.data.pins = pins;
  EDITEUR_LIB.data.style = "dip";
  EDITEUR_LIB.data.pitch = pitch;
  EDITEUR_LIB.data.pkg = `DIP-${pins}`;
  editeurAjusterCorpsAuto(true);

  remplirFormulaireEditeur();
  basculerSousOngletEditeur("elements");
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.autoFit();
}

function editeurGenererSoic() {
  editeurHistoriquePush();
  const pins = parseInt(document.getElementById("genSoicPins")?.value, 10) || 8;
  const pitch = parseFloat(document.getElementById("genSoicPitch")?.value) || 1.27;
  const span = parseFloat(document.getElementById("genSoicSpan")?.value) || 5.4;
  const padSize = (document.getElementById("genSoicPadSize")?.value || "1.5 x 0.6").split("x");
  const padW = parseFloat(padSize[0]) || 1.5;
  const padH = parseFloat(padSize[1]) || 0.6;

  const nSide = Math.floor(pins / 2);
  const pads = [];
  const startY = ((nSide - 1) * pitch) / 2;

  for (let i = 0; i < nSide; i++) {
    pads.push({
      n: i + 1,
      x: -span / 2,
      y: startY - i * pitch,
      w: padW,
      h: padH,
      shape: "rect",
      drill: 0,
      rot: 0
    });
  }
  for (let i = 0; i < nSide; i++) {
    pads.push({
      n: nSide + 1 + i,
      x: span / 2,
      y: -startY + i * pitch,
      w: padW,
      h: padH,
      shape: "rect",
      drill: 0,
      rot: 0
    });
  }

  EDITEUR_LIB.data.pads = pads;
  EDITEUR_LIB.data.pins = pins;
  EDITEUR_LIB.data.style = "soic";
  EDITEUR_LIB.data.pitch = pitch;
  EDITEUR_LIB.data.pkg = `SOIC-${pins}`;
  editeurAjusterCorpsAuto(true);

  remplirFormulaireEditeur();
  basculerSousOngletEditeur("elements");
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.autoFit();
}

function editeurGenererHeader() {
  editeurHistoriquePush();
  const pins = parseInt(document.getElementById("genHdrPins")?.value, 10) || 4;
  const pitch = parseFloat(document.getElementById("genHdrPitch")?.value) || 2.54;
  const pads = [];
  const startY = ((pins - 1) * pitch) / 2;

  for (let i = 0; i < pins; i++) {
    pads.push({
      n: i + 1,
      x: 0,
      y: startY - i * pitch,
      w: 1.7,
      h: 1.7,
      shape: i === 0 ? "rect" : "circ",
      drill: 1.0,
      rot: 0
    });
  }

  EDITEUR_LIB.data.pads = pads;
  EDITEUR_LIB.data.pins = pins;
  EDITEUR_LIB.data.style = "header";
  EDITEUR_LIB.data.pitch = pitch;
  EDITEUR_LIB.data.pkg = `HDR-1x${pins}`;
  editeurAjusterCorpsAuto(true);

  remplirFormulaireEditeur();
  basculerSousOngletEditeur("elements");
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.autoFit();
}

function editeurGenererCiSch() {
  editeurHistoriquePush();
  const pins = parseInt(document.getElementById("genSchPins")?.value, 10) || 8;
  const spacing = parseFloat(document.getElementById("genSchSpacing")?.value) || 20;
  const width = parseFloat(document.getElementById("genSchWidth")?.value) || 50;
  const pinLen = parseFloat(document.getElementById("genSchPinLen")?.value) || 15;

  const nSide = Math.floor(pins / 2);
  const bodyH = Math.max(40, (nSide + 1) * spacing);
  const halfW = width / 2;
  const halfH = bodyH / 2;
  const pinStartX = halfW + pinLen;

  const pinsArr = [];
  const primitives = [
    { op: "rect", x: -halfW, y: -halfH, w: width, h: bodyH, r: 4, fill: true },
    { op: "circle", x: -halfW + 8, y: -halfH + 8, r: 2.5, fill: true } // Repère broche 1
  ];

  const startY = -((nSide - 1) * spacing) / 2;

  // Gauche
  for (let i = 0; i < nSide; i++) {
    const py = startY + i * spacing;
    pinsArr.push({ n: i + 1, x: -pinStartX, y: py });
    primitives.push({ op: "line", x1: -pinStartX, y1: py, x2: -halfW, y2: py });
  }

  // Droite (du bas vers le haut)
  for (let i = 0; i < nSide; i++) {
    const py = -startY - i * spacing;
    pinsArr.push({ n: nSide + 1 + i, x: pinStartX, y: py });
    primitives.push({ op: "line", x1: halfW, y1: py, x2: pinStartX, y2: py });
  }

  primitives.push({ op: "text", text: "IC", x: 0, y: 0, size: 12 });

  EDITEUR_LIB.data.pins = pinsArr;
  EDITEUR_LIB.data.pinCount = pins;
  EDITEUR_LIB.data.primitives = primitives;
  EDITEUR_LIB.data.ext = [-pinStartX, -halfH - 5, pinStartX, halfH + 5];

  remplirFormulaireEditeur();
  basculerSousOngletEditeur("elements");
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.autoFit();
}

/* ---------- Synchronisation et Sauvegarde ---------- */
async function editeurEnregistrer() {
  let nom = (document.getElementById("editeurNomFichier")?.value || "").trim();
  if (!nom) {
    alert("Le nom de fichier est obligatoire (ex: mon_boitier.json)");
    return;
  }
  if (!nom.toLowerCase().endsWith(".json")) {
    nom += ".json";
  }

  // Si on est en vue JSON, parser le textarea d'abord
  if (EDITEUR_LIB.vue === "json") {
    const txtArea = document.getElementById("editeurCodeJson");
    if (txtArea) {
      try {
        EDITEUR_LIB.data = JSON.parse(txtArea.value);
      } catch (err) {
        alert("Erreur dans le code JSON : " + err.message);
        return;
      }
    }
  }

  const type = EDITEUR_LIB.type;
  try {
    afficherToast(`Enregistrement de ${nom} en cours...`, "info");
    await sauvegarderFichierLib(type, nom, EDITEUR_LIB.data);
    afficherToast(`${nom} enregistré avec succès dans la bibliothèque`, "success");

    fermerEditeurLib();

    // Rafraîchir l'interface
    if (typeof rafraichirGaleriePcb === "function" && type === "pcb") {
      rafraichirGaleriePcb();
    } else if (typeof rafraichirGalerieSch === "function" && type === "schematique") {
      rafraichirGalerieSch();
    }
    if (typeof rafraichirStats === "function") rafraichirStats();

    // Mettre à jour l'inspecteur si le composant actif utilise ce fichier
    if (LIB_STATE.selection && typeof selectionnerComposant === "function") {
      selectionnerComposant(LIB_STATE.selection._id);
    }
  } catch (err) {
    alert("Erreur lors de l'enregistrement : " + err.message);
  }
}

// Initialisation des écouteurs de l'éditeur JSON
document.addEventListener("DOMContentLoaded", () => {
  const txtJson = document.getElementById("editeurCodeJson");
  const errDiv = document.getElementById("editeurJsonErr");
  if (txtJson) {
    txtJson.addEventListener("input", () => {
      try {
        const parsed = JSON.parse(txtJson.value);
        EDITEUR_LIB.data = parsed;
        if (errDiv) errDiv.textContent = "";
        if (EDITEUR_LIB.renderer) {
          if (EDITEUR_LIB.type === "pcb") EDITEUR_LIB.renderer.setFootprint(parsed);
          else EDITEUR_LIB.renderer.setSymbol(parsed);
        }
      } catch (e) {
        if (errDiv) errDiv.textContent = "Syntaxe JSON : " + e.message;
      }
    });
  }
});

// Écouteur clavier global pour l'éditeur (Ctrl+Z Annuler, Ctrl+Y / Ctrl+Maj+Z Rétablir, Échap pour annuler tracé ou sélection)
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("keydown", e => {
    if (!EDITEUR_LIB.actif) return;

    // Si l'utilisateur tape dans le textarea JSON brut, laisser l'undo/redo natif du navigateur agir
    if (e.target && e.target.id === "editeurCodeJson") {
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    // Ctrl+Z (Undo) ou Ctrl+Shift+Z (Redo)
    if (mod && k === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        editeurRedo();
      } else {
        editeurUndo();
      }
      return;
    }

    // Ctrl+Y (Redo)
    if (mod && k === "y") {
      e.preventDefault();
      editeurRedo();
      return;
    }

    if (e.key === "Escape") {
      if (EDITEUR_LIB.ligneEnCours) {
        EDITEUR_LIB.ligneEnCours = null;
        editeurAfficherInfoCanvas("Tracé de trait annulé");
        if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
      } else if (EDITEUR_LIB.selectionIndex >= 0) {
        EDITEUR_LIB.selectionIndex = -1;
        editeurMettreAJourSelectionTable(-1);
        if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
      }
    }
  });
}

// Export global
window.EDITEUR_LIB = EDITEUR_LIB;
window.ouvrirEditeurPcb = ouvrirEditeurPcb;
window.ouvrirEditeurSch = ouvrirEditeurSch;
window.creerNouvelleEmpreintePcb = creerNouvelleEmpreintePcb;
window.creerNouveauSymboleSch = creerNouveauSymboleSch;
window.fermerEditeurLib = fermerEditeurLib;
window.editeurEnregistrer = editeurEnregistrer;
window.basculerVueEditeur = basculerVueEditeur;
window.basculerSousOngletEditeur = basculerSousOngletEditeur;
window.editeurAjusterCorpsAuto = editeurAjusterCorpsAuto;
window.editeurAjouterPad = editeurAjouterPad;
window.editeurSupprimerPad = editeurSupprimerPad;
window.editeurAjouterPin = editeurAjouterPin;
window.editeurSupprimerPin = editeurSupprimerPin;
window.editeurGenererDip = editeurGenererDip;
window.editeurGenererSoic = editeurGenererSoic;
window.editeurGenererHeader = editeurGenererHeader;
window.editeurGenererCiSch = editeurGenererCiSch;
window.editeurChangerOutil = editeurChangerOutil;
window.editeurChangerPasGrille = editeurChangerPasGrille;
window.remplirTraitsEditeur = remplirTraitsEditeur;
window.editeurAjouterLigne = editeurAjouterLigne;
window.editeurSupprimerLigne = editeurSupprimerLigne;
window.editeurHitPad = editeurHitPad;
window.editeurHitPin = editeurHitPin;
window.editeurFinaliserLigne = editeurFinaliserLigne;
window.editeurSnap = editeurSnap;
window.editeurPointerDown = editeurPointerDown;
window.editeurPointerMove = editeurPointerMove;
window.editeurPointerUp = editeurPointerUp;
window.editeurHistoriquePush = editeurHistoriquePush;
window.editeurUndo = editeurUndo;
window.editeurRedo = editeurRedo;
window.editeurInputBeforeChange = editeurInputBeforeChange;
window.editeurMettreAJourBoutonsHistorique = editeurMettreAJourBoutonsHistorique;



