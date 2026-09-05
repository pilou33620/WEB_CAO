"use strict";
/* =============================================================================
   editeur-schematique — 22-recherche-composants.js
   Enrichissement automatique des composants placés sur le schéma :
   - Recherche en ligne (jlc_search) via la passerelle locale
   - Recoupement distributeurs automatique (JLCPCB, Mouser, DigiKey)
   - Sélection à la carte des caractéristiques techniques (cases à cocher)
   - Téléchargement sécurisé des datasheets (PDF) dans le dossier du projet
   - Propagation par lot facultative aux composants identiques du schéma
   ============================================================================= */

const CR_ETAT = {
  open: false,
  el: null,
  query: "",
  candidates: [],
  selectedCand: null,
  partDetails: null,
  mouserData: null,
  digikeyData: null,
  pinoutData: null,
  detectedConflicts: [],
  loadingSearch: false,
  loadingDetails: false,
  identicalCount: 0
};

/* ---------- Détection de conflits & réalignement assisté ---------- */
function crIsPower(s) {
  return /(\+?3[V\.]?3V?|\+?5V?0?|\+?12V?|\+?1[V\.]?8V?|\+?2[V\.]?5V?|VCC|VDD|VIN|VOUT|VBUS|VBAT|\+V)/i.test(String(s || ""));
}

function crIsGround(s) {
  return /^(GND|VSS|0V|AGND|DGND|PGND|VSSA|VSSD|MASSE)/i.test(String(s || "").trim());
}

function crNormSig(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function crDetecterConflitsCablage(el, pinoutData) {
  if (!el || !pinoutData || !Array.isArray(pinoutData) || !pinoutData.length) return [];
  if (typeof allPins !== "function" || typeof nets !== "function" || typeof S === "undefined" || !Array.isArray(S.wires)) return [];

  const pins = allPins(el);
  const nInfo = nets();
  const pinInfos = [];

  for (let i = 0; i < pins.length; i++) {
    const pt = pins[i];
    const k = (typeof key === "function") ? key(pt.x, pt.y) : (pt.x + "," + pt.y);
    const nObj = nInfo && nInfo.byPoint ? nInfo.byPoint.get(k) : null;
    const netName = (nObj && nObj.name) ? String(nObj.name).trim() : "";
    const isAuto = !nObj || !nObj.named || (typeof NET_AUTO !== "undefined" && NET_AUTO.test(netName));

    const hasWire = S.wires.some(w => (w.x1 === pt.x && w.y1 === pt.y) ||
                                      (w.x2 === pt.x && w.y2 === pt.y) ||
                                      (typeof insideSeg === "function" && insideSeg(pt, w)));

    const pinNum = i + 1;
    const pData = pinoutData.find(p => parseInt(p.number, 10) === pinNum);
    const newPinName = pData && pData.name ? String(pData.name).trim() : "";

    pinInfos.push({
      idx: i,
      pinNum: pinNum,
      pt: pt,
      netName: netName,
      isAuto: isAuto,
      hasWire: hasWire,
      newPinName: newPinName,
      normNet: crNormSig(netName),
      normNewPin: crNormSig(newPinName)
    });
  }

  const suggestions = [];
  const handled = new Set();

  // 1. Détection des permutations par paires (Swaps)
  for (let i = 0; i < pinInfos.length; i++) {
    if (handled.has(i)) continue;
    const pi = pinInfos[i];
    if (!pi.hasWire || pi.isAuto || !pi.newPinName) continue;

    for (let j = i + 1; j < pinInfos.length; j++) {
      if (handled.has(j)) continue;
      const pj = pinInfos[j];
      if (!pj.hasWire || pj.isAuto || !pj.newPinName) continue;

      let isSwap = false;
      let critique = false;
      let reason = "";

      // Cas A : Inversion critique Alimentation ⇄ Masse
      if ((crIsPower(pi.netName) && crIsGround(pi.newPinName) && crIsGround(pj.netName) && crIsPower(pj.newPinName)) ||
          (crIsGround(pi.netName) && crIsPower(pi.newPinName) && crIsPower(pj.netName) && crIsGround(pj.newPinName))) {
        isSwap = true;
        critique = true;
        reason = "Inversion critique Alimentation ⇄ Masse (" + pi.netName + " et " + pj.netName + ")";
      }
      // Cas B : Inversion de paires de bus (SDA ⇄ SCL, TX ⇄ RX, D+ ⇄ D-)
      else if ((/SDA/i.test(pi.netName) && /SCL/i.test(pi.newPinName) && /SCL/i.test(pj.netName) && /SDA/i.test(pj.newPinName)) ||
               (/SCL/i.test(pi.netName) && /SDA/i.test(pi.newPinName) && /SDA/i.test(pj.netName) && /SCL/i.test(pj.newPinName))) {
        isSwap = true;
        reason = "Inversion de bus I2C (SDA ⇄ SCL)";
      } else if ((/TX/i.test(pi.netName) && /RX/i.test(pi.newPinName) && /RX/i.test(pj.netName) && /TX/i.test(pj.newPinName)) ||
                 (/RX/i.test(pi.netName) && /TX/i.test(pi.newPinName) && /TX/i.test(pj.netName) && /RX/i.test(pj.newPinName))) {
        isSwap = true;
        reason = "Inversion de signaux UART (TX ⇄ RX)";
      } else if (((/D\+|DP/i.test(pi.netName)) && (/D\-|DM/i.test(pi.newPinName)) && (/D\-|DM/i.test(pj.netName)) && (/D\+|DP/i.test(pj.newPinName))) ||
                 ((/D\-|DM/i.test(pi.netName)) && (/D\+|DP/i.test(pi.newPinName)) && (/D\+|DP/i.test(pj.netName)) && (/D\-|DM/i.test(pj.newPinName)))) {
        isSwap = true;
        reason = "Inversion de signaux USB (D+ ⇄ D-)";
      }
      // Cas C : Noms croisés exacts ou normalisés
      else if (pi.normNet && pj.normNet && pi.normNet === pj.normNewPin && pj.normNet === pi.normNewPin) {
        isSwap = true;
        reason = "Inversion de signaux (" + pi.netName + " ⇄ " + pj.netName + ")";
      }

      if (isSwap) {
        handled.add(i);
        handled.add(j);
        suggestions.push({
          id: "swap_" + pi.pinNum + "_" + pj.pinNum,
          type: "swap",
          pinA: i,
          pinB: j,
          numA: pi.pinNum,
          numB: pj.pinNum,
          nomA: pi.newPinName,
          nomB: pj.newPinName,
          netA: pi.netName,
          netB: pj.netName,
          titre: "Inversion : Broche " + pi.pinNum + " (" + pi.newPinName + ") ⇄ Broche " + pj.pinNum + " (" + pj.newPinName + ")",
          desc: reason + " : permuter le fil « " + pi.netName + " » et le fil « " + pj.netName + " ».",
          critique: critique,
          checked: true
        });
        break;
      }
    }
  }

  // 2. Détection de déplacements simples (Move)
  for (let i = 0; i < pinInfos.length; i++) {
    if (handled.has(i)) continue;
    const pi = pinInfos[i];
    if (!pi.hasWire || pi.isAuto || !pi.newPinName) continue;

    if (pi.normNet !== pi.normNewPin) {
      const matchIdx = pinInfos.findIndex((pj, idx) => idx !== i && !handled.has(idx) && pj.normNewPin === pi.normNet);
      if (matchIdx >= 0) {
        const pj = pinInfos[matchIdx];
        handled.add(i);
        handled.add(matchIdx);
        suggestions.push({
          id: "move_" + pi.pinNum + "_" + pj.pinNum,
          type: "move",
          pinA: i,
          pinB: matchIdx,
          numA: pi.pinNum,
          numB: pj.pinNum,
          nomA: pi.newPinName,
          nomB: pj.newPinName,
          netA: pi.netName,
          titre: "Déplacement : Net « " + pi.netName + " » vers Broche " + pj.pinNum + " (" + pj.newPinName + ")",
          desc: "Le fil « " + pi.netName + " » est sur la broche " + pi.pinNum + " (" + (pi.newPinName || "?") + "). Il correspond à la broche " + pj.pinNum + " (" + pj.newPinName + ").",
          critique: false,
          checked: true
        });
      }
    }
  }

  return suggestions;
}

function crRealignerFilsBroches(el, actions) {
  if (!el || !actions || !Array.isArray(actions) || !actions.length) return 0;
  if (typeof allPins !== "function" || typeof S === "undefined" || !Array.isArray(S.wires)) return 0;

  const pins = allPins(el);
  let count = 0;

  for (const act of actions) {
    if (!act.checked) continue;
    const pA = pins[act.pinA];
    const pB = pins[act.pinB];
    if (!pA || !pB) continue;

    if (act.type === "swap") {
      const wiresA = S.wires.filter(w => (w.x1 === pA.x && w.y1 === pA.y) || (w.x2 === pA.x && w.y2 === pA.y));
      const wiresB = S.wires.filter(w => (w.x1 === pB.x && w.y1 === pB.y) || (w.x2 === pB.x && w.y2 === pB.y));

      for (const w of wiresA) {
        if (w.x1 === pA.x && w.y1 === pA.y) { w.x1 = pB.x; w.y1 = pB.y; }
        else if (w.x2 === pA.x && w.y2 === pA.y) { w.x2 = pB.x; w.y2 = pB.y; }
      }
      for (const w of wiresB) {
        if (w.x1 === pB.x && w.y1 === pB.y) { w.x1 = pA.x; w.y1 = pA.y; }
        else if (w.x2 === pB.x && w.y2 === pB.y) { w.x2 = pA.x; w.y2 = pA.y; }
      }
      count++;
    } else if (act.type === "move") {
      const wiresA = S.wires.filter(w => (w.x1 === pA.x && w.y1 === pA.y) || (w.x2 === pA.x && w.y2 === pA.y));
      for (const w of wiresA) {
        if (w.x1 === pA.x && w.y1 === pA.y) { w.x1 = pB.x; w.y1 = pB.y; }
        else if (w.x2 === pA.x && w.y2 === pA.y) { w.x2 = pB.x; w.y2 = pB.y; }
      }
      count++;
    }
  }

  if (count > 0) {
    if (typeof resolveSplits === "function") resolveSplits();
    if (typeof touchWires === "function") touchWires();
    if (typeof buildList === "function") buildList();
    if (typeof draw === "function") draw();
  }
  return count;
}

/* ---------- Helpers de formatage ---------- */
function crFmtEntier(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString("fr-FR");
}

function crFmtPrix(p, devise) {
  if (p === null || p === undefined || isNaN(p)) return "—";
  const d = devise || "$";
  return Number(p).toFixed(4).replace(/\.?0+$/, "") + " " + d;
}

function crEsc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- Appel vers la passerelle locale (/api/tool) ---------- */
async function crApiAppel(outil, args) {
  const resp = await fetch("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ name: outil, arguments: args || {} })
  });
  if (!resp.ok) {
    let msg = "HTTP " + resp.status;
    try {
      const j = await resp.json();
      if (j && (j.detail || j.message)) msg = j.detail || j.message;
    } catch (_) {}
    throw new Error(msg);
  }
  const res = await resp.json();
  return res ? res.data : null;
}

