"use strict";
/* =============================================================================
   editeur-schematique — 24-lib-sync.js
   Synchronisation dynamique et alertes avec Gestion LIB
   ============================================================================= */

const SCH_LIB_ALERTE = {
  active: false,
  detail: null,
  compIds: new Set()
};

function schTousLesComposants() {
  const list = [];
  if (typeof S !== "undefined") {
    if (Array.isArray(S.pages) && S.pages.length > 0) {
      for (const p of S.pages) {
        if (Array.isArray(p.comps)) {
          for (const c of p.comps) list.push(c);
        }
      }
    } else if (Array.isArray(S.comps)) {
      for (const c of S.comps) list.push(c);
    }
  }
  return list;
}

function schTrouverComposantsAmettreAJour(detail) {
  if (!detail) return [];
  const comps = schTousLesComposants();
  const matches = [];

  if (detail.genre === "catalogue") {
    for (const c of comps) {
      if (c.csvPartName) matches.push(c);
    }
    return matches;
  }

  const nomNettoye = String(detail.nom || "").replace(/\.json$/i, "").toLowerCase().trim();
  if (!nomNettoye) return [];

  for (const c of comps) {
    const part = String(c.csvPartName || "").toLowerCase().trim();
    const sym = String(c.symSch || "").toLowerCase().trim();
    const fp = String(c.fpPcb || c.pkg || "").toLowerCase().trim();
    const type = String(c.type || "").toLowerCase().trim();
    const val = String(c.value || c.val || "").toLowerCase().trim();

    if (part === nomNettoye || sym === nomNettoye || fp === nomNettoye || type === nomNettoye || val === nomNettoye) {
      matches.push(c);
    }
  }

  return matches;
}

function schComposantAlerteLib(comp) {
  if (!comp || !SCH_LIB_ALERTE.active) return false;
  return SCH_LIB_ALERTE.compIds.has(comp.id);
}

function schAfficherAlerteLib(titre, msg, onMaj, onIgnorer) {
  if (typeof document === "undefined") return;
  let toast = document.getElementById("schLibToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "schLibToast";
    document.body.appendChild(toast);
  }

  toast.style.cssText = 
    "position:fixed; top:46px; left:50%; transform:translateX(-50%); z-index:10000; " +
    "background:#1e222b; border:1px solid #f59e0b; border-radius:6px; padding:8px 14px; " +
    "box-shadow:0 6px 20px rgba(0,0,0,0.6); display:flex; align-items:center; gap:12px; " +
    "font-family:var(--sans, sans-serif); font-size:12px; color:#f3f4f6; animation:schSlideDown 0.2s ease;";

  toast.innerHTML = 
    '<div style="font-size:18px; color:#f59e0b;">⚠️</div>' +
    '<div>' +
      '<div style="font-weight:bold; color:#f59e0b; margin-bottom:2px;">' + (typeof esc === "function" ? esc(titre) : titre) + '</div>' +
      '<div style="color:#d1d5db;">' + (typeof esc === "function" ? esc(msg) : msg) + '</div>' +
    '</div>' +
    '<div style="display:flex; align-items:center; gap:8px; margin-left:8px;">' +
      '<button id="schToastBtnMaj" class="tb mini on" style="background:#f59e0b; color:#111; font-weight:bold; cursor:pointer; padding:4px 10px; border-radius:4px; border:none;">🔄 Mettre à jour</button>' +
      '<button id="schToastBtnClose" class="pnl-btn" style="cursor:pointer; background:none; border:none; color:#9ca3af; font-size:14px; padding:2px 6px;" title="Ignorer">✕</button>' +
    '</div>';

  const bMaj = document.getElementById("schToastBtnMaj");
  if (bMaj) {
    bMaj.onclick = function() {
      if (typeof onMaj === "function") onMaj();
    };
  }

  const bClose = document.getElementById("schToastBtnClose");
  if (bClose) {
    bClose.onclick = function() {
      if (typeof onIgnorer === "function") onIgnorer();
      if (toast && toast.parentNode) toast.remove();
    };
  }
}

function schAfficherToast(msg, succes) {
  if (typeof document === "undefined") return;
  let t = document.getElementById("schFeedbackToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "schFeedbackToast";
    document.body.appendChild(t);
  }
  t.style.cssText = 
    "position:fixed; bottom:30px; right:30px; z-index:10000; " +
    "background:" + (succes ? "#14532d" : "#1f2937") + "; " +
    "border:1px solid " + (succes ? "#22c55e" : "#4b5563") + "; " +
    "border-radius:6px; padding:8px 14px; color:#f9fafb; font-size:12px; " +
    "box-shadow:0 4px 14px rgba(0,0,0,0.4); transition:all 0.3s ease;";
  t.textContent = msg;
  setTimeout(function() {
    if (t && t.parentNode) t.remove();
  }, 4000);
}

