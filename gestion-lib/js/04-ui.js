"use strict";
/* =============================================================================
   Gestion LIB — 04-ui.js
   Contrôleur d'interface utilisateur, gestion des événements et liaisons
   ============================================================================= */

let pcbRendererMain = null;
let schRendererMain = null;
let currentTab = "composants";

function initApp() {
  // Instanciation des moteurs de rendu de l'inspecteur
  const cvPcb = document.getElementById("canvasPcbInsp");
  const cvSch = document.getElementById("canvasSchInsp");
  if (cvPcb) pcbRendererMain = new PcbRenderer(cvPcb);
  if (cvSch) schRendererMain = new SymboleRenderer(cvSch);

  // Écouteurs de la barre de recherche & filtres
  const inpSearch = document.getElementById("searchComp");
  if (inpSearch) {
    inpSearch.addEventListener("input", () => {
      LIB_STATE.filtres.recherche = inpSearch.value;
      rafraichirTable();
    });
  }

  const selPrefix = document.getElementById("filterPrefix");
  if (selPrefix) {
    selPrefix.addEventListener("change", () => {
      LIB_STATE.filtres.prefix = selPrefix.value;
      rafraichirTable();
    });
  }

  const selStatut = document.getElementById("filterStatut");
  if (selStatut) {
    selStatut.addEventListener("change", () => {
      LIB_STATE.filtres.statut = selStatut.value;
      rafraichirTable();
    });
  }

  // Écouteurs de recherche pour les galeries
  const inpSearchPcb = document.getElementById("searchPcb");
  if (inpSearchPcb) {
    inpSearchPcb.addEventListener("input", () => {
      LIB_GAL_STATE.pcb.query = inpSearchPcb.value;
      LIB_GAL_STATE.pcb.page = 1;
      rafraichirGaleriePcb();
    });
  }

  const inpSearchSch = document.getElementById("searchSch");
  if (inpSearchSch) {
    inpSearchSch.addEventListener("input", () => {
      LIB_GAL_STATE.sch.query = inpSearchSch.value;
      LIB_GAL_STATE.sch.page = 1;
      rafraichirGalerieSch();
    });
  }

  const inpSearchSim = document.getElementById("searchSim");
  if (inpSearchSim) {
    inpSearchSim.addEventListener("input", () => {
      LIB_GAL_STATE.sim.query = inpSearchSim.value;
      LIB_GAL_STATE.sim.page = 1;
      rafraichirGalerieSim();
    });
  }

  // Onglets
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      basculerOnglet(tab);
    });
  });

  // Boutons d'action principaux
  const bSave = document.getElementById("bSave");
  if (bSave) bSave.addEventListener("click", actionEnregistrer);

  const bAuto = document.getElementById("bAutoAssoc");
  if (bAuto) bAuto.addEventListener("click", actionAutoAssocier);

  const bExport = document.getElementById("bExportCsv");
  if (bExport) bExport.addEventListener("click", () => telechargerCsv());

  const bNouveau = document.getElementById("bNewComp");
  if (bNouveau) bNouveau.addEventListener("click", ouvrirModaleNouveauComposant);

  const bNewPcb = document.getElementById("bNewPcb");
  if (bNewPcb) bNewPcb.addEventListener("click", () => creerNouvelleEmpreintePcb());

  const bNewSch = document.getElementById("bNewSch");
  if (bNewSch) bNewSch.addEventListener("click", () => creerNouveauSymboleSch());

  const bModeIa = document.getElementById("bModeIaLib");
  if (bModeIa) bModeIa.addEventListener("click", () => iaLibBasculer());

  const bCols = document.getElementById("bReglerColonnes");
  if (bCols) bCols.addEventListener("click", () => ouvrirModaleColonnes());

  // Double-clic sur les aperçus de l'inspecteur pour ouvrir l'éditeur
  if (cvPcb && cvPcb.parentElement) {
    cvPcb.parentElement.style.cursor = "pointer";
    cvPcb.parentElement.title = "Double-cliquez pour éditer l'empreinte PCB";
    cvPcb.parentElement.addEventListener("dblclick", () => {
      const nom = document.getElementById("inspPcbName")?.textContent?.trim();
      if (nom && nom !== "Non associée" && nom !== "—") {
        ouvrirEditeurPcb(nom);
      }
    });
  }
  if (cvSch && cvSch.parentElement) {
    cvSch.parentElement.style.cursor = "pointer";
    cvSch.parentElement.title = "Double-cliquez pour éditer le symbole schématique";
    cvSch.parentElement.addEventListener("dblclick", () => {
      const nom = document.getElementById("inspSchName")?.textContent?.trim();
      if (nom && nom !== "Non associé" && nom !== "—") {
        ouvrirEditeurSch(nom);
      }
    });
  }

  // Fermeture des modales avec la touche Echap
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fermerModaleNouveauComposant();
      fermerModaleColonnes();
      fermerEditeurLib();
      iaLibFermer();
    }
  });

  // Chargement initial des données
  afficherToast("Chargement de la bibliothèque...", "info");
  chargerDonneesBibliotheque().then(res => {
    afficherToast(`${res.total} composants chargés avec succès`, "success");
    remplirFiltresPrefixes();
    rafraichirTout();
    // Gestion des paramètres d'URL (liaison directe depuis Schématique ou PCB)
    try {
      const params = new URLSearchParams(window.location.search);
      const paramComp = params.get("comp");
      const paramTab = params.get("tab");
      const paramNom = params.get("nom");
      if (paramComp) {
        LIB_STATE.filtres.recherche = paramComp;
        const sInput = document.getElementById("searchComp");
        if (sInput) sInput.value = paramComp;
        rafraichirTable();
        const found = LIB_STATE.composants.find(c =>
          (c["Part Name"] || "").toLowerCase() === paramComp.toLowerCase() ||
          (c["Part Number "] || c["Part Number"] || "").toLowerCase() === paramComp.toLowerCase()
        );
        if (found) {
          selectionnerComposant(found._id);
        } else if (LIB_STATE.composants.length > 0) {
          selectionnerComposant(LIB_STATE.composants[0]._id);
        }
      } else if (paramTab) {
        basculerOnglet(paramTab);
        if (paramNom) {
          if (paramTab === "pcb" && typeof ouvrirEditeurPcb === "function") {
            ouvrirEditeurPcb(paramNom);
          } else if (paramTab === "schematique" && typeof ouvrirEditeurSch === "function") {
            ouvrirEditeurSch(paramNom);
          }
        }
      } else if (LIB_STATE.composants.length > 0) {
        selectionnerComposant(LIB_STATE.composants[0]._id);
      }
    } catch (_) {
      if (LIB_STATE.composants.length > 0) {
        selectionnerComposant(LIB_STATE.composants[0]._id);
      }
    }
  }).catch(err => {
    afficherToast("Erreur de chargement : " + err.message, "error");
  });
}