/* ---------- Déduction de requête automatique depuis le composant ---------- */
function crDevinerRequete(el) {
  if (!el) return "";
  const def = typeof defOf === "function" ? defOf(el.type) : {};
  const val = String(el.value || "").trim();
  const pkg = String(el.pkg || "").trim();

  // Circuits intégrés / puces / régulateurs ou références explicites
  if (el.type === "ic" || el.type === "reg" || el.type === "opt" || /^[a-zA-Z]{2,}\d+/i.test(val)) {
    return val;
  }

  // Composants passifs ou discrets standards
  let suffixe = "";
  const p = (def.p || "").toUpperCase();
  if (p === "R" || el.type === "r") suffixe = "resistor";
  else if (p === "C" || el.type === "c" || el.type === "cpol") suffixe = "capacitor";
  else if (p === "L" || el.type === "l") suffixe = "inductor";
  else if (p === "D" || el.type === "d") suffixe = "diode";
  else if (p === "Q" || el.type === "npn" || el.type === "pnp") suffixe = "transistor";

  const morceaux = [];
  if (val) morceaux.push(val);
  if (pkg && pkg !== "xx") morceaux.push(pkg);
  if (suffixe) morceaux.push(suffixe);

  return morceaux.join(" ") || val;
}

/* ---------- Construction de la fenêtre modale ---------- */
function crBuildModal() {
  if (document.getElementById("crModal")) return;

  const d = document.createElement("div");
  d.id = "crModal";
  d.className = "modal";
  d.hidden = true;

  d.innerHTML =
    '<div class="modal-box cr-box">' +
      '<header class="modal-head">' +
        '<span class="modal-title" id="crTitle">🔍 Enrichissement composant</span>' +
        '<button class="pnl-btn" id="crClose" title="Fermer (Échap)">✕</button>' +
      '</header>' +
      '<div class="modal-body cr-body">' +
        '<!-- Colonne gauche : Recherche & Liste des candidats -->' +
        '<div class="cr-left">' +
          '<div class="cr-search-bar">' +
            '<input id="crInpSearch" type="text" placeholder="Ex: 10k 0603 resistor, LM358, STM32...">' +
            '<button class="tb on" id="crBtnRech">Chercher</button>' +
          '</div>' +
          '<div class="cr-filter-bar">' +
            '<label><input type="checkbox" id="crFilterBasic"> Basic / Sans frais d’abord</label>' +
            '<button type="button" id="crBtnDistribRech" class="cr-btn-link" style="margin-left:auto; font-size:11px; color:#5cdbd3;" title="Forcer la recherche directe chez Mouser & DigiKey">Mouser / DigiKey ↗</button>' +
            '<span id="crCount" class="cr-count" style="margin-left:8px;"></span>' +
          '</div>' +
          '<div id="crList" class="cr-list"></div>' +
        '</div>' +
        '<!-- Colonne droite : Fiche détaillée, Comparatif distributeurs & Attributs -->' +
        '<div class="cr-right" id="crDetailsPanel">' +
          '<div class="cr-placeholder">Recherchez ou sélectionnez un composant à gauche pour afficher ses détails techniques.</div>' +
        '</div>' +
      '</div>' +
      '<footer class="cr-foot">' +
        '<div id="crBatchWrap" class="cr-batch-wrap"></div>' +
        '<div class="cr-foot-acts">' +
          '<button class="tb" id="crBtnCancel">Annuler</button>' +
          '<button class="tb on" id="crBtnApply" disabled style="font-weight:600; background:var(--blue); color:#fff;">✓ Valider et enrichir</button>' +
        '</div>' +
      '</footer>' +
    '</div>';

  document.body.appendChild(d);

  // Événements de base
  document.getElementById("crClose").onclick = crFermer;
  document.getElementById("crBtnCancel").onclick = crFermer;
  document.getElementById("crBtnRech").onclick = () => crLancerRecherche();
  document.getElementById("crInpSearch").onkeydown = (e) => {
    if (e.key === "Enter") crLancerRecherche();
  };
  document.getElementById("crFilterBasic").onchange = () => crTrierEtAfficherCandidats();
  const bDist = document.getElementById("crBtnDistribRech");
  if (bDist) bDist.onclick = () => crLancerRecherche(undefined, true);
  document.getElementById("crBtnApply").onclick = crAppliquerAuComposant;

  // Fermeture sur clic arrière-plan ou Échap
  d.onclick = (e) => {
    if (e.target === d) crFermer();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && CR_ETAT.open) crFermer();
  });
}

