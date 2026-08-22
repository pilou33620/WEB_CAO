/**
 * WEB_CAO - Éditeur Schématique Rendu Optimisé
 * ===========================================
 * Double buffering + optimisations Safari iPad
 */
"use strict";

/* ==========================================================================
   Configuration Canvas Manager Schématique
   ========================================================================== */
const CAO_SCH = {
  manager: null,
  canvas: null,
  ctx: null,
  dpr: 1,
  
  // Cache pour les éléments
  cache: {
    grid: null,
    components: new Map(),
    wires: null
  },
  
  // État dirty
  needsFullRedraw: true,
  
  /**
   * Initialise le canvas
   */
  init() {
    this.canvas = document.getElementById('schematic');
    if (!this.canvas) {
      this.canvas = document.getElementById('canvas');
    }
    if (!this.canvas) return;
    
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // Resize observer
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(this.canvas.parentElement);
    
    this.onResize();
    this.startLoop();
  },
  
  /**
   * Handler de resize
   */
  onResize() {
    const cv = this.canvas;
    const parent = cv.parentElement;
    if (!parent) return;
    
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    
    const physW = Math.round(w * this.dpr);
    const physH = Math.round(h * this.dpr);
    
    if (cv.width === physW && cv.height === physH) return;
    
    cv.width = physW;
    cv.height = physH;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    
    this.needsFullRedraw = true;
    this.invalidateCache();
  },
  
  /**
   * Invalide le cache
   */
  invalidateCache() {
    this.cache.grid = null;
    this.cache.components.clear();
    this.cache.wires = null;
  },
  
  /**
   * Boucle de rendu
   */
  loopId: null,
  running: false,
  lastTime: 0,
  
  startLoop() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    
    const loop = (time) => {
      if (!this.running) return;
      
      const elapsed = time - this.lastTime;
      
      // Skip frames si nécessaire (battery saving sur iPad)
      if (elapsed < 16) {
        this.loopId = requestAnimationFrame(loop);
        return;
      }
      
      this.render();
      this.lastTime = time;
      
      this.loopId = requestAnimationFrame(loop);
    };
    
    this.loopId = requestAnimationFrame(loop);
  },
  
  /**
   * Rendu principal
   */
  render() {
    const ctx = this.ctx;
    const cv = this.canvas;
    
    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, cv.width, cv.height);
    
    // Transformation
    const dpr = this.dpr;
    const scale = S.scale * dpr;
    
    ctx.setTransform(
      dpr * scale, 0, 0, dpr * scale,
      dpr * S.ox, dpr * S.oy
    );
    
    // Draw layers
    this.drawGrid();
    this.drawWires();
    this.drawJunctions();
    this.drawComponents();
    this.drawNetLabels();
    this.drawSelection();
    this.drawPreview();
    
    // Reset pour UI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    this.updateStatus();
    this.needsFullRedraw = false;
  },
  
  /**
   * Dessine la grille avec cache
   */
  drawGrid() {
    if (!S.showGrid) return;
    
    const ctx = this.ctx;
    const cv = this.canvas;
    
    // Cache key
    const key = `${S.grid}_${S.scale}_${S.ox}_${S.oy}`;
    if (this.cache.grid && this.cache.grid.key === key) {
      ctx.drawImage(this.cache.grid.canvas, 0, 0);
      return;
    }
    
    // Crée canvas de grille
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = cv.width;
    gridCanvas.height = cv.height;
    const gCtx = gridCanvas.getContext('2d');
    
    // Même transformation
    const dpr = this.dpr;
    const scale = S.scale * dpr;
    gCtx.setTransform(
      dpr * scale, 0, 0, dpr * scale,
      dpr * S.ox, dpr * S.oy
    );
    
    // Dessine grille
    const step = G * S.scale;
    if (step >= 10) {
      const w = cv.width / dpr;
      const h = cv.height / dpr;
      const o = {
        x: S.ox * dpr % (G * scale),
        y: S.oy * dpr % (G * scale)
      };
      
      gCtx.strokeStyle = C_GRID;
      gCtx.lineWidth = 1 / dpr;
      gCtx.beginPath();
      
      for (let x = -o.x % (G * scale); x < w * dpr; x += G * scale) {
        const px = Math.round(x) + 0.5;
        gCtx.moveTo(px / dpr, 0);
        gCtx.lineTo(px / dpr, h);
      }
      
      for (let y = -o.y % (G * scale); y < h * dpr; y += G * scale) {
        const py = Math.round(y) + 0.5;
        gCtx.moveTo(0, py / dpr);
        gCtx.lineTo(w, py / dpr);
      }
      
      gCtx.stroke();
      
      // Grille majeure
      const big = G * 5;
      const bStep = big * scale;
      if (bStep >= 50) {
        gCtx.strokeStyle = C_GRIDMAJ;
        gCtx.beginPath();
        
        const bx = -((S.ox * dpr) % bStep) + bStep;
        const by = -((S.oy * dpr) % bStep) + bStep;
        
        for (let x = bx % bStep; x < w * dpr; x += bStep) {
          const px = Math.round(x) + 0.5;
          gCtx.moveTo(px / dpr, 0);
          gCtx.lineTo(px / dpr, h);
        }
        
        for (let y = by % bStep; y < h * dpr; y += bStep) {
          const py = Math.round(y) + 0.5;
          gCtx.moveTo(0, py / dpr);
          gCtx.lineTo(w, py / dpr);
        }
        
        gCtx.stroke();
      }
    }
    
    // Cache
    this.cache.grid = { key, canvas: gridCanvas };
    
    // Dessine
    ctx.drawImage(gridCanvas, 0, 0);
  },
  
  /**
   * Dessine les fils
   */
  drawWires() {
    const ctx = this.ctx;
    
    // Cache les fils statiques
    if (!this.cache.wires) {
      const wCanvas = document.createElement('canvas');
      wCanvas.width = this.canvas.width;
      wCanvas.height = this.canvas.height;
      const wCtx = wCanvas.getContext('2d');
      
      const dpr = this.dpr;
      wCtx.setTransform(
        dpr * S.scale, 0, 0, dpr * S.scale,
        dpr * S.ox, dpr * S.oy
      );
      
      wCtx.strokeStyle = C_WIRE;
      wCtx.lineWidth = 3;
      wCtx.lineCap = 'round';
      
      wCtx.beginPath();
      for (const w of S.wires) {
        wCtx.moveTo(w.x1, w.y1);
        wCtx.lineTo(w.x2, w.y2);
      }
      wCtx.stroke();
      
      this.cache.wires = wCanvas;
    }
    
    ctx.drawImage(this.cache.wires, 0, 0);
  },
  
  /**
   * Dessine les jonctions
   */
  drawJunctions() {
    const ctx = this.ctx;
    ctx.fillStyle = C_RED;
    
    for (const p of junctions()) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Jonctions de broches
    for (const q of pinContactPoints()) {
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  
  /**
   * Dessine les composants
   */
  drawComponents() {
    const ctx = this.ctx;
    
    for (const el of S.comps) {
      this.drawComponent(el);
    }
  },
  
  /**
   * Dessine un composant
   */
  drawComponent(el) {
    const ctx = this.ctx;
    const def = defOf(el.type);
    
    ctx.save();
    ctx.translate(el.x, el.y);
    
    if (!def.flat) {
      ctx.rotate(((el.rot % 360) + 360) % 360 * Math.PI / 180);
      if (el.mir) ctx.scale(-1, 1);
    }
    
    ctx.strokeStyle = C_COMP;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    _symT = def.flat ? null : { rot: el.rot | 0, mir: !!el.mir };
    
    try {
      def.d(ctx, el);
    } finally {
      _symT = null;
    }
    
    ctx.restore();
    
    // Broches
    ctx.fillStyle = '#8fd0ff';
    for (const p of allPins(el)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Textes
    if (def.refIn && el.ref) {
      TXT(ctx, el.ref, el.x, el.y + 1, 12.5, C_TXT);
    }
    if (def.valIn && el.value) {
      TXT(ctx, el.value, el.x, el.y + 1, 12.5, C_TXT);
    }
    
    for (const t of compTexts(el)) {
      TXT(ctx, t.text, t.x, t.y, t.size, t.col, t.align);
    }
  },
  
  /**
   * Dessine les labels de net
   */
  drawNetLabels() {
    if (!S.netLabels || S.scale < 0.45) return;
    
    const ctx = this.ctx;
    ctx.lineWidth = 1.2;
    
    for (const b of netLabelBoxes()) {
      const n = b.net;
      const col = n.conflict ? C_RED : netColor(n);
      
      RR(ctx, b.x, b.y, b.w, b.h, 4, '#16181c');
      TXT(ctx, b.t, b.x + b.w / 2, b.y + b.h / 2 + 0.5, 10.5, col);
    }
  },
  
  /**
   * Dessine la sélection
   */
  drawSelection() {
    const ctx = this.ctx;
    
    // Fils sélectionnés
    if (S.selW && S.selW.size) {
      ctx.strokeStyle = C_SEL;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      for (const w of S.wires) {
        if (S.selW.has(w)) {
          ctx.moveTo(w.x1, w.y1);
          ctx.lineTo(w.x2, w.y2);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      
      // Poignées
      const h = HANDLE / S.scale;
      ctx.fillStyle = C_SEL;
      for (const w of S.wires) {
        if (S.selW.has(w)) {
          ctx.fillRect(w.x1 - h, w.y1 - h, h * 2, h * 2);
          ctx.fillRect(w.x2 - h, w.y2 - h, h * 2, h * 2);
        }
      }
    }
    
    // Composants sélectionnés
    if (S.sel && S.sel.size) {
      ctx.strokeStyle = C_SEL;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      
      for (const el of S.comps) {
        if (S.sel.has(el.id)) {
          const b = bbox(el);
          ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
        }
      }
      
      ctx.setLineDash([]);
    }
  },
  
  /**
   * Dessine l'aperçu (preview)
   */
  drawPreview() {
    const ctx = this.ctx;
    
    // Aperçu de composant à poser
    if (S.place) {
      const ghost = {
        id: -1,
        type: S.place,
        x: snap(S.mouse.x),
        y: snap(S.mouse.y),
        rot: S.placeRot || 0,
        mir: false,
        ref: '',
        value: defOf(S.place).v
      };
      
      ctx.globalAlpha = 0.45;
      this.drawComponent(ghost);
      ctx.globalAlpha = 1;
    }
    
    // Aperçu de fil
    if (S.wireStart) {
      const b = { x: snap(S.mouse.x), y: snap(S.mouse.y) };
      
      ctx.strokeStyle = C_WIRE;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 3.4;
      ctx.setLineDash([7, 5]);
      
      ctx.beginPath();
      for (const s of routeL(S.wireStart, b)) {
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      
      ctx.fillStyle = C_RED;
      ctx.beginPath();
      ctx.arc(S.wireStart.x, S.wireStart.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Broche survolée
    if (S.hoverPin) {
      ctx.strokeStyle = C_SEL;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(S.hoverPin.x, S.hoverPin.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Rectangle de sélection
    if (S.marquee) {
      const m = S.marquee;
      ctx.strokeStyle = C_SEL;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        Math.min(m.x1, m.x2),
        Math.min(m.y1, m.y2),
        Math.abs(m.x2 - m.x1),
        Math.abs(m.y2 - m.y1)
      );
      ctx.setLineDash([]);
    }
  },
  
  /**
   * Met à jour la barre de statut
   */
  updateStatus() {
    const zoomEl = document.getElementById('fZoom');
    if (zoomEl) zoomEl.textContent = Math.round(S.scale * 100) + '%';
    
    const nEl = document.getElementById('fN');
    if (nEl) nEl.textContent = S.comps.length;
    
    const wEl = document.getElementById('fW');
    if (wEl) wEl.textContent = S.wires.length;
    
    const netsEl = document.getElementById('fNets');
    if (netsEl) netsEl.textContent = nets().list.length;
  },
  
  /**
   * Invalide pour re-render
   */
  invalidate() {
    this.invalidateCache();
    this.needsFullRedraw = true;
  },
  
  /**
   * Cleanup
   */
  destroy() {
    this.running = false;
    if (this.loopId) {
      cancelAnimationFrame(this.loopId);
    }
  }
};

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CAO_SCH.init());
} else {
  CAO_SCH.init();
}
