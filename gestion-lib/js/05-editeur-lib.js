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
  EDITEUR_LIB.trouSel = -1;
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
  EDITEUR_LIB.trouSel = -1;
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

  // le nom vient de l'adresse (?nom=), d'une cellule du catalogue ou de l'IA : échappé
  document.getElementById("editeurModalTitre").innerHTML = `<span>${icon} ${typeLabel}</span> — <small style="color:var(--txt-dim);">${esc(titre)}</small>`;
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
  EDITEUR_LIB.trouSel = -1;            // annuler / rétablir : les rangs des trous ne valent plus
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
  const btnTrou = document.getElementById("btnOutilTrou");

  if (btnTrou) btnTrou.classList.toggle("active", outil === "trou");
  if (btnPan) btnPan.classList.toggle("active", outil === "pan");
  if (btnMove) btnMove.classList.toggle("active", outil === "move");
  if (btnLine) btnLine.classList.toggle("active", outil === "line");

  const canvas = document.getElementById("canvasEditeurLib");
  if (canvas) {
    if (outil === "pan") canvas.style.cursor = "grab";
    else if (outil === "line" || outil === "trou") canvas.style.cursor = "crosshair";
    else canvas.style.cursor = "default";
  }

  const isPcb = EDITEUR_LIB.type === "pcb";
  if (outil === "move") {
    editeurAfficherInfoCanvas(isPcb
      ? "Mode Déplacement : Glissez une pastille (pad) pour changer sa position avec magnétisme"
      : "Mode Déplacement : Glissez une broche (pin) pour changer sa position sur la grille");
  } else if (outil === "trou") {
    editeurAfficherInfoCanvas("Mode Trou : Cliquez pour poser un trou non métallisé (centrage, fixation) ; diamètre et position dans l'onglet Éléments");
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

// Le trou le plus proche du pointeur, à son rayon à l'écran (12 px au moins)
function editeurHitTrou(clientX, clientY) {
  const r = EDITEUR_LIB.renderer, T = EDITEUR_LIB.data && EDITEUR_LIB.data.holes;
  if (!r || !Array.isArray(T)) return -1;
  const cr = r.canvas.getBoundingClientRect(), sx = clientX - cr.left, sy = clientY - cr.top;
  let best = -1, bd = Infinity;
  T.forEach((t, i) => {
    const ps = r.worldToScreen(t.x, t.y), d = Math.hypot(sx - ps.x, sy - ps.y);
    if (d <= Math.max(12, ((Math.max(t.w || 0, t.d || 1)) * r.zoom) / 2 + 4) && d < bd) { bd = d; best = i; }
  });
  return best;
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
      EDITEUR_LIB.trouSel = -1;
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

    // Un trou sous le pointeur : sélectionné et glissé comme une pastille
    const iTrou = isPcb ? editeurHitTrou(e.clientX, e.clientY) : -1;
    if (iTrou >= 0) {
      const t = EDITEUR_LIB.data.holes[iTrou];
      EDITEUR_LIB.trouSel = iTrou;
      EDITEUR_LIB.drag = { trou: iTrou, startX: e.clientX, startY: e.clientY, origX: t.x, origY: t.y, hasMoved: false };
      try { EDITEUR_LIB.renderer.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      editeurAfficherInfoCanvas("Trou #" + (iTrou + 1) + " sélectionné — glissez pour le déplacer, Suppr pour l'effacer");
      EDITEUR_LIB.renderer.render();
      return true;
    }
    EDITEUR_LIB.trouSel = -1;

    // Clic dans le vide en mode move : désélectionne et permet le pan
    if (EDITEUR_LIB.selectionIndex >= 0) {
      EDITEUR_LIB.selectionIndex = -1;
      editeurMettreAJourSelectionTable(-1);
      EDITEUR_LIB.renderer.render();
    }
    return false;
  }

  // Trou NPTH : posé sur la grille, au diamètre du dernier trou (3,2 mm au premier)
  if (tool === "trou" && isPcb) {
    const w = EDITEUR_LIB.renderer.screenToWorld(e.clientX, e.clientY);
    editeurHistoriquePush();
    if (!Array.isArray(EDITEUR_LIB.data.holes)) EDITEUR_LIB.data.holes = [];
    const prec = EDITEUR_LIB.data.holes[EDITEUR_LIB.data.holes.length - 1];
    EDITEUR_LIB.data.holes.push({
      x: parseFloat(editeurSnap(w.x, EDITEUR_LIB.grilleMm).toFixed(3)),
      y: parseFloat(editeurSnap(w.y, EDITEUR_LIB.grilleMm).toFixed(3)),
      d: prec ? prec.d : 3.2
    });
    remplirElementsEditeur();
    EDITEUR_LIB.renderer.render();
    return true;
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

    if (EDITEUR_LIB.drag.trou != null) {
      const t = EDITEUR_LIB.data.holes && EDITEUR_LIB.data.holes[EDITEUR_LIB.drag.trou];
      if (t) { t.x = newX; t.y = newY; }
      editeurAfficherInfoCanvas(`Trou #${EDITEUR_LIB.drag.trou + 1} : X = ${newX} mm, Y = ${newY} mm`);
      EDITEUR_LIB.drag.hasMoved = true;
      EDITEUR_LIB.renderer.render();
      return true;
    }

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
    const trouGlisse = EDITEUR_LIB.drag.trou != null && EDITEUR_LIB.drag.hasMoved;
    EDITEUR_LIB.drag = null;
    if (trouGlisse) remplirElementsEditeur();   // la table des trous suit
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

  // 0. Le trou sélectionné (Suppr l'efface) : cerclé de la couleur de sélection
  const tSel = isPcb && Array.isArray(EDITEUR_LIB.data.holes) ? EDITEUR_LIB.data.holes[EDITEUR_LIB.trouSel] : null;
  if (tSel) {
    const s = EDITEUR_LIB.renderer.worldToScreen(tSel.x, tSel.y);
    ctx.save();
    ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(10, (Math.max(tSel.w || 0, tSel.d || 1) * EDITEUR_LIB.renderer.zoom) / 2 + 5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

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
      if (isPcb && elem.rot) ctx.rotate((elem.rot * Math.PI) / 180);

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
  if (isPcb) rendreDetailPad();
}

/* ---------- Fiche de la pastille sélectionnée ----------
   Ce que le tableau n'a pas la place de dire : le masque et la pâte propres
   à la pastille, et pour une traversante sa forme sur les couches internes
   et au dessous. Une empreinte de bibliothèque ignore le nombre de couches de
   la carte qui l'utilisera : « couches internes » vaut pour toutes, « dessous »
   pour la dernière (clés `int` et `bas` de `parCouche`, que l'éditeur PCB lit
   couche par couche — Gerber, zones, contrôle des règles et routeur). */
const FORMES_PAD_LIB = {circ: "Rond", rect: "Rect. arrondi", sharp: "Rect. angles droits", oval: "Ovale", chamfer: "Chanfreiné"};
function rendreDetailPad() {
  const cont = document.getElementById("editeurPadDetail");
  if (!cont || EDITEUR_LIB.type !== "pcb") return;
  const pads = (EDITEUR_LIB.data && EDITEUR_LIB.data.pads) || [];
  const idx = EDITEUR_LIB.selectionIndex;
  const p = (idx != null && idx >= 0) ? pads[idx] : null;
  if (!p) {
    cont.innerHTML = `<div class="hint-txt" style="font-size:11px; color:var(--txt-dim);">Sélectionnez une pastille pour régler son masque, sa pâte et sa forme par couche.</div>`;
    return;
  }
  const n = v => (v == null || !isFinite(v)) ? "" : String(Math.round(v * 1000) / 1000);
  const mMode = p.noMask ? "aucun" : (p.mask != null ? "propre" : "regle");
  const pMode = p.noPaste ? "aucune" : (p.paste != null ? "propre" : "regle");
  const th = (p.drill || 0) > 0;
  const pc = p.parCouche || {};
  const ligneCouche = (cle, titre, avecAucune) => {
    const o = pc[cle];
    const mode = !o ? "meme" : (o.shape === "aucune" ? "aucune" : "autre");
    return `
      <div class="pad-detail-row" style="display:flex; gap:6px; align-items:flex-end; margin-top:6px; flex-wrap:wrap;">
        <label style="min-width:120px; font-size:11px;">${titre}<br>
          <select data-pc="${cle}" data-k="mode">
            <option value="meme" ${mode === "meme" ? "selected" : ""}>Même forme</option>
            <option value="autre" ${mode === "autre" ? "selected" : ""}>Autre forme</option>
            ${avecAucune ? `<option value="aucune" ${mode === "aucune" ? "selected" : ""}>Aucune pastille</option>` : ""}
          </select></label>
        ${mode === "autre" ? `
          <label style="font-size:11px;">Forme<br><select data-pc="${cle}" data-k="shape">
            ${Object.keys(FORMES_PAD_LIB).map(k => `<option value="${k}" ${o.shape === k ? "selected" : ""}>${FORMES_PAD_LIB[k]}</option>`).join("")}
          </select></label>
          <label style="font-size:11px;">W<br><input type="number" step="0.05" min="0.05" data-pc="${cle}" data-k="w" value="${n(o.w)}" style="width:62px;"></label>
          <label style="font-size:11px;">H<br><input type="number" step="0.05" min="0.05" data-pc="${cle}" data-k="h" value="${n(o.h)}" style="width:62px;"></label>` : ""}
      </div>`;
  };
  cont.innerHTML = `
    <div style="font-weight:600; font-size:12px; margin-bottom:4px;">Pastille ${esc(p.n)} — masque, pâte${th ? " et forme par couche" : ""}</div>
    <div class="pad-detail-row" style="display:flex; gap:6px; align-items:flex-end; flex-wrap:wrap;">
      <label style="min-width:150px; font-size:11px;">Masque (vernis)<br><select id="padMaskMode">
        <option value="regle" ${mMode === "regle" ? "selected" : ""}>Règle de la carte</option>
        <option value="propre" ${mMode === "propre" ? "selected" : ""}>Marge propre</option>
        <option value="aucun" ${mMode === "aucun" ? "selected" : ""}>Recouverte de vernis</option>
      </select></label>
      ${mMode === "propre" ? `<label style="font-size:11px;">Marge (mm)<br><input type="number" step="0.01" id="padMaskV" value="${n(p.mask)}" style="width:70px;"></label>` : ""}
    </div>
    ${th ? `<div style="font-size:11px; color:var(--txt-dim); margin-top:6px;">Traversante : pas de pâte au pochoir.</div>` : `
    <div class="pad-detail-row" style="display:flex; gap:6px; align-items:flex-end; margin-top:6px; flex-wrap:wrap;">
      <label style="min-width:150px; font-size:11px;">Pâte à braser<br><select id="padPasteMode">
        <option value="regle" ${pMode === "regle" ? "selected" : ""}>Règle de la carte</option>
        <option value="propre" ${pMode === "propre" ? "selected" : ""}>Réduction propre</option>
        <option value="aucune" ${pMode === "aucune" ? "selected" : ""}>Sans pâte</option>
      </select></label>
      ${pMode === "propre" ? `<label style="font-size:11px;">Réduction (mm)<br><input type="number" step="0.01" id="padPasteV" value="${n(p.paste)}" style="width:70px;"></label>` : ""}
    </div>`}
    ${th ? `
      <div style="font-size:11px; color:var(--txt-dim); margin-top:8px;">La forme du tableau vaut pour le dessus et pour les couches marquées « Même forme ».</div>
      ${ligneCouche("int", "Couches internes", true)}
      ${ligneCouche("bas", "Dessous", false)}` : ""}
    <div style="font-size:11px; color:var(--txt-dim); margin-top:8px;">Marge positive : le vernis s'ouvre au-delà de la pastille. Réduction positive : la pâte est plus petite que la pastille.</div>
  `;
  const avant = () => { editeurHistoriquePush(); };
  const apres = () => { rendreDetailPad(); if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render(); };
  const mm = document.getElementById("padMaskMode");
  if (mm) mm.onchange = () => {
    avant();
    delete p.mask; delete p.noMask;
    if (mm.value === "aucun") p.noMask = true;
    else if (mm.value === "propre") p.mask = 0.05;
    apres();
  };
  const mv = document.getElementById("padMaskV");
  if (mv) mv.onchange = () => { avant(); const v = parseFloat(mv.value); p.mask = isFinite(v) ? Math.max(-5, Math.min(5, v)) : 0; apres(); };
  const pm = document.getElementById("padPasteMode");
  if (pm) pm.onchange = () => {
    avant();
    delete p.paste; delete p.noPaste;
    if (pm.value === "aucune") p.noPaste = true;
    else if (pm.value === "propre") p.paste = 0.05;
    apres();
  };
  const pv = document.getElementById("padPasteV");
  if (pv) pv.onchange = () => { avant(); const v = parseFloat(pv.value); p.paste = isFinite(v) ? Math.max(-5, Math.min(5, v)) : 0; apres(); };
  cont.querySelectorAll("[data-pc]").forEach(el => {
    el.onchange = () => {
      avant();
      const cle = el.getAttribute("data-pc"), k = el.getAttribute("data-k");
      const pcN = Object.assign({}, p.parCouche || {});
      if (k === "mode") {
        if (el.value === "meme") delete pcN[cle];
        else if (el.value === "aucune") pcN[cle] = {shape: "aucune"};
        else pcN[cle] = {shape: p.shape === "circ" ? "circ" : (p.shape || "circ"), w: p.w || 1, h: p.h || 1};
      } else if (pcN[cle]) {
        const o = Object.assign({}, pcN[cle]);
        if (k === "shape") o.shape = el.value;
        else { const v = parseFloat(el.value); if (isFinite(v) && v >= 0.05) o[k] = v; }
        pcN[cle] = o;
      }
      if (Object.keys(pcN).length) p.parCouche = pcN; else delete p.parCouche;
      apres();
    };
  });
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
          <input id="edFpNom" value="${esc(data.name || '')}">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Boîtier (Package)</label>
            <input id="edFpPkg" value="${esc(data.pkg || '')}">
          </div>
          <div class="form-group">
            <label>Style</label>
            <input id="edFpStyle" value="${esc(data.style || 'sop')}" placeholder="chip, row, dip, sop, quad, bga">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Pitch / Pas (mm)</label>
            <input type="number" step="0.01" id="edFpPitch" value="${+(data.pitch || 0) || 0}">
          </div>
          <div class="form-group">
            <label>Nombre de broches</label>
            <input type="number" id="edFpPins" value="${+(data.pins || (data.pads ? data.pads.length : 0)) || 0}">
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edFpDesc" rows="2">${esc(data.description || '')}</textarea>
        </div>
        <div style="border-top:1px solid var(--border); padding-top:10px;">
          <label style="font-weight:600; font-size:11.5px; color:var(--txt);">Corps sérigraphie (mm)</label>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-top:6px;">
            <div class="form-group"><label>X1</label><input type="number" step="0.05" id="edBodyX1" value="${+(data.body ? data.body.x1 : -1) || 0}"></div>
            <div class="form-group"><label>Y1</label><input type="number" step="0.05" id="edBodyY1" value="${+(data.body ? data.body.y1 : -1) || 0}"></div>
            <div class="form-group"><label>X2</label><input type="number" step="0.05" id="edBodyX2" value="${+(data.body ? data.body.x2 : 1) || 0}"></div>
            <div class="form-group"><label>Y2</label><input type="number" step="0.05" id="edBodyY2" value="${+(data.body ? data.body.y2 : 1) || 0}"></div>
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
          <input id="edSchId" value="${esc(data.id || '')}">
        </div>
        <div class="form-group">
          <label>Nom du symbole</label>
          <input id="edSchNom" value="${esc(data.name || '')}">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Préfixe de référence</label>
            <input id="edSchPrefix" value="${esc(data.prefix || 'U')}" maxlength="5">
          </div>
          <div class="form-group">
            <label>Catégorie</label>
            <input id="edSchCat" value="${esc(data.category || 'Générique')}">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div class="form-group">
            <label>Valeur par défaut</label>
            <input id="edSchDefVal" value="${esc(data.defaultValue || '')}">
          </div>
          <div class="form-group">
            <label>Boîtier par défaut</label>
            <input id="edSchDefPkg" value="${esc(data.defaultPkg || '')}">
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
  d.style = (document.getElementById("edFpStyle")?.value || "sop").trim();
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
          <td style="width:38px;"><input type="text" data-field="n" value="${esc(p.n)}" style="text-align:center;"></td>
          <td><input type="number" step="0.05" data-field="x" value="${+(p.x) || 0}"></td>
          <td><input type="number" step="0.05" data-field="y" value="${+(p.y) || 0}"></td>
          <td><input type="number" step="0.05" data-field="w" value="${+(p.w || 1) || 0}"></td>
          <td><input type="number" step="0.05" data-field="h" value="${+(p.h || 1) || 0}"></td>
          <td style="width:55px;">
            <select data-field="shape">
              <option value="rect" ${p.shape === 'rect' ? 'selected' : ''}>Rect</option>
              <option value="circ" ${p.shape === 'circ' ? 'selected' : ''}>Rond</option>
              <option value="oval" ${p.shape === 'oval' ? 'selected' : ''}>Ovale</option>
            </select>
          </td>
          <td><input type="number" step="0.1" data-field="drill" value="${+(p.drill || 0) || 0}"></td>
          <td><input type="number" step="0.1" data-field="slot" value="${+(p.slot || 0) || 0}" title="Fente : longueur hors tout du perçage oblong (0 = rond)"></td>
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
              <th title="Longueur hors tout d'un perçage oblong, le long du grand côté (0 = rond)">Fente</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="tbodyPadsEditeur">${rowsHtml}</tbody>
        </table>
      </div>
      <div id="editeurPadDetail" style="margin-top:10px;"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin:12px 0 8px;">
        <span style="font-weight:600; font-size:12px;">Trous non métallisés (${(data.holes || []).length})</span>
        <button class="tb mini" onclick="editeurChangerOutil('trou')" title="Poser un trou au clic sur le plan">⊕ Poser un trou</button>
      </div>
      <table class="editable-items-table">
        <thead><tr><th>X</th><th>Y</th><th>Ø</th><th title="Longueur hors tout d'un trou oblong (0 = rond)">L</th><th title="Angle de la longueur, en degrés">Rot</th><th></th></tr></thead>
        <tbody id="tbodyTrousEditeur">${(data.holes || []).map((t, idx) => `
          <tr data-idx="${idx}">
            <td><input type="number" step="0.05" data-field="x" value="${+t.x || 0}"></td>
            <td><input type="number" step="0.05" data-field="y" value="${+t.y || 0}"></td>
            <td><input type="number" step="0.05" min="0.4" max="30" data-field="d" value="${+t.d || 3.2}"></td>
            <td><input type="number" step="0.05" min="0" data-field="w" value="${+t.w || 0}"></td>
            <td><input type="number" step="15" data-field="rot" value="${+t.rot || 0}"></td>
            <td style="width:30px; text-align:center;">
              <button class="tb mini" style="color:var(--red); padding:1px 5px;" onclick="editeurSupprimerTrou(${idx})" title="Supprimer">✕</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    `;
    rendreDetailPad();
    const tbodyTrous = document.getElementById("tbodyTrousEditeur");
    if (tbodyTrous) {
      tbodyTrous.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("focus", () => { editeurInputSessionPushed = false; });
        inp.addEventListener("input", e => {
          editeurInputBeforeChange();
          const idx = parseInt(e.target.closest("tr").getAttribute("data-idx"), 10);
          const t = EDITEUR_LIB.data.holes && EDITEUR_LIB.data.holes[idx];
          const v = parseFloat(e.target.value);
          if (!t || !Number.isFinite(v)) return;
          // le Ø suit les bornes de l'éditeur PCB (0,4 à 30 mm), qui le ramènerait sinon à la lecture
          const fld = e.target.getAttribute("data-field");
          t[fld] = fld === "d" ? Math.min(30, Math.max(0.4, v)) : v;
          if ((fld === "w" || fld === "rot") && !v) delete t[fld];   // 0 = trou rond / sans angle
          if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
        });
      });
    }

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
            if (fld === "slot" && !(val > 0)) delete EDITEUR_LIB.data.pads[idx].slot;   // 0 = perçage rond
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
          <td style="width:45px;"><input type="text" data-field="n" value="${esc(pn)}" style="text-align:center;"></td>
          <td><input type="number" step="5" data-field="x" value="${+(px) || 0}"></td>
          <td><input type="number" step="5" data-field="y" value="${+(py) || 0}"></td>
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

function editeurSupprimerTrou(idx) {
  if (!Array.isArray(EDITEUR_LIB.data.holes)) return;
  EDITEUR_LIB.trouSel = -1;
  editeurHistoriquePush();
  EDITEUR_LIB.data.holes.splice(idx, 1);
  if (!EDITEUR_LIB.data.holes.length) delete EDITEUR_LIB.data.holes;
  remplirElementsEditeur();
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render();
}

// Suppr : efface le trou sélectionné (rend vrai s'il y en avait un)
function editeurSupprimerSelection() {
  const i = EDITEUR_LIB.trouSel;
  if (!(i >= 0) || !Array.isArray(EDITEUR_LIB.data.holes) || !EDITEUR_LIB.data.holes[i]) return false;
  EDITEUR_LIB.trouSel = -1;
  editeurSupprimerTrou(i);
  return true;
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
          <td><input type="number" step="0.05" data-field="x1" value="${+(l.x1 !== undefined ? l.x1 : 0) || 0}"></td>
          <td><input type="number" step="0.05" data-field="y1" value="${+(l.y1 !== undefined ? l.y1 : 0) || 0}"></td>
          <td><input type="number" step="0.05" data-field="x2" value="${+(l.x2 !== undefined ? l.x2 : 0) || 0}"></td>
          <td><input type="number" step="0.05" data-field="y2" value="${+(l.y2 !== undefined ? l.y2 : 0) || 0}"></td>
          <td style="width:55px;"><input type="number" step="0.02" data-field="width" value="${+(l.width || 0.15) || 0}"></td>
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
          <td><input type="number" step="5" data-field="x1" value="${+(p.x1 !== undefined ? p.x1 : 0) || 0}"></td>
          <td><input type="number" step="5" data-field="y1" value="${+(p.y1 !== undefined ? p.y1 : 0) || 0}"></td>
          <td><input type="number" step="5" data-field="x2" value="${+(p.x2 !== undefined ? p.x2 : 0) || 0}"></td>
          <td><input type="number" step="5" data-field="y2" value="${+(p.y2 !== undefined ? p.y2 : 0) || 0}"></td>
          <td style="width:55px;"><input type="number" step="0.5" data-field="width" value="${+(p.width || 2.5) || 0}"></td>
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

  /* déjà là : on garde ce qui a été saisi (remplirFormulaireEditeur repasse ici après chaque génération) */
  if (isPcb && document.getElementById("genIpcFamille")) return;
  if (isPcb) {
    /* Le générateur IPC-7351B de la LIB (commun/composants-lib.js), le même que celui de
       Claude (lib_empreinte_generer) : les cotes min / max de la datasheet → l'empreinte. */
    const familles = Object.keys(COMPOSANTS_LIB.CHAMPS);
    cont.innerHTML = `
      <div class="generator-card">
        <h4>📐 Empreinte IPC-7351B, depuis les cotes de la datasheet</h4>
        <div class="generator-grid">
          <div class="form-group"><label>Famille</label><select id="genIpcFamille" onchange="editeurIpcChamps()">
            ${familles.map(f => `<option value="${f}">${f.toUpperCase()}</option>`).join("")}</select></div>
          <div class="form-group"><label>Densité</label><select id="genIpcDensite">
            <option value="N">N — nominale</option><option value="M">M — large</option><option value="L">L — serrée</option></select></div>
          <div class="form-group"><label>Nom (facultatif)</label><input type="text" id="genIpcNom" placeholder="nom calculé"></div>
        </div>
        <div class="generator-grid" id="genIpcChamps"></div>
        <small style="color:var(--txt-dim);">Cotes en mm : « 5,8 6,2 » pour min et max, « 3,9 x 4,9 » pour largeur × longueur.
          Un champ vide prend la cote JEDEC courante, à vérifier.</small>
        <button class="tb primary mini" style="align-self:flex-start;" onclick="editeurGenererIpc()">Générer</button>
        <div id="genIpcResultat"></div>
      </div>
    `;
    editeurIpcChamps();
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

/* Les champs de la famille choisie (COMPOSANTS_LIB.CHAMPS) */
function editeurIpcChamps() {
  const cont = document.getElementById("genIpcChamps");
  if (!cont) return;
  const f = document.getElementById("genIpcFamille")?.value || "chip";
  cont.innerHTML = (COMPOSANTS_LIB.CHAMPS[f] || []).map(([cle, lib, genre, liste]) =>
    `<div class="form-group"><label>${esc(lib)}</label>` + (genre === "choix"
      ? `<select id="genIpc_${cle}"><option value="">—</option>${liste.map(v => `<option>${esc(v)}</option>`).join("")}</select>`
      : `<input type="text" id="genIpc_${cle}" placeholder="${genre === "cote" ? "min max" : genre === "paire" ? "l x L" : ""}">`) +
    `</div>`).join("");
  const res = document.getElementById("genIpcResultat");
  if (res) res.innerHTML = "";
}

/* Génère l'empreinte et la pose dans l'éditeur, sans rien enregistrer : on la relit, on la
   nomme, puis « Enregistrer » la contrôle et l'écrit comme toute autre. */
function editeurGenererIpc() {
  const val = id => document.getElementById(id)?.value || "";
  const f = val("genIpcFamille") || "chip";
  const textes = {};
  for (const [cle] of COMPOSANTS_LIB.CHAMPS[f] || []) textes[cle] = val("genIpc_" + cle);
  const lu = COMPOSANTS_LIB.lireParametres(f, textes);
  const res = document.getElementById("genIpcResultat");
  const montrer = (erreurs, remarques, cotes) => {
    if (!res) return;
    res.innerHTML = erreurs.map(e => `<div style="color:var(--err,#e8564a);">✗ ${esc(e)}</div>`).join("") +
      remarques.map(r => `<div style="color:var(--txt-dim);">• ${esc(r)}</div>`).join("") +
      (cotes ? `<div style="color:var(--txt-dim);">IPC-7351B : Z ${+cotes.Z} · G ${+cotes.G} · X ${+cotes.X} mm</div>` : "");
  };
  if (lu.erreurs.length) { montrer(lu.erreurs, []); return false; }
  lu.parametres.densite = val("genIpcDensite") || "N";
  const nom = val("genIpcNom").trim();
  if (nom) lu.parametres.nom = nom;
  const r = COMPOSANTS_LIB.genererEmpreinte(f, lu.parametres);
  if (!r.empreinte || r.erreurs.length) { montrer(r.erreurs, r.remarques || []); return false; }
  editeurHistoriquePush();
  // le même objet : le moteur de rendu le tient
  const d = EDITEUR_LIB.data;
  for (const k of Object.keys(d)) delete d[k];
  Object.assign(d, JSON.parse(JSON.stringify(r.empreinte)));
  if (EDITEUR_LIB.estNouveau) {
    const inp = document.getElementById("editeurNomFichier");
    if (inp) inp.value = d.name + ".json";
  }
  remplirFormulaireEditeur();
  montrer([], r.remarques, r.cotes);
  if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.autoFit();
  return true;
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

  // les contrôles de la création par le MCP (commun/composants-lib.js) : montrés, l'utilisateur décide
  if (EDITEUR_LIB.type === "pcb" && typeof COMPOSANTS_LIB !== "undefined") {
    const v = COMPOSANTS_LIB.verifierEmpreinte(EDITEUR_LIB.data, nom.replace(/\.json$/i, ".json"));
    if (v.erreurs.length && !confirm("Cette empreinte ne passe pas les contrôles :\n• " +
        v.erreurs.slice(0, 8).join("\n• ") + "\n\nEnregistrer quand même ?")) return;
  }

  const type = EDITEUR_LIB.type;
  /* un autre fichier de la LIB du même nom : on ne l'écrase pas sans le demander (un nom
     généré, « SOIC-8 », « 0603 », y est souvent déjà) */
  const existe = Array.isArray(LIB_STATE.fichiers[type]) && LIB_STATE.fichiers[type].includes(nom);
  if (existe && (EDITEUR_LIB.estNouveau || nom !== EDITEUR_LIB.nomFichier) &&
      !confirm(`${nom} existe déjà dans la LIB. Le remplacer ?`)) return;
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

    // Suppr / Retour arrière hors d'un champ : efface le trou sélectionné
    if ((e.key === "Delete" || e.key === "Backspace") && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) {
      if (editeurSupprimerSelection()) { e.preventDefault(); if (EDITEUR_LIB.renderer) EDITEUR_LIB.renderer.render(); }
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
window.editeurIpcChamps = editeurIpcChamps;
window.editeurGenererIpc = editeurGenererIpc;
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



