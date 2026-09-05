"use strict";
/* =============================================================================
   editeur-pcb — 20-placement-score.js
   Panneau dockable de diagnostic et qualité de placement PCB.
   - HPWL (Half-Perimeter Wirelength) et comparaison de tendance
   - Carte de congestion et centrage sur le point chaud (rpPhare)
   - Proximité et conformité des condensateurs de découplage
   - Suggestions d'ordonnancement par niveaux (Tiers 1 à 4)
   - Sélection et déplacement par blocs fonctionnels (patterns)
   ============================================================================= */

var PLACEMENT_SCORE = (function() {
  let _timer = 0;
  let _dernierHpwl = null;
  let _dernierResultat = null;
  let _patternsCache = null;
  let _chargementEnCours = false;

  /* ---------- Préparation du document PCB ---------- */
  function construireDocumentPcb() {
    if (typeof S === "undefined" || !S || !Array.isArray(S.fps)) return null;

    const fps = S.fps.map(fp => {
      const pads = (typeof padsWorld === "function") ? padsWorld(fp) : (fp.pads || []);
      return {
        id: fp.id,
        ref: fp.ref || "",
        val: fp.value || fp.val || "",
        pkg: fp.pkg || "",
        x: fp.x || 0,
        y: fp.y || 0,
        rot: fp.rot || 0,
        pads: pads.map(q => ({
          n: q.n || 1,
          net: q.net || "",
          x: q.x || 0,
          y: q.y || 0
        }))
      };
    });

    const b = S.board ? { x: S.board.x || 0, y: S.board.y || 0, w: S.board.w || 50, h: S.board.h || 50 } : null;
    return { board: b, footprints: fps };
  }

  /* ---------- Centrer et braquer le phare sur un composant ---------- */
  function ciblerComposant(ref) {
    if (typeof S === "undefined" || !S || !Array.isArray(S.fps)) return;
    const fp = S.fps.find(f => f.ref === ref);
    if (!fp) return;

    if (S.sel && S.sel.fps) {
      S.sel.fps.clear();
      S.sel.fps.add(fp.id);
    }
    const b = (typeof fpBBox === "function") ? fpBBox(fp) : { x1: fp.x - 2, y1: fp.y - 2, x2: fp.x + 2, y2: fp.y + 2 };
    if (typeof rpCadrer === "function") rpCadrer(b);
    if (typeof rpPhare === "function") rpPhare(b);
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
  }

  /* ---------- Sélectionner tous les composants d'un groupe fonctionnel ---------- */
  function selectionnerGroupe(refs) {
    if (typeof S === "undefined" || !S || !Array.isArray(S.fps) || !Array.isArray(refs)) return;
    if (!S.sel || !S.sel.fps) return;

    S.sel.fps.clear();
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    let trouve = 0;

    for (const ref of refs) {
      const fp = S.fps.find(f => f.ref === ref);
      if (fp) {
        S.sel.fps.add(fp.id);
        const b = (typeof fpBBox === "function") ? fpBBox(fp) : { x1: fp.x, y1: fp.y, x2: fp.x, y2: fp.y };
        x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1);
        x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2);
        trouve++;
      }
    }

    if (trouve > 0) {
      const boite = { x1, y1, x2, y2 };
      if (typeof rpCadrer === "function") rpCadrer(boite);
      if (typeof rpPhare === "function") rpPhare(boite);
    }
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
  }

  /* ---------- Centrer et braquer le phare sur le hotspot ---------- */
  function ciblerPointChaud(hx, hy) {
    const r = 3.5;
    const b = { x1: hx - r, y1: hy - r, x2: hx + r, y2: hy + r };
    if (typeof rpCadrer === "function") rpCadrer(b);
    if (typeof rpPhare === "function") rpPhare(b);
    if (typeof draw === "function") draw();
  }

  /* ---------- Détection d'intersection entre deux segments 2D ---------- */
  function segmentsCroisent(p1, p2, p3, p4) {
    const tol = 1e-4;
    if ((Math.abs(p1.x - p3.x) < tol && Math.abs(p1.y - p3.y) < tol) ||
        (Math.abs(p1.x - p4.x) < tol && Math.abs(p1.y - p4.y) < tol) ||
        (Math.abs(p2.x - p3.x) < tol && Math.abs(p2.y - p3.y) < tol) ||
        (Math.abs(p2.x - p4.x) < tol && Math.abs(p2.y - p4.y) < tol)) return false;
    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
  }

  /* ---------- Analyse d'orientation assistée pour un composant ---------- */
  function evaluerRotationComposant(ref) {
    if (typeof S === "undefined" || !S || !Array.isArray(S.fps)) return null;
    const fp = S.fps.find(f => f.ref === ref);
    if (!fp) return null;

    const padsL = (typeof padsOf === "function") ? padsOf(fp) : (fp.pads || []);
    const connected = padsL.filter(q => q.net || (fp.nets && fp.nets[q.n]));
    if (connected.length < 2) return null;

    // Indexation des pastilles externes par net
    const extPadsByNet = new Map();
    for (const other of S.fps) {
      if (other === fp) continue;
      const oPads = (typeof padsWorld === "function") ? padsWorld(other) : (other.pads || []);
      for (const op of oPads) {
        if (!op.net) continue;
        if (!extPadsByNet.has(op.net)) extPadsByNet.set(op.net, []);
        extPadsByNet.get(op.net).push({ x: op.x, y: op.y });
      }
    }

    const curRot = ((Math.round(fp.rot || 0) % 360) + 360) % 360;
    const angles = [0, 90, 180, 270];
    const resultats = [];

    for (const a of angles) {
      const aRad = a * Math.PI / 180;
      const cosA = Math.cos(aRad);
      const sinA = Math.sin(aRad);
      const m = fp.side ? -1 : 1;

      const segments = [];
      let longueurTotale = 0;

      for (const p of connected) {
        const net = p.net || (fp.nets && fp.nets[p.n]);
        const targets = extPadsByNet.get(net);
        if (!targets || !targets.length) continue;

        const wx = fp.x + (m * p.x) * cosA - p.y * sinA;
        const wy = fp.y + (m * p.x) * sinA + p.y * cosA;

        let bestT = null, bestD = 1e9;
        for (const t of targets) {
          const d = Math.hypot(wx - t.x, wy - t.y);
          if (d < bestD) { bestD = d; bestT = t; }
        }
        longueurTotale += bestD;
        segments.push({
          p1: { x: wx, y: wy },
          p2: bestT,
          net: net
        });
      }

      let nbCroisements = 0;
      const nSeg = segments.length;
      for (let i = 0; i < nSeg; i++) {
        for (let j = i + 1; j < nSeg; j++) {
          if (segments[i].net !== segments[j].net) {
            if (segmentsCroisent(segments[i].p1, segments[i].p2, segments[j].p1, segments[j].p2)) {
              nbCroisements++;
            }
          }
        }
      }

      const score = nbCroisements * 1000 + longueurTotale;
      resultats.push({
        angle: a,
        croisements: nbCroisements,
        longueurMm: Math.round(longueurTotale * 10) / 10,
        score: score
      });
    }

    resultats.sort((a, b) => a.score - b.score);
    const meilleur = resultats[0];
    const actuel = resultats.find(r => r.angle === curRot) || resultats[0];

    return {
      ref: ref,
      rotActuelle: curRot,
      rotOptimale: meilleur.angle,
      croisementsActuels: actuel.croisements,
      croisementsOptimaux: meilleur.croisements,
      gainCroisements: actuel.croisements - meilleur.croisements,
      longueurActuelleMm: actuel.longueurMm,
      longueurOptimaleMm: meilleur.longueurMm,
      gainLongueurMm: Math.round((actuel.longueurMm - meilleur.longueurMm) * 10) / 10,
      rotations: angles.map(a => resultats.find(r => r.angle === a))
    };
  }

  /* ---------- Appliquer l'orientation optimale ---------- */
  function appliquerRotation(ref, angle) {
    if (typeof S === "undefined" || !Array.isArray(S.fps)) return;
    const fp = S.fps.find(f => f.ref === ref);
    if (!fp) return;
    if (typeof push === "function") push();
    fp.rot = ((angle % 360) + 360) % 360;
    if (typeof touch === "function") touch();
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
    actualiser(100);
  }

  function optimiserEtAppliquerRotation(ref) {
    const diag = evaluerRotationComposant(ref);
    if (!diag) return;
    if (diag.rotActuelle === diag.rotOptimale) {
      if (typeof hint === "function") {
        hint(ref + " : l'orientation actuelle (" + diag.rotActuelle + "°) est déjà optimale ✓");
      }
      return;
    }
    appliquerRotation(ref, diag.rotOptimale);
    if (typeof hint === "function") {
      const msgG = diag.gainCroisements > 0 ? (diag.gainCroisements + " croisement(s) éliminé(s)") : (diag.gainLongueurMm + " mm gagnés");
      hint("✨ " + ref + " tourné à " + diag.rotOptimale + "° (" + msgG + ").");
    }
  }

  /* ---------- Rendu HTML du panneau ---------- */
  function rendrePanneau(data, erreur) {
    const el = document.getElementById("pnlPlacementBody");
    if (!el) return;

    if (erreur) {
      el.innerHTML = `
        <div style="padding:12px;color:var(--txt-dim);font-size:12px;line-height:1.5;">
          <div style="color:var(--yellow);font-weight:600;margin-bottom:6px;">⚠️ Serveur d'analyse non disponible</div>
          <div>${erreur}</div>
          <div style="margin-top:8px;font-size:11px;color:var(--txt-dim);">Lancez <code>python serveur.py</code> en console pour activer le calcul en temps réel.</div>
          <button class="tb" id="bPlacementRefresh" style="margin-top:10px;width:100%;justify-content:center;">🔄 Réessayer</button>
        </div>
      `;
      const btn = document.getElementById("bPlacementRefresh");
      if (btn) btn.onclick = () => actualiser(0);
      return;
    }

    if (!data) return;

    const hpwl = data.hpwl_mm || 0;
    let hpwlDeltaHtml = "";
    if (_dernierHpwl !== null) {
      const diff = hpwl - _dernierHpwl;
      if (Math.abs(diff) >= 0.1) {
        const signe = diff > 0 ? "+" : "";
        const col = diff < 0 ? "#4cd964" : "#ff5c5c"; // vert si en baisse (bon), rouge si en hausse
        hpwlDeltaHtml = `<span style="color:${col};font-size:11px;margin-left:6px;font-family:var(--mono);">(${signe}${diff.toFixed(1)} mm)</span>`;
      }
    }

    const cong = data.congestion || {};
    const dec = data.decouplage || {};
    const worst = data.top_contributeurs || [];
    const tiers = (data.ordonnancement && data.ordonnancement.tiers) ? data.ordonnancement.tiers : {};

    // Détection de composant sélectionné pour orientation assistée
    let selRef = null;
    if (typeof S !== "undefined" && S.sel && S.sel.fps && S.sel.fps.size === 1) {
      const selId = [...S.sel.fps][0];
      const selFp = S.fps.find(f => f.id === selId);
      if (selFp) selRef = selFp.ref;
    }

    let diagSel = selRef ? evaluerRotationComposant(selRef) : null;
    let sugsRot = (data && Array.isArray(data.rotations_suggerees)) ? data.rotations_suggerees : [];
    if (!sugsRot.length && typeof S !== "undefined" && Array.isArray(S.fps)) {
      for (const fp of S.fps) {
        const diag = evaluerRotationComposant(fp.ref);
        if (diag && (diag.gainCroisements > 0 || (diag.gainCroisements === 0 && diag.gainLongueurMm >= 8.0 && diag.rotActuelle !== diag.rotOptimale))) {
          sugsRot.push(diag);
        }
      }
      sugsRot.sort((a, b) => b.gainCroisements - a.gainCroisements || b.gainLongueurMm - a.gainLongueurMm);
    }

    let html = `
      <div style="padding:10px;display:flex;flex-direction:column;gap:12px;font-size:12px;">

        <!-- 1. En-tête HPWL -->
        <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;">Chevelu minimal (HPWL)</span>
            <button class="tb" id="bPlacementRefresh" style="padding:2px 6px;font-size:10px;" title="Recalculer">🔄</button>
          </div>
          <div style="margin-top:4px;display:flex;align-items:baseline;">
            <span style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--blue);">${hpwl.toFixed(1)} <span style="font-size:12px;font-weight:normal;color:var(--txt-dim);">mm</span></span>
            ${hpwlDeltaHtml}
          </div>
          <div style="font-size:10px;color:var(--txt-dim);margin-top:2px;">Estimation physique de la longueur totale de cuivre.</div>
        </div>

        <!-- 2. Congestion & Point chaud -->
        <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:10px;">
          <div style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;">Congestion & Hotspot</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <span>Densité max : <b>${cong.peak_density || 0}</b> pastilles / 5mm</span>
            ${(cong.peak_density > 0) ? `
              <button class="tb" id="bCiblerHotspot" style="padding:3px 8px;font-size:11px;" title="Braquer le phare visuel sur le point chaud">
                ⌖ Voir (X=${cong.hotspot_x}, Y=${cong.hotspot_y})
              </button>
            ` : ""}
          </div>
        </div>

        <!-- 3. Orientation assistée (anti-croisements) -->
        <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;">Orientation assistée</span>
            ${selRef ? `<span style="font-family:var(--mono);font-size:10px;color:var(--cyan);font-weight:700;">${selRef}</span>` : ''}
          </div>

          ${diagSel ? `
            <div style="margin-top:6px;background:rgba(255,255,255,0.03);padding:6px;border-radius:4px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;">
                <span>Actuelle : <b>${diagSel.rotActuelle}°</b> (${diagSel.croisementsActuels} cr.)</span>
                <span style="color:${diagSel.rotActuelle === diagSel.rotOptimale ? '#4cd964' : 'var(--yellow)'};font-weight:600;">
                  ${diagSel.rotActuelle === diagSel.rotOptimale ? '✓ Optimale' : 'Gain : -' + diagSel.gainCroisements + ' cr.'}
                </span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;">
                ${diagSel.rotations.map(r => `
                  <button class="tb btn-rot-angle" data-ref="${selRef}" data-angle="${r.angle}"
                          style="padding:4px 2px;font-size:10px;display:flex;flex-direction:column;align-items:center;gap:1px;${r.angle === diagSel.rotOptimale ? 'border-color:#4cd964;background:rgba(76,217,100,0.1);color:#4cd964;font-weight:700;' : (r.angle === diagSel.rotActuelle ? 'border-color:var(--blue);' : '')}"
                          title="${r.croisements} croisement(s), ${r.longueurMm} mm">
                    <span>${r.angle}°</span>
                    <span style="font-size:9px;opacity:0.8;">${r.croisements} cr.</span>
                  </button>
                `).join("")}
              </div>
              ${diagSel.rotActuelle !== diagSel.rotOptimale ? `
                <button class="tb btn-rot-angle" data-ref="${selRef}" data-angle="${diagSel.rotOptimale}"
                        style="margin-top:6px;width:100%;justify-content:center;font-size:11px;background:rgba(76,217,100,0.15);border-color:#4cd964;color:#4cd964;font-weight:600;">
                  ✨ Tourner à ${diagSel.rotOptimale}° (-${diagSel.gainCroisements} cr., -${diagSel.gainLongueurMm} mm)
                </button>
              ` : ''}
            </div>
          ` : (sugsRot.length > 0 ? `
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;max-height:110px;overflow-y:auto;">
              ${sugsRot.slice(0, 5).map(s => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:3px 6px;border-radius:4px;font-size:11px;">
                  <span>
                    <a href="#" class="lk-fp" data-ref="${s.ref}" style="color:var(--cyan);text-decoration:none;font-weight:600;">${s.ref}</a>
                    <span style="font-size:10px;color:var(--txt-dim);margin-left:4px;">${s.rotActuelle}° ➔ <b>${s.rotOptimale}°</b></span>
                  </span>
                  <button class="tb btn-rot-angle" data-ref="${s.ref}" data-angle="${s.rotOptimale}" style="padding:1px 5px;font-size:10px;" title="Appliquer l'orientation optimale">
                    ${s.gainCroisements > 0 ? '-' + s.gainCroisements + ' cr.' : '-' + s.gainLongueurMm + 'mm'}
                  </button>
                </div>
              `).join("")}
            </div>
          ` : `
            <div style="margin-top:6px;font-size:11px;color:var(--txt-dim);">
              Orientations conformes (aucun croisement évitable) ✓
            </div>
          `)}
        </div>

        <!-- 3. Découplage CI/Condensateurs -->
        <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;">Découplage HF</span>
            <span style="font-family:var(--mono);font-weight:700;color:${(dec.conform_pct >= 80) ? '#4cd964' : (dec.conform_pct >= 50 ? 'var(--yellow)' : 'var(--red)')};">
              ${(dec.conform_pct !== undefined && dec.conform_pct !== null) ? dec.conform_pct.toFixed(0) + '%' : '—'}
            </span>
          </div>
          <div style="font-size:11px;color:var(--txt);margin-top:4px;">
            Distance moy. : <b>${dec.mean_dist_mm !== null && dec.mean_dist_mm !== undefined ? dec.mean_dist_mm + ' mm' : 'N/A'}</b>
            <span style="color:var(--txt-dim);font-size:10px;">(cible ≤ 3.5 mm)</span>
          </div>

          <!-- Alertes découplage trop loin -->
          ${Array.isArray(dec.details) && dec.details.filter(d => !d.conforme).length > 0 ? `
            <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;">
              <div style="font-size:10px;color:var(--yellow);font-weight:600;margin-bottom:4px;">Capas éloignées de leur CI :</div>
              <div style="display:flex;flex-direction:column;gap:3px;max-height:80px;overflow-y:auto;">
                ${dec.details.filter(d => !d.conforme).map(d => `
                  <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,180,0,0.08);padding:2px 6px;border-radius:3px;">
                    <span>
                      <a href="#" class="lk-fp" data-ref="${d.cap_ref}" style="color:var(--cyan);text-decoration:none;font-weight:600;">${d.cap_ref}</a>
                      ➔ <a href="#" class="lk-fp" data-ref="${d.ic_ref}" style="color:var(--txt);text-decoration:none;">${d.ic_ref}</a>
                    </span>
                    <span style="font-family:var(--mono);font-size:10px;color:var(--red);">${d.dist_mm} mm</span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>

        <!-- 4. Top 5 perturbateurs HPWL -->
        ${worst.length > 0 ? `
          <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:10px;">
            <div style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;margin-bottom:6px;">Composants les plus étirés</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${worst.map(w => `
                <button class="tb lk-fp" data-ref="${w.ref}" style="padding:2px 6px;font-size:11px;" title="Déplacement moyen : ${w.deplacement_moyen_mm} mm">
                  ${w.ref} <span style="color:var(--txt-dim);font-size:9px;font-family:var(--mono);">${w.deplacement_moyen_mm}mm</span>
                </button>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <!-- 5. Blocs fonctionnels (motifs schéma) -->
        ${_patternsCache && Array.isArray(_patternsCache.motifs) && _patternsCache.motifs.length > 0 ? `
          <div style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:10px;">
            <div style="font-weight:600;text-transform:uppercase;font-size:10px;color:var(--txt-dim);letter-spacing:0.08em;margin-bottom:6px;">Groupes de placement détectés</div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              ${_patternsCache.motifs.map((m, idx) => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(63,160,234,0.08);padding:4px 8px;border-radius:4px;border:1px solid rgba(63,160,234,0.2);">
                  <div>
                    <span style="font-weight:600;color:var(--blue);">${m.label || m.type}</span>
                    <span style="font-size:10px;color:var(--txt-dim);margin-left:4px;">(${(m.components||[]).join(", ")})</span>
                  </div>
                  <button class="tb btn-grp" data-idx="${idx}" style="padding:2px 6px;font-size:10px;" title="Sélectionner tout le bloc pour déplacement">
                    Grouper
                  </button>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <!-- 6. Ordre de placement suggéré -->
        <details style="background:var(--panel2);border:1px solid var(--border2);border-radius:6px;padding:8px 10px;">
          <summary style="font-weight:600;font-size:11px;color:var(--txt-dim);cursor:pointer;user-select:none;">
            Ordre suggéré de placement (Tiers 1 à 4)
          </summary>
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:11px;">
            <div>
              <span style="color:var(--yellow);font-weight:600;">Tier 1 - Ancres (${(tiers.anchor||[]).length}) :</span>
              <span style="color:var(--txt-dim);">${(tiers.anchor||[]).join(", ") || "aucun"}</span>
            </div>
            <div>
              <span style="color:var(--blue);font-weight:600;">Tier 2 - Actifs (${(tiers.semi_fixed||[]).length}) :</span>
              <span style="color:var(--txt-dim);">${(tiers.semi_fixed||[]).join(", ") || "aucun"}</span>
            </div>
            <div>
              <span style="color:var(--cyan);font-weight:600;">Tier 3 - Flexibles (${(tiers.flexible||[]).length}) :</span>
              <span style="color:var(--txt-dim);">${(tiers.flexible||[]).join(", ") || "aucun"}</span>
            </div>
            <div>
              <span style="color:var(--txt-dim);font-weight:600;">Tier 4 - Passifs libres (${(tiers.free||[]).length}) :</span>
              <span style="color:var(--txt-dim);">${(tiers.free||[]).slice(0, 15).join(", ")}${(tiers.free||[]).length > 15 ? '...' : ''}</span>
            </div>
          </div>
        </details>

      </div>
    `;

    el.innerHTML = html;

    // Câblage des écouteurs
    const btnRef = document.getElementById("bPlacementRefresh");
    if (btnRef) btnRef.onclick = () => actualiser(0);

    const btnHotspot = document.getElementById("bCiblerHotspot");
    if (btnHotspot) btnHotspot.onclick = () => ciblerPointChaud(cong.hotspot_x, cong.hotspot_y);

    el.querySelectorAll(".lk-fp").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const r = btn.getAttribute("data-ref");
        if (r) ciblerComposant(r);
      };
    });

    el.querySelectorAll(".btn-grp").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        if (_patternsCache && _patternsCache.motifs && _patternsCache.motifs[idx]) {
          selectionnerGroupe(_patternsCache.motifs[idx].components || []);
        }
      };
    });

    el.querySelectorAll(".btn-rot-angle").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const r = btn.getAttribute("data-ref");
        const a = parseInt(btn.getAttribute("data-angle"), 10);
        if (r && !isNaN(a)) appliquerRotation(r, a);
      };
    });
  }

  /* ---------- Appel HTTP vers le serveur ---------- */
  function actualiser(delaiMs = 300) {
    if (_timer) clearTimeout(_timer);

    _timer = setTimeout(async () => {
      const doc = construireDocumentPcb();
      if (!doc || !doc.footprints || doc.footprints.length === 0) {
        rendrePanneau(null, "Aucune empreinte sur la carte.");
        return;
      }

      if (_chargementEnCours) return;
      _chargementEnCours = true;

      try {
        const res = await fetch("/api/pcb/score-placement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(doc)
        });

        if (!res.ok) {
          throw new Error("HTTP " + res.status + " : " + res.statusText);
        }

        const data = await res.json();
        if (data && data.succes) {
          rendrePanneau(data, null);
          _dernierHpwl = data.hpwl_mm;
          _dernierResultat = data;
        } else {
          rendrePanneau(null, (data && data.detail) || "Échec du calcul de scoring.");
        }
      } catch (err) {
        rendrePanneau(null, err.message);
      } finally {
        _chargementEnCours = false;
      }

      // Tente aussi de rafraîchir les motifs si le cache est vide
      if (!_patternsCache) {
        chargerMotifs();
      }
    }, delaiMs);
  }

  /* ---------- Chargement des motifs pour la sélection de groupe ---------- */
  async function chargerMotifs() {
    try {
      const raw = typeof sessionStorage !== "undefined" && sessionStorage.getItem("web_cao_patterns_cache");
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.motifs)) {
          injecterMotifs(d);
          return;
        }
      }

      // Si pas encore en cache mais qu'un document schéma existe
      if (typeof pcbSchemaDoc === "function") {
        const sDoc = pcbSchemaDoc();
        if (sDoc && (sDoc.components || sDoc.parts)) {
          const res = await fetch("/api/schema/patterns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sDoc)
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.succes && Array.isArray(data.motifs)) {
              sessionStorage.setItem("web_cao_patterns_cache", JSON.stringify(data));
              injecterMotifs(data);
            }
          }
        }
      }
    } catch (_) {}
  }

  function injecterMotifs(motifsData) {
    _patternsCache = motifsData;
    if (_dernierResultat) rendrePanneau(_dernierResultat, null);
  }

  /* ---------- Initialisation ---------- */
  function init() {
    // Bouton barre d'outils
    const btnTb = document.getElementById("bPlacementScore");
    if (btnTb) {
      btnTb.onclick = () => {
        if (typeof WS !== "undefined" && WS.togglePanel) {
          WS.togglePanel("placement");
        }
        actualiser(0);
      };
    }

    // Synchronisation en direct avec le schéma via BroadcastChannel
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("web_cao_patterns_sync");
        bc.onmessage = (ev) => {
          if (ev.data && ev.data.type === "patterns_updated" && ev.data.data) {
            injecterMotifs(ev.data.data);
          }
        };
      }
    } catch (_) {}

    // Écoute des changements de session storage
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("storage", (ev) => {
        if (ev.key === "web_cao_patterns_cache") {
          chargerMotifs();
        }
      });
    }

    // Crochet automatique sur touch()
    // Crochet automatique sur touch() et refreshPanels()
    if (typeof window !== "undefined") {
      const prevTouch = window.touch;
      window.touch = function() {
        if (typeof prevTouch === "function") {
          prevTouch.apply(this, arguments);
        }
        actualiser(350);
      };

      const prevRefresh = window.refreshPanels;
      window.refreshPanels = function() {
        if (typeof prevRefresh === "function") {
          prevRefresh.apply(this, arguments);
        }
        if (_dernierResultat) rendrePanneau(_dernierResultat, null);
      };
    }

    // Premier chargement des motifs et calcul différé après chargement
    chargerMotifs();
    setTimeout(() => actualiser(100), 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 50);
  }

  return {
    actualiser,
    injecterMotifs,
    selectionnerGroupe,
    ciblerComposant,
    ciblerPointChaud,
    evaluerRotationComposant,
    appliquerRotation,
    optimiserEtAppliquerRotation
  };
})();
