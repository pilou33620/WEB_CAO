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
  /* Sans serveur, ou avant la première analyse, la masse et les alimentations
     se reconnaissent encore à leur nom, avec les règles du serveur
     (python/pattern_recognition.py, _RE_GROUND_NET puis _RE_POWER_NET) ; le
     reste est « Lent », la classe par défaut. */
  const RE_MASSE = /GND|VSS|(?<![\d.])0V(?!\d)|^MASSE$/i;
  const RE_ALIM = /VCC|VDD|VBAT|3V3|3[.,]3V|5V|12V|\bPWR\b|AVCC|DVCC|\+V/i;
  function classeAuto(nom) {
    const d = _derniersMotifs;
    const sug = d && d.classes_suggerees && d.classes_suggerees[nom];
    if (sug) return { classe: sug, raison: (d.raisons_classes || {})[nom] || "Analyse du schéma" };
    if (RE_MASSE.test(nom)) return { classe: "Masse", raison: "Nom de masse « " + nom + " »" };
    if (RE_ALIM.test(nom)) return { classe: "Alimentation", raison: "Nom d'alimentation « " + nom + " »" };
    return { classe: "Lent", raison: d ? "Aucun indice : lent par défaut"
                                       : "Sans analyse du serveur : lent par défaut" };
  }

  // les nets nommés du document, toutes feuilles : ceux qu'on peut classer
  function nomsNets() {
    try {
      if (typeof docNets === "function")
        return docNets().groups.filter(g => g.name && g.members.some(m => m.net && m.net.named))
          .map(g => g.name);
    } catch (_) {}
    return Object.keys(_derniersNets || {}).filter(Boolean);
  }

  function classesFinales(data) {
    const res = {};
    if (!data) {
      // pas d'analyse : seules les évidences, le PCB garde le reste (partiel)
      for (const n of nomsNets()) {
        const c = classeAuto(n).classe;
        if (c !== "Lent") res[n] = c;
      }
    }
    Object.assign(res, (data && data.classes_suggerees) || {});
    const man = (typeof S !== "undefined" && S && S.netClasses) || {};
    for (const n in man) res[n] = man[n];
    return res;
  }

  /* L'éditeur PCB applique ces classes : en direct s'il est ouvert dans un
     autre onglet (BroadcastChannel), à son ouverture sinon — par la session
     s'il s'ouvre dans cet onglet, par la copie du projet (localStorage) s'il
     s'ouvre dans un autre, depuis l'accueil. */
  function publierClasses(data) {
    const classes = classesFinales(data);
    const partiel = !data;
    try {
      const paires = (data && data.paires_diff) || [];
      // les nœuds de commutation d'un hacheur : ils agressent leurs voisins
      const bruyants = Object.keys((data && data.nets_bruyants) || {});
      sessionStorage.setItem("web_cao_netclasses", JSON.stringify(classes));
      sessionStorage.setItem("web_cao_paires_diff", JSON.stringify(paires));
      sessionStorage.setItem("web_cao_nets_bruyants", JSON.stringify(bruyants));
      sessionStorage.setItem("web_cao_netclasses_partiel", partiel ? "1" : "0");
      try {
        const projet = (typeof projNom === "function" && projNom()) || "";
        if (projet) localStorage.setItem("web_cao_netclasses." + projet, JSON.stringify(
          { t: Date.now(), classes: classes, paires: paires, bruyants: bruyants, partiel: partiel }));
      } catch (_) {}
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("web_cao_patterns_sync");
        bc.postMessage({ type: "netclasses_updated", classes: classes, paires: paires,
                         bruyants: bruyants, partiel: partiel });
        bc.close();
      }
    } catch (_) {}
  }

  /* Corrige la classe d'un net, d'où qu'on la choisisse (liste des nets,
     panneau du fil, panneau des motifs) : "" la rend à l'analyse. */
  function poserClasse(nom, classe) {
    if (!nom || typeof S === "undefined" || !S) return;
    const v = NET_CLASSES.includes(classe) ? classe : "";
    if ((S.netClasses[nom] || "") === v) return;
    if (typeof push === "function") push();
    if (v) S.netClasses[nom] = v;
    else delete S.netClasses[nom];
    publierClasses(_derniersMotifs);
    // sans analyse, le panneau des motifs garde son message (serveur absent)
    if (_derniersMotifs) rendrePanneau(_derniersMotifs, null);
  }

  function htmlClassesNets(data) {
    const noms = Object.keys(_derniersNets).filter(n => n && _derniersNets[n].length)
      .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    if (!noms.length) return "";
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
            const auto = classeAuto(n).classe;
            const raison = man[n] ? "Corrigé à la main (auto : " + auto + ")"
              : (why[n] || classeAuto(n).raison);
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
        poserClasse(sel.dataset.net, sel.value);
        if (typeof buildList === "function") buildList();
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
        // serveur absent : le PCB reçoit au moins les corrections et les évidences
        if (!_derniersMotifs) publierClasses(null);
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
    ciblerComposantSchema,
    classeAuto,
    poserClasse,
    publierClasses: () => publierClasses(_derniersMotifs)
  };
})();
