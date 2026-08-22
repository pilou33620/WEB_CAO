/**
 * WEB_CAO - Éditeur PCB Rendu Optimisé
 * =====================================
 * Double buffering + optimisations Safari iPad
 */
"use strict";

/* ==========================================================================
   Configuration Canvas Manager
   ========================================================================== */
const CAO_PCB = {
  manager: null,
  canvas: null,
  ctx: null,
  dpr: 1,
  
  // État du dirty rect pour rendering incrémental
  dirtyRect: null,
  lastViewBox: null,
  
  // Cache pour les éléments graphiques
  cache: {
    grid: null,
    zones: new Map(),
    components: new Map()
  },
  
  /**
   * Initialise le canvas optimisé
   */
  init() {
    this.canvas = document.getElementById('board');
    if (!this.canvas) return;
    
    // Crée le manager de canvas
    if (window.CAO && CAO.Canvas) {
      this.manager = CAO.Canvas.create(this.canvas, {
        doubleBuffer: true,
        pixelRatio: true,
        maxPixelRatio: 2, // Limité pour Safari iPad
        adaptiveFps: true,
        targetFps: 60,
        minFps: 30,
        preserveDrawingBuffer: false,
        onDraw: (ctx, time, delta, w, h) => this.render(ctx, w, h),
        onResize: (w, h, dpr) => this.onResize(w, h, dpr),
        debug: false
      });
      this.ctx = this.manager.getContext();
      this.dpr = window.devicePixelRatio || 1;
    } else {
      // Fallback: setup manuel
      this.setupManualCanvas();
    }
    
    // Événements
    window.addEventListener('resize', () => this.scheduleRedraw());
    window.addEventListener('scroll', () => this.scheduleRedraw(), { passive: true });
    
    // Schedule initial draw
    this.scheduleRedraw();
  },
  
  /**
   * Setup manuel si CAO.Canvas non chargé
   */
  setupManualCanvas() {
    const cv = this.canvas;
    this.ctx = cv.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      this.onResize(
        cv.clientWidth,
        cv.clientHeight,
        this.dpr
      );
    });
    resizeObserver.observe(cv.parentElement);
    
    this.onResize(cv.clientWidth, cv.clientHeight, this.dpr);
    this.startManualLoop();
  },
  
  /**
   * Boucle de rendu manuelle
   */
  manualLoopId: null,
  manualRunning: false,
  lastFrameTime: 0,
  
  startManualLoop() {
    if (this.manualRunning) return;
    this.manualRunning = true;
    this.lastFrameTime = performance.now();
    
    const loop = (timestamp) => {
      if (!this.manualRunning) return;
      
      const elapsed = timestamp - this.lastFrameTime;
      
      // Adaptive: skip si trop lent
      if (elapsed < 16) {
        this.manualLoopId = requestAnimationFrame(loop);
        return;
      }
      
      // Rendu
      this.render(this.ctx, this.canvas.width, this.canvas.height);
      this.lastFrameTime = timestamp;
      
      this.manualLoopId = requestAnimationFrame(loop);
    };
    
    this.manualLoopId = requestAnimationFrame(loop);
  },
  
  /**
   * Resize handler
   */
  onResize(width, height, dpr) {
    const cv = this.canvas;
    
    // Taille physique
    const physW = Math.round(width * dpr);
    const physH = Math.round(height * dpr);
    
    // Seulement si différent
    if (cv.width === physW && cv.height === physH) return;
    
    cv.width = physW;
    cv.height = physH;
    cv.style.width = width + 'px';
    cv.style.height = height + 'px';
    
    this.dpr = dpr;
    this.dirtyRect = null; // Full redraw
    
    // Invalide le cache
    this.invalidateCache();
    
    if (typeof resize === 'function') {
      resize();
    }
  },
  
  /**
   * Invalide le cache
   */
  invalidateCache() {
    this.cache.zones.clear();
    this.cache.components.clear();
    this.cache.grid = null;
  },
  
  /**
   * Schedule un redraw
   */
  scheduleRedraw() {
    this.dirtyRect = null; // Full
    if (this.manager) {
      this.manager.invalidate();
    }
  },
  
  /**
   * Rendu principal
   */
  render(ctx, w, h) {
    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, w, h);
    
    // Applique la transformation
    const scale = S.scale * this.dpr;
    const ox = S.ox * this.dpr;
    const oy = S.oy * this.dpr;
    
    ctx.setTransform(
      S.flip ? -scale : scale, 0, 0, scale,
      S.flip ? this.dpr * (2 * bcx() * S.scale + ox) : ox,
      oy
    );
    
    // Draw layers
    this.drawBackground(ctx);
    this.drawGrid(ctx);
    this.drawBoard(ctx);
    this.drawCopper(ctx);
    this.drawSilkscreen(ctx);
    this.drawSelection(ctx);
    this.drawOverlays(ctx);
    
    // Reset transform pour UI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Update status bar
    this.updateStatus();
  },
  
  /**
   * Dessine le fond (substrat)
   */
  drawBackground(ctx) {
    const P = boardPoly();
    if (!P || P.length < 3) return;
    
    ctx.fillStyle = C_SUB;
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) {
      ctx.lineTo(P[i].x, P[i].y);
    }
    ctx.closePath();
    ctx.fill();
  },
  
  /**
   * Dessine la grille avec caching
   */
  drawGrid(ctx) {
    if (!S.showGrid) return;
    
    // Cache la grille si elle n'a pas changé
    const cacheKey = `${S.grid}_${S.scale}_${S.ox}_${S.oy}_${S.flip}`;
    if (this.cache.grid && this.cache.grid.key === cacheKey) {
      ctx.drawImage(this.cache.grid.canvas, 0, 0);
      return;
    }
    
    const step = gridShownStep() * S.scale;
    if (step < 7) return;
    
    // Crée un canvas pour la grille
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = this.canvas.width;
    gridCanvas.height = this.canvas.height;
    const gridCtx = gridCanvas.getContext('2d');
    
    // Applique la même transformation
    const scale = S.scale * this.dpr;
    const ox = S.ox * this.dpr;
    const oy = S.oy * this.dpr;
    gridCtx.setTransform(
      S.flip ? -scale : scale, 0, 0, scale,
      S.flip ? this.dpr * (2 * bcx() * S.scale + ox) : ox,
      oy
    );
    
    // Dessine la grille
    drawGrid(gridCtx, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    
    // Cache
    this.cache.grid = { key: cacheKey, canvas: gridCanvas };
    
    // Dessine
    ctx.drawImage(gridCanvas, 0, 0);
  },
  
  /**
   * Dessine le contour de la carte
   */
  drawBoard(ctx) {
    if (!S.show.edge) return;
    
    const P = boardPoly();
    if (!P || P.length < 3) return;
    
    ctx.strokeStyle = S.sel.edge ? C_SEL : C_EDGE;
    ctx.lineWidth = px(S.sel.edge ? 2 : 1.6);
    
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) {
      ctx.lineTo(P[i].x, P[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  },
  
  /**
   * Dessine le cuivre (pistes, pastilles, zones)
   */
  drawCopper(ctx) {
    for (const i of layerOrder()) {
      const alpha = layerAlpha(i);
      if (alpha <= 0) continue;
      
      // Zones avec cache
      if (S.show.plane) {
        this.drawZones(ctx, i, alpha);
      }
      
      // Pastilles SMD
      this.drawSmdPads(ctx, i, alpha);
      
      // Pistes
      this.drawTracks(ctx, i, alpha);
    }
    
    // Pastilles traversantes
    this.drawThruPads(ctx);
    
    // Vias
    this.drawVias(ctx);
  },
  
  /**
   * Dessine les zones avec cache
   */
  drawZones(ctx, layerIndex, alpha) {
    const cacheKey = `zone_${layerIndex}_${S.ver}_${S.scale}`;
    
    // Check cache
    if (this.cache.zones.has(cacheKey)) {
      const cached = this.cache.zones.get(cacheKey);
      ctx.globalAlpha = alpha;
      ctx.drawImage(cached.canvas, cached.x, cached.y, cached.w, cached.h);
      ctx.globalAlpha = 1;
      return;
    }
    
    const zs = S.zones.filter(z => z.l === layerIndex && z.pts.length >= 3);
    if (!zs.length) return;
    
    // Calcule la bounding box
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const z of zs) {
      const b = polyBBox(z.pts);
      x1 = Math.min(x1, b.x1); y1 = Math.min(y1, b.y1);
      x2 = Math.max(x2, b.x2); y2 = Math.max(y2, b.y2);
    }
    
    const res = Math.min(S.scale * 2, 20);
    const W = Math.ceil((x2 - x1) * res);
    const H = Math.ceil((y2 - y1) * res);
    
    if (W > 2000 || H > 2000) return; // Gardefou
    
    // Canvas pour la zone
    const zoneCanvas = document.createElement('canvas');
    zoneCanvas.width = W;
    zoneCanvas.height = H;
    const zCtx = zoneCanvas.getContext('2d');
    
    zCtx.setTransform(res, 0, 0, res, -x1 * res, -y1 * res);
    
    // Fill zones
    zCtx.fillStyle = layerColor(layerIndex);
    for (const z of zs) {
      zCtx.beginPath();
      zCtx.moveTo(z.pts[0].x, z.pts[0].y);
      for (let k = 1; k < z.pts.length; k++) {
        zCtx.lineTo(z.pts[k].x, z.pts[k].y);
      }
      zCtx.closePath();
      zCtx.fill();
    }
    
    // Cache
    this.cache.zones.set(cacheKey, {
      canvas: zoneCanvas,
      x: x1 * S.scale,
      y: y1 * S.scale,
      w: W / res * S.scale,
      h: H / res * S.scale
    });
    
    ctx.globalAlpha = alpha;
    ctx.drawImage(zoneCanvas, x1, y1, (x2 - x1), (y2 - y1));
    ctx.globalAlpha = 1;
  },
  
  /**
   * Dessine les pastilles SMD
   */
  drawSmdPads(ctx, layerIndex, alpha) {
    const col = layerColor(layerIndex);
    
    for (const fp of S.fps) {
      for (const q of padsWorld(fp)) {
        if (q.drill > 0) continue;
        if (padLayers(fp, q)[0] !== layerIndex) continue;
        
        ctx.globalAlpha = alpha * netAlpha(q.net);
        
        // Cache les pastilles individuelles si utilisées souvent
        padFill(ctx, q, 0, col);
      }
    }
    ctx.globalAlpha = 1;
  },
  
  /**
   * Dessine les pistes
   */
  drawTracks(ctx, layerIndex, alpha) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const col = layerColor(layerIndex);
    
    // Groupe par largeur
    const byWidth = new Map();
    for (const t of S.tracks) {
      if (t.l !== layerIndex) continue;
      if (!byWidth.has(t.w)) byWidth.set(t.w, []);
      byWidth.get(t.w).push(t);
    }
    
    for (const [w, segs] of byWidth) {
      const na = netAlpha(segs[0].net);
      ctx.globalAlpha = alpha * na;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      
      ctx.beginPath();
      for (const t of segs) {
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  
  /**
   * Dessine les pastilles traversantes
   */
  drawThruPads(ctx) {
    for (const fp of S.fps) {
      for (const q of padsWorld(fp)) {
        if (!(q.drill > 0)) continue;
        ctx.globalAlpha = netAlpha(q.net);
        padFill(ctx, q, 0, C_THRU);
      }
    }
    ctx.globalAlpha = 1;
  },
  
  /**
   * Dessine les vias
   */
  drawVias(ctx) {
    for (const v of S.vias) {
      ctx.globalAlpha = netAlpha(v.net);
      const thru = (v.a === 0 && v.b === S.cu - 1);
      ctx.fillStyle = thru ? C_THRU : layerColor(v.a);
      
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.d / 2, 0, Math.PI * 2);
      ctx.fill();
      
      if (!thru) {
        ctx.strokeStyle = layerColor(v.b);
        ctx.lineWidth = v.d * 0.22;
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.d / 2 - v.d * 0.11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },
  
  /**
   * Dessine la sérigraphie
   */
  drawSilkscreen(ctx) {
    for (const fp of S.fps) {
      const top = !fp.side;
      if (top && !S.show.silkT) continue;
      if (!top && !S.show.silkB) continue;
      
      const T = fpXform(fp);
      const b = bodyOf(fp);
      const pts = [T(b.x1, b.y1), T(b.x2, b.y1), T(b.x2, b.y2), T(b.x1, b.y2)];
      
      ctx.strokeStyle = top ? C_SILK_T : C_SILK_B;
      ctx.lineWidth = px(1.2);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
    }
  },
  
  /**
   * Dessine la sélection
   */
  drawSelection(ctx) {
    // Via selection
    for (const v of S.sel.vias) {
      ctx.strokeStyle = C_SEL;
      ctx.lineWidth = px(1.6);
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.d / 2 + px(2), 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  
  /**
   * Dessine les overlays (DRC, rats, etc.)
   */
  drawOverlays(ctx) {
    // Rats nest
    if (S.show.rats) {
      this.drawRats(ctx);
    }
    
    // DRC errors
    if (S.show.drc && S.drc.length) {
      this.drawDrc(ctx);
    }
  },
  
  /**
   * Dessine le rats nest
   */
  drawRats(ctx) {
    const R = conn().rats;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(4), px(3)]);
    
    for (const r of R) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = C_RATS;
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();
    }
    
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  },
  
  /**
   * Dessine les erreurs DRC
   */
  drawDrc(ctx) {
    ctx.strokeStyle = C_ERR;
    ctx.lineWidth = px(1.6);
    
    for (const e of S.drc) {
      if (e.info) continue;
      ctx.beginPath();
      ctx.arc(e.x, e.y, px(9), 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(e.x - px(6), e.y - px(6));
      ctx.lineTo(e.x + px(6), e.y + px(6));
      ctx.moveTo(e.x + px(6), e.y - px(6));
      ctx.lineTo(e.x - px(6), e.y + px(6));
      ctx.stroke();
    }
  },
  
  /**
   * Met à jour la barre de statut
   */
  updateStatus() {
    const zoomEl = document.getElementById('fZoom');
    if (zoomEl) zoomEl.textContent = Math.round(S.scale * 20) + '%';
    
    const nEl = document.getElementById('fN');
    if (nEl) nEl.textContent = S.fps.length;
    
    const tEl = document.getElementById('fT');
    if (tEl) tEl.textContent = S.tracks.length;
    
    const vEl = document.getElementById('fV');
    if (vEl) vEl.textContent = S.vias.length;
  },
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.manager) {
      this.manager.destroy();
    }
    if (this.manualLoopId) {
      this.manualRunning = false;
      cancelAnimationFrame(this.manualLoopId);
    }
  }
};

// Auto-init quand le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CAO_PCB.init());
} else {
  CAO_PCB.init();
}