/* ---------- Ouverture de la modale ---------- */
function crOuvrir(el) {
  if (!el) return;
  crBuildModal();

  CR_ETAT.open = true;
  CR_ETAT.el = el;
  CR_ETAT.candidates = [];
  CR_ETAT.selectedCand = null;
  CR_ETAT.partDetails = null;
  CR_ETAT.mouserData = null;
  CR_ETAT.digikeyData = null;
  CR_ETAT.pinoutData = null;

  // Calcul du nombre de composants identiques sur le schéma
  const src = (typeof S !== "undefined" && S.comps) ? S.comps : [];
  CR_ETAT.identicalCount = src.filter(c => c !== el && c.type === el.type && c.value === el.value).length;

  const def = typeof defOf === "function" ? defOf(el.type) : {};
  const refNom = el.ref || def.n || "Composant";
  document.getElementById("crTitle").textContent = "🔍 Enrichissement composant — " + refNom + (el.value ? " (" + el.value + ")" : "");

  const initQ = crDevinerRequete(el);
  const inp = document.getElementById("crInpSearch");
  inp.value = initQ;

  const m = document.getElementById("crModal");
  m.hidden = false;
  inp.focus();
  inp.select();

  // Lancement automatique de la recherche
  if (initQ) {
    crLancerRecherche(initQ);
  } else {
    document.getElementById("crList").innerHTML = '<div class="cr-placeholder">Entrez un terme de recherche ci-dessus.</div>';
    document.getElementById("crDetailsPanel").innerHTML = '<div class="cr-placeholder">Aucune sélection.</div>';
  }
}

function crFermer() {
  const m = document.getElementById("crModal");
  if (m) m.hidden = true;
  CR_ETAT.open = false;
}

/* ---------- Recherche de secours multi-distributeurs (Mouser & DigiKey) ---------- */
async function crRechercherDistributeurs(queryRef) {
  const q = String(queryRef || "").trim();
  if (!q) return [];

  // Déterminer la référence à chercher (enlever les mots généraux s'il y en a)
  let cleanRef = q;
  const parts = q.split(/\s+/);
  if (parts.length > 1) {
    const codePart = parts.find(p => /[A-Za-z]/.test(p) && /\d/.test(p));
    cleanRef = codePart || parts[0];
  }

  const [mouserRes, digikeyRes] = await Promise.all([
    crApiAppel("mouser_get_part", { part_number: cleanRef }).catch(e => {
      console.warn("Mouser recherche error:", e);
      return null;
    }),
    crApiAppel("digikey_get_part", { product_number: cleanRef }).catch(e => {
      console.warn("DigiKey recherche error:", e);
      return null;
    })
  ]);

  const mResults = (mouserRes && mouserRes.results && Array.isArray(mouserRes.results)) ? mouserRes.results : [];
  const dkResults = (digikeyRes && digikeyRes.results && Array.isArray(digikeyRes.results)) ? digikeyRes.results : [];

  if (!mResults.length && !dkResults.length) return [];

  const candsMap = new Map();

  mResults.forEach(m => {
    const mpn = m.mfr_part_number || m.part_number || cleanRef;
    const k = mpn.toUpperCase();
    const pkg = m.package || (m.parameters && (m.parameters["Package / Case"] || m.parameters["Boîtier / Empreinte"])) || "";
    let ds = m.datasheet_url || "";
    if (ds && ds.startsWith("//")) ds = "https:" + ds;

    candsMap.set(k, {
      source: "mouser",
      model: mpn,
      manufacturer: m.manufacturer || "",
      package: pkg,
      stock: m.stock || 0,
      price: m.price || 0,
      currency: m.currency || "USD",
      description: m.description || "",
      datasheet: ds,
      mouserData: m,
      digikeyData: null,
      parameters: { ...(m.parameters || {}) }
    });
  });

  dkResults.forEach(dk => {
    const mpn = dk.mfr_part_number || dk.part_number || cleanRef;
    const k = mpn.toUpperCase();
    const pkg = dk.package || (dk.parameters && (dk.parameters["Package / Case"] || dk.parameters["Boîtier / Empreinte"])) || "";
    let ds = dk.datasheet_url || "";
    if (ds && ds.startsWith("//")) ds = "https:" + ds;

    if (candsMap.has(k)) {
      const cand = candsMap.get(k);
      cand.digikeyData = dk;
      cand.source = "distrib";
      if (!cand.manufacturer && dk.manufacturer) cand.manufacturer = dk.manufacturer;
      if (!cand.package && pkg) cand.package = pkg;
      if (!cand.stock && dk.stock) cand.stock = dk.stock;
      if (!cand.price && dk.price) cand.price = dk.price;
      if (!cand.datasheet && ds) cand.datasheet = ds;
      cand.parameters = { ...(dk.parameters || {}), ...(cand.parameters || {}) };
    } else {
      candsMap.set(k, {
        source: "digikey",
        model: mpn,
        manufacturer: dk.manufacturer || "",
        package: pkg,
        stock: dk.stock || 0,
        price: dk.price || 0,
        currency: dk.currency || "USD",
        description: dk.description || "",
        datasheet: ds,
        mouserData: null,
        digikeyData: dk,
        parameters: { ...(dk.parameters || {}) }
      });
    }
  });

  return Array.from(candsMap.values());
}

/* ---------- Lancement de la recherche JLCPCB & Distributeurs ---------- */
async function crLancerRecherche(overrideQuery, forceDistribOnly) {
  const q = overrideQuery !== undefined ? overrideQuery : document.getElementById("crInpSearch").value.trim();
  if (!q) return;

  CR_ETAT.query = q;
  CR_ETAT.loadingSearch = true;
  const listEl = document.getElementById("crList");
  listEl.innerHTML = '<div class="cr-loading"><span class="cr-spinner"></span> Recherche en cours pour « ' + crEsc(q) + ' »...</div>';
  document.getElementById("crCount").textContent = "";
  document.getElementById("crBtnApply").disabled = true;

  try {
    let rawResults = [];
    if (!forceDistribOnly) {
      const res = await crApiAppel("jlc_search", { query: q, limit: 16 }).catch(e => {
        console.warn("Erreur jlc_search:", e);
        return { results: [] };
      });
      rawResults = (res && res.results) || (Array.isArray(res) ? res : []);
    }

    // Si aucun résultat chez JLCPCB (ou si recherche distributeurs explicite), bascule automatique sur Mouser / DigiKey
    if (!rawResults.length) {
      listEl.innerHTML =
        '<div class="cr-loading"><span class="cr-spinner"></span> ' +
        (forceDistribOnly ? 'Recherche chez Mouser & DigiKey...' : 'Non trouvé chez JLCPCB. Recherche automatique chez Mouser & DigiKey...') +
        '</div>';

      const distribRes = await crRechercherDistributeurs(q);
      if (distribRes && distribRes.length > 0) {
        rawResults = distribRes;
      }
    }

    CR_ETAT.candidates = rawResults;
    CR_ETAT.loadingSearch = false;

    if (!rawResults.length) {
      listEl.innerHTML =
        '<div class="cr-placeholder">' +
          'Aucun composant trouvé pour « ' + crEsc(q) + ' » chez JLCPCB, Mouser ou DigiKey.<br><br>' +
          '<i>Conseil : Vérifiez la référence exacte du fabricant (MPN, ex: IRA-S400ST01A01, STM32F103, LM358...).</i>' +
        '</div>';
      document.getElementById("crDetailsPanel").innerHTML = '<div class="cr-placeholder">Aucun résultat.</div>';
      return;
    }

    crTrierEtAfficherCandidats(true);
  } catch (err) {
    CR_ETAT.loadingSearch = false;
    listEl.innerHTML = '<div class="cr-error">Erreur de recherche : ' + crEsc(err.message || err) + '</div>';
  }
}