function basculerOnglet(tabName) {
  currentTab = tabName;
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-tab") === tabName);
  });

  document.getElementById("viewComposants").hidden = (tabName !== "composants");
  document.getElementById("viewPcb").hidden = (tabName !== "pcb");
  document.getElementById("viewSch").hidden = (tabName !== "schematique");
  document.getElementById("viewSim").hidden = (tabName !== "simulation");

  // Masquer l'inspecteur latéral dans les onglets galeries pour donner plus d'espace
  const insp = document.getElementById("inspectorPanel");
  if (insp) {
    insp.classList.toggle("collapsed", tabName !== "composants");
  }

  if (tabName === "composants") rafraichirTable();
  else if (tabName === "pcb") rafraichirGaleriePcb();
  else if (tabName === "schematique") rafraichirGalerieSch();
  else if (tabName === "simulation") rafraichirGalerieSim();
}

function remplirFiltresPrefixes() {
  const sel = document.getElementById("filterPrefix");
  if (!sel) return;
  const prefixes = new Set();
  for (const c of LIB_STATE.composants) {
    const p = (c["Reference designator Prefix"] || "").trim().toUpperCase();
    if (p) prefixes.add(p);
  }
  const tries = Array.from(prefixes).sort();
  sel.innerHTML = '<option value="TOUS">Tous les préfixes (R, C, U...)</option>';
  for (const p of tries) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = `${p} (${LIB_STATE.composants.filter(c => (c["Reference designator Prefix"]||"").toUpperCase() === p).length})`;
    sel.appendChild(opt);
  }
}

