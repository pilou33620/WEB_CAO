/**
 * WEB_CAO - Système de Modules Léger
 * =================================
 * Module system moderne sans build step
 * Compatible Safari iPad (ES2015+)
 * 
 * Utilisation:
 *   import { signal, computed } from './modules.js';
 *   import state from './modules.js';
 */
"use strict";

/**
 * Namespace global pour les modules
 */
const CAO = window.CAO || {};

/**
 * Résolveur de dépendances
 * Trouve les fichiers .js dans le dossier courant
 */
CAO.resolve = function(path) {
  const base = location.pathname.replace(/[^/]*$/, '');
  return base + path + '.js';
};

/**
 * Chargeur de modules async
 */
CAO.load = function(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CAO.resolve(path);
    script.type = 'module';
    script.onload = () => resolve(window.CAO._loaded[path]);
    script.onerror = () => reject(new Error(`Failed to load: ${path}`));
    document.head.appendChild(script);
  });
};

/**
 * Cache des modules chargés
 */
CAO._loaded = {};

/**
 * Définition de module
 */
CAO.module = function(name, factory) {
  const exports = {};
  const module = { exports };
  factory(module, exports, CAO);
  CAO._loaded[name] = module.exports;
  return module.exports;
};

// ============================================================
// Signaux réactifs (implémentation simplifiée type Preact signals)
// Compatible Safari 14.1+
// ============================================================
CAO.Signal = class Signal {
  #value;
  #subscribers = new Set();
  #computed = false;
  #dirty = true;
  
  constructor(value) {
    this.#value = value;
    this.#computed = false;
  }
  
  get value() {
    // Lecture lazy des computed
    if (this.#computed && this.#dirty) {
      this.#recompute();
    }
    return this.#value;
  }
  
  set value(v) {
    if (this.#value !== v) {
      this.#value = v;
      this.#notify();
    }
  }
  
  #recompute() {
    // Sera implémenté par ComputedSignal
  }
  
  #notify() {
    this.#dirty = false;
    this.#subscribers.forEach(fn => fn(this.#value));
    CAO._effects.forEach(e => e._check());
  }
  
  subscribe(fn) {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }
  
  peek() {
    return this.#value;
  }
};

/**
 * Signal calculé (dérivé)
 */
CAO.ComputedSignal = class ComputedSignal extends CAO.Signal {
  #fn;
  #sources = [];
  
  constructor(fn) {
    super(undefined);
    this.#fn = fn;
    this.#computed = true;
    this.#dirty = true;
    this.#track();
  }
  
  #track() {
    CAO._batch(() => {
      this.#sources = [];
      const track = (s) => {
        if (s instanceof CAO.Signal) {
          this.#sources.push(s);
          s.subscribe(() => {
            this.#dirty = true;
            this.#notify();
          });
        }
      };
      // Capture les lectures de signaux
      try {
        this.#fn({ track });
      } catch (e) {
        // Ignoré
      }
    });
  }
  
  #recompute() {
    CAO._batch(() => {
      try {
        const result = this.#fn({ track: () => {} });
        this.value = result;
      } catch (e) {
        console.error('Computed signal error:', e);
      }
    });
  }
};

/**
 * Batch pour éviter les re-renders multiples
 */
CAO._effects = [];
CAO._batching = false;
CAO._pending = [];

CAO._batch = function(fn) {
  CAO._batching = true;
  try {
    fn();
  } finally {
    CAO._batching = false;
    CAO._flush();
  }
};

CAO._flush = function() {
  CAO._pending.forEach(fn => fn());
  CAO._pending = [];
};

/**
 * Effet (side-effect automatique)
 */
CAO.Effect = class Effect {
  #fn;
  #check;
  
  constructor(fn) {
    this.#fn = fn;
    this._check = () => {
      if (!CAO._batching) {
        CAO._pending.push(this.#run);
      }
    };
    this.#run();
  }
  
  #run() {
    this.#fn();
  }
};

/**
 * API publique
 */
CAO.signals = {
  signal: (value) => new CAO.Signal(value),
  computed: (fn) => new CAO.ComputedSignal(fn),
  effect: (fn) => new CAO.Effect(fn),
  batch: CAO._batch,
  
  // Héritage pour compatibilité
  Signal: CAO.Signal,
  ComputedSignal: CAO.ComputedSignal
};

// ============================================================
// Store d'état (état global simple)
// ============================================================
CAO.Store = class Store {
  #state;
  #listeners = new Map();
  
  constructor(initial = {}) {
    this.#state = new CAO.Signal(initial);
  }
  
  get state() {
    return this.#state.value;
  }
  
  setState(updater) {
    const current = this.#state.value;
    const next = typeof updater === 'function' ? updater(current) : updater;
    this.#state.value = { ...current, ...next };
    this.#notify();
  }
  
  subscribe(key, fn) {
    if (!this.#listeners.has(key)) {
      this.#listeners.set(key, new Set());
    }
    this.#listeners.get(key).add(fn);
    return () => this.#listeners.get(key).delete(fn);
  }
  
  #notify() {
    this.#listeners.forEach((fns, key) => {
      if (key in this.#state.value) {
        fns.forEach(fn => fn(this.#state.value[key]));
      }
    });
  }
};

// ============================================================
// Event Bus (pub/sub pour composants)
// ============================================================
CAO.Events = class Events {
  #events = new Map();
  
  on(event, handler) {
    if (!this.#events.has(event)) {
      this.#events.set(event, new Set());
    }
    this.#events.get(event).add(handler);
    return () => this.#events.get(event).delete(handler);
  }
  
  off(event, handler) {
    if (this.#events.has(event)) {
      this.#events.get(event).delete(handler);
    }
  }
  
  emit(event, data) {
    if (this.#events.has(event)) {
      this.#events.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error(`Event handler error (${event}):`, e);
        }
      });
    }
  }
  
  once(event, handler) {
    const wrapped = (data) => {
      this.off(event, wrapped);
      handler(data);
    };
    return this.on(event, wrapped);
  }
};

// ============================================================
// Lazy loading de scripts
// ============================================================
CAO.scripts = {
  loaded: new Map(),
  
  async load(path, type = 'classic') {
    if (this.loaded.has(path)) {
      return this.loaded.get(path);
    }
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      
      if (type === 'module') {
        script.type = 'module';
      }
      
      script.onload = () => {
        this.loaded.set(path, true);
        resolve(true);
      };
      
      script.onerror = () => {
        reject(new Error(`Failed to load script: ${path}`));
      };
      
      document.head.appendChild(script);
    });
  },
  
  // Préchargement intelligent
  async preload(paths) {
    return Promise.all(paths.map(p => this.load(p).catch(() => null)));
  }
};

// ============================================================
// Initialisation
// ============================================================
window.CAO = CAO;

// Export pour les modules ES si supportés
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CAO;
}
