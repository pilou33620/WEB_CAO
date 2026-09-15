"use strict";
/* =============================================================================
   editeur-pcb — 22-bloc-placement.js
   Pré-placement assisté par blocs fonctionnels et zones schématiques (Rooms).
   - Réception et écoute des zones et motifs issus du schéma (BroadcastChannel / session)
   - Color-coding et badges visuels sur les empreintes du PCB
   - Solveur géométrique d'agencement 2D (gabarits buck, ldo, quartz, filtre, cluster)
   - Élimination des collisions de boîtiers avec marge d'isolation DRC
   - Optimisation automatique des rotations (alignement des pastilles de même net)
   - Actions 1-clic : « Compacter sur place » et « Déposer en grappe »
   ============================================================================= */

var BLOC_PLACEMENT = (function() {
  let _zonesCache = [];
  let _patternsCache = null;

  /* ---------- Chargement initial et synchronisation ---------- */
  function initialiser() {
    chargerCaches();

    if (typeof BroadcastChannel !== "undefined") {
      try {
        const bc = new BroadcastChannel("web_cao_patterns_sync");
        bc.onmessage = function(e) {
          if (e.data && e.data.type === "patterns_updated") {
            if (e.data.zones) _zonesCache = e.data.zones;
            if (e.data.data) {
              _patternsCache = e.data.data;
              if (Array.isArray(e.data.data.zones)) _zonesCache = e.data.data.zones;
            }
            if (typeof draw === "function") draw();
            if (typeof refreshPanels === "function") refreshPanels();
            if (typeof PLACEMENT_SCORE !== "undefined" && PLACEMENT_SCORE.actualiser) {
              PLACEMENT_SCORE.actualiser(100);
            }
          }
        };
      } catch (_) {}
    }
  }

  function chargerCaches() {
    try {
      if (typeof sessionStorage !== "undefined") {
        const rawZ = sessionStorage.getItem("web_cao_zones");
        if (rawZ) _zonesCache = JSON.parse(rawZ) || [];

        const rawP = sessionStorage.getItem("web_cao_patterns_cache");
        if (rawP) {
          _patternsCache = JSON.parse(rawP);
          if (Array.isArray(_patternsCache.zones) && _patternsCache.zones.length > 0) {
            _zonesCache = _patternsCache.zones;
          }
        }
      }
    } catch (_) {}
  }

  function getZones() {
    if (!_zonesCache || !_zonesCache.length) chargerCaches();
    return _zonesCache || [];
  }

  function getPatterns() {
    if (!_patternsCache) chargerCaches();
    return _patternsCache;
  }

  /* ---------- Recherche de la zone d'une empreinte ---------- */
  function trouverZonePourFp(fp) {
    if (!fp || !fp.ref) return null;
    const ref = String(fp.ref).trim().toUpperCase();
    const zones = getZones();
    for (const z of zones) {
      const comps = (z.composants || z.components || []).map(c => String(c).trim().toUpperCase());
      if (comps.includes(ref)) return z;
    }
    return null;
  }

  /* ---------- Color-coding et badges visuels sur le PCB ---------- */
  function peindreBadgesZones(ctx, dpr) {
    if (typeof S === "undefined" || !S || !Array.isArray(S.fps)) return;

    const zones = getZones();
    if (!zones.length) return;

    ctx.save();
    for (const fp of S.fps) {
      const z = trouverZonePourFp(fp);
      if (!z) continue;

      const bb = (typeof fpBBox === "function") ? fpBBox(fp) : { x1: fp.x - 2, y1: fp.y - 2, x2: fp.x + 2, y2: fp.y + 2 };
      const col = z.couleur || z.color || "#f59e0b";

      // Pastille colorée discrète en coin supérieur droit de l'empreinte
      const bx = bb.x2 + 0.6;
      const by = bb.y1 - 0.6;
      const r = 0.9; // 0.9 mm de rayon

      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 0.25;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Liseré fin autour du composant si sélectionné
      if (S.sel && S.sel.fps && S.sel.fps.has(fp.id)) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.35;
        ctx.setLineDash([1, 1]);
        ctx.strokeRect(bb.x1 - 0.4, bb.y1 - 0.4, (bb.x2 - bb.x1) + 0.8, (bb.y2 - bb.y1) + 0.8);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /* ---------- Boîte englobante sécurisée ---------- */
  function getBBox(fp) {
    if (typeof fpBBox === "function") {
      const b = fpBBox(fp);
      return { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, w: Math.max(1, b.x2 - b.x1), h: Math.max(1, b.y2 - b.y1) };
    }
    return { x1: fp.x - 2, y1: fp.y - 2, x2: fp.x + 2, y2: fp.y + 2, w: 4, h: 4 };
  }

  /* ---------- Résolution des collisions 2D (Relaxation élastique) ---------- */
  function resoudreCollisions(clusterFps, clearance = 0.6, iterations = 40, anchorId = null) {
    if (clusterFps.length < 2) return;

    for (let it = 0; it < iterations; it++) {
      let modif = false;
      for (let i = 0; i < clusterFps.length; i++) {
        for (let j = i + 1; j < clusterFps.length; j++) {
          const a = clusterFps[i], b = clusterFps[j];
          const ba = getBBox(a), bb = getBBox(b);

          const ox = (ba.w / 2 + bb.w / 2 + clearance) - Math.abs(a.x - b.x);
          const oy = (ba.h / 2 + bb.h / 2 + clearance) - Math.abs(a.y - b.y);

          if (ox > 0 && oy > 0) {
            modif = true;
            const aIsAnchor = (anchorId !== null && a.id === anchorId);
            const bIsAnchor = (anchorId !== null && b.id === anchorId);
            // Écarte selon l'axe de plus faible recouvrement
            if (ox < oy) {
              const sign = (b.x >= a.x ? 1 : -1);
              const shift = (ox / 2) * sign;
              if (!aIsAnchor) a.x -= shift;
              if (!bIsAnchor) b.x += shift;
            } else {
              const sign = (b.y >= a.y ? 1 : -1);
              const shift = (oy / 2) * sign;
              if (!aIsAnchor) a.y -= shift;
              if (!bIsAnchor) b.y += shift;
            }
          }
        }
      }
      if (!modif) break;
    }
  }

  /* ---------- Optimisation de rotation d'un composant satellite ---------- */
  function optimiserRotation(satelliteFp, anchorFp, autresFps) {
    if (!satelliteFp) return;

    const angles = [0, 90, 180, 270];
    const initialRot = satelliteFp.rot || 0;
    let meilleurAngle = initialRot;
    let meilleureDist = 1e9;

    const ciblePads = [];
    const allCibles = [anchorFp, ...autresFps].filter(f => f && f.id !== satelliteFp.id);
    for (const c of allCibles) {
      const cp = (typeof padsWorld === "function") ? padsWorld(c) : (c.pads || []);
      for (const p of cp) {
        if (p.net) ciblePads.push(p);
      }
    }

    if (!ciblePads.length) return;

    for (const rot of angles) {
      satelliteFp.rot = rot;
      const sPads = (typeof padsWorld === "function") ? padsWorld(satelliteFp) : (satelliteFp.pads || []);
      let scoreDist = 0;
      let matched = 0;

      for (const sp of sPads) {
        if (!sp.net) continue;
        for (const cp of ciblePads) {
          if (sp.net === cp.net) {
            scoreDist += Math.hypot(sp.x - cp.x, sp.y - cp.y);
            matched++;
          }
        }
      }

      if (matched > 0 && scoreDist < meilleureDist) {
        meilleureDist = scoreDist;
        meilleurAngle = rot;
      }
    }

    satelliteFp.rot = meilleurAngle;
  }

  /* ---------- Solveur géométrique d'agencement par gabarit ---------- */
  function calculerAgencement(motif, options = {}) {
    if (!motif || typeof S === "undefined" || !Array.isArray(S.fps)) return null;

    const refs = (motif.components || motif.composants || []).map(r => String(r).trim().toUpperCase());
    if (refs.length < 2) return null;

    const fps = [];
    for (const ref of refs) {
      const fp = S.fps.find(f => String(f.ref).trim().toUpperCase() === ref);
      if (fp) fps.push(fp);
    }
    if (fps.length < 2) return null;

    // Détermination de l'ancre principale
    let anchor = null;
    const mainRef = (motif.main_component || motif.ancre || "").trim().toUpperCase();
    if (mainRef) {
      anchor = fps.find(f => String(f.ref).trim().toUpperCase() === mainRef);
    }
    if (!anchor) {
      anchor = fps.find(f => /^(U|IC|VR|REG|Y|X)/i.test(f.ref)) || fps[0];
    }

    const satellites = fps.filter(f => f.id !== anchor.id);

    const roleMap = motif.role_map || {};
    const tpl = motif.layout_template || "cluster_free";

    const aBox = getBBox(anchor);
    const ax = anchor.x, ay = anchor.y;

    if (tpl === "buck_compact") {
      // Hacheur : Cin à gauche, Inductance L à droite, Diode en bas/milieu, Cout à droite de L
      const cinRefs = (roleMap.cin || []).map(r => String(r).toUpperCase());
      const coutRefs = (roleMap.cout || []).map(r => String(r).toUpperCase());
      const indRef = String(roleMap.sw_inductor || (roleMap.inductors && roleMap.inductors[0]) || "").toUpperCase();
      const diodeRefs = (roleMap.diodes || []).map(r => String(r).toUpperCase());

      let leftOffset = aBox.w / 2 + 1.2;
      let rightOffset = aBox.w / 2 + 1.2;

      // 1. Condensateur(s) d'entrée à gauche
      satellites.filter(f => cinRefs.includes(f.ref.toUpperCase())).forEach(f => {
        const b = getBBox(f);
        f.x = ax - leftOffset - b.w / 2;
        f.y = ay;
        leftOffset += b.w + 0.8;
      });

      // 2. Inductance de découpage à droite
      const indFp = satellites.find(f => f.ref.toUpperCase() === indRef || f.ref.toUpperCase().startsWith("L"));
      if (indFp) {
        const b = getBBox(indFp);
        indFp.x = ax + rightOffset + b.w / 2;
        indFp.y = ay;
        rightOffset += b.w + 1.0;
      }

      // 3. Diode de roue libre
      satellites.filter(f => diodeRefs.includes(f.ref.toUpperCase()) || f.ref.toUpperCase().startsWith("D")).forEach(f => {
        const b = getBBox(f);
        f.x = ax + aBox.w / 4;
        f.y = ay + aBox.h / 2 + b.h / 2 + 0.8;
      });

      // 4. Condensateur(s) de sortie à droite de l'inductance
      satellites.filter(f => coutRefs.includes(f.ref.toUpperCase())).forEach(f => {
        const b = getBBox(f);
        f.x = ax + rightOffset + b.w / 2;
        f.y = ay;
        rightOffset += b.w + 0.8;
      });

      // 5. Autres passifs (résistances de feedback...)
      const places = new Set([anchor, indFp, ...satellites.filter(f => cinRefs.includes(f.ref.toUpperCase()) || coutRefs.includes(f.ref.toUpperCase()))].filter(Boolean));
      let topOffset = aBox.h / 2 + 1.0;
      satellites.filter(f => !places.has(f)).forEach(f => {
        const b = getBBox(f);
        f.x = ax;
        f.y = ay - topOffset - b.h / 2;
        topOffset += b.h + 0.8;
      });

    } else if (tpl === "ldo_inline") {
      // Régulateur LDO : Cin à gauche, Cout à droite
      const cinRefs = (roleMap.cin || []).map(r => String(r).toUpperCase());
      const coutRefs = (roleMap.cout || []).map(r => String(r).toUpperCase());

      let leftOffset = aBox.w / 2 + 1.0;
      let rightOffset = aBox.w / 2 + 1.0;

      satellites.filter(f => cinRefs.includes(f.ref.toUpperCase()) || f.ref.toUpperCase() === "C1").forEach(f => {
        const b = getBBox(f);
        f.x = ax - leftOffset - b.w / 2;
        f.y = ay;
        leftOffset += b.w + 0.8;
      });

      satellites.filter(f => coutRefs.includes(f.ref.toUpperCase()) || f.ref.toUpperCase() === "C2").forEach(f => {
        const b = getBBox(f);
        f.x = ax + rightOffset + b.w / 2;
        f.y = ay;
        rightOffset += b.w + 0.8;
      });

      // Reste des passifs au-dessus / au-dessous
      const placed = satellites.filter(f => cinRefs.includes(f.ref.toUpperCase()) || coutRefs.includes(f.ref.toUpperCase()));
      let vOffset = aBox.h / 2 + 1.0;
      satellites.filter(f => !placed.includes(f)).forEach(f => {
        const b = getBBox(f);
        f.x = ax;
        f.y = ay + vOffset + b.h / 2;
        vOffset += b.h + 0.8;
      });

    } else if (tpl === "crystal_symmetric") {
      // Quartz : 2 capacités C1 et C2 disposées symétriquement de part et d'autre
      const c1 = satellites[0];
      const c2 = satellites[1];
      if (c1) {
        const b1 = getBBox(c1);
        c1.x = ax - aBox.w / 2 - b1.w / 2 - 0.8;
        c1.y = ay + aBox.h / 4;
      }
      if (c2) {
        const b2 = getBBox(c2);
        c2.x = ax + aBox.w / 2 + b2.w / 2 + 0.8;
        c2.y = ay + aBox.h / 4;
      }

    } else if (tpl === "filter_inline") {
      // Filtre : en ligne R puis C vers GND
      let curX = ax + aBox.w / 2 + 1.2;
      satellites.forEach(f => {
        const b = getBBox(f);
        f.x = curX + b.w / 2;
        f.y = ay;
        curX += b.w + 0.8;
      });

    } else {
      // Disposition radiale compacte par défaut (cluster_free)
      const count = satellites.length;
      const rBase = Math.max(aBox.w, aBox.h) / 2 + 2.5;
      satellites.forEach((f, idx) => {
        const ang = (idx / count) * Math.PI * 2;
        const b = getBBox(f);
        const r = rBase + Math.max(b.w, b.h) / 2;
        f.x = ax + Math.cos(ang) * r;
        f.y = ay + Math.sin(ang) * r;
      });
    }

    // Résolution des collisions avec marge d'isolation DRC (0.6 mm)
    resoudreCollisions(fps, 0.6, 50, anchor ? anchor.id : null);

    // Optimisation automatique des rotations
    satellites.forEach(f => optimiserRotation(f, anchor, satellites));

    return { anchor, satellites, all: fps };
  }

  /* ---------- Action 1 : Compacter sur place en 1 clic ---------- */
  function compacterSurPlace(motifOrId) {
    const motif = trouverMotifOuZone(motifOrId);
    if (!motif) return false;

    if (typeof push === "function") push();
    else if (typeof undoPush === "function") undoPush();

    const res = calculerAgencement(motif);
    if (!res) return false;

    // Recalculer le chevelu et rafraîchir
    finaliserAction(motif, "agencé sur place");
    return true;
  }

  /* ---------- Recherche d'une zone libre sur la carte ---------- */
  function chercherZoneLibre(largeur = 30, hauteur = 20) {
    if (typeof S === "undefined" || !S || !S.board) return { x: 20, y: 20 };
    const b = S.board;
    const step = 4; // pas de recherche 4 mm

    for (let x = b.x + 4; x <= b.x + b.w - largeur - 4; x += step) {
      for (let y = b.y + 4; y <= b.y + b.h - hauteur - 4; y += step) {
        const x2 = x + largeur, y2 = y + hauteur;
        const collision = S.fps.some(fp => {
          const bb = getBBox(fp);
          return !(bb.x2 < x || bb.x1 > x2 || bb.y2 < y || bb.y1 > y2);
        });
        if (!collision) return { x: x + largeur / 2, y: y + hauteur / 2 };
      }
    }
    // Si la carte est pleine, place à droite de la carte
    return { x: b.x + b.w + largeur / 2 + 5, y: b.y + hauteur / 2 };
  }

  /* ---------- Action 2 : Déposer en grappe en 1 clic ---------- */
  function deposerEnGrappe(motifOrId, cibleX = null, cibleY = null) {
    const motif = trouverMotifOuZone(motifOrId);
    if (!motif) return false;

    if (typeof push === "function") push();
    else if (typeof undoPush === "function") undoPush();

    // 1. Trouve les positions relatives idéales
    const res = calculerAgencement(motif);
    if (!res || !res.anchor) return false;

    // 2. Détermine le centre cible
    let targetX = cibleX;
    let targetY = cibleY;
    if (targetX === null || targetY === null) {
      const free = chercherZoneLibre(30, 25);
      targetX = free.x;
      targetY = free.y;
    }

    const dx = targetX - res.anchor.x;
    const dy = targetY - res.anchor.y;

    // 3. Déplace l'ensemble du cluster solidaire
    res.all.forEach(f => {
      f.x += dx;
      f.y += dy;
    });

    finaliserAction(motif, "déposé sur la carte");
    return true;
  }

  function injecterMotifs(data) {
    _patternsCache = data;
    if (data && Array.isArray(data.zones)) _zonesCache = data.zones;
  }

  function injecterZones(zones) {
    _zonesCache = zones;
  }

  function trouverMotifOuZone(idOrObj) {
    if (typeof idOrObj === "object" && idOrObj !== null) return idOrObj;

    const pat = getPatterns();
    const idStr = String(idOrObj).trim();
    const idx = parseInt(idStr, 10);
    if (!isNaN(idx) && String(idx) === idStr) {
      if (pat && Array.isArray(pat.motifs) && pat.motifs[idx]) return pat.motifs[idx];
      const zArr = getZones();
      if (zArr && zArr[idx]) return zArr[idx];
    }

    const zones = getZones();
    const z = zones.find(item => item.id === idStr || item.nom === idStr);
    if (z) return z;

    if (pat && Array.isArray(pat.motifs)) {
      const m = pat.motifs.find(item => item.id === idStr || item.label === idStr);
      if (m) return m;
    }
    return null;
  }

  /* ---------- Action 3 : Agencer automatiquement une liste de nouveaux composants par grappes fonctionnelles ---------- */
  function agencerListeNouveauxComposants(addedFps) {
    if (!addedFps || !addedFps.length || typeof S === "undefined" || !S || !S.board) return;

    const b = S.board;
    const addedRefs = new Set(addedFps.map(f => String(f.ref).trim().toUpperCase()));
    const traites = new Set();
    const grappes = [];

    // 1. Recherche parmi les motifs existants (patterns issus du schéma ou du serveur)
    const pat = getPatterns();
    if (pat && Array.isArray(pat.motifs)) {
      for (const m of pat.motifs) {
        const mRefs = (m.components || m.composants || []).map(r => String(r).trim().toUpperCase());
        const matchRefs = mRefs.filter(r => addedRefs.has(r) && !traites.has(r));
        if (matchRefs.length >= 2) {
          const res = calculerAgencement(m);
          if (res && res.all && res.all.length >= 2) {
            grappes.push({ motif: m, res, fps: res.all });
            matchRefs.forEach(r => traites.add(r));
          }
        }
      }
    }

    // 2. Recherche parmi les zones schématiques (rooms)
    const zones = getZones();
    if (zones && zones.length) {
      for (const z of zones) {
        const zRefs = (z.composants || z.components || []).map(r => String(r).trim().toUpperCase());
        const matchRefs = zRefs.filter(r => addedRefs.has(r) && !traites.has(r));
        if (matchRefs.length >= 2) {
          const pseudoMotif = {
            label: z.nom || z.name || "Zone",
            main_component: matchRefs.find(r => /^(U|IC|VR|REG|Y|X)/i.test(r)) || matchRefs[0],
            components: matchRefs,
            layout_template: "cluster_free"
          };
          const res = calculerAgencement(pseudoMotif);
          if (res && res.all && res.all.length >= 2) {
            grappes.push({ motif: pseudoMotif, res, fps: res.all });
            matchRefs.forEach(r => traites.add(r));
          }
        }
      }
    }

    // 3. Détection heuristique locale sur connectivité (fonctionne 100% hors-ligne)
    const maitres = addedFps.filter(f => !traites.has(String(f.ref).toUpperCase()) && /^(U|IC|VR|REG|Y|X)/i.test(f.ref));
    for (const mFp of maitres) {
      const mRef = String(mFp.ref).toUpperCase();
      if (traites.has(mRef)) continue;

      const mNets = new Set(Object.values(mFp.nets || {}).filter(Boolean));
      if (!mNets.size) continue;

      const satellites = [];
      for (const other of addedFps) {
        const oRef = String(other.ref).toUpperCase();
        if (oRef === mRef || traites.has(oRef)) continue;
        if (!/^(C|R|L|D)/i.test(oRef)) continue;
        const oNets = Object.values(other.nets || {}).filter(Boolean);
        if (oNets.some(n => mNets.has(n))) {
          satellites.push(other);
        }
      }

      if (satellites.length >= 1) {
        let tpl = "cluster_free";
        const hasL = satellites.some(s => /^L/i.test(s.ref));
        const hasD = satellites.some(s => /^D/i.test(s.ref));
        if (hasL && hasD) tpl = "buck_compact";
        else if (/ldo|reg|1117/i.test(mFp.value || "") || (/^VR|^REG/i.test(mFp.ref) && satellites.length >= 2)) tpl = "ldo_inline";
        else if (/^Y|^X/i.test(mFp.ref)) tpl = "quartz_compact";

        const pseudoMotif = {
          label: "Grappe " + mRef,
          main_component: mRef,
          components: [mRef, ...satellites.map(s => String(s.ref).toUpperCase())],
          layout_template: tpl
        };
        const res = calculerAgencement(pseudoMotif);
        if (res && res.all && res.all.length >= 2) {
          grappes.push({ motif: pseudoMotif, res, fps: res.all });
          traites.add(mRef);
          satellites.forEach(s => traites.add(String(s.ref).toUpperCase()));
        }
      }
    }

    // 4. Disposition des grappes formées
    let startX = b.x + b.w + 8;
    let curY = b.y;
    let colW = 0;
    const maxY = b.y + b.h * 1.6;

    for (const g of grappes) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxYCluster = -Infinity;
      g.fps.forEach(f => {
        const bb = getBBox(f);
        minX = Math.min(minX, bb.x1); maxX = Math.max(maxX, bb.x2);
        minY = Math.min(minY, bb.y1); maxYCluster = Math.max(maxYCluster, bb.y2);
      });
      const gw = Math.max(10, maxX - minX);
      const gh = Math.max(10, maxYCluster - minY);

      if (curY + gh > maxY && colW > 0) {
        curY = b.y;
        startX += colW + 6;
        colW = 0;
      }

      const targetX = startX + gw / 2;
      const targetY = curY + gh / 2;
      const dx = targetX - (minX + gw / 2);
      const dy = targetY - (minY + gh / 2);

      g.fps.forEach(f => {
        f.x = (typeof snapX === "function") ? snapX(f.x + dx) : (f.x + dx);
        f.y = (typeof snapY === "function") ? snapY(f.y + dy) : (f.y + dy);
      });

      colW = Math.max(colW, gw);
      curY += gh + 6;
    }

    // 5. Disposition linéaire des composants isolés restants
    const orphelins = addedFps.filter(f => !traites.has(String(f.ref).toUpperCase()));
    if (orphelins.length > 0) {
      if (colW > 0) {
        startX += colW + 6;
        curY = b.y;
        colW = 0;
      }
      for (const fp of orphelins) {
        const bb = getBBox(fp);
        const w = bb.w, h = bb.h;
        if (curY + h > maxY && colW > 0) {
          curY = b.y;
          startX += colW + 4;
          colW = 0;
        }
        fp.x = (typeof snapX === "function") ? snapX(startX + w / 2) : (startX + w / 2);
        fp.y = (typeof snapY === "function") ? snapY(curY + h / 2) : (curY + h / 2);
        colW = Math.max(colW, w);
        curY += h + 3;
      }
    }

    if (grappes.length > 0) {
      console.log(`[PCB BLOC] ${grappes.length} grappe(s) fonctionnelle(s) pré-agencée(s) avec succès.`);
    }
  }

  function finaliserAction(motif, actionNom) {
    // Reconnexion & chevelu
    if (typeof conn === "function") conn();
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
    if (typeof touch === "function") touch();

    // Mise à jour du score
    if (typeof PLACEMENT_SCORE !== "undefined" && PLACEMENT_SCORE.actualiser) {
      PLACEMENT_SCORE.actualiser(50);
    }

    // Message console / notification
    const nom = motif.label || motif.nom || motif.zone_name || "Bloc";
    console.log(`[PCB BLOC] Bloc « ${nom} » ${actionNom} avec succès.`);
  }

  function init() {
    initialiser();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      setTimeout(init, 50);
    }
  }

  return {
    initialiser,
    getZones,
    getPatterns,
    injecterMotifs,
    injecterZones,
    trouverZonePourFp,
    peindreBadgesZones,
    calculerAgencement,
    compacterSurPlace,
    deposerEnGrappe,
    chercherZoneLibre,
    agencerListeNouveauxComposants
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BLOC_PLACEMENT;
}