function rafraichirStats() {
  const s = calculerStats();
  document.getElementById("statTotalComps").textContent = s.total;
  document.getElementById("statPcbAssoc").textContent = `${s.avecPcb} (${s.tauxPcb} %)`;
  document.getElementById("statSchAssoc").textContent = `${s.avecSch} (${s.tauxSch} %)`;
  document.getElementById("statSimAssoc").textContent = `${s.avecSim} (${s.tauxSim} %)`;

  // Badges des onglets
  document.getElementById("badgeComps").textContent = s.total;
  document.getElementById("badgePcb").textContent = s.totalPcbDispo;
  document.getElementById("badgeSch").textContent = s.totalSchDispo;
  document.getElementById("badgeSim").textContent = s.totalSimDispo;

  // État du bouton Enregistrer
  const bSave = document.getElementById("bSave");
  if (bSave) {
    bSave.classList.toggle("on", LIB_STATE.sale);
    bSave.textContent = LIB_STATE.sale ? "💾 Enregistrer *" : "💾 Enregistré";
  }
}

function rafraichirTout() {
  rafraichirStats();
  rafraichirTable();
}

/* ---------- Rendu de la table de composants ---------- */

function rafraichirTable() {
  rafraichirStats();
  const tbody = document.getElementById("tableBodyComps");
  const thead = document.getElementById("tableHeadComps");
  if (!tbody) return;

  if (!Array.isArray(LIB_STATE.colonnesVisibles) || LIB_STATE.colonnesVisibles.length === 0) {
    initialiserColonnesVisibles();
  }

  // Mettre à jour le compteur du bouton Colonnes
  const countBadge = document.getElementById("countColVisibles");
  if (countBadge) countBadge.textContent = LIB_STATE.colonnesVisibles.length;

  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  // 1. Rendu dynamique des en-têtes
  if (thead) {
    let thsHtml = "";
    LIB_STATE.colonnesVisibles.forEach(col => {
      const isTri = LIB_STATE.tri.colonne === col;
      const fleche = isTri ? (LIB_STATE.tri.asc ? " ▲" : " ▼") : "";
      let styleCol = "cursor:pointer; user-select:none; white-space:nowrap;";
      if (col === colPcb || col === colSch) {
        styleCol += " color:var(--blue); min-width:160px;";
      } else if (col === colSim) {
        styleCol += " color:var(--yellow); min-width:160px;";
      } else if (col === "Part Name") {
        styleCol += " min-width:140px;";
      } else if (col === "Reference designator Prefix") {
        styleCol += " width:65px;";
      } else if (col === "Description") {
        styleCol += " min-width:220px;";
      }
      thsHtml += `<th style="${styleCol}" onclick="trierParColonne('${escapeHtml(col)}')" title="Cliquer pour trier par ${escapeHtml(col)}">${escapeHtml(col)}${fleche}</th>`;
    });
    thead.innerHTML = `<tr>${thsHtml}</tr>`;
  }

  const liste = obtenirComposantsFiltres();
  document.getElementById("compListCount").textContent = `${liste.length} affiché(s) sur ${LIB_STATE.composants.length}`;

  // Options pour les sélecteurs
  const pcbOptions = ['<option value="">-- Aucune --</option>']
    .concat(LIB_STATE.fichiers.pcb.map(f => `<option value="${f}">${f}</option>`)).join("");
  const schOptions = ['<option value="">-- Aucun --</option>']
    .concat(LIB_STATE.fichiers.schematique.map(f => `<option value="${f}">${f}</option>`)).join("");
  const simOptions = ['<option value="">-- Aucun --</option>']
    .concat(LIB_STATE.fichiers.simulation.map(f => `<option value="${f}">${f}</option>`)).join("");

  let html = "";
  const maxRows = Math.min(250, liste.length);
  for (let i = 0; i < maxRows; i++) {
    const c = liste[i];
    const isSelected = LIB_STATE.selection && LIB_STATE.selection._id === c._id;
    const pcbVal = c[colPcb] || "";
    const schVal = c[colSch] || "";
    const simVal = c[colSim] || "";

    html += `<tr data-id="${c._id}" class="${isSelected ? 'selected' : ''}">`;

    LIB_STATE.colonnesVisibles.forEach(col => {
      const val = c[col] !== undefined ? c[col] : "";

      if (col === colPcb) {
        html += `
          <td>
            <select class="sel-assoc ${pcbVal ? 'has-val' : 'empty'}" data-field="${colPcb}" data-id="${c._id}">
              ${pcbOptions.replace(`value="${pcbVal}"`, `value="${pcbVal}" selected`)}
            </select>
          </td>
        `;
      } else if (col === colSch) {
        html += `
          <td>
            <select class="sel-assoc ${schVal ? 'has-val' : 'empty'}" data-field="${colSch}" data-id="${c._id}">
              ${schOptions.replace(`value="${schVal}"`, `value="${schVal}" selected`)}
            </select>
          </td>
        `;
      } else if (col === colSim) {
        html += `
          <td>
            <select class="sel-assoc ${simVal ? 'has-val' : 'empty'}" data-field="${colSim}" data-id="${c._id}">
              ${simOptions.replace(`value="${simVal}"`, `value="${simVal}" selected`)}
            </select>
          </td>
        `;
      } else if (col === "Reference designator Prefix") {
        html += `<td><span class="tag-prefix">${escapeHtml(val || "—")}</span></td>`;
      } else if (col === "Package type") {
        html += `<td><span class="tag-pkg">${escapeHtml(val || "—")}</span></td>`;
      } else if (col === "Part Name") {
        html += `<td><b>${escapeHtml(val || "")}</b></td>`;
      } else {
        html += `<td><span title="${escapeHtml(val)}" style="max-width:240px; display:inline-block; overflow:hidden; text-overflow:ellipsis; vertical-align:middle;">${escapeHtml(val || "—")}</span></td>`;
      }
    });

    html += `</tr>`;
  }

  tbody.innerHTML = html;

  // Événements sur les lignes
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", e => {
      if (e.target.tagName === "SELECT") return;
      const id = parseInt(tr.getAttribute("data-id"), 10);
      selectionnerComposant(id);
    });

    // Double-clic sur la ligne : ouvrir l'éditeur PCB si disponible, sinon schéma
    tr.addEventListener("dblclick", e => {
      const id = parseInt(tr.getAttribute("data-id"), 10);
      const c = LIB_STATE.composants.find(comp => comp._id === id);
      if (!c) return;
      if (c[colPcb] && typeof ouvrirEditeurPcb === "function") {
        ouvrirEditeurPcb(c[colPcb]);
      } else if (c[colSch] && typeof ouvrirEditeurSch === "function") {
        ouvrirEditeurSch(c[colSch]);
      }
    });
  });

  // Événements sur les sélecteurs
  tbody.querySelectorAll("select.sel-assoc").forEach(sel => {
    sel.addEventListener("change", e => {
      const id = parseInt(sel.getAttribute("data-id"), 10);
      const field = sel.getAttribute("data-field");
      const val = sel.value;
      modifierComposant(id, field, val);
      sel.className = `sel-assoc ${val ? 'has-val' : 'empty'}`;
      rafraichirStats();
      if (LIB_STATE.selection && LIB_STATE.selection._id === id) {
        selectionnerComposant(id);
      }
    });
  });
}

