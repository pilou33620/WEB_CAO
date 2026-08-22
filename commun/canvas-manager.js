/**
 * WEB_CAO - Gestionnaire de Canvas Optimisé
 * =========================================
 * Double buffering, optimisations Safari iPad
 * 
 * Safari iPad a des comportements spécifiques:
 * - Memory pressure provoque la perte du contexte
 * - requestAnimationFrame moins fiable
 * - devicePixelRatio peut être fractionné
 * 
 * Usage:
 *   const manager = CAO.Canvas.create('myCanvas', {
 *     onDraw: (ctx, time) => { ... },
 *     onResize: (width, height) => { ... }
 *   });
 */
"use strict";

(function(CAO) {
  'use strict';

  /**
   * Constantes de détection
   */
  const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const IS_ANDROID = /Android/.test(navigator.userAgent);
  const HAS_WEBGL = (function() {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  })();

  /**
   * Gestionnaire de Canvas principal
   */
  class CanvasManager {
    #canvas;
    #ctx;
    #offscreen;        // Double buffer
    #offCtx;
    #options;
    #rafId = null;
    #running = false;
    #dirty = true;
    #lastTime = 0;
    #fps = 60;
    #frameTime = 1000 / 60;
    #skipFrames = 0;
    #lastDpr = 1;
    #lostContext = false;
    #resizeObserver;
    
    /**
     * Crée un nouveau CanvasManager
     */
    constructor(canvas, options = {}) {
      this.#canvas = canvas;
      this.#options = {
        // Callbacks
        onDraw: options.onDraw || (() => {}),
        onResize: options.onResize || (() => {}),
        onInit: options.onInit || (() => {}),
        onContextLost: options.onContextLost || (() => {}),
        onContextRestored: options.onContextRestored || (() => {}),
        
        // Configuration
        doubleBuffer: options.doubleBuffer !== false,
        autoResize: options.autoResize !== false,
        pixelRatio: options.pixelRatio === undefined ? true : options.pixelRatio,
        maxPixelRatio: Math.min(options.maxPixelRatio || 2, IS_IOS ? 2 : 3),
        vsync: options.vsync !== false,
        adaptiveFps: options.adaptiveFps !== false,
        targetFps: options.targetFps || 60,
        minFps: options.minFps || 30,
        
        // Optimisations Safari
        preserveDrawingBuffer: IS_SAFARI ? false : (options.preserveDrawingBuffer || false),
        willReadFrequently: options.willReadFrequently || false,
        
        // Debug
        debug: options.debug || false
      };
      
      this.#init();
    }
    
    /**
     * Initialisation
     */
    #init() {
      // Contexte principal
      this.#ctx = this.#getContext();
      if (!this.#ctx) {
        console.error('Canvas: Impossible de créer le contexte 2D');
        return;
      }
      
      // Double buffer si activé
      if (this.#options.doubleBuffer) {
        this.#createOffscreen();
      }
      
      // Surveiller les pertes de contexte (Safari)
      this.#setupContextHandlers();
      
      // Auto-resize
      if (this.#options.autoResize) {
        this.#setupResizeObserver();
      }
      
      // Taille initiale
      this.resize();
      
      // Callback d'initialisation
      this.#options.onInit(this.#ctx);
      
      // Démarrer le rendu
      this.start();
      
      if (this.#options.debug) {
        this.#setupDebug();
      }
    }
    
    /**
     * Obtenir le contexte avec retry pour Safari
     */
    #getContext() {
      const canvas = this.#canvas;
      const opts = {
        alpha: true,
        desynchronized: !IS_SAFARI, // Safari ne supporte pas bien
        preserveDrawingBuffer: this.#options.preserveDrawingBuffer,
        willReadFrequently: this.#options.willReadFrequently
      };
      
      let ctx;
      
      // Essaye d'abord avec les options optimales
      try {
        ctx = canvas.getContext('2d', opts);
      } catch (e) {
        ctx = null;
      }
      
      // Fallback sans options
      if (!ctx) {
        try {
          ctx = canvas.getContext('2d');
        } catch (e) {
          ctx = null;
        }
      }
      
      return ctx;
    }
    
    /**
     * Crée le buffer hors-écran
     */
    #createOffscreen() {
      this.#offscreen = document.createElement('canvas');
      this.#offCtx = this.#offscreen.getContext('2d', {
        alpha: false, // Plus rapide car opaque
        willReadFrequently: false
      });
    }
    
    /**
     * Configure les handlers de contexte perdu/restauré
     */
    #setupContextHandlers() {
      this.#canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.#lostContext = true;
        this.#options.onContextLost();
        if (this.#options.debug) {
          console.warn('Canvas: Contexte perdu');
        }
      });
      
      this.#canvas.addEventListener('webglcontextrestored', () => {
        this.#lostContext = false;
        this.#ctx = this.#getContext();
        if (this.#options.doubleBuffer) {
          this.#createOffscreen();
        }
        this.#options.onContextRestored(this.#ctx);
        if (this.#options.debug) {
          console.log('Canvas: Contexte restauré');
        }
      });
    }
    
    /**
     * Configure le ResizeObserver pour Safari
     */
    #setupResizeObserver() {
      this.#resizeObserver = new ResizeObserver((entries) => {
        // Debounce pour Safari
        clearTimeout(this.#resizeTimer);
        this.#resizeTimer = setTimeout(() => {
          this.resize();
        }, 16);
      });
      
      this.#resizeObserver.observe(this.#canvas.parentElement || this.#canvas);
    }
    
    #resizeTimer = null;
    
    /**
     * Redimensionne le canvas
     */
    resize(width, height) {
      const canvas = this.#canvas;
      const parent = canvas.parentElement;
      
      // Taille par défaut
      if (width === undefined) {
        width = parent ? parent.clientWidth : canvas.clientWidth || 800;
      }
      if (height === undefined) {
        height = parent ? parent.clientHeight : canvas.clientHeight || 600;
      }
      
      // devicePixelRatio
      let dpr = 1;
      if (this.#options.pixelRatio) {
        dpr = Math.min(
          window.devicePixelRatio || 1,
          this.#options.maxPixelRatio
        );
      }
      
      // Éviter les ratios fractionnaires sur Safari iOS
      if (IS_IOS) {
        dpr = Math.round(dpr);
      }
      
      // Nouvelle taille physique
      const physW = Math.round(width * dpr);
      const physH = Math.round(height * dpr);
      
      // Seulement si différent
      if (canvas.width === physW && canvas.height === physH && dpr === this.#lastDpr) {
        return;
      }
      
      // Applique
      canvas.width = physW;
      canvas.height = physH;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      
      // Offscreen buffer
      if (this.#offscreen) {
        this.#offscreen.width = physW;
        this.#offscreen.height = physH;
      }
      
      this.#lastDpr = dpr;
      this.#dirty = true;
      
      // Reset transform
      this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.#offCtx) {
        this.#offCtx.setTransform(1, 0, 0, 1, 0, 0);
      }
      
      this.#options.onResize(width, height, dpr);
    }
    
    /**
     * Marque comme devant être redessiné
     */
    invalidate() {
      this.#dirty = true;
    }
    
    /**
     * Boucle de rendu
     */
    #loop(timestamp) {
      if (!this.#running) return;
      
      // Timing
      const elapsed = timestamp - this.#lastTime;
      const delta = elapsed / 1000;
      
      // Adaptive FPS
      if (this.#options.adaptiveFps && elapsed > 0) {
        const currentFps = 1000 / elapsed;
        if (currentFps < this.#options.minFps) {
          this.#skipFrames = Math.min(this.#skipFrames + 1, 3);
        } else if (currentFps > this.#options.targetFps) {
          this.#skipFrames = Math.max(this.#skipFrames - 1, 0);
        }
      }
      
      // Skip frame si nécessaire (pour les dispositifs lents)
      if (this.#skipFrames > 0) {
        this.#rafId = requestAnimationFrame((t) => this.#loop(t));
        return;
      }
      
      // Rendu
      if (this.#dirty || !this.#options.vsync) {
        this.#draw(timestamp, delta);
        this.#dirty = false;
      }
      
      this.#lastTime = timestamp;
      this.#rafId = requestAnimationFrame((t) => this.#loop(t));
    }
    
    /**
     * Dessine une frame
     */
    #draw(timestamp, delta) {
      const ctx = this.#options.doubleBuffer ? this.#offCtx : this.#ctx;
      
      // Efface
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
      
      // Callback de rendu
      try {
        this.#options.onDraw(ctx, timestamp, delta, this.#canvas.width, this.#canvas.height);
      } catch (e) {
        console.error('Canvas draw error:', e);
      }
      
      // Swap buffers
      if (this.#options.doubleBuffer) {
        this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.#ctx.drawImage(this.#offscreen, 0, 0);
      }
    }
    
    /**
     * Démarre le rendu
     */
    start() {
      if (this.#running) return;
      this.#running = true;
      this.#dirty = true;
      this.#lastTime = performance.now();
      this.#rafId = requestAnimationFrame((t) => this.#loop(t));
    }
    
    /**
     * Stop le rendu
     */
    stop() {
      this.#running = false;
      if (this.#rafId) {
        cancelAnimationFrame(this.#rafId);
        this.#rafId = null;
      }
    }
    
    /**
     * Pause (réactivable)
     */
    pause() {
      this.#running = false;
    }
    
    /**
     * Reprend
     */
    resume() {
      if (this.#running) return;
      this.#running = true;
      this.#dirty = true;
      this.#lastTime = performance.now();
      this.#rafId = requestAnimationFrame((t) => this.#loop(t));
    }
    
    /**
     * Getter contexte
     */
    getContext() {
      return this.#ctx;
    }
    
    /**
     * Getter canvas
     */
    getCanvas() {
      return this.#canvas;
    }
    
    /**
     * FPS actuel
     */
    getFps() {
      return Math.round(1000 / (performance.now() - this.#lastTime));
    }
    
    /**
     * Cleanup
     */
    destroy() {
      this.stop();
      if (this.#resizeObserver) {
        this.#resizeObserver.disconnect();
      }
    }
    
    /**
     * Debug overlay
     */
    #setupDebug() {
      let debugEl = document.getElementById('canvas-debug');
      if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'canvas-debug';
        debugEl.style.cssText = `
          position: fixed;
          top: 10px;
          left: 10px;
          background: rgba(0,0,0,0.8);
          color: #0f0;
          font: 12px monospace;
          padding: 10px;
          border-radius: 4px;
          z-index: 9999;
          pointer-events: none;
        `;
        document.body.appendChild(debugEl);
      }
      
      // Mise à jour toutes les 500ms
      setInterval(() => {
        if (this.#canvas) {
          debugEl.innerHTML = `
            Canvas: ${this.#canvas.width}x${this.#canvas.height}<br>
            DPR: ${this.#lastDpr}<br>
            Buffer: ${this.#options.doubleBuffer ? 'double' : 'single'}<br>
            Running: ${this.#running}<br>
            Dirty: ${this.#dirty}<br>
            Skip: ${this.#skipFrames}<br>
            Safari: ${IS_SAFARI}<br>
            iOS: ${IS_IOS}
          `;
        }
      }, 500);
    }
  }

  /**
   * Layer pour rendu multicouche
   */
  class CanvasLayer {
    #canvas;
    #ctx;
    #manager;
    #zIndex;
    
    constructor(manager, zIndex = 0) {
      this.#manager = manager;
      this.#zIndex = zIndex;
      
      const parent = manager.getCanvas().parentElement;
      this.#canvas = document.createElement('canvas');
      this.#canvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      `;
      this.#canvas.style.zIndex = zIndex;
      
      parent.appendChild(this.#canvas);
      
      // Sync avec le manager
      manager.onResize((w, h, dpr) => {
        this.#canvas.width = Math.round(w * dpr);
        this.#canvas.height = Math.round(h * dpr);
      });
    }
    
    getContext() {
      return this.#ctx || (this.#ctx = this.#canvas.getContext('2d'));
    }
    
    clear() {
      const ctx = this.getContext();
      ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    }
    
    setPointerEvents(enabled) {
      this.#canvas.style.pointerEvents = enabled ? 'auto' : 'none';
    }
    
    destroy() {
      this.#canvas.remove();
    }
  }

  /**
   * Sprite pour éléments répétés
   */
  class SpriteCache {
    #cache = new Map();
    #canvas;
    #ctx;
    
    constructor() {
      this.#canvas = document.createElement('canvas');
      this.#ctx = this.#canvas.getContext('2d');
    }
    
    /**
     * Crée ou retourne un sprite en cache
     */
    get(key, drawFn) {
      if (this.#cache.has(key)) {
        return this.#cache.get(key);
      }
      
      // Dessine sur le canvas de cache
      const size = this.calculateSize(key);
      this.#canvas.width = size;
      this.#canvas.height = size;
      
      const ctx = this.#ctx;
      ctx.clearRect(0, 0, size, size);
      
      drawFn(ctx, size);
      
      const imageData = ctx.getImageData(0, 0, size, size);
      this.#cache.set(key, imageData);
      
      return imageData;
    }
    
    /**
     * Dessine un sprite sur un contexte
     */
    draw(ctx, key, x, y, scale = 1) {
      const sprite = this.#cache.get(key);
      if (!sprite) return;
      
      const size = sprite.width * scale;
      ctx.putImageData(sprite, x, y);
    }
    
    /**
     * Calcule la taille du sprite
     */
    calculateSize(key) {
      if (typeof key === 'number') return key;
      if (typeof key === 'string') return parseInt(key) || 64;
      return 64;
    }
    
    /**
     * Clear le cache
     */
    clear() {
      this.#cache.clear();
    }
  }

  /**
   * Export API
   */
  CAO.Canvas = {
    Manager: CanvasManager,
    Layer: CanvasLayer,
    SpriteCache: SpriteCache,
    
    // Détection
    isSafari: IS_SAFARI,
    isIOS: IS_IOS,
    isAndroid: IS_ANDROID,
    hasWebGL: HAS_WEBGL,
    
    /**
     * Crée un manager rapidement
     */
    create: function(idOrCanvas, options = {}) {
      const canvas = typeof idOrCanvas === 'string' 
        ? document.getElementById(idOrCanvas)
        : idOrCanvas;
      
      return new CanvasManager(canvas, options);
    },
    
    /**
     * Helper pour setup rapide
     */
    setup: function(id, callbacks) {
      const canvas = document.getElementById(id);
      if (!canvas) return null;
      
      return new CanvasManager(canvas, {
        onDraw: callbacks.draw || (() => {}),
        onResize: callbacks.resize || (() => {}),
        ...callbacks
      });
    }
  };

})(window.CAO = window.CAO || {});
