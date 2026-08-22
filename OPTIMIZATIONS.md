# WEB_CAO - Optimisations Safari iPad

Ce document décrit les optimisations ajoutées pour améliorer les performances sur Safari iPad et les navigateurs mobiles.

## Problèmes ciblés

| Problème | Impact | Solution |
|----------|--------|----------|
| Scripts volumineux (~50-100 KB par module) | Temps de chargement lent | Minification + compression + lazy loading |
| JS vanilla = code manuel | Maintenabilité | Système de modules léger |
| Canvas 2D pas toujours optimal | Performances de rendu | Double buffering + caching |
| Pas de collaboration | Limitation d'usage | Multi-onglets via BroadcastChannel |

## Nouvelles fonctionnalités

### 1. Système de modules (`commun/modules.js`)

Module léger ajouté pour structurer le code sans framework:

- **Signals réactifs** - Implémentation simplifiée type Preact signals
- **Store d'état** - État global avec abonnements
- **Event Bus** - Pub/sub pour composants
- **Lazy loading** - Chargement async des scripts

```javascript
// Exemple d'utilisation
const count = CAO.signals.signal(0);
const doubled = CAO.signals.computed(() => count.value * 2);

CAO.signals.effect(() => {
  console.log('Count changed:', count.value);
});

count.value = 5; // Déclenche l'effet
```

### 2. Gestionnaire de Canvas optimisé (`commun/canvas-manager.js`)

Optimisations spécifiques Safari iPad:

| Fonctionnalité | Description |
|----------------|-------------|
| Double buffering | Prévention du flickering |
| Adaptive FPS | Réduction automatique des FPS sur batterie |
| Context lost handling | Récupération automatique après perte de contexte |
| Pixel ratio limité | Max 2x sur iOS pour préserver la RAM |
| ResizeObserver | Détection optimale des changements de taille |

```javascript
// Création d'un canvas optimisé
const manager = CAO.Canvas.create('monCanvas', {
  doubleBuffer: true,
  maxPixelRatio: 2,
  adaptiveFps: true,
  targetFps: 60,
  minFps: 30,
  onDraw: (ctx, time, delta) => { /* rendu */ }
});
```

### 3. Collaboration légère (`commun/collab.js`)

Synchronisation multi-onglets sans backend:

- **BroadcastChannel** - Communication entre onglets
- **IndexedDB** - Persistance locale
- **CRDT simple** - Résolution de conflits
- **Export/Import JSON** - Partage de projets

```javascript
// Création d'une session collaborative
const collab = await CAO.Collab.create('mon-projet');

collab.on('update', (data) => {
  applyUpdate(data);
});

collab.push({ type: 'move', id: 1, x: 100, y: 200 });

// Export pour partage
const json = await collab.exportJSON();
```

### 4. Build Python (`build.py`)

Script de build sans dépendance Node.js:

```bash
# Build standard
python build.py

# Sans compression
python build.py --no-compress
```

Output:
- `dist/bundle.js` - Bundle minifié
- `dist/manifest.json` - Métadonnées

### 5. Service Worker (`service-worker.js`)

 pour le mode offline:

- Cache des fichiers statiques
- Mise à jour en arrière-plan
- Mode hors-ligne automatique

### 6. Rendu optimisé

#### PCB (`editeur-pcb/js/render-optimized.js`)

- Cache des zones de cuivre
- Cache de la grille
- Rendu incrémental
- Adaptive frame skipping

#### Schématique (`editeur-schematique/js/render-optimized.js`)

- Cache des composants
- Cache des fils
- Rendu différé des labels

## Optimisations Safari spécifiques

### Mémoire

```javascript
// Limitation du pixel ratio sur iOS
const dpr = Math.min(window.devicePixelRatio || 1, 2); // iOS: max 2x

// Gestion de la perte de contexte
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  // Reconstruction du contexte
});
```

### Performances

```javascript
// Adaptive FPS sur batterie
if (isLowPowerMode) {
  targetFps = 30;
}

// Passive event listeners
window.addEventListener('scroll', handler, { passive: true });
```

### Touch

```javascript
// Détection iPad
const isIPad = /iPad|iPhone|iPod/.test(navigator.userAgent);

// Désactivation des animations coûteuses
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

## Utilisation recommandée

### iPad (Safari)

1. Ouvrir `index.html`
2. Le Service Worker se charge automatiquement
3. Les performances sont optimisées automatiquement

### Desktop

1. Optionnel: `python build.py` pour générer les bundles
2. Ou utilisation directe des fichiers source

## Benchmarks attendus

| Métrique | Avant | Après |
|----------|-------|-------|
| Temps de chargement (PCB) | ~800ms | ~400ms |
| FPS moyen (rendu) | 45 | 60 |
| Mémoire (10 composants) | ~45MB | ~35MB |
| Offline | Non | Oui |

## Compatibilité

- Safari 14.1+ (iPadOS 14+)
- Chrome 90+
- Firefox 88+
- Edge 90+

## Fichiers ajoutés

```
commun/
  modules.js           # Système de modules
  canvas-manager.js     # Gestionnaire Canvas optimisé
  collab.js            # Collaboration multi-onglets
  
editeur-pcb/
  js/render-optimized.js  # Rendu PCB optimisé
  
editeur-schematique/
  js/render-optimized.js  # Rendu schématique optimisé
  
commun/
  build.py             # Build script Python
  service-worker.js    # Offline support
  
index.html             # Bootstrap optimisé
manifest.json         # PWA manifest
service-worker.js     # Root level
build.py              # Build script
OPTIMIZATIONS.md      # Cette documentation
```

## Limitations connues

1. **Pas de WebGL** - Canvas 2D uniquement (meilleure compatibilité)
2. **Pas de vrai multi-utilisateurs** - BroadcastChannel limite à la même origine
3. **IndexedDB requis** - Ne fonctionne pas en mode privé strict

## Pour aller plus loin

1. **Webpack/Rollup** - Remplacer `build.py` par un bundler moderne
2. **WebGL** - Passer à WebGL pour les gros projets (>10000 éléments)
3. **WebSocket** - Ajouter un backend pour la vraie collaboration
4. **WebWorkers** - Déplacer le calcul lourd hors du thread UI