function trierParColonne(col) {
  if (LIB_STATE.tri.colonne === col) {
    LIB_STATE.tri.asc = !LIB_STATE.tri.asc;
  } else {
    LIB_STATE.tri.colonne = col;
    LIB_STATE.tri.asc = true;
  }
  rafraichirTable();
}

/* ---------- Sélection et inspecteur de composant ---------- */

async function selectionnerComposant(id) {
  const comp = LIB_STATE.composants.find(c => c._id === id);
  if (!comp) return;
  LIB_STATE.selection = comp;

  // Mise à jour de la classe selected sur la table
  document.querySelectorAll("#tableBodyComps tr").forEach(tr => {
    tr.classList.toggle("selected", parseInt(tr.getAttribute("data-id"), 10) === id);
  });

  // Titre inspecteur
  document.getElementById("inspPartName").textContent = comp["Part Name"] || "(sans nom)";
  document.getElementById("inspDesc").textContent = comp["Description"] || "Aucune description";
  document.getElementById("inspPkg").textContent = comp["Package type"] || "—";
  document.getElementById("inspMfr").textContent = comp["Manufacturer"] || "—";
  document.getElementById("inspMpn").textContent = comp["manufacturer part Number"] || comp["Part Number "] || "—";
  document.getElementById("inspVal").textContent = comp["Value"] || "—";

  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  const nomPcb = comp[colPcb];
  const nomSch = comp[colSch];
  const nomSim = comp[colSim];

  document.getElementById("inspPcbName").textContent = nomPcb || "Non associée";
  document.getElementById("inspSchName").textContent = nomSch || "Non associé";

  // Rendu de l'empreinte PCB
  if (pcbRendererMain) {
    if (nomPcb) {
      const pcbData = await obtenirFichierLib("pcb", nomPcb);
      if (pcbData) {
        pcbRendererMain.setFootprint(pcbData);
      }
    } else {
      pcbRendererMain.setFootprint(null);
    }
  }

  // Rendu du symbole schématique
  if (schRendererMain) {
    if (nomSch) {
      const schData = await obtenirFichierLib("schematique", nomSch);
      if (schData) {
        schRendererMain.setSymbol(schData);
      }
    } else {
      schRendererMain.setSymbol(null);
    }
  }

  // Rendu aperçu simulation
  const simWrap = document.getElementById("inspSimWrap");
  if (simWrap) {
    if (nomSim) {
      const simData = await obtenirFichierLib("simulation", nomSim);
      document.getElementById("inspSimCode").textContent = simData || "(Modèle vide)";
      simWrap.hidden = false;
    } else {
      simWrap.hidden = true;
    }
  }
}

