/**
 * WEB_CAO - Service Worker
 * ========================
 * Cache offline + mise à jour en arrière-plan
 * 
 * Fonctionnalités:
 * - Cache des fichiers statiques
 * - Mise à jour en arrière-plan
 * - Mode hors-ligne
 */
"use strict";

const CACHE_NAME = 'web-cao-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './editeur-pcb/editeur-pcb.html',
  './editeur-schematique/editeur-schematique.html',
  './recherche-composants/recherche-composants.html'
];

// Installation - cache les assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation - nettoie les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ignore les requêtes API
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  
  // Ignore les requêtes cross-origin
  if (url.origin !== location.origin) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        // Retourne le cache ou fetch
        const fetchPromise = fetch(event.request)
          .then(response => {
            // Ne cache que les réponses valides
            if (response && response.status === 200 && response.type === 'basic') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => {
            // Fallback si offline
            return cached;
          });
        
        return cached || fetchPromise;
      })
  );
});

// Message - pour communiquer avec le client
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
