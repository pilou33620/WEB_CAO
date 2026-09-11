"use strict";
/* =============================================================================
   Gestion LIB — 03-rendu-symbole.js
   Moteur de rendu Canvas 2D pour les symboles schématiques
   ============================================================================= */

const SCH_COLORS = {
  bg: "#0b0d10",
  grid: "#16181f",
  bodyStroke: "#cfe6fb",
  bodyFill: "rgba(32, 45, 62, 0.45)",
  pin: "#cfe6fb",
  pinDot: "#e8443a",
  txt: "#e6e8ec",
  txtDim: "#8b919c",
  accent: "#f2c744"
};

class SymboleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sym = null;
    this.zoom = 1.8;
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
    const xPx = (sx - this.panX) / this.zoom;
    const yPx = (sy - this.panY) / this.zoom;
    return { x: xPx, y: yPx, sx, sy };
  }

  worldToScreen(xPx, yPx) {
    return {
      x: this.panX + xPx * this.zoom,
      y: this.panY + yPx * this.zoom
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
      this.zoom = Math.max(0.4, Math.min(10, this.zoom * factor));
      this.render();
    }, { passive: false });
  }

  setSymbol(sym) {
    this.sym = sym;
    this.autoFit();
  }

  autoFit() {
    if (!this.canvas || !this.sym) return;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 200;
    this.canvas.width = w * window.devicePixelRatio;
    this.canvas.height = h * window.devicePixelRatio;

    let x1 = -40, y1 = -30, x2 = 40, y2 = 30;
    if (Array.isArray(this.sym.ext) && this.sym.ext.length >= 4) {
      x1 = this.sym.ext[0]; y1 = this.sym.ext[1];
      x2 = this.sym.ext[2]; y2 = this.sym.ext[3];
    } else if (Array.isArray(this.sym.pins) && this.sym.pins.length) {
      for (const p of this.sym.pins) {
        x1 = Math.min(x1, p.x || p[0] || 0);
        x2 = Math.max(x2, p.x || p[0] || 0);
        y1 = Math.min(y1, p.y || p[1] || 0);
        y2 = Math.max(y2, p.y || p[1] || 0);
      }
    }

    if (Array.isArray(this.sym.primitives)) {
      for (const p of this.sym.primitives) {
        if (p.op === "line") {
          x1 = Math.min(x1, p.x1, p.x2);
          y1 = Math.min(y1, p.y1, p.y2);
          x2 = Math.max(x2, p.x1, p.x2);
          y2 = Math.max(y2, p.y1, p.y2);
        } else if (p.op === "rect") {
          x1 = Math.min(x1, p.x);
          y1 = Math.min(y1, p.y);
          x2 = Math.max(x2, p.x + p.w);
          y2 = Math.max(y2, p.y + p.h);
        }
      }
    }

    const spanX = Math.max(20, (x2 - x1) * 1.6);
    const spanY = Math.max(20, (y2 - y1) * 1.6);

    const zoomX = w / spanX;
    const zoomY = h / spanY;
    this.zoom = Math.max(0.6, Math.min(3.5, Math.min(zoomX, zoomY)));
    this.panX = w / 2 - ((x1 + x2) / 2) * this.zoom;
    this.panY = h / 2 - ((y1 + y2) / 2) * this.zoom;

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
    ctx.fillStyle = SCH_COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    this._drawGrid(ctx, w, h);

    if (this.sym) {
      this._drawPrimitives(ctx);
      this._drawPins(ctx);
    }

    ctx.restore();

    // Surcouche interactive (déplacement de broches, tracé de traits)
    if (typeof this.customOverlayDraw === "function") {
      ctx.save();
      ctx.scale(dpr, dpr);
      this.customOverlayDraw(ctx, w, h);
      ctx.restore();
    }
  }

  _drawGrid(ctx, w, h) {
    const z = this.zoom;
    const step = 20; // 20 px = 1 mm standard de l'éditeur schématique

    const left = -this.panX / z;
    const right = (w - this.panX) / z;
    const top = -this.panY / z;
    const bottom = (h - this.panY) / z;

    ctx.fillStyle = SCH_COLORS.grid;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;

    for (let x = startX; x <= right; x += step) {
      for (let y = startY; y <= bottom; y += step) {
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
  }

  _drawPrimitives(ctx) {
    const sym = this.sym;
    if (!Array.isArray(sym.primitives)) return;

    ctx.strokeStyle = SCH_COLORS.bodyStroke;
    ctx.fillStyle = SCH_COLORS.bodyFill;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const p of sym.primitives) {
      ctx.save();
      if (p.width) ctx.lineWidth = p.width;
      if (p.stroke) ctx.strokeStyle = p.stroke;

      if (p.op === "line") {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
      } else if (p.op === "rect") {
        ctx.beginPath();
        if (p.r) {
          ctx.roundRect(p.x, p.y, p.w, p.h, p.r);
        } else {
          ctx.rect(p.x, p.y, p.w, p.h);
        }
        if (p.fill !== false) {
          ctx.fillStyle = (typeof p.fill === "string") ? p.fill : SCH_COLORS.bodyFill;
          ctx.fill();
        }
        ctx.stroke();
      } else if (p.op === "circle") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        if (p.fill) {
          ctx.fillStyle = (p.fill === "hole") ? SCH_COLORS.bg : SCH_COLORS.bodyFill;
          ctx.fill();
        }
        ctx.stroke();
      } else if (p.op === "arc") {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, p.start, p.end);
        ctx.stroke();
      } else if (p.op === "poly" && Array.isArray(p.pts)) {
        ctx.beginPath();
        ctx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (let i = 1; i < p.pts.length; i++) {
          ctx.lineTo(p.pts[i][0], p.pts[i][1]);
        }
        ctx.closePath();
        if (p.fill) {
          ctx.fillStyle = (typeof p.fill === "string") ? p.fill : SCH_COLORS.bodyFill;
          ctx.fill();
        }
        ctx.stroke();
      } else if (p.op === "arrow") {
        const d = p.size || 9;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle || 0);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-d, -d * 0.42);
        ctx.lineTo(-d, d * 0.42);
        ctx.closePath();
        ctx.fillStyle = p.col || SCH_COLORS.bodyStroke;
        ctx.fill();
        ctx.restore();
      } else if (p.op === "text") {
        ctx.font = `600 ${p.size || 11}px "Segoe UI", sans-serif`;
        ctx.fillStyle = p.color || SCH_COLORS.txt;
        ctx.textAlign = p.align || "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.text, p.x, p.y);
      }

      ctx.restore();
    }
  }

  _drawPins(ctx) {
    const sym = this.sym;
    if (!Array.isArray(sym.pins)) return;

    for (let i = 0; i < sym.pins.length; i++) {
      const p = sym.pins[i];
      const px = p.x !== undefined ? p.x : p[0];
      const py = p.y !== undefined ? p.y : p[1];

      // Point rouge de connexion
      ctx.fillStyle = SCH_COLORS.pinDot;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Numéro de broche
      ctx.font = `9px "JetBrains Mono", Consolas, monospace`;
      ctx.fillStyle = SCH_COLORS.txtDim;
      ctx.textAlign = px < 0 ? "right" : (px > 0 ? "left" : "center");
      ctx.textBaseline = py < 0 ? "bottom" : (py > 0 ? "top" : "middle");

      const offX = px < 0 ? -6 : (px > 0 ? 6 : 0);
      const offY = py < 0 ? -6 : (py > 0 ? 6 : 0);
      ctx.fillText(String(i + 1), px + offX, py + offY);
    }
  }
}

window.SymboleRenderer = SymboleRenderer;