/* ---------- Rendu des galeries d'empreintes, symboles et simulation avec pagination ---------- */

const LIB_GAL_STATE = {
  pcb: { page: 1, pageSize: 24, query: "" },
  sch: { page: 1, pageSize: 24, query: "" },
  sim: { page: 1, pageSize: 20, query: "" }
};

function rendrePaginationBar(barEl, current, total, onPageChange) {
  if (!barEl) return;
  if (total <= 1) {
    barEl.innerHTML = "";
    return;
  }
  let html = `<button class="page-btn" ${current <= 1 ? "disabled" : ""} data-p="${current - 1}" title="Page précédente">◀</button>`;

  let startP = Math.max(1, current - 2);
  let endP = Math.min(total, current + 2);
  if (startP > 1) {
    html += `<button class="page-btn" data-p="1">1</button>`;
    if (startP > 2) html += `<span class="page-info">…</span>`;
  }
  for (let p = startP; p <= endP; p++) {
    html += `<button class="page-btn ${p === current ? "active" : ""}" data-p="${p}">${p}</button>`;
  }
  if (endP < total) {
    if (endP < total - 1) html += `<span class="page-info">…</span>`;
    html += `<button class="page-btn" data-p="${total}">${total}</button>`;
  }

  html += `<button class="page-btn" ${current >= total ? "disabled" : ""} data-p="${current + 1}" title="Page suivante">▶</button>`;
  html += `<span class="page-info">${current}/${total}</span>`;
  barEl.innerHTML = html;

  barEl.querySelectorAll(".page-btn[data-p]").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const p = parseInt(b.getAttribute("data-p"), 10);
      if (p >= 1 && p <= total && p !== current) {
        onPageChange(p);
      }
    };
  });
}

