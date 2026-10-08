"use strict";
/* =============================================================================
   editeur-schematique — 23-patterns.js
   Reconnaissance de motifs de circuits et blocs fonctionnels.
   - Alimentations (LDO, Hacheurs)
   - Bus numériques (I2C, SPI, UART)
   - Oscillateurs et horloges
   - Filtres RC et amplificateurs
   - Suggestion de classes de nets et inférence de courants DC (A-FAIRE.md)
   ============================================================================= */

var SCHEMA_PATTERNS = (function() {
  let _timer = 0;
  let _derniersMotifs = null;
  let _chargementEnCours = false;
  let _derniersNets = {};
  let _netsOuverts = false;

  /* ---------- Extraction des composants et de la netlist globale ---------- */
  function extraireDonneesSchema() {
    if (typeof S === "undefined" || !S) return null;

    const compsMap = {};
    const allComps = [];

    if (Array.isArray(S.pages) && S.pages.length > 0) {
      S.pages.forEach((p, i) => {
        const cList = (i === S.page) ? S.comps : (p.comps || []);
        if (Array.isArray(cList)) {
          cList.forEach(c => allComps.push(c));
        }
      });
    } else if (Array.isArray(S.comps)) {
      S.comps.forEach(c => allComps.push(c));
    }

    allComps.forEach(c => {
      const ref = (c.ref || "").trim();
      if (!ref) return;
      compsMap[ref] = {
        val: (c.value || c.val || "").trim(),
        type: (c.type || "").trim(),
        pkg: (c.pkg || "").trim()
      };
    });

    const netsMap = {};
    const dn = (typeof docNets === "function") ? docNets() : null;

    if (dn && Array.isArray(dn.groups)) {
      dn.groups.forEach(g => {
        const nName = g.name;
        if (!netsMap[nName]) netsMap[nName] = [];
        (g.nodes || []).forEach(nd => {
          const compRef = (nd.comp && nd.comp.ref) ? nd.comp.ref : (nd.ref || "");
          if (compRef) {
            netsMap[nName].push({
              ref: compRef,
              pin: nd.pad || nd.pin || nd.pinName || 1,   // patte de l'empreinte (25-brochage.js)
              name: nd.label || ""
            });
          }
        });
      });
    }

    const zonesList = (typeof schToutesLesZones === "function") ? schToutesLesZones() : [];

    return { components: compsMap, nets: netsMap, zones: zonesList };
  }

  /* ---------- Cibler un composant au schéma ---------- */
  function ciblerComposantSchema(ref) {
    if (typeof S === "undefined" || !S || !Array.isArray(S.comps)) return;
    const comp = S.comps.find(c => (c.ref || "").trim() === ref);
    if (!comp) return;

    if (S.sel) {
      S.sel.clear();
      S.sel.add(comp.id);
    }
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  /* ---------- Classes de nets : suggestion de l'analyse + corrections ---------- */
  function classesFinales(data) {
    const res = Object.assign({}, (data && data.classes_suggerees) || {});
    const man = (typeof S !== "undefined" && S && S.netClasses) || {};
    for (const n in man) res[n] = man[n];
    return res;
  }

  // l'éditeur PCB, ouvert dans un autre onglet, applique ces classes en direct
  function publierClasses(data) {
    const classes = classesFinales(data);
    try {
      const paires = (data && data.paires_diff) || [];
      // les nœuds de commutation d'un hacheur : ils agressent leurs voisins
      const bruyants = Object.keys((data && data.nets_bruyants) || {});
      sessionStorage.setItem("web_cao_netclasses", JSON.stringify(classes));
      sessionStorage.setItem("web_cao_paires_diff", JSON.stringify(paires));
      sessionStorage.setItem("web_cao_nets_bruyants", JSON.stringify(bruyants));
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("web_cao_patterns_sync");
        bc.postMessage({ type: "netclasses_updated", classes: classes, paires: paires,
                         bruyants: bruyants });
        bc.close();
      }
    } catch (_) {}
  }

  function htmlClassesNets(data) {
    const noms = Object.keys(_derniersNets).filter(n => n && _derniersNets[n].length)
      .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    if (!noms.length) return "";
    const sug = (data && data.classes_suggerees) || {};
    const why = (data && data.raisons_classes) || {};
    const man = S.netClasses || {};
    const partenaire = {};
    ((data && data.paires_diff) || []).forEach(p => { partenaire[p[0]] = p[1]; partenaire[p[1]] = p[0]; });
    const nbMan = noms.filter(n => man[n]).length;
    return `
      <details id="patNets" ${_netsOuverts ? "open" : ""} style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:8px 10px;">
        <summary style="cursor:pointer;font-weight:600;font-size:10px;color:var(--txt-dim);text-transform:uppercase;letter-spacing:0.08em;">
          Classes de nets (${noms.length}${nbMan ? " · " + nbMan + " corrigée(s)" : ""})
        </summary>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
          ${noms.map(n => {
            const auto = sug[n] || "Lent";
            const raison = man[n] ? "Corrigé à la main (auto : " + auto + ")"
              : (why[n] || "Aucun indice : lent par défaut");
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <div style="min-width:0;">
                  <div style="font-family:var(--mono);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${esc(n)}${partenaire[n] ? ` <span style="color:var(--blue);" title="Paire différentielle">⇄ ${esc(partenaire[n])}</span>` : ""}
                  </div>
                  <div style="font-size:10px;color:${man[n] ? "var(--yellow)" : "var(--txt-dim)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(raison)}">${esc(raison)}</div>
                </div>
                <select data-net="${esc(n)}" aria-label="Classe du net ${esc(n)}" style="font-size:11px;flex:none;">
                  <option value="">Auto (${esc(auto)})</option>
                  ${NET_CLASSES.map(c => `<option${man[n] === c ? " selected" : ""}>${c}</option>`).join("")}
                </select>
              </div>`;
          }).join("")}
        </div>
      </details>`;
  }

  function cablerClassesNets(el) {
    const det = el.querySelector("#patNets");
    if (det) det.ontoggle = () => { _netsOuverts = det.open; };
    el.querySelectorAll("select[data-net]").forEach(sel => {
      sel.onchange = () => {
        const n = sel.dataset.net;
        if (typeof push === "function") push();
        if (sel.value) S.netClasses[n] = sel.value;
        else delete S.netClasses[n];
        publierClasses(_derniersMotifs);
        rendrePanneau(_derniersMotifs, null);
      };
    });
  }

  /* ---------- Rendu du panneau dans l'interface ---------- */
  function rendrePanneau(data, erreur) {
    const el = document.getElementById("pnlPatternsBody");
    if (!el) return;

    if (erreur) {
      // « HTTP … » : le serveur a répondu, il refuse ; sinon il est injoignable
      const repondu = /^HTTP \d/.test(String(erreur));
      el.innerHTML = `
        <div style="padding:12px;color:var(--txt-dim);font-size:12px;line-height:1.5;">
          <div style="color:var(--yellow);font-weight:600;margin-bottom:6px;">⚠️ ${repondu ? "Analyse refusée par le serveur" : "Serveur non disponible"}</div>
          <div>${esc(erreur)}</div>
          ${repondu ? "" : '<div style="margin-top:8px;font-size:11px;color:var(--txt-dim);">Lancez <code>python web_CAO.py</code> pour activer la reconnaissance de motifs.</div>'}
          <button class="tb" id="bPatternsRefresh" style="margin-top:10px;width:100%;justify-content:center;">🔄 Réessayer</button>
        </div>
      `;
      const btn = document.getElementById("bPatternsRefresh");
      if (btn) btn.onclick = () => analyser(0);
      return;
    }

    const classesHtml = htmlClassesNets(data);
    if (!data || !Array.isArray(data.motifs) || (data.motifs.length === 0 && !classesHtml)) {
      el.innerHTML = `
        <div style="padding:14px;color:var(--txt-dim);font-size:12px;text-align:center;">
          <div>Aucun motif standard reconnu pour l'instant.</div>
          <div style="font-size:11px;margin-top:6px;">Ajoutez un régulateur (AMS1117, 7805...), un quartz ou des résistances de pull-up I2C pour voir les blocs.</div>
          <button class="tb" id="bPatternsRefresh" style="margin-top:12px;display:inline-flex;">🔄 Actualiser</button>
        </div>
      `;
      const btn = document.getElementById("bPatternsRefresh");
      if (btn) btn.onclick = () => analyser(0);
      return;
    }

    const motifs = data.motifs;
    const courants = data.courants_dc_estimes || [];

    let html = `
      <div style="padding:10px;display:flex;flex-direction:column;gap:10px;font-size:12px;">

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;">
            ${motifs.length} bloc(s) fonctionnel(s) détecté(s)
          </span>
          <button class="tb" id="bPatternsRefresh" style="padding:2px 6px;font-size:10px;" title="Rafraîchir l'analyse">🔄</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${motifs.map((m, idx) => `
            <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:8px 10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;color:var(--blue);">${esc(m.label || m.type)}</span>
                <span style="font-size:10px;padding:2px 5px;background:rgba(63,160,234,0.15);color:var(--blue);border-radius:3px;">
                  ${esc(m.suggested_netclass || 'Signal')}
                </span>
              </div>

              <!-- Composants du bloc -->
              <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
                ${(m.components || []).map(r => `
                  <button class="tb lk-sch-comp" data-ref="${esc(r)}" style="padding:2px 6px;font-size:10px;" title="Sélectionner au schéma">
                    ${esc(r)}
                  </button>
                `).join("")}
              </div>

              <!-- Équipotentielles associées -->
              ${m.nets && m.nets.length > 0 ? `
                <div style="margin-top:6px;font-size:10px;color:var(--txt-dim);">
                  Nets : <b>${(m.nets || []).map(esc).join(", ")}</b>
                </div>
              ` : ""}

              ${m.output_voltage ? `
                <div style="margin-top:4px;font-size:10px;color:var(--yellow);">
                  ⚡ Tension inférée : <b>${esc(m.output_voltage)} V</b>
                </div>
              ` : ""}
            </div>
          `).join("")}
        </div>

        ${classesHtml}

        <!-- Section Courants DC pour la simulation -->
        ${courants.length > 0 ? `
          <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:8px 10px;margin-top:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:600;font-size:10px;color:var(--yellow);text-transform:uppercase;letter-spacing:0.08em;">
                ⚡ Courants DC inférés (Solveur PI)
              </span>
              <button class="tb" id="bSyncDcCurrents" style="padding:2px 6px;font-size:10px;" title="Sauvegarder pour le solveur DC">
                Valider pour PI
              </button>
            </div>
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;font-size:11px;">
              ${courants.map(c => `
                <div style="display:flex;justify-content:space-between;color:var(--txt-dim);">
                  <span>${esc(c.source)} (${esc(c.type)})</span>
                  <span style="font-family:var(--mono);color:var(--txt);font-weight:600;">${esc(c.courant_ma)} mA</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

      </div>
    `;

    el.innerHTML = html;
    cablerClassesNets(el);

    const btnRef = document.getElementById("bPatternsRefresh");
    if (btnRef) btnRef.onclick = () => analyser(0);

    el.querySelectorAll(".lk-sch-comp").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const r = btn.getAttribute("data-ref");
        if (r) ciblerComposantSchema(r);
      };
    });

    const btnDc = document.getElementById("bSyncDcCurrents");
    if (btnDc) {
      btnDc.onclick = () => {
        try {
          sessionStorage.setItem("web_cao_courants_dc", JSON.stringify(courants));
          btnDc.textContent = "✓ Enregistré !";
          btnDc.style.color = "#4cd964";
          setTimeout(() => { btnDc.textContent = "Valider pour PI"; btnDc.style.color = ""; }, 2000);
        } catch (_) {}
      };
    }
  }

  /* ---------- Appel HTTP d'analyse des motifs ---------- */
  function analyser(delaiMs = 300) {
    if (_timer) clearTimeout(_timer);

    _timer = setTimeout(async () => {
      const doc = extraireDonneesSchema();
      if (!doc || Object.keys(doc.components).length === 0) {
        rendrePanneau(null, "Schéma vide.");
        return;
      }

      if (_chargementEnCours) return;
      _derniersNets = doc.nets;
      _chargementEnCours = true;

      try {
        const res = await fetch("/api/schema/patterns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc)
        });

        if (!res.ok) {
          /* Le serveur explique ses refus (CSRF, module absent) : son message
             vaut mieux qu'un « Forbidden » qui fait croire au serveur arrete. */
          let detail = "";
          try { detail = ((await res.json()) || {}).detail || ""; } catch (_) {}
          throw new Error("HTTP " + res.status + " : " + (detail || res.statusText));
        }

        const data = await res.json();
        if (data && data.succes) {
          _derniersMotifs = data;
          rendrePanneau(data, null);

          // Transmet les motifs, courants DC, netclasses et zones à l'éditeur PCB
          try {
            sessionStorage.setItem("web_cao_patterns_cache", JSON.stringify(data));
            if (Array.isArray(data.zones)) {
              sessionStorage.setItem("web_cao_zones", JSON.stringify(data.zones));
            } else if (Array.isArray(doc.zones)) {
              sessionStorage.setItem("web_cao_zones", JSON.stringify(doc.zones));
            }
            const cDc = data.courants_dc_estimes || data.courants_dc || [];
            sessionStorage.setItem("web_cao_courants_dc", JSON.stringify(cDc));
            publierClasses(data);
            if (typeof BroadcastChannel !== "undefined") {
              const bc = new BroadcastChannel("web_cao_patterns_sync");
              bc.postMessage({ type: "patterns_updated", data: data, zones: data.zones || doc.zones || [] });
              bc.close();
            }
          } catch (_) {}
        } else {
          rendrePanneau(null, (data && data.detail) || "Échec de l'analyse.");
        }
      } catch (err) {
        rendrePanneau(null, err.message);
      } finally {
        _chargementEnCours = false;
      }
    }, delaiMs);
  }

  /* ---------- Initialisation ---------- */
  function init() {
    const btnTb = document.getElementById("bPatterns");
    if (btnTb) {
      btnTb.onclick = () => {
        if (typeof WS !== "undefined" && WS.togglePanel) {
          WS.togglePanel("patterns");
        }
        analyser(0);
      };
    }

    // Premier appel différé
    setTimeout(() => analyser(100), 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 50);
  }

  return {
    analyser,
    ciblerComposantSchema
  };
})();
