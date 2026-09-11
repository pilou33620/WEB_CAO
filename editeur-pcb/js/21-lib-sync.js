"use strict";
/* =============================================================================
   editeur-pcb — 21-lib-sync.js
   Synchronisation dynamique et alertes d'empreintes avec Gestion LIB
   ============================================================================= */

const PCB_LIB_ALERTE = {
  active: false,
  detail: null,
  pkgNames: new Set()
};

function pcbTrouverEmpreintesAmettreAJour(pkgName) {
  if (!pkgName || typeof S === "undefined" || !Array.isArray(S.fps)) return [];
  const kTarget = (typeof pkgKey === "function") ? pkgKey(pkgName) : String(pkgName).toUpperCase();
  return S.fps.filter(fp => {
    const kFp = (typeof pkgKey === "function") ? pkgKey(fp.pkg) : String(fp.pkg).toUpperCase();
    return kFp === kTarget;
  });
}

function pcbEmpreinteAlerteLib(fp) {
  if (!fp || !PCB_LIB_ALERTE.active) return false;
  const kFp = (typeof pkgKey === "function") ? pkgKey(fp.pkg) : String(fp.pkg).toUpperCase();
  for (const name of PCB_LIB_ALERTE.pkgNames) {
    const k = (typeof pkgKey === "function") ? pkgKey(name) : String(name).toUpperCase();
    if (k === kFp) return true;
  }
  return false;
}

function pcbAfficherAlerteLib(titre, msg, onMaj, onIgnorer) {
  if (typeof document === "undefined") return;
  let toast = document.getElementById("pcbLibToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "pcbLibToast";
    document.body.appendChild(toast);
  }

  toast.style.cssText = 
    "position:fixed; top:46px; left:50%; transform:translateX(-50%); z-index:10000; " +
    "background:#1e222b; border:1px solid #f59e0b; border-radius:6px; padding:8px 14px; " +
    "box-shadow:0 6px 20px rgba(0,0,0,0.6); display:flex; align-items:center; gap:12px; " +
    "font-family:var(--sans, sans-serif); font-size:12px; color:#f3f4f6; animation:pcbSlideDown 0.2s ease;";

  toast.innerHTML = 
    '<div style="font-size:18px; color:#f59e0b;">⚠️</div>' +
    '<div>' +
      '<div style="font-weight:bold; color:#f59e0b; margin-bottom:2px;">' + (typeof esc === "function" ? esc(titre) : titre) + '</div>' +
      '<div style="color:#d1d5db;">' + (typeof esc === "function" ? esc(msg) : msg) + '</div>' +
    '</div>' +
    '<div style="display:flex; align-items:center; gap:8px; margin-left:8px;">' +
      '<button id="pcbToastBtnMaj" class="tb mini on" style="background:#f59e0b; color:#111; font-weight:bold; cursor:pointer; padding:4px 10px; border-radius:4px; border:none;">🔄 Mettre à jour</button>' +
      '<button id="pcbToastBtnClose" class="pnl-btn" style="cursor:pointer; background:none; border:none; color:#9ca3af; font-size:14px; padding:2px 6px;" title="Ignorer">✕</button>' +
    '</div>';

  const bMaj = document.getElementById("pcbToastBtnMaj");
  if (bMaj) {
    bMaj.onclick = function() {
      if (typeof onMaj === "function") onMaj();
    };
  }

  const bClose = document.getElementById("pcbToastBtnClose");
  if (bClose) {
    bClose.onclick = function() {
      if (typeof onIgnorer === "function") onIgnorer();
      if (toast && toast.parentNode) toast.remove();
    };
  }
}