function rafraichirGaleriePcb() {
  const container = document.getElementById("gridPcbCards");
  if (!container) return;
  const rawList = LIB_STATE.fichiers.pcb || [];
  const q = (LIB_GAL_STATE.pcb.query || "").toLowerCase().trim();
  const list = rawList.filter(f => !q || f.toLowerCase().includes(q));

  const countBadge = document.getElementById("countPcbBadge");
  if (countBadge) countBadge.textContent = `${list.length} empreinte${list.length > 1 ? "s" : ""}`;

  const pageSize = LIB_GAL_STATE.pcb.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  LIB_GAL_STATE.pcb.page = Math.max(1, Math.min(LIB_GAL_STATE.pcb.page, totalPages));
  const page = LIB_GAL_STATE.pcb.page;

  const pageBar = document.getElementById("pcbPaginationBar");
  rendrePaginationBar(pageBar, page, totalPages, (newPage) => {
    LIB_GAL_STATE.pcb.page = newPage;
    rafraichirGaleriePcb();
  });

  const slice = list.slice((page - 1) * pageSize, page * pageSize);

  if (slice.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1; padding:32px; text-align:center; color:var(--txt-dim);">Aucune empreinte ne correspond à votre recherche.</div>`;
    return;
  }

  let html = "";
  for (const f of slice) {
    const base = f.replace(/\.json$/i, "");
    html += `
      <div class="lib-card" data-nom="${f}" data-type="pcb" title="Double-cliquez pour éditer l'empreinte">
        <canvas class="lib-card-canvas" id="cv_pcb_${escapeHtml(base)}"></canvas>
        <div class="lib-card-info">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="lib-card-title">${escapeHtml(base)}</span>
            <button class="tb mini" style="padding:1px 6px; font-size:10px;" onclick="event.stopPropagation(); ouvrirEditeurPcb('${escapeHtml(f)}');" title="Éditer">✏️</button>
          </div>
          <div class="lib-card-sub">
            <span>JSON</span>
            <span>Double-clic pour éditer</span>
          </div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;

  slice.forEach(async f => {
    const base = f.replace(/\.json$/i, "");
    const cv = document.getElementById(`cv_pcb_${base}`);
    if (cv) {
      const r = new PcbRenderer(cv);
      const data = await obtenirFichierLib("pcb", f);
      if (data) r.setFootprint(data);
    }
  });

  container.querySelectorAll(".lib-card").forEach(card => {
    const f = card.getAttribute("data-nom");
    card.addEventListener("dblclick", () => {
      if (typeof ouvrirEditeurPcb === "function") {
        ouvrirEditeurPcb(f);
      }
    });
  });
}

function rafraichirGalerieSch() {
  const container = document.getElementById("gridSchCards");
  if (!container) return;
  const rawList = LIB_STATE.fichiers.schematique || [];
  const q = (LIB_GAL_STATE.sch.query || "").toLowerCase().trim();
  const list = rawList.filter(f => !q || f.toLowerCase().includes(q));

  const countBadge = document.getElementById("countSchBadge");
  if (countBadge) countBadge.textContent = `${list.length} symbole${list.length > 1 ? "s" : ""}`;

  const pageSize = LIB_GAL_STATE.sch.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  LIB_GAL_STATE.sch.page = Math.max(1, Math.min(LIB_GAL_STATE.sch.page, totalPages));
  const page = LIB_GAL_STATE.sch.page;

  const pageBar = document.getElementById("schPaginationBar");
  rendrePaginationBar(pageBar, page, totalPages, (newPage) => {
    LIB_GAL_STATE.sch.page = newPage;
    rafraichirGalerieSch();
  });

  const slice = list.slice((page - 1) * pageSize, page * pageSize);

  if (slice.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1; padding:32px; text-align:center; color:var(--txt-dim);">Aucun symbole ne correspond à votre recherche.</div>`;
    return;
  }

  let html = "";
  for (const f of slice) {
    const base = f.replace(/\.json$/i, "");
    html += `
      <div class="lib-card" data-nom="${f}" data-type="schematique" title="Double-cliquez pour éditer le symbole">
        <canvas class="lib-card-canvas" id="cv_sch_${escapeHtml(base)}"></canvas>
        <div class="lib-card-info">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="lib-card-title">${escapeHtml(base)}</span>
            <button class="tb mini" style="padding:1px 6px; font-size:10px;" onclick="event.stopPropagation(); ouvrirEditeurSch('${escapeHtml(f)}');" title="Éditer">✏️</button>
          </div>
          <div class="lib-card-sub">
            <span>JSON</span>
            <span>Double-clic pour éditer</span>
          </div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;

  slice.forEach(async f => {
    const base = f.replace(/\.json$/i, "");
    const cv = document.getElementById(`cv_sch_${base}`);
    if (cv) {
      const r = new SymboleRenderer(cv);
      const data = await obtenirFichierLib("schematique", f);
      if (data) r.setSymbol(data);
    }
  });

  container.querySelectorAll(".lib-card").forEach(card => {
    const f = card.getAttribute("data-nom");
    card.addEventListener("dblclick", () => {
      if (typeof ouvrirEditeurSch === "function") {
        ouvrirEditeurSch(f);
      }
    });
  });
}

function rafraichirGalerieSim() {
  const container = document.getElementById("gridSimCards");
  if (!container) return;
  const rawList = LIB_STATE.fichiers.simulation || [];
  const q = (LIB_GAL_STATE.sim.query || "").toLowerCase().trim();
  const list = rawList.filter(f => !q || f.toLowerCase().includes(q));

  const countBadge = document.getElementById("countSimBadge");
  if (countBadge) countBadge.textContent = `${list.length} modèle${list.length > 1 ? "s" : ""}`;

  const pageSize = LIB_GAL_STATE.sim.pageSize;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  LIB_GAL_STATE.sim.page = Math.max(1, Math.min(LIB_GAL_STATE.sim.page, totalPages));
  const page = LIB_GAL_STATE.sim.page;

  const pageBar = document.getElementById("simPaginationBar");
  rendrePaginationBar(pageBar, page, totalPages, (newPage) => {
    LIB_GAL_STATE.sim.page = newPage;
    rafraichirGalerieSim();
  });

  const slice = list.slice((page - 1) * pageSize, page * pageSize);

  if (slice.length === 0) {
    container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--txt-dim);">Aucun modèle de simulation ne correspond à votre recherche.</div>`;
    return;
  }

  let html = "";
  for (const f of slice) {
    html += `
      <div class="preview-card" style="margin-bottom:12px;">
        <div class="preview-card-head">
          <span>${escapeHtml(f)}</span>
          <span class="type-label">SPICE Subcircuit (.sub)</span>
        </div>
        <pre style="margin:0; padding:10px; background:#090a0c; font-family:var(--mono); font-size:11.5px; color:#93c5fd; overflow-x:auto;" id="sim_code_${escapeHtml(f.replace(/\./g, '_'))}">Chargement...</pre>
      </div>
    `;
  }
  container.innerHTML = html;

  slice.forEach(async f => {
    const el = document.getElementById(`sim_code_${f.replace(/\./g, '_')}`);
    if (el) {
      const data = await obtenirFichierLib("simulation", f);
      el.textContent = data || "(Fichier vide)";
    }
  });
}

