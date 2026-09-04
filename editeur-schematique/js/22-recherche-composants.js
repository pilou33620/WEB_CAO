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
  return /(\+?3\.?3V|\+?5V|VCC|VDD|VIN|VOUT|VBUS|VBAT|\+?12V|\+?1\.?8V|\+V)/i.test(String(s || ""));
}

function crIsGround(s) {
  return /^(GND|VSS|0V|AGND|DGND|MASSE)$/i.test(String(s || "").trim());
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
            '<span id="crCount" class="cr-count"></span>' +
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

/* ---------- Lancement de la recherche JLCPCB ---------- */
async function crLancerRecherche(overrideQuery) {
  const q = overrideQuery !== undefined ? overrideQuery : document.getElementById("crInpSearch").value.trim();
  if (!q) return;

  CR_ETAT.query = q;
  CR_ETAT.loadingSearch = true;
  const listEl = document.getElementById("crList");
  listEl.innerHTML = '<div class="cr-loading"><span class="cr-spinner"></span> Recherche en cours pour « ' + crEsc(q) + ' »...</div>';
  document.getElementById("crCount").textContent = "";
  document.getElementById("crBtnApply").disabled = true;

  try {
    const res = await crApiAppel("jlc_search", { query: q, limit: 16 });
    const rawResults = (res && res.results) || (Array.isArray(res) ? res : []);

    CR_ETAT.candidates = rawResults;
    CR_ETAT.loadingSearch = false;

    if (!rawResults.length) {
      listEl.innerHTML = '<div class="cr-placeholder">Aucun composant trouvé pour « ' + crEsc(q) + ' ». Essayez avec des termes plus généraux.</div>';
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

  // Filtre Basic si demandé
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
    const selClass = (CR_ETAT.selectedCand && CR_ETAT.selectedCand.lcsc === c.lcsc) ? " active" : "";

    html +=
      '<div class="cr-card' + selClass + '" data-lcsc="' + crEsc(c.lcsc) + '" data-idx="' + idx + '">' +
        '<div class="cr-card-head">' +
          '<b class="cr-mpn">' + crEsc(c.model || c.lcsc) + '</b>' +
          '<div class="cr-badges">' +
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
          '<span>Prix : <b>' + crFmtPrix(c.price) + '</b></span>' +
          '<span class="cr-lcsc-tag">' + crEsc(c.lcsc) + '</span>' +
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

/* ---------- Sélection d'un candidat & Chargement Distributeurs ---------- */
async function crSelectionnerCandidat(cand) {
  CR_ETAT.selectedCand = cand;

  // Mise à jour visuelle dans la liste
  document.querySelectorAll(".cr-card").forEach(c => {
    c.classList.toggle("active", c.getAttribute("data-lcsc") === cand.lcsc);
  });

  const pnl = document.getElementById("crDetailsPanel");
  pnl.innerHTML =
    '<div class="cr-loading"><span class="cr-spinner"></span> ' +
    'Récupération des caractéristiques et recoupement distributeurs (Mouser & DigiKey)...</div>';

  document.getElementById("crBtnApply").disabled = true;

  try {
    // 1. Appel fiche complète JLCPCB
    const jlcPromise = crApiAppel("jlc_get_part", { lcsc: cand.lcsc });

    // 2. Interrogation automatique Mouser & DigiKey avec le MPN
    const mpn = cand.model || "";
    const mouserPromise = mpn ? crApiAppel("mouser_get_part", { part_number: mpn }).catch(e => ({ error: e.message })) : Promise.resolve(null);
    const digikeyPromise = mpn ? crApiAppel("digikey_get_part", { product_number: mpn }).catch(e => ({ error: e.message })) : Promise.resolve(null);

    // 3. Optionnel : brochage si circuit intégré
    const isIc = CR_ETAT.el && (typeof defOf === "function" ? typeof defOf(CR_ETAT.el.type).pins === "function" : false);
    const pinoutPromise = (isIc && cand.lcsc) ? crApiAppel("jlc_get_pinout", { lcsc: cand.lcsc }).catch(() => null) : Promise.resolve(null);

    const [jlcData, mouserRes, digikeyRes, pinoutRes] = await Promise.all([
      jlcPromise,
      mouserPromise,
      digikeyPromise,
      pinoutPromise
    ]);

    CR_ETAT.partDetails = jlcData || cand;
    CR_ETAT.mouserData = (mouserRes && mouserRes.results && mouserRes.results[0]) || null;
    CR_ETAT.digikeyData = (digikeyRes && digikeyRes.results && digikeyRes.results[0]) || null;
    CR_ETAT.pinoutData = Array.isArray(pinoutRes) ? pinoutRes : (pinoutRes && pinoutRes.pins) || null;
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
  const pkg = d.package || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.package) || "";
  const dsheetUrl = d.datasheet || d.datasheet_url || "";

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
      '<div class="cr-distrib-card cr-distrib-jlc">' +
        '<div class="cr-distrib-name">JLCPCB / LCSC</div>' +
        '<div class="cr-distrib-stat">Stock : <b>' + crFmtEntier(d.stock || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.stock)) + '</b></div>' +
        '<div class="cr-distrib-stat">Prix (1+) : <b>' + crFmtPrix(d.price || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.price)) + '</b></div>' +
        '<div class="cr-distrib-ref">Réf : ' + crEsc(d.lcsc || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.lcsc)) + '</div>' +
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

  // 6. Code LCSC — Non-essentiel : décoché par défaut
  if (d.lcsc) {
    html +=
      '<label class="cr-prop-row dim">' +
        '<input type="checkbox" id="cp_lcsc" data-prop="lcsc">' +
        '<span class="cr-prop-k">Code LCSC</span>' +
        '<span class="cr-prop-v">' + crEsc(d.lcsc) + '</span>' +
      '</label>';
  }

  // 7. Réf Mouser — Non-essentiel
  if (m && m.part_number) {
    html +=
      '<label class="cr-prop-row dim">' +
        '<input type="checkbox" id="cp_mouser" data-prop="mouser">' +
        '<span class="cr-prop-k">Référence Mouser</span>' +
        '<span class="cr-prop-v">' + crEsc(m.part_number) + '</span>' +
      '</label>';
  }

  // 8. Réf DigiKey — Non-essentiel
  if (dk && dk.part_number) {
    html +=
      '<label class="cr-prop-row dim">' +
        '<input type="checkbox" id="cp_digikey" data-prop="digikey">' +
        '<span class="cr-prop-k">Référence DigiKey</span>' +
        '<span class="cr-prop-v">' + crEsc(dk.part_number) + '</span>' +
      '</label>';
  }

  // 9. Import du nom des broches (Pinout pour CI)
  if (pin && pin.length > 0) {
    html +=
      '<label class="cr-prop-row cr-prop-pinout">' +
        '<input type="checkbox" id="cp_pinout" data-prop="pinout" checked>' +
        '<span class="cr-prop-k">Brochage EasyEDA</span>' +
        '<span class="cr-prop-v">' + pin.length + ' broches trouvées</span>' +
      '</label>';
  }

  html += '</div></div>';

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
  const pkg = d.package || (CR_ETAT.selectedCand && CR_ETAT.selectedCand.package) || "";
  const dsheetUrl = d.datasheet || d.datasheet_url || "";

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
  if (checkMouser && CR_ETAT.mouserData) el.mouser_part = CR_ETAT.mouserData.part_number;
  if (checkDigikey && CR_ETAT.digikeyData) el.digikey_part = CR_ETAT.digikeyData.part_number;

  // Enregistrer le résumé des distributeurs
  el.distributeurs = {
    jlc: { stock: d.stock, prix: d.price },
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

  // Fermeture & Rafraîchissement de l'interface
  crFermer();

  if (typeof refreshPanels === "function") refreshPanels();
  if (typeof draw === "function") draw();

  const fHint = document.getElementById("fHint");
  if (fHint) {
    let msg = "Composant " + (el.ref || "sélectionné") + " enrichi (" + (mpn || el.value) + ")";
    if (nbRealign > 0) msg += " · ⚡ " + nbRealign + " inversion(s)/connexion(s) de fil(s) réalignée(s)";
    if (nbPropag > 0) msg += " + " + nbPropag + " autre(s) composant(s) identique(s)";
    if (el.datasheet_local) msg += " · Fiche technique sauvegardée dans datasheets/";
    fHint.textContent = msg;
  }
}
