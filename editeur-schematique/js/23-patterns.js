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
              pin: nd.pin || nd.pinName || 1
            });
          }
        });
      });
    }

    return { components: compsMap, nets: netsMap };
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

  /* ---------- Rendu du panneau dans l'interface ---------- */
  function rendrePanneau(data, erreur) {
    const el = document.getElementById("pnlPatternsBody");
    if (!el) return;

    if (erreur) {
      el.innerHTML = `
        <div style="padding:12px;color:var(--txt-dim);font-size:12px;line-height:1.5;">
          <div style="color:var(--yellow);font-weight:600;margin-bottom:6px;">⚠️ Serveur non disponible</div>
          <div>${erreur}</div>
          <div style="margin-top:8px;font-size:11px;color:var(--txt-dim);">Lancez <code>python serveur.py</code> pour activer la reconnaissance de motifs.</div>
          <button class="tb" id="bPatternsRefresh" style="margin-top:10px;width:100%;justify-content:center;">🔄 Réessayer</button>
        </div>
      `;
      const btn = document.getElementById("bPatternsRefresh");
      if (btn) btn.onclick = () => analyser(0);
      return;
    }

    if (!data || !Array.isArray(data.motifs) || data.motifs.length === 0) {
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
                <span style="font-weight:600;color:var(--blue);">${m.label || m.type}</span>
                <span style="font-size:10px;padding:2px 5px;background:rgba(63,160,234,0.15);color:var(--blue);border-radius:3px;">
                  ${m.suggested_netclass || 'Signal'}
                </span>
              </div>

              <!-- Composants du bloc -->
              <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
                ${(m.components || []).map(r => `
                  <button class="tb lk-sch-comp" data-ref="${r}" style="padding:2px 6px;font-size:10px;" title="Sélectionner au schéma">
                    ${r}
                  </button>
                `).join("")}
              </div>

              <!-- Équipotentielles associées -->
              ${m.nets && m.nets.length > 0 ? `
                <div style="margin-top:6px;font-size:10px;color:var(--txt-dim);">
                  Nets : <b>${m.nets.join(", ")}</b>
                </div>
              ` : ""}

              ${m.output_voltage ? `
                <div style="margin-top:4px;font-size:10px;color:var(--yellow);">
                  ⚡ Tension inférée : <b>${m.output_voltage} V</b>
                </div>
              ` : ""}
            </div>
          `).join("")}
        </div>

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
                  <span>${c.source} (${c.type})</span>
                  <span style="font-family:var(--mono);color:var(--txt);font-weight:600;">${c.courant_ma} mA</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

      </div>
    `;

    el.innerHTML = html;

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
      _chargementEnCours = true;

      try {
        const res = await fetch("/api/schema/patterns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc)
        });

        if (!res.ok) {
          throw new Error("HTTP " + res.status + " : " + res.statusText);
        }

        const data = await res.json();
        if (data && data.succes) {
          _derniersMotifs = data;
          rendrePanneau(data, null);

          // Transmet les motifs, courants DC et netclasses à l'éditeur PCB
          try {
            sessionStorage.setItem("web_cao_patterns_cache", JSON.stringify(data));
            const cDc = data.courants_dc_estimes || data.courants_dc || [];
            sessionStorage.setItem("web_cao_courants_dc", JSON.stringify(cDc));
            if (data.classes_suggerees) {
              sessionStorage.setItem("web_cao_netclasses", JSON.stringify(data.classes_suggerees));
            }
            if (typeof BroadcastChannel !== "undefined") {
              const bc = new BroadcastChannel("web_cao_patterns_sync");
              bc.postMessage({ type: "patterns_updated", data: data });
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