/* ---------- Actions utilisateur ---------- */

async function actionEnregistrer() {
  afficherToast("Enregistrement des modifications en cours...", "info");
  try {
    const res = await enregistrerCatalogue();
    afficherToast("Modifications enregistrées avec succès dans LIB/LIB_composants.csv", "success");
    rafraichirStats();
  } catch (err) {
    afficherToast("Échec de l'enregistrement : " + err.message, "error");
  }
}

function actionAutoAssocier() {
  const n = autoAssocierCatalogue();
  if (n > 0) {
    afficherToast(`${n} association(s) automatique(s) générée(s)`, "success");
    rafraichirTout();
  } else {
    afficherToast("Tous les composants sont déjà associés", "info");
  }
}

function ouvrirModaleNouveauComposant() {
  const modale = document.getElementById("modalNouveauComp");
  if (modale) {
    modale.hidden = false;
    modale.style.display = "flex";
    const inp = document.getElementById("newPartName");
    if (inp) inp.focus();
  }
}

function fermerModaleNouveauComposant() {
  const modale = document.getElementById("modalNouveauComp");
  if (modale) {
    modale.hidden = true;
    modale.style.display = "none";
  }
}

function creerNouveauComposant() {
  const partName = document.getElementById("newPartName").value.trim();
  if (!partName) {
    alert("Le nom du composant (Part Name) est obligatoire.");
    return;
  }
  const prefix = document.getElementById("newPrefix").value.trim().toUpperCase() || "U";
  const pkg = document.getElementById("newPackage").value.trim();
  const val = document.getElementById("newVal").value.trim();
  const desc = document.getElementById("newDesc").value.trim();
  const mfr = document.getElementById("newMfr").value.trim();

  const colPcb = "Empreinte PCB";
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const colSim = LIB_STATE.colonnes.includes("Modèle Simulation") ? "Modèle Simulation" : "Modele Simulation";

  const newComp = {
    _id: LIB_STATE.composants.length,
    "Part Name": partName,
    "Reference designator Prefix": prefix,
    "Package type": pkg,
    "Value": val,
    "Description": desc,
    "Manufacturer": mfr,
    [colPcb]: "",
    [colSch]: "",
    [colSim]: ""
  };

  LIB_STATE.composants.unshift(newComp);
  LIB_STATE.sale = true;
  fermerModaleNouveauComposant();
  autoAssocierCatalogue();
  rafraichirTout();
  selectionnerComposant(newComp._id);
  afficherToast(`Composant ${partName} créé avec succès`, "success");
}