/* ---------- Tri et affichage des candidats ---------- */
function crTrierEtAfficherCandidats(autoSelectPremier) {
  const listEl = document.getElementById("crList");
  const filterBasic = document.getElementById("crFilterBasic").checked;

  let items = [...CR_ETAT.candidates];

  // Filtre Basic si demandé (ne masque pas les distributeurs tiers s'il n'y a pas de pièce basic)
  if (filterBasic) {
    const bas = items.filter(c => (c.library_type === "basic" || c.preferred));
    if (bas.length > 0) items = bas;
  }

  // Tri de pertinence : Basic / Preferred en premier, puis stock décroissant
  items.sort((a, b) => {
    const aBasic = (a.library_type === "basic" || a.preferred) ? 1 : 0;
    const bBasic = (b.library_type === "basic" || b.preferred) ? 1 : 0;
    if (aBasic !== bBasic) return bBasic - aBasic;
    return (b.stock || 0) - (a.stock || 0);
  });

  document.getElementById("crCount").textContent = items.length + " trouvé(s)";

  let html = "";
  items.forEach((c, idx) => {
    const isBasic = c.library_type === "basic" || c.preferred;
    const isRec = idx === 0; // Le premier après tri est le recommandé
    const selClass = (CR_ETAT.selectedCand && (CR_ETAT.selectedCand.lcsc ? CR_ETAT.selectedCand.lcsc === c.lcsc : CR_ETAT.selectedCand.model === c.model)) ? " active" : "";

    let badgeSource = "";
    if (c.source === "mouser") badgeSource = '<span class="cr-badge cr-badge-mouser">Mouser</span>';
    else if (c.source === "digikey") badgeSource = '<span class="cr-badge cr-badge-digikey">DigiKey</span>';
    else if (c.source === "distrib") badgeSource = '<span class="cr-badge cr-badge-distrib">Mouser + DigiKey</span>';

    const refTag = c.lcsc || (c.mouserData && c.mouserData.part_number) || (c.digikeyData && c.digikeyData.part_number) || c.model;

    html +=
      '<div class="cr-card' + selClass + '" data-lcsc="' + crEsc(c.lcsc || "") + '" data-idx="' + idx + '">' +
        '<div class="cr-card-head">' +
          '<b class="cr-mpn">' + crEsc(c.model || c.lcsc) + '</b>' +
          '<div class="cr-badges">' +
            badgeSource +
            (isRec ? '<span class="cr-badge cr-badge-rec" title="Recommandé : meilleur équilibre stock & sans frais">★ Recommandé</span>' : '') +
            (isBasic ? '<span class="cr-badge cr-badge-basic" title="Sans frais d’installation JLCPCB">Basic</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="cr-card-sub">' +
          '<span>' + crEsc(c.manufacturer || "Fabricant inconnu") + '</span>' +
          '<span>·</span>' +
          '<span>' + crEsc(c.package || "Boîtier inconnu") + '</span>' +
        '</div>' +
        '<div class="cr-card-meta">' +
          '<span>Stock : <b>' + crFmtEntier(c.stock) + '</b></span>' +
          '<span>Prix : <b>' + crFmtPrix(c.price, c.currency) + '</b></span>' +
          '<span class="cr-lcsc-tag">' + crEsc(refTag) + '</span>' +
        '</div>' +
      '</div>';
  });

  listEl.innerHTML = html;

  // Câblage des clics sur les fiches
  listEl.querySelectorAll(".cr-card").forEach(card => {
    card.onclick = () => {
      const idx = parseInt(card.getAttribute("data-idx"), 10);
      const cand = items[idx];
      crSelectionnerCandidat(cand);
    };
  });

  // Sélection automatique du premier (recommandé) si demandé
  if (autoSelectPremier && items.length > 0) {
    crSelectionnerCandidat(items[0]);
  }
}

/* ---------- Helpers pour le retour systématique du pinout schématique ---------- */
function crClassifierBroche(nom) {
  const s = String(nom || "").toUpperCase().trim();
  if (crIsPower(s)) return { cat: "alim", badge: "Alimentation", cls: "cr-pin-pwr" };
  if (crIsGround(s)) return { cat: "gnd", badge: "Masse (GND)", cls: "cr-pin-gnd" };
  if (/^(SDA|SCL|TX|RX|D\+|D\-|DP|DM|CAN|CLK|SCK|MISO|MOSI|CS|SS|NRST|BOOT)/.test(s)) {
    return { cat: "bus", badge: "Bus / Comm", cls: "cr-pin-bus" };
  }
  return { cat: "sig", badge: "Signal / E-S", cls: "cr-pin-sig" };
}

function crBrocheRaccordementSchema(el, pinNum) {
  if (!el || typeof allPins !== "function" || typeof nets !== "function" || typeof S === "undefined" || !Array.isArray(S.wires)) return null;
  const pins = allPins(el);
  const idx = pinNum - 1;
  if (idx < 0 || idx >= pins.length) return null;
  const pt = pins[idx];
  const nInfo = nets();
  const k = (typeof key === "function") ? key(pt.x, pt.y) : (pt.x + "," + pt.y);
  const nObj = nInfo && nInfo.byPoint ? nInfo.byPoint.get(k) : null;
  const netName = (nObj && nObj.name) ? String(nObj.name).trim() : "";
  const hasWire = S.wires.some(w => (w.x1 === pt.x && w.y1 === pt.y) || (w.x2 === pt.x && w.y2 === pt.y) || (typeof insideSeg === "function" && insideSeg(pt, w)));
  return { netName, hasWire, isAuto: !nObj || !nObj.named };
}

async function crRecupererBrochage(cand, mpn) {
  let lcsc = cand.lcsc;
  if (!lcsc && mpn) {
    try {
      const sRes = await crApiAppel("jlc_search", { query: mpn, limit: 1 }).catch(() => null);
      const first = (sRes && sRes.results && sRes.results[0]);
      if (first && first.lcsc) {
        lcsc = first.lcsc;
        if (!cand.lcsc) cand.lcsc = lcsc;
      }
    } catch (_) {}
  }
  if (!lcsc) return null;
  try {
    return await crApiAppel("jlc_get_pinout", { lcsc: lcsc }).catch(() => null);
  } catch (_) {
    return null;
  }
}

/* ---------- Sélection d'un composant et chargement des fiches détaillées ---------- */
async function crSelectionnerCandidat(cand) {
  CR_ETAT.selectedCand = cand;

  // Mise à jour visuelle dans la liste
  document.querySelectorAll(".cr-card").forEach(c => {
    const isSel = cand.lcsc
      ? (c.getAttribute("data-lcsc") === cand.lcsc)
      : (c.querySelector(".cr-mpn") && c.querySelector(".cr-mpn").textContent === (cand.model || ""));
    c.classList.toggle("active", isSel);
  });

  const pnl = document.getElementById("crDetailsPanel");
  pnl.innerHTML =
    '<div class="cr-loading"><span class="cr-spinner"></span> ' +
    'Récupération des caractéristiques et recoupement distributeurs (Mouser & DigiKey)...</div>';

  document.getElementById("crBtnApply").disabled = true;

  try {
    const mpn = cand.model || "";

    // 1. Fiche complète JLCPCB (seulement si le code LCSC est connu)
    const jlcPromise = cand.lcsc
      ? crApiAppel("jlc_get_part", { lcsc: cand.lcsc }).catch(() => null)
      : Promise.resolve(null);

    // 2. Interrogation automatique Mouser & DigiKey si pas déjà présents
    const mouserPromise = cand.mouserData
      ? Promise.resolve({ results: [cand.mouserData] })
      : (mpn ? crApiAppel("mouser_get_part", { part_number: mpn }).catch(e => ({ error: e.message })) : Promise.resolve(null));

    const digikeyPromise = cand.digikeyData
      ? Promise.resolve({ results: [cand.digikeyData] })
      : (mpn ? crApiAppel("digikey_get_part", { product_number: mpn }).catch(e => ({ error: e.message })) : Promise.resolve(null));

    // 3. Récupération systématique du brochage (Pinout schématique)
    const pinoutPromise = crRecupererBrochage(cand, mpn);

    const [jlcData, mouserRes, digikeyRes, pinoutRes] = await Promise.all([
      jlcPromise,
      mouserPromise,
      digikeyPromise,
      pinoutPromise
    ]);

    CR_ETAT.mouserData = (mouserRes && mouserRes.results && mouserRes.results[0]) || cand.mouserData || null;
    CR_ETAT.digikeyData = (digikeyRes && digikeyRes.results && digikeyRes.results[0]) || cand.digikeyData || null;
    CR_ETAT.pinoutMeta = (pinoutRes && typeof pinoutRes === "object" && !Array.isArray(pinoutRes)) ? pinoutRes : null;
    CR_ETAT.pinoutData = Array.isArray(pinoutRes) ? pinoutRes : (pinoutRes && pinoutRes.pins) || null;

    if (jlcData) {
      CR_ETAT.partDetails = jlcData;
    } else {
      const m = CR_ETAT.mouserData;
      const dk = CR_ETAT.digikeyData;
      CR_ETAT.partDetails = {
        model: mpn,
        manufacturer: (m && m.manufacturer) || (dk && dk.manufacturer) || cand.manufacturer || "",
        package: (m && m.package) || (dk && dk.package) || cand.package || "",
        description: (m && m.description) || (dk && dk.description) || cand.description || "",
        datasheet: cand.datasheet || (m && m.datasheet_url) || (dk && dk.datasheet_url) || "",
        stock: (m && m.stock) || (dk && dk.stock) || cand.stock || 0,
        price: (m && m.price) || (dk && dk.price) || cand.price || 0,
        currency: (m && m.currency) || (dk && dk.currency) || cand.currency || "USD",
        parameters: { ...(cand.parameters || {}), ...((m && m.parameters) || {}), ...((dk && dk.parameters) || {}) }
      };
    }

    CR_ETAT.detectedConflicts = (CR_ETAT.pinoutData && CR_ETAT.el)
      ? crDetecterConflitsCablage(CR_ETAT.el, CR_ETAT.pinoutData)
      : [];

    crAfficherDetailsComplets();
  } catch (err) {
    pnl.innerHTML = '<div class="cr-error">Erreur lors de la récupération des détails : ' + crEsc(err.message || err) + '</div>';
  }
}

/* ---------- Rendu de la vue détaillée, du comparatif distributeurs et des cases à cocher ---------- */
function crAfficherDetailsComplets() {
  const pnl = document.getElementById("crDetailsPanel");
  const d = CR_ETAT.partDetails;
  const m = CR_ETAT.mouserData;
  const dk = CR_ETAT.digikeyData;
  const pin = CR_ETAT.pinoutData;

  const mpn = d.model || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.model) || "";
  const mfr = d.manufacturer || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.manufacturer) || "";
  let pkg = d.package || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.package) || "";
  let dsheetUrl = d.datasheet || d.datasheet_url || (m && m.datasheet_url) || (dk && dk.datasheet_url) || "";
  if (dsheetUrl && dsheetUrl.startsWith("//")) dsheetUrl = "https:" + dsheetUrl;

  const params = d.parameters || (m && m.parameters) || (dk && dk.parameters) || {};
  if (!pkg && params["Package / Case"]) pkg = params["Package / Case"];
  else if (!pkg && params["Boîtier / Empreinte"]) pkg = params["Boîtier / Empreinte"];

  let html = '<div class="cr-det-scroll">';

  // Titre & description du composant
  html +=
    '<div class="cr-det-header">' +
      '<div class="cr-det-title">' + crEsc(mpn) + '</div>' +
      '<div class="cr-det-sub">' + crEsc(mfr) + (pkg ? ' · Boîtier : <b>' + crEsc(pkg) + '</b>' : '') + '</div>' +
      (d.description ? '<div class="cr-det-desc">' + crEsc(d.description) + '</div>' : '') +
    '</div>';

  // --- SECTION 1 : Comparatif Distributeurs (JLCPCB, Mouser, DigiKey) ---
  html +=
    '<div class="cr-sect-title">DISTRIBUTEURS & DISPONIBILITÉ</div>' +
    '<div class="cr-distrib-grid">' +
      // Carte JLCPCB / LCSC
      '<div class="cr-distrib-card ' + (d.lcsc ? 'cr-distrib-jlc dispo' : 'indispo') + '">' +
        '<div class="cr-distrib-name">JLCPCB / LCSC</div>' +
        (d.lcsc ? (
          '<div class="cr-distrib-stat">Stock : <b>' + crFmtEntier(d.stock || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.stock)) + '</b></div>' +
          '<div class="cr-distrib-stat">Prix (1+) : <b>' + crFmtPrix(d.price || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.price)) + '</b></div>' +
          '<div class="cr-distrib-ref">Réf : ' + crEsc(d.lcsc || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.lcsc)) + '</div>'
        ) : '<div class="cr-distrib-none">Non référencé JLCPCB</div>') +
      '</div>' +
      // Carte Mouser
      '<div class="cr-distrib-card' + (m ? ' dispo' : ' indispo') + '">' +
        '<div class="cr-distrib-name">Mouser</div>' +
        (m ? (
          '<div class="cr-distrib-stat">Stock : <b>' + crFmtEntier(m.stock) + '</b></div>' +
          '<div class="cr-distrib-stat">Prix (1+) : <b>' + crFmtPrix(m.price, m.currency) + '</b></div>' +
          '<div class="cr-distrib-ref" title="' + crEsc(m.part_number) + '">Réf : ' + crEsc(m.part_number) + '</div>'
        ) : '<div class="cr-distrib-none">Non trouvé / rupture</div>') +
      '</div>' +
      // Carte DigiKey
      '<div class="cr-distrib-card' + (dk ? ' dispo' : ' indispo') + '">' +
        '<div class="cr-distrib-name">DigiKey</div>' +
        (dk ? (
          '<div class="cr-distrib-stat">Stock : <b>' + crFmtEntier(dk.stock) + '</b></div>' +
          '<div class="cr-distrib-stat">Prix (1+) : <b>' + crFmtPrix(dk.price, dk.currency) + '</b></div>' +
          '<div class="cr-distrib-ref" title="' + crEsc(dk.part_number) + '">Réf : ' + crEsc(dk.part_number) + '</div>'
        ) : '<div class="cr-distrib-none">Non trouvé / rupture</div>') +
      '</div>' +
    '</div>';

  // --- SECTION 2 : Sélection des données techniques par cases à cocher ---
  html +=
    '<div class="cr-sect-head">' +
      '<div class="cr-sect-title">DONNÉES TECHNIQUES À ENRICHIR</div>' +
      '<div class="cr-sel-actions">' +
        '<button type="button" id="crSelAll" class="cr-btn-link">Tout cocher</button>' +
        '<span>·</span>' +
        '<button type="button" id="crSelEss" class="cr-btn-link">Essentiel seul</button>' +
      '</div>' +
    '</div>' +
    '<div class="cr-props-list">';

  // 1. Référence fabricant (MPN) — Essentiel : coché
  html +=
    '<label class="cr-prop-row">' +
      '<input type="checkbox" id="cp_mpn" data-prop="mpn" data-essential="1" checked>' +
      '<span class="cr-prop-k">Référence (MPN)</span>' +
      '<span class="cr-prop-v">' + crEsc(mpn) + '</span>' +
    '</label>';

  // 2. Fabricant — Essentiel : coché
  html +=
    '<label class="cr-prop-row">' +
      '<input type="checkbox" id="cp_mfr" data-prop="manufacturer" data-essential="1" checked>' +
      '<span class="cr-prop-k">Fabricant</span>' +
      '<span class="cr-prop-v">' + crEsc(mfr) + '</span>' +
    '</label>';

  // 3. Boîtier / Empreinte — Essentiel : coché
  if (pkg) {
    html +=
      '<label class="cr-prop-row">' +
        '<input type="checkbox" id="cp_pkg" data-prop="pkg" data-essential="1" checked>' +
        '<span class="cr-prop-k">Boîtier / Empreinte</span>' +
        '<span class="cr-prop-v">' + crEsc(pkg) + '</span>' +
      '</label>';
  }

  // 4. Caractéristiques techniques (specs) — Essentiel : coché
  const specs = d.specs || {};
  const attrs = Array.isArray(d.attributes) ? d.attributes : [];
  const specItems = [];

  for (const k in specs) {
    if (specs[k]) specItems.push({ nom: k, val: specs[k] });
  }
  for (const a of attrs) {
    if (a.name && a.value && !specs[a.name]) {
      specItems.push({ nom: a.name, val: a.value });
    }
  }
  for (const k in params) {
    if (params[k] && params[k] !== "-" && !specs[k] && !specItems.some(it => it.nom === k)) {
      specItems.push({ nom: k, val: params[k] });
    }
  }

  specItems.forEach((sp) => {
    html +=
      '<label class="cr-prop-row">' +
        '<input type="checkbox" class="cp-spec" data-spec-key="' + crEsc(sp.nom) + '" data-spec-val="' + crEsc(sp.val) + '" data-essential="1" checked>' +
        '<span class="cr-prop-k">' + crEsc(sp.nom) + '</span>' +
        '<span class="cr-prop-v">' + crEsc(sp.val) + '</span>' +
      '</label>';
  });

  // 5. Datasheet (Fiche technique PDF) — Essentiel : coché si présente
  if (dsheetUrl) {
    html +=
      '<label class="cr-prop-row cr-prop-dsheet">' +
        '<input type="checkbox" id="cp_dsheet" data-prop="datasheet" data-essential="1" checked>' +
        '<span class="cr-prop-k">Télécharger la Datasheet</span>' +
        '<span class="cr-prop-v"><a href="' + crEsc(dsheetUrl) + '" target="_blank" rel="noopener" class="cr-link">Voir PDF en ligne ↗</a></span>' +
      '</label>';
  }

  // 6. Code LCSC — Non-essentiel : décoché par défaut (seulement si présent)
  if (d.lcsc) {
    html +=
      '<label class="cr-prop-row dim">' +
        '<input type="checkbox" id="cp_lcsc" data-prop="lcsc">' +
        '<span class="cr-prop-k">Code LCSC</span>' +
        '<span class="cr-prop-v">' + crEsc(d.lcsc) + '</span>' +
      '</label>';
  }

  // 7. Réf Mouser — Prioritaire si non disponible JLCPCB
  if (m && m.part_number) {
    const isMouserPrimary = !d.lcsc;
    html +=
      '<label class="cr-prop-row' + (isMouserPrimary ? '' : ' dim') + '">' +
        '<input type="checkbox" id="cp_mouser" data-prop="mouser"' + (isMouserPrimary ? ' data-essential="1" checked' : '') + '>' +
        '<span class="cr-prop-k">Référence Mouser</span>' +
        '<span class="cr-prop-v">' + crEsc(m.part_number) + '</span>' +
      '</label>';
  }

  // 8. Réf DigiKey — Prioritaire si non disponible JLCPCB
  if (dk && dk.part_number) {
    const isDkPrimary = !d.lcsc;
    html +=
      '<label class="cr-prop-row' + (isDkPrimary ? '' : ' dim') + '">' +
        '<input type="checkbox" id="cp_digikey" data-prop="digikey"' + (isDkPrimary ? ' data-essential="1" checked' : '') + '>' +
        '<span class="cr-prop-k">Référence DigiKey</span>' +
        '<span class="cr-prop-v">' + crEsc(dk.part_number) + '</span>' +
      '</label>';
  }

  // 9. Import du nom des broches (Pinout schématique)
  if (pin && pin.length > 0) {
    const elPins = (CR_ETAT.el && CR_ETAT.el.pinNames) || [];
    const isAlreadySame = elPins.length > 0 && pin.every((p, idx) => elPins[idx] && elPins[idx].toUpperCase() === (p.name || "").toUpperCase());
    html +=
      '<label class="cr-prop-row cr-prop-pinout">' +
        '<input type="checkbox" id="cp_pinout" data-prop="pinout" data-essential="1" checked>' +
        '<span class="cr-prop-k">Brochage officiel</span>' +
        '<span class="cr-prop-v">' + pin.length + ' broches ' + (isAlreadySame ? '<b style="color:#52c41a">(identique à votre schéma ✓)</b>' : '(import / validation)') + '</span>' +
      '</label>';
  }

  html += '</div></div>';

  // --- SECTION : RETOUR SYSTÉMATIQUE DU BROCHAGE SCHÉMATIQUE (PINOUT) ---
  if (pin && pin.length > 0) {
    html +=
      '<div class="cr-sect-title cr-sect-pinout">⚡ BROCHAGE SCHÉMATIQUE OFFICIEL (PINOUT — ' + pin.length + ' BROCHES)</div>' +
      '<div class="cr-pinout-box">' +
        '<div class="cr-pinout-meta">' +
          (pkg ? '<span>Boîtier : <b>' + crEsc(pkg) + '</b></span>' : '') +
          '<span>Nombre de broches : <b>' + pin.length + '</b></span>' +
          '<span>Source : <b style="color:#52c41a">Symbole EasyEDA / LCSC</b></span>' +
        '</div>' +
        '<div class="cr-pinout-scroll">' +
          '<table class="cr-pinout-table">' +
            '<thead>' +
              '<tr>' +
                '<th style="width:40px;text-align:center">N°</th>' +
                '<th>Broche officielle</th>' +
                '<th style="width:110px">Type électrique</th>' +
                '<th>Fil schématique actuel</th>' +
                '<th style="width:120px">Concordance</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>';

    pin.forEach(p => {
      const num = parseInt(p.number, 10);
      const nom = p.name || "";
      const typeInfo = crClassifierBroche(nom);
      const racc = crBrocheRaccordementSchema(CR_ETAT.el, num);
      const nomActuel = (CR_ETAT.el && CR_ETAT.el.pinNames && CR_ETAT.el.pinNames[num - 1]) || "";

      let cellNom = '<b>' + crEsc(nom) + '</b>';
      if (nomActuel && nomActuel.toUpperCase() === nom.toUpperCase()) {
        cellNom += ' <span style="color:#52c41a;font-size:10px;font-weight:normal" title="Votre schéma porte déjà ce nom officiel">✓ Actuel</span>';
      } else if (nomActuel) {
        cellNom += '<div style="font-size:10px;color:var(--txt-dim);font-family:var(--mono)">Actuel sur schéma : ' + crEsc(nomActuel) + '</div>';
      }

      let netTxt = '<span style="color:var(--txt-dim);font-style:italic">Non raccordé</span>';
      let stTxt = '<span class="cr-pin-badge-ready">Prêt à câbler</span>';
      if (nomActuel && nomActuel.toUpperCase() === nom.toUpperCase() && (!racc || !racc.hasWire)) {
        stTxt = '<span class="cr-conf-badge cr-conf-badge-ok">✓ Broche définie</span>';
      }

      if (racc && racc.hasWire) {
        netTxt = '<b style="color:#60a5fa">' + crEsc(racc.netName || "Net sans nom") + '</b>';
        const normNet = crNormSig(racc.netName);
        const normPin = crNormSig(nom);

        if (typeInfo.cat === "alim" && crIsGround(racc.netName)) {
          stTxt = '<span class="cr-conf-badge cr-conf-badge-crit">⚠️ Court-circuit VCC/GND</span>';
        } else if (typeInfo.cat === "gnd" && crIsPower(racc.netName)) {
          stTxt = '<span class="cr-conf-badge cr-conf-badge-crit">⚠️ Court-circuit GND/VCC</span>';
        } else if (normNet && normPin && (normNet === normPin || normNet.includes(normPin) || normPin.includes(normNet))) {
          stTxt = '<span class="cr-conf-badge cr-conf-badge-ok">✓ Concordant</span>';
        } else if (typeInfo.cat === "gnd" && crIsGround(racc.netName)) {
          stTxt = '<span class="cr-conf-badge cr-conf-badge-ok">✓ Masse OK</span>';
        } else if (typeInfo.cat === "alim" && crIsPower(racc.netName)) {
          stTxt = '<span class="cr-conf-badge cr-conf-badge-ok">✓ Alim OK</span>';
        } else {
          stTxt = '<span class="cr-conf-badge cr-conf-badge-info">Câblé (' + crEsc(racc.netName) + ')</span>';
        }
      }

      html +=
        '<tr>' +
          '<td class="cr-pin-num-cell">#' + crEsc(p.number) + '</td>' +
          '<td class="cr-pin-name-cell">' + cellNom + '</td>' +
          '<td><span class="cr-pin-pill ' + typeInfo.cls + '">' + crEsc(typeInfo.badge) + '</span></td>' +
          '<td>' + netTxt + '</td>' +
          '<td>' + stTxt + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div></div>';
  } else {
    html +=
      '<div class="cr-sect-title">⚡ BROCHAGE DU COMPOSANT (PINOUT)</div>' +
      '<div class="cr-pinout-box cr-pinout-none">' +
        '<i>Brochage non fourni par la base de données pour cette référence (composant standard ou passif). Le schéma conserve son brochage standard.</i>' +
      '</div>';
  }

  // --- SECTION 3 : Analyse du câblage schématique et détection d'inversions ---
  if (CR_ETAT.detectedConflicts && CR_ETAT.detectedConflicts.length > 0) {
    html +=
      '<div class="cr-sect-title cr-sect-alert">⚡ VÉRIFICATION DU CÂBLAGE SCHÉMATIQUE (' + CR_ETAT.detectedConflicts.length + ' anomalie(s))</div>' +
      '<div class="cr-conflicts-wrap">' +
        '<p class="cr-conflicts-intro">Des incohérences ont été détectées entre les fils de votre schéma et le brochage officiel. Cochez les corrections souhaitées :</p>';
    CR_ETAT.detectedConflicts.forEach((conf, cIdx) => {
      const critBadge = conf.critique
        ? '<span class="cr-conf-badge cr-conf-badge-crit">Court-circuit alim/masse évité</span>'
        : '<span class="cr-conf-badge cr-conf-badge-warn">Inversion de signal</span>';
      html +=
        '<label class="cr-conflict-card' + (conf.critique ? ' crit' : '') + '">' +
          '<input type="checkbox" class="cp-conflict-cb" data-cidx="' + cIdx + '"' + (conf.checked ? ' checked' : '') + '> ' +
          '<div class="cr-conf-body">' +
            '<div class="cr-conf-head">' + critBadge + '<b class="cr-conf-title">' + crEsc(conf.titre) + '</b></div>' +
            '<div class="cr-conf-desc">' + crEsc(conf.desc) + '</div>' +
          '</div>' +
        '</label>';
    });
    html += '</div>';
  } else if (pin && pin.length > 0 && typeof allPins === "function" && CR_ETAT.el) {
    const pts = allPins(CR_ETAT.el);
    const hasAnyWire = Array.isArray(pts) && Array.isArray(S.wires) && pts.some(pt => S.wires.some(w => (w.x1 === pt.x && w.y1 === pt.y) || (w.x2 === pt.x && w.y2 === pt.y)));
    if (hasAnyWire) {
      html +=
        '<div class="cr-conflicts-ok">' +
          '<span class="cr-ok-icon">✓</span> Câblage existant cohérent avec le nouveau brochage.' +
        '</div>';
    }
  }

  pnl.innerHTML = html;

  // Actions tout cocher / essentiel
  document.getElementById("crSelAll").onclick = () => {
    pnl.querySelectorAll(".cr-props-list input[type=checkbox]").forEach(cb => cb.checked = true);
  };
  document.getElementById("crSelEss").onclick = () => {
    pnl.querySelectorAll(".cr-props-list input[type=checkbox]").forEach(cb => {
      cb.checked = cb.getAttribute("data-essential") === "1";
    });
  };

  // Option de propagation par lot dans le footer
  const batchWrap = document.getElementById("crBatchWrap");
  if (CR_ETAT.identicalCount > 0) {
    batchWrap.innerHTML =
      '<label class="cr-batch-label">' +
        '<input type="checkbox" id="crBatchApply" checked> ' +
        'Appliquer également aux <b>' + CR_ETAT.identicalCount + '</b> autre(s) composant(s) identique(s) (' + crEsc(CR_ETAT.el.value) + ')' +
      '</label>';
  } else {
    batchWrap.innerHTML = "";
  }

  document.getElementById("crBtnApply").disabled = false;
}

/* ---------- Application des données au composant du schéma ---------- */
async function crAppliquerAuComposant() {
  const el = CR_ETAT.el;
  const d = CR_ETAT.partDetails;
  if (!el || !d) return;

  const btnApply = document.getElementById("crBtnApply");
  btnApply.disabled = true;
  btnApply.textContent = "Application en cours...";

  // 1. Récupération des cases cochées
  const checkMpn = document.getElementById("cp_mpn") && document.getElementById("cp_mpn").checked;
  const checkMfr = document.getElementById("cp_mfr") && document.getElementById("cp_mfr").checked;
  const checkPkg = document.getElementById("cp_pkg") && document.getElementById("cp_pkg").checked;
  const checkDsheet = document.getElementById("cp_dsheet") && document.getElementById("cp_dsheet").checked;
  const checkLcsc = document.getElementById("cp_lcsc") && document.getElementById("cp_lcsc").checked;
  const checkMouser = document.getElementById("cp_mouser") && document.getElementById("cp_mouser").checked;
  const checkDigikey = document.getElementById("cp_digikey") && document.getElementById("cp_digikey").checked;
  const checkPinout = document.getElementById("cp_pinout") && document.getElementById("cp_pinout").checked;

  const mpn = d.model || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.model) || "";
  const mfr = d.manufacturer || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.manufacturer) || "";
  let pkg = d.package || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.package) || "";
  const params = d.parameters || (CR_ETAT.mouserData && CR_ETAT.mouserData.parameters) || (CR_ETAT.digikeyData && CR_ETAT.digikeyData.parameters) || {};
  if (!pkg && params["Package / Case"]) pkg = params["Package / Case"];
  else if (!pkg && params["Boîtier / Empreinte"]) pkg = params["Boîtier / Empreinte"];

  let dsheetUrl = d.datasheet || d.datasheet_url || (CR_ETAT.mouserData && CR_ETAT.mouserData.datasheet_url) || (CR_ETAT.digikeyData && CR_ETAT.digikeyData.datasheet_url) || "";
  if (dsheetUrl && dsheetUrl.startsWith("//")) dsheetUrl = "https:" + dsheetUrl;

  // Spécifications sélectionnées
  const specsSelectionnees = {};
  document.querySelectorAll(".cp-spec:checked").forEach(cb => {
    const k = cb.getAttribute("data-spec-key");
    const v = cb.getAttribute("data-spec-val");
    if (k && v) specsSelectionnees[k] = v;
  });

  // Historique annuler/rétablir
  if (typeof push === "function") push();

  // 2. Assignation des propriétés sur le composant cible
  if (checkMpn && mpn) el.mpn = mpn;
  if (checkMfr && mfr) el.manufacturer = mfr;
  if (checkPkg && pkg) el.pkg = pkg;
  if (Object.keys(specsSelectionnees).length > 0) el.specs = specsSelectionnees;

  if (checkLcsc && d.lcsc) el.lcsc = d.lcsc;
  else if (!d.lcsc) delete el.lcsc;
  if (checkMouser && CR_ETAT.mouserData) el.mouser_part = CR_ETAT.mouserData.part_number;
  if (checkDigikey && CR_ETAT.digikeyData) el.digikey_part = CR_ETAT.digikeyData.part_number;

  // Enregistrer le résumé des distributeurs
  el.distributeurs = {
    jlc: d.lcsc ? { stock: d.stock, prix: d.price } : null,
    mouser: CR_ETAT.mouserData ? { stock: CR_ETAT.mouserData.stock, prix: CR_ETAT.mouserData.price } : null,
    digikey: CR_ETAT.digikeyData ? { stock: CR_ETAT.digikeyData.stock, prix: CR_ETAT.digikeyData.price } : null
  };

  // Brochage si demandé
  if (checkPinout && CR_ETAT.pinoutData && Array.isArray(CR_ETAT.pinoutData)) {
    if (!el.pinNames) el.pinNames = [];
    let maxPin = el.npins || 8;
    CR_ETAT.pinoutData.forEach(p => {
      const idx = parseInt(p.number, 10) - 1;
      if (idx >= 0 && idx < 64 && p.name) {
        el.pinNames[idx] = p.name;
        if (idx + 1 > maxPin) maxPin = idx + 1;
      }
    });
    el.pinout = CR_ETAT.pinoutData.map(p => ({ number: String(p.number), name: String(p.name || "") }));
    el.pinoutVerified = true;
    if (el.type === "ic" && maxPin !== (el.npins || 8)) {
      if (typeof icSetCount === "function") icSetCount(el, maxPin);
      else el.npins = maxPin;
    }
  }

  // Réalignement assisté des fils en conflit si coché
  let nbRealign = 0;
  if (CR_ETAT.detectedConflicts && CR_ETAT.detectedConflicts.length > 0) {
    document.querySelectorAll(".cp-conflict-cb").forEach(cb => {
      const cIdx = parseInt(cb.getAttribute("data-cidx"), 10);
      if (CR_ETAT.detectedConflicts[cIdx]) {
        CR_ETAT.detectedConflicts[cIdx].checked = cb.checked;
      }
    });
    nbRealign = crRealignerFilsBroches(el, CR_ETAT.detectedConflicts);
  }

  // 3. Téléchargement de la Datasheet (si cochée et présente)
  if (checkDsheet && dsheetUrl) {
    el.datasheet_web = dsheetUrl;
    try {
      const projetNom = (typeof projdChemin === "function" && projdChemin()) ||
                        (typeof projNom === "function" && projNom()) || "";

      const repDl = await fetch("/api/datasheet/telecharger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: dsheetUrl,
          mpn: mpn || el.ref || "datasheet",
          projet: projetNom
        })
      });

      if (repDl.ok) {
        const jDl = await repDl.json();
        if (jDl && jDl.ok) {
          el.datasheet_local = jDl.chemin_rel;
          el.datasheet_url = jDl.url_locale;
        }
      }
    } catch (e) {
      console.warn("Échec du téléchargement local de la datasheet :", e);
      el.datasheet_url = dsheetUrl;
    }
  }

  // 4. Propagation par lot (Batch Apply) si cochée
  const batchCb = document.getElementById("crBatchApply");
  let nbPropag = 0;
  if (batchCb && batchCb.checked) {
    const src = (typeof S !== "undefined" && S.comps) ? S.comps : [];
    src.forEach(c => {
      if (c !== el && c.type === el.type && c.value === el.value) {
        if (checkMpn && mpn) c.mpn = mpn;
        if (checkMfr && mfr) c.manufacturer = mfr;
        if (checkPkg && pkg) c.pkg = pkg;
        if (Object.keys(specsSelectionnees).length > 0) c.specs = { ...specsSelectionnees };
        if (checkLcsc && d.lcsc) c.lcsc = d.lcsc;
        if (checkMouser && el.mouser_part) c.mouser_part = el.mouser_part;
        if (checkDigikey && el.digikey_part) c.digikey_part = el.digikey_part;
        if (checkPinout && el.pinNames) {
          c.pinNames = [...el.pinNames];
          if (el.pinout) c.pinout = JSON.parse(JSON.stringify(el.pinout));
          c.pinoutVerified = true;
          if (c.type === "ic" && el.npins && c.npins !== el.npins) {
            if (typeof icSetCount === "function") icSetCount(c, el.npins);
            else c.npins = el.npins;
          }
        }
        if (el.distributeurs) c.distributeurs = JSON.parse(JSON.stringify(el.distributeurs));
        if (el.datasheet_web) c.datasheet_web = el.datasheet_web;
        if (el.datasheet_local) c.datasheet_local = el.datasheet_local;
        if (el.datasheet_url) c.datasheet_url = el.datasheet_url;
        nbPropag++;
      }
    });
  }

  // Émission d'un signal inter-outils pour avertir l'éditeur PCB s'il est ouvert
  try {
    const bc = (typeof sessCanal === "function") ? sessCanal() : null;
    if (bc) bc.postMessage({ v: 1, type: "pinout_update", ref: el.ref, mpn: mpn, pkg: pkg, pinout: el.pinout });
  } catch (_) {}

  // Fermeture & Rafraîchissement de l'interface
  crFermer();

  if (typeof refreshPanels === "function") refreshPanels();
  if (typeof draw === "function") draw();

  const fHint = document.getElementById("fHint");
  if (fHint) {
    let msg = "Composant " + (el.ref || "sélectionné") + " enrichi (" + (mpn || el.value) + ")";
    if (el.pinout && el.pinout.length > 0) msg += " · ⚡ Pinout schématique (" + el.pinout.length + " broches) validé";
    if (nbRealign > 0) msg += " · ⚡ " + nbRealign + " inversion(s)/connexion(s) de fil(s) réalignée(s)";
    if (nbPropag > 0) msg += " + " + nbPropag + " autre(s) composant(s) identique(s)";
    if (el.datasheet_local) msg += " · Fiche technique sauvegardée dans datasheets/";
    fHint.textContent = msg;
  }
}
