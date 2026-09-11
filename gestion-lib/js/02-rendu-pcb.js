"use strict";
/* =============================================================================
   Gestion LIB — 02-rendu-pcb.js
   Moteur de rendu Canvas 2D haute fidélité pour les empreintes PCB
   ============================================================================= */

const PCB_COLORS = {
  bg: "#0b0d10",
  grid: "#1a1d24",
  axis: "#2d3340",
  silk: "#f3f4f6",
  copperSmd: "#f59e0b",
  copperThru: "#eab308",
  copperText: "#18181b",
  drill: "#090a0c",
  pin1Marker: "#ef4444",
  selection: "#38bdf8"
};

class PcbRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.fp = null;
    this.zoom = 20; // pixels par mm
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.customPointerDown = null;
    this.customPointerMove = null;
    this.customPointerUp = null;
    this.customOverlayDraw = null;

    this._bindEvents();
  }

  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    const xMm = (sx - this.panX) / this.zoom;
    const yMm = -(sy - this.panY) / this.zoom;
    return { x: xMm, y: yMm, sx, sy };
  }

  worldToScreen(xMm, yMm) {
    return {
      x: this.panX + xMm * this.zoom,
      y: this.panY - yMm * this.zoom
    };
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener("pointerdown", e => {
      if (this.customPointerDown && this.customPointerDown(e)) {
        return;
      }
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
    });

    c.addEventListener("pointermove", e => {
      if (this.customPointerMove && this.customPointerMove(e)) {
        return;
      }
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panX += dx;
      this.panY += dy;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.render();
    });

    const stopDrag = e => {
      if (this.customPointerUp && this.customPointerUp(e)) {
        return;
      }
      this.isDragging = false;
    };
    c.addEventListener("pointerup", stopDrag);
    c.addEventListener("pointercancel", stopDrag);

    c.addEventListener("wheel", e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      this.zoom = Math.max(2, Math.min(200, this.zoom * factor));
      this.render();
    }, { passive: false });
  }

  setFootprint(fp) {
    this.fp = fp;
    this.autoFit();
  }

  autoFit() {
    if (!this.canvas || !this.fp) return;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 200;
    this.canvas.width = w * window.devicePixelRatio;
    this.canvas.height = h * window.devicePixelRatio;

    // Calcul de l'emprise
    let x1 = -2, y1 = -2, x2 = 2, y2 = 2;
    if (this.fp.body) {
      x1 = Math.min(x1, this.fp.body.x1 || -2);
      y1 = Math.min(y1, this.fp.body.y1 || -2);
      x2 = Math.max(x2, this.fp.body.x2 || 2);
      y2 = Math.max(y2, this.fp.body.y2 || 2);
    }
    if (Array.isArray(this.fp.pads)) {
      for (const p of this.fp.pads) {
        const pw = (p.w || 1) / 2, ph = (p.h || 1) / 2;
        x1 = Math.min(x1, p.x - pw);
        y1 = Math.min(y1, p.y - ph);
        x2 = Math.max(x2, p.x + pw);
        y2 = Math.max(y2, p.y + ph);
      }
    }
    if (Array.isArray(this.fp.lines)) {
      for (const l of this.fp.lines) {
        if (l.x1 !== undefined) x1 = Math.min(x1, l.x1);
        if (l.y1 !== undefined) y1 = Math.min(y1, l.y1);
        if (l.x2 !== undefined) x2 = Math.max(x2, l.x2);
        if (l.y2 !== undefined) y2 = Math.max(y2, l.y2);
      }
    }

    const spanX = Math.max(1, (x2 - x1) * 1.5);
    const spanY = Math.max(1, (y2 - y1) * 1.5);

    const zoomX = w / spanX;
    const zoomY = h / spanY;
    this.zoom = Math.max(5, Math.min(120, Math.min(zoomX, zoomY)));
    this.panX = w / 2 - ((x1 + x2) / 2) * this.zoom;
    this.panY = h / 2 + ((y1 + y2) / 2) * this.zoom;

    this.render();
  }

  render() {
    const c = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;

    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Fond
    ctx.fillStyle = PCB_COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // Transformation mm -> pixels écran
    // Y inversé pour avoir les ordonnées usuelles de CAO
    ctx.translate(this.panX, this.panY);

    this._drawGrid(ctx, w, h);
    this._drawAxes(ctx);

    if (this.fp) {
      this._drawSilkscreen(ctx);
      this._drawPads(ctx);
    }

    ctx.restore();

    // Surcouche interactive (déplacement de pastilles, tracé de traits)
    if (typeof this.customOverlayDraw === "function") {
      ctx.save();
      ctx.scale(dpr, dpr);
      this.customOverlayDraw(ctx, w, h);
      ctx.restore();
    }
  }

  _drawGrid(ctx, w, h) {
    const z = this.zoom;
    // Grille tous les 1 mm si assez grand, sinon 2.54 ou 5
    let step = 1;
    if (z < 10) step = 5;
    else if (z < 20) step = 2.54;

    const leftMm = -this.panX / z;
    const rightMm = (w - this.panX) / z;
    const topMm = (this.panY - h) / z;
    const bottomMm = this.panY / z;

    ctx.fillStyle = PCB_COLORS.grid;
    const startX = Math.floor(leftMm / step) * step;
    const startY = Math.floor(topMm / step) * step;

    for (let x = startX; x <= rightMm; x += step) {
      for (let y = startY; y <= bottomMm; y += step) {
        ctx.fillRect(x * z - 0.5, -y * z - 0.5, 1, 1);
      }
    }
  }

  _drawAxes(ctx) {
    const z = this.zoom;
    ctx.strokeStyle = PCB_COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10 * z, 0); ctx.lineTo(10 * z, 0);
    ctx.moveTo(0, -10 * z); ctx.lineTo(0, 10 * z);
    ctx.stroke();

    // Origine (0, 0)
    ctx.strokeStyle = "rgba(63, 160, 234, 0.6)";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawSilkscreen(ctx) {
    const fp = this.fp;
    const z = this.zoom;
    const b = fp.body;

    ctx.strokeStyle = PCB_COLORS.silk;
    ctx.lineWidth = Math.max(1, 0.15 * z);

    if (b) {
      const bx = b.x1 * z;
      const by = -b.y2 * z;
      const bw = (b.x2 - b.x1) * z;
      const bh = (b.y2 - b.y1) * z;

      ctx.strokeRect(bx, by, bw, bh);

      // Repère broche 1 (encoche ou point)
      ctx.fillStyle = PCB_COLORS.silk;
      ctx.beginPath();
      ctx.arc(bx + 6, by + 6, Math.max(2, 0.3 * z), 0, Math.PI * 2);
      ctx.fill();
    }

    // Lignes sérigraphie personnalisées
    if (Array.isArray(fp.lines) && fp.lines.length > 0) {
      for (const l of fp.lines) {
        ctx.lineWidth = Math.max(1, (l.width || 0.15) * z);
        ctx.beginPath();
        ctx.moveTo(l.x1 * z, -l.y1 * z);
        ctx.lineTo(l.x2 * z, -l.y2 * z);
        ctx.stroke();
      }
    }
  }

  _drawPads(ctx) {
    const fp = this.fp;
    const z = this.zoom;
    if (!Array.isArray(fp.pads)) return;

    for (const q of fp.pads) {
      const px = q.x * z;
      const py = -q.y * z;
      const pw = (q.w || 1) * z;
      const ph = (q.h || 1) * z;
      const isThru = (q.drill || 0) > 0;

      ctx.save();
      ctx.translate(px, py);
      if (q.rot) ctx.rotate((-q.rot * Math.PI) / 180);

      // Cuivre
      ctx.fillStyle = isThru ? PCB_COLORS.copperThru : PCB_COLORS.copperSmd;
      if (q.shape === "circ") {
        ctx.beginPath();
        ctx.arc(0, 0, pw / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (q.shape === "oval") {
        ctx.beginPath();
        const r = Math.min(pw, ph) / 2;
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, r);
        ctx.fill();
      } else {
        // Rectangle
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      }

      // Perçage si traversant
      if (isThru) {
        const dr = (q.drill * z) / 2;
        ctx.fillStyle = PCB_COLORS.drill;
        ctx.beginPath();
        ctx.arc(0, 0, dr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Numéro de pastille
      const fSize = Math.max(8, Math.min(13, Math.min(pw, ph) * 0.55));
      ctx.font = `600 ${fSize}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = isThru ? "#ffffff" : PCB_COLORS.copperText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(q.n || ""), 0, 0);

      ctx.restore();
    }
  }
}

window.PcbRenderer = PcbRenderer;