/* ---------- Notification Toast ---------- */

function afficherToast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transition = "opacity 0.3s";
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- Modale de sélection des colonnes ---------- */

function ouvrirModaleColonnes() {
  const modal = document.getElementById("modalColonnes");
  if (!modal) return;
  modal.hidden = false;
  modal.style.display = "flex";
  remplirGrilleColonnesPicker();
}

function fermerModaleColonnes() {
  const modal = document.getElementById("modalColonnes");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
}

function remplirGrilleColonnesPicker(filtre = "") {
  const grid = document.getElementById("gridColonnesPicker");
  if (!grid) return;
  const q = (filtre || "").toLowerCase().trim();
  const visibles = new Set(LIB_STATE.colonnesVisibles);

  let html = "";
  LIB_STATE.colonnes.forEach((col) => {
    if (q && !col.toLowerCase().includes(q)) return;
    const isChecked = visibles.has(col);
    html += `
      <label class="col-item ${isChecked ? 'checked' : ''}">
        <input type="checkbox" value="${escapeHtml(col)}" ${isChecked ? 'checked' : ''} onchange="this.parentElement.classList.toggle('checked', this.checked); majCompteurColsPicker();">
        <span title="${escapeHtml(col)}">${escapeHtml(col)}</span>
      </label>
    `;
  });
  grid.innerHTML = html;
  majCompteurColsPicker();

  const inpSearch = document.getElementById("searchColonnes");
  if (inpSearch && !inpSearch._bound) {
    inpSearch._bound = true;
    inpSearch.addEventListener("input", () => {
      remplirGrilleColonnesPicker(inpSearch.value);
    });
  }
}

function majCompteurColsPicker() {
  const countEl = document.getElementById("countSelectionCols");
  if (!countEl) return;
  const checks = document.querySelectorAll("#gridColonnesPicker input[type='checkbox']:checked");
  countEl.textContent = checks.length;
}

function cocherToutesColonnes(val) {
  document.querySelectorAll("#gridColonnesPicker input[type='checkbox']").forEach(cb => {
    cb.checked = val;
    cb.parentElement.classList.toggle("checked", val);
  });
  majCompteurColsPicker();
}

function reinitialiserColonnesDefaut() {
  const defSet = new Set(COLONNES_DEFAUT);
  document.querySelectorAll("#gridColonnesPicker input[type='checkbox']").forEach(cb => {
    const isDef = defSet.has(cb.value);
    cb.checked = isDef;
    cb.parentElement.classList.toggle("checked", isDef);
  });
  majCompteurColsPicker();
}

function appliquerColonnesSelectionnees() {
  const choisies = [];
  document.querySelectorAll("#gridColonnesPicker input[type='checkbox']:checked").forEach(cb => {
    choisies.push(cb.value);
  });
  if (choisies.length === 0) {
    alert("Veuillez sélectionner au moins une colonne à afficher.");
    return;
  }
  enregistrerColonnesVisibles(choisies);
  fermerModaleColonnes();
  rafraichirTable();
  afficherToast(`${choisies.length} colonne(s) affichée(s) dans le catalogue`, "info");
}

// Export global
window.ouvrirModaleColonnes = ouvrirModaleColonnes;
window.fermerModaleColonnes = fermerModaleColonnes;
window.cocherToutesColonnes = cocherToutesColonnes;
window.reinitialiserColonnesDefaut = reinitialiserColonnesDefaut;
window.appliquerColonnesSelectionnees = appliquerColonnesSelectionnees;
window.trierParColonne = trierParColonne;

window.addEventListener("DOMContentLoaded", initApp);