function pcbAfficherToastFeedback(msg, succes) {
  if (typeof document === "undefined") return;
  let t = document.getElementById("pcbFeedbackToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "pcbFeedbackToast";
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

function pcbAppliquerMajLib(pkgName) {
  if (!pkgName) return 0;
  if (typeof push === "function") push();

  // Invalider le cache pour cette empreinte
  const key = (typeof pkgKey === "function") ? pkgKey(pkgName) : String(pkgName).toUpperCase();
  if (typeof PCB_LIB_CACHE !== "undefined") {
    if (typeof PCB_LIB_CACHE.delete === "function") {
      PCB_LIB_CACHE.delete(key);
      PCB_LIB_CACHE.delete(pkgName);
    } else {
      delete PCB_LIB_CACHE[key];
      delete PCB_LIB_CACHE[pkgName];
    }
  }

  const matches = pcbTrouverEmpreintesAmettreAJour(pkgName);
  let count = 0;

  const onDone = () => {
    const kTarget = (typeof pkgKey === "function") ? pkgKey(pkgName) : String(pkgName).toUpperCase();
    for (const name of Array.from(PCB_LIB_ALERTE.pkgNames)) {
      const k = (typeof pkgKey === "function") ? pkgKey(name) : String(name).toUpperCase();
      if (k === kTarget || name === pkgName) {
        PCB_LIB_ALERTE.pkgNames.delete(name);
      }
    }
    if (PCB_LIB_ALERTE.pkgNames.size === 0) {
      PCB_LIB_ALERTE.active = false;
      const t = document.getElementById("pcbLibToast");
      if (t && t.parentNode) t.remove();
    }

    if (typeof conn === "function") conn();
    if (typeof runDrc === "function") runDrc();
    if (typeof touch === "function") touch();
    if (typeof draw === "function") draw();
    if (typeof buildProps === "function") buildProps();

    pcbAfficherToastFeedback(`✅ ${count} empreinte(s) mise(s) à jour depuis la bibliothèque (DRC vérifié)`, true);
    return count;
  };

  const promises = [];
  for (const fp of matches) {
    if (typeof pcbAppliquerEmpreinteLib === "function") {
      const res = pcbAppliquerEmpreinteLib(fp, fp.pkg);
      count++;
      if (res && typeof res.then === "function") {
        promises.push(res);
      }
    }
  }

  if (promises.length > 0) {
    return Promise.all(promises).then(onDone);
  } else {
    return onDone();
  }
}

function pcbInitialiserLibSync() {
  if (typeof sessEcouterLibModif !== "function") return;

  sessEcouterLibModif(function(detail) {
    if (!detail) return;

    if (detail.typeFichier === "pcb" || detail.genre === "catalogue") {
      const nom = detail.nom ? detail.nom.replace(/\.json$/i, "") : "";
      
      // Invalidation préventive du cache
      if (nom && typeof PCB_LIB_CACHE !== "undefined") {
        const k = (typeof pkgKey === "function") ? pkgKey(nom) : nom.toUpperCase();
        if (typeof PCB_LIB_CACHE.delete === "function") PCB_LIB_CACHE.delete(k);
        else delete PCB_LIB_CACHE[k];
      }

      if (typeof pcbChargerCatalogueEmpreintes === "function") {
        pcbChargerCatalogueEmpreintes();
      }
      if (typeof pcbChargerCsvLib === "function") {
        pcbChargerCsvLib();
      }

      if (!nom) return;

      const matches = pcbTrouverEmpreintesAmettreAJour(nom);
      if (matches.length > 0) {
        PCB_LIB_ALERTE.active = true;
        PCB_LIB_ALERTE.detail = detail;
        PCB_LIB_ALERTE.pkgNames.add(nom);

        const titre = "Bibliothèque modifiée";
        const msg = `L'empreinte "${nom}" a été modifiée dans Gestion LIB (${matches.length} composant(s) sur le PCB).`;

        pcbAfficherAlerteLib(titre, msg, function() {
          pcbAppliquerMajLib(nom);
        }, function() {
          PCB_LIB_ALERTE.pkgNames.delete(nom);
          if (PCB_LIB_ALERTE.pkgNames.size === 0) PCB_LIB_ALERTE.active = false;
        });

        if (typeof buildProps === "function") buildProps();
      }
    }
  });
}

async function pcbChargerCsvLib() {
  if (typeof window !== "undefined" && window.CSV_LIB && window.CSV_LIB.length > 0) return window.CSV_LIB;
  if (typeof fetch === "function") {
    try {
      const res = await fetch("/api/lib/composants");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.composants)) {
          if (typeof window !== "undefined") window.CSV_LIB = data.composants;
          return data.composants;
        }
      }
    } catch (_) {}
  }
  return (typeof window !== "undefined" && window.CSV_LIB) ? window.CSV_LIB : [];
}

pcbInitialiserLibSync();
pcbChargerCsvLib();
