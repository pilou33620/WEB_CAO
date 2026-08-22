/**
 * WEB_CAO - Système de Collaboration Léger
 * =========================================
 * Multi-onglets via BroadcastChannel + IndexedDB pour persistance
 * Pas de backend nécessaire
 * 
 * Fonctionnalités:
 * - Synchronisation entre onglets via BroadcastChannel
 * - Persistance via IndexedDB
 * - Détection de conflits (CRDT simple)
 * - Export/Import JSON pour partage
 * 
 * Usage:
 *   const collab = CAO.Collab.create('mon-projet');
 *   collab.on('update', (data) => applyUpdate(data));
 *   collab.push({ type: 'move', id: 1, x: 100, y: 200 });
 */
"use strict";

(function(CAO) {
  'use strict';

  /**
   * Version du protocole
   */
  const VERSION = '1.0.0';
  
  /**
   * Noms des événements
   */
  const EVENTS = {
    UPDATE: 'update',
    SYNC: 'sync',
    CONFLICT: 'conflict',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    SAVE: 'save',
    LOAD: 'load'
  };

  /**
   * Gestionnaire principal de collaboration
   */
  class CollabManager {
    #id;              // ID unique du projet
    #channel;         // BroadcastChannel
    #db;              // IndexedDB
    #connected = false;
    #listeners = new Map();
    #pendingOps = [];
    #lastSync = 0;
    #versionVector = new Map();
    #localVector = 0;
    #peers = new Set();
    
    /**
     * Crée une nouvelle session
     */
    constructor(id) {
      this.#id = id;
    }
    
    /**
     * Initialise la connexion
     */
    async init() {
      // Ouvre le canal de broadcast
      this.#channel = new BroadcastChannel(`cao-collab-${this.#id}`);
      this.#channel.onmessage = (e) => this.#handleMessage(e.data);
      
      // Ouvre IndexedDB
      await this.#openDB();
      
      // Charge l'état actuel
      await this.#loadState();
      
      this.#connected = true;
      this.#emit(EVENTS.CONNECTED);
      
      // Annonce la présence
      this.#broadcast({
        type: 'announce',
        peerId: this.#getPeerId(),
        timestamp: Date.now()
      });
      
      return this;
    }
    
    /**
     * ID unique pour ce peer
     */
    #peerId;
    #getPeerId() {
      if (!this.#peerId) {
        this.#peerId = localStorage.getItem('cao-peer-id');
        if (!this.#peerId) {
          this.#peerId = 'peer-' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('cao-peer-id', this.#peerId);
        }
      }
      return this.#peerId;
    }
    
    /**
     * Ouvre IndexedDB
     */
    #openDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(`CAO-Collab-${this.#id}`, 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
          this.#db = request.result;
          resolve();
        };
        
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          
          // Store pour les documents
          if (!db.objectStoreNames.contains('documents')) {
            const docStore = db.createObjectStore('documents', { keyPath: 'id' });
            docStore.createIndex('updated', 'updated');
          }
          
          // Store pour l'historique des opérations
          if (!db.objectStoreNames.contains('history')) {
            const histStore = db.createObjectStore('history', { 
              keyPath: 'id', 
              autoIncrement: true 
            });
            histStore.createIndex('timestamp', 'timestamp');
            histStore.createIndex('documentId', 'documentId');
          }
        };
      });
    }
    
    /**
     * Charge l'état depuis IndexedDB
     */
    async #loadState() {
      return new Promise((resolve, reject) => {
        const tx = this.#db.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        const request = store.get(this.#id);
        
        request.onsuccess = () => {
          const doc = request.result;
          if (doc) {
            this.#versionVector = new Map(doc.versionVector || []);
            this.#localVector = doc.localVector || 0;
            this.#emit(EVENTS.LOAD, doc.data);
          }
          resolve(doc);
        };
        
        request.onerror = () => reject(request.error);
      });
    }
    
    /**
     * Sauvegarde l'état dans IndexedDB
     */
    async #saveState(data) {
      return new Promise((resolve, reject) => {
        const tx = this.#db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        
        const doc = {
          id: this.#id,
          data: data,
          versionVector: Array.from(this.#versionVector.entries()),
          localVector: this.#localVector,
          updated: Date.now()
        };
        
        const request = store.put(doc);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    /**
     * Ajoute une opération à l'historique
     */
    async #addToHistory(op) {
      return new Promise((resolve, reject) => {
        const tx = this.#db.transaction('history', 'readwrite');
        const store = tx.objectStore('history');
        
        const entry = {
          documentId: this.#id,
          op: op,
          timestamp: Date.now(),
          peerId: this.#getPeerId()
        };
        
        const request = store.add(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    /**
     * Gère les messages BroadcastChannel
     */
    #handleMessage(msg) {
      if (msg.peerId === this.#getPeerId()) return;
      
      switch (msg.type) {
        case 'announce':
          this.#peers.add(msg.peerId);
          this.#emit(EVENTS.CONNECTED, { peerId: msg.peerId });
          // Répond avec notre état pour sync
          this.#broadcast({
            type: 'sync-request',
            peerId: this.#getPeerId(),
            vector: this.#localVector
          });
          break;
          
        case 'update':
          this.#handleUpdate(msg);
          break;
          
        case 'sync-request':
          // Quelqu'un demande notre état
          if (this.#localVector > msg.vector) {
            this.#broadcast({
              type: 'sync-response',
              peerId: this.#getPeerId(),
              data: this.#getCurrentData(),
              vector: this.#localVector
            });
          }
          break;
          
        case 'sync-response':
          this.#handleSyncResponse(msg);
          break;
          
        case 'leave':
          this.#peers.delete(msg.peerId);
          this.#emit(EVENTS.DISCONNECTED, { peerId: msg.peerId });
          break;
      }
    }
    
    /**
     * Gère une mise à jour d'un pair
     */
    #handleUpdate(msg) {
      const peerVector = msg.vector || 0;
      
      // Vérifie l'ordre causale
      if (this.#isConcurrent(peerVector)) {
        // Conflit - utilise timestamp comme tie-breaker
        if (msg.timestamp > (this.#versionVector.get(msg.peerId) || 0)) {
          this.#emit(EVENTS.UPDATE, msg.data);
          this.#versionVector.set(msg.peerId, msg.timestamp);
        } else {
          this.#emit(EVENTS.CONFLICT, { incoming: msg.data, current: this.#getCurrentData() });
        }
      } else {
        this.#emit(EVENTS.UPDATE, msg.data);
      }
    }
    
    /**
     * Gère la réponse de synchronisation
     */
    #handleSyncResponse(msg) {
      if (msg.vector > this.#localVector) {
        this.#emit(EVENTS.SYNC, msg.data);
        this.#localVector = msg.vector;
      }
    }
    
    /**
     * Vérifie si deux vecteurs sont concurrents
     */
    #isConcurrent(peerVector) {
      return Math.abs(peerVector - this.#localVector) > 1000;
    }
    
    /**
     * Broadcast à tous les peers
     */
    #broadcast(msg) {
      if (this.#channel) {
        msg.timestamp = Date.now();
        this.#channel.postMessage(msg);
      }
    }
    
    /**
     * Retourne les données actuelles
     */
    #getCurrentData() {
      // À surcharger par l'application
      return null;
    }
    
    /**
     * Push une mise à jour
     */
    push(data) {
      this.#localVector = Date.now();
      this.#versionVector.set(this.#getPeerId(), this.#localVector);
      
      this.#broadcast({
        type: 'update',
        peerId: this.#getPeerId(),
        data: data,
        vector: this.#localVector,
        timestamp: this.#localVector
      });
      
      // Sauvegarde locale
      this.#addToHistory(data);
      this.#emit(EVENTS.UPDATE, data);
      
      return this;
    }
    
    /**
     * Force une synchronisation
     */
    async sync() {
      await this.#loadState();
      this.#broadcast({
        type: 'sync-request',
        peerId: this.#getPeerId(),
        vector: this.#localVector
      });
      return this;
    }
    
    /**
     * Enregistre le document complet
     */
    async save(data) {
      await this.#saveState(data);
      this.#emit(EVENTS.SAVE, data);
      return this;
    }
    
    /**
     * Exporte le document en JSON
     */
    exportJSON() {
      return new Promise((resolve, reject) => {
        const tx = this.#db.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        const request = store.get(this.#id);
        
        request.onsuccess = () => {
          const doc = request.result;
          resolve(JSON.stringify(doc, null, 2));
        };
        request.onerror = () => reject(request.error);
      });
    }
    
    /**
     * Importe un document JSON
     */
    async importJSON(json) {
      const doc = JSON.parse(json);
      await this.#saveState(doc.data);
      this.#emit(EVENTS.SYNC, doc.data);
      return this;
    }
    
    /**
     * Écoute un événement
     */
    on(event, handler) {
      if (!this.#listeners.has(event)) {
        this.#listeners.set(event, new Set());
      }
      this.#listeners.get(event).add(handler);
      return () => this.#listeners.get(event).delete(handler);
    }
    
    /**
     * Émet un événement
     */
    #emit(event, data) {
      if (this.#listeners.has(event)) {
        this.#listeners.get(event).forEach(fn => {
          try {
            fn(data);
          } catch (e) {
            console.error(`Collab event error (${event}):`, e);
          }
        });
      }
    }
    
    /**
     * Déconnecte
     */
    disconnect() {
      this.#broadcast({
        type: 'leave',
        peerId: this.#getPeerId()
      });
      
      if (this.#channel) {
        this.#channel.close();
        this.#channel = null;
      }
      
      this.#connected = false;
      this.#emit(EVENTS.DISCONNECTED);
    }
    
    /**
     * Est connecté
     */
    get isConnected() {
      return this.#connected;
    }
    
    /**
     * Nombre de peers
     */
    get peerCount() {
      return this.#peers.size;
    }
  }

  /**
   * CRDT Simple pour texte (optionnel, pour les annotations)
   */
  class SimpleCRDT {
    #state;
    
    constructor() {
      this.#state = new Map();
    }
    
    /**
     * Insert à une position
     */
    insert(id, pos, char) {
      const entry = this.#state.get(id) || { ops: [] };
      entry.ops.push({ op: 'insert', pos, char, ts: Date.now() });
      this.#state.set(id, entry);
    }
    
    /**
     * Delete à une position
     */
    delete(id, pos) {
      const entry = this.#state.get(id) || { ops: [] };
      entry.ops.push({ op: 'delete', pos, ts: Date.now() });
      this.#state.set(id, entry);
    }
    
    /**
     * Merge avec un autre état
     */
    merge(other) {
      for (const [id, entry] of other.#state) {
        const current = this.#state.get(id);
        if (!current || entry.ops[entry.ops.length - 1]?.ts > current.ops[current.ops.length - 1]?.ts) {
          this.#state.set(id, entry);
        }
      }
    }
    
    /**
     * Résout l'état final
     */
    resolve() {
      let result = '';
      const ops = [];
      
      this.#state.forEach(entry => {
        ops.push(...entry.ops);
      });
      
      ops.sort((a, b) => a.ts - b.ts);
      
      for (const op of ops) {
        if (op.op === 'insert') {
          result = result.slice(0, op.pos) + op.char + result.slice(op.pos);
        } else if (op.op === 'delete') {
          result = result.slice(0, op.pos) + result.slice(op.pos + 1);
        }
      }
      
      return result;
    }
  }

  /**
   * Export API
   */
  CAO.Collab = {
    Manager: CollabManager,
    CRDT: SimpleCRDT,
    EVENTS,
    
    /**
     * Crée une session collaborative
     */
    create: async function(projectId) {
      const collab = new CollabManager(projectId);
      await collab.init();
      return collab;
    },
    
    /**
     * Vérifie si BroadcastChannel est supporté
     */
    isSupported: function() {
      return typeof BroadcastChannel !== 'undefined';
    },
    
    /**
     * Vérifie si IndexedDB est supporté
     */
    isIndexedDBSupported: function() {
      return typeof indexedDB !== 'undefined';
    }
  };

})(window.CAO = window.CAO || {});