function schAppliquerMajLibComposant(comp, dataFichier) {
  if (!comp) return false;
  if (typeof push === "function") push();

  // 1. Mise à jour depuis le catalogue CSV
  if (window.CSV_LIB && Array.isArray(window.CSV_LIB)) {
    const part = (comp.csvPartName || "").toLowerCase().trim();
    const val = (comp.value || comp.val || "").toLowerCase().trim();
    const entry = window.CSV_LIB.find(it => {
      const p = (it["Part Name"] || "").toLowerCase().trim();
      return (part && p === part) || (val && p === val);
    });

    if (entry) {
      if (entry["Empreinte PCB"]) {
        comp.fpPcb = entry["Empreinte PCB"];
        comp.pkg = entry["Empreinte PCB"];
      }
      if (entry["Empreinte Schématique"]) comp.symSch = entry["Empreinte Schématique"];
      if (entry["Modèle Simulation"]) comp.simModel = entry["Modèle Simulation"];
      if (entry["Manufacturer"]) comp.manufacturer = entry["Manufacturer"];
      if (entry["MPN"]) comp.mpn = entry["MPN"];
      if (entry["Description"]) comp.desc = entry["Description"];

      // Spécifications électriques du catalogue LIB CSV
      const vRating = entry["Voltage Rating"] || entry["voltage rating"] || entry["Voltage"] || "";
      const cRating = entry["current Rating"] || entry["Current Rating"] || entry["current rating"] || "";
      const wRating = entry["wattage"] || entry["Wattage"] || "";
      const fRating = entry["fréquency"] || entry["frequency"] || entry["Frequency"] || "";

      const isSrc = comp.type === "vcc" || comp.type === "regulator" || /^(VR|REG|PWR|BAT|J|CON)/i.test(comp.ref || "");
      const specs = comp.specs ? { ...comp.specs } : {};
      let aDesSpecs = false;

      if (vRating && vRating !== "xx" && vRating !== "-") {
        specs[isSrc ? "Output Voltage" : "Operating Voltage"] = vRating;
        specs["Voltage Rating"] = vRating;
        aDesSpecs = true;
      }
      if (cRating && cRating !== "xx" && cRating !== "-") {
        specs[isSrc ? "Max Current" : "Supply Current"] = cRating;
        specs["Current Rating"] = cRating;
        aDesSpecs = true;
      }
      if (wRating && wRating !== "xx" && wRating !== "-") {
        specs["Power Rating"] = wRating;
        aDesSpecs = true;
      }
      if (fRating && fRating !== "xx" && fRating !== "-") {
        specs["Frequency"] = fRating;
        aDesSpecs = true;
      }

      if (aDesSpecs) {
        comp.specs = specs;
        if (!comp.specsProvenance || comp.specsProvenance === "defaut") {
          comp.specsProvenance = "catalogue";
        }
      }
    }
  }

  // 2. Mise à jour des broches si données de symbole fournies
  if (dataFichier && (Array.isArray(dataFichier.pins) || Array.isArray(dataFichier.broches))) {
    const newPins = dataFichier.pins || dataFichier.broches;
    if (newPins.length > 0) {
      comp.pins = newPins.map((p, idx) => ({
        num: p.num || p.n || (idx + 1),
        name: p.name || p.nom || String(idx + 1),
        x: p.x || 0,
        y: p.y || 0
      }));
    }
  }

  SCH_LIB_ALERTE.compIds.delete(comp.id);
  if (SCH_LIB_ALERTE.compIds.size === 0) {
    SCH_LIB_ALERTE.active = false;
    const t = document.getElementById("schLibToast");
    if (t && t.parentNode) t.remove();
  }

  if (typeof touchWires === "function") touchWires();
  if (typeof S !== "undefined") S.dirty = true;
  if (typeof draw === "function") draw();
  if (typeof buildList === "function") buildList();
  if (typeof refreshPanels === "function") refreshPanels();

  return true;
}

function schAppliquerMajLibTous(detail) {
  const comps = schTousLesComposants().filter(c => SCH_LIB_ALERTE.compIds.has(c.id));
  if (comps.length === 0) return 0;

  if (typeof push === "function") push();

  let modifs = 0;
  for (const c of comps) {
    if (schAppliquerMajLibComposant(c, detail ? detail.data : null)) {
      modifs++;
    }
  }

  SCH_LIB_ALERTE.compIds.clear();
  SCH_LIB_ALERTE.active = false;
  const t = document.getElementById("schLibToast");
  if (t && t.parentNode) t.remove();

  schAfficherToast(`✅ ${modifs} composant(s) mis à jour depuis la bibliothèque`, true);
  return modifs;
}

function schInitialiserLibSync() {
  if (typeof sessEcouterLibModif !== "function") return;

  sessEcouterLibModif(function(detail) {
    if (!detail) return;

    // Si catalogue mis à jour, rafraîchir en arrière-plan
    if (detail.genre === "catalogue" && typeof loadCSVLib === "function") {
      loadCSVLib();
    }

    const matches = schTrouverComposantsAmettreAJour(detail);
    if (matches.length > 0) {
      SCH_LIB_ALERTE.active = true;
      SCH_LIB_ALERTE.detail = detail;
      SCH_LIB_ALERTE.compIds = new Set(matches.map(c => c.id));

      const nom = detail.nom ? detail.nom.replace(/\.json$/i, "") : "Catalogue";
      const titre = "Bibliothèque modifiée";
      const msg = `La référence "${nom}" a été modifiée dans Gestion LIB (${matches.length} composant(s) dans le schéma).`;

      schAfficherAlerteLib(titre, msg, function() {
        schAppliquerMajLibTous(detail);
      }, function() {
        SCH_LIB_ALERTE.compIds.clear();
        SCH_LIB_ALERTE.active = false;
      });

      if (typeof refreshPanels === "function") refreshPanels();
    }
  });
}

schInitialiserLibSync();
