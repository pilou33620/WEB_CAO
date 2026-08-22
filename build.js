/**
 * WEB_CAO - Script de Build Léger
 * ================================
 * Minification basique + concaténation + compression
 * Compatible avec Python (pas de Node.js requis pour le build)
 * 
 * Usage: python build.py [--watch] [--compress]
 */
"use strict";

const FS = require("fs");
const PATH = require("path");

// Configuration
const CONFIG = {
  // Chemins
  baseDir: __dirname,
  editeurPcb: "editeur-pcb",
  editeurSchema: "editeur-schematique",
  commun: "commun",
  dist: "dist",
  
  // Fichiers par éditeur (ordre de chargement)
  pcbFiles: [
    "js/00-espace-config.js",
    "commun/workspace.js",
    "commun/session.js",
    "js/01-core.js",
    "js/02-connectivity.js",
    "js/03-render.js",
    "js/04-fabrication.js",
    "js/05-tools.js",
    "js/06-panels.js",
    "js/07-app.js",
    "js/08-empreinte.js"
  ],
  
  schemaFiles: [
    "js/00-espace-config.js",
    "commun/workspace.js",
    "commun/session.js",
    "js/01-noyau.js",
    "js/02-bibliotheque.js",
    "js/03-boitiers.js",
    "js/04-etat.js",
    "js/05-feuilles.js",
    "js/06-rendu-fond.js",
    "js/07-connectivite.js",
    "js/08-rendu-schema.js",
    "js/09-interaction.js",
    "js/10-actions.js",
    "js/11-palette.js",
    "js/12-panneaux.js",
    "js/13-fichiers.js",
    "js/14-clavier-boutons.js",
    "js/15-import.js",
    "js/16-demo.js",
    "js/17-demarrage.js",
    "js/18-csv.js",
    "js/19-broches.js"
  ],
  
  // Commun
  communFiles: [
    "workspace.js",
    "session.js",
    "workspace.css",
    "session.css"
  ],
  
  // Options
  compress: true,
  sourceMaps: false,
  bundleName: "bundle.js"
};

/**
 * Minification basique (compatible Python stdlib)
 * - Supprime commentaires
 * - Supprime espaces inutiles
 * - Pas de obfuscation (debuggabilité)
 */
function minify(code) {
  let result = code;
  
  // Supprime commentaires sur une ligne
  result = result.replace(/^\s*\/\/.*$/gm, "");
  
  // Supprime commentaires multi-lignes
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  
  // Réduit les espaces multiples
  result = result.replace(/\s+/g, " ");
  
  // Supprime espaces autour des opérateurs
  result = result.replace(/\s*([{};,=+\-*/<>()[\]|:&!?~])\s*/g, "$1");
  
  // Supprime point-virgule de fin inutile
  result = result.replace(/;}/g, "}");
  
  return result;
}

/**
 * Compression basique pour le réseau
 * Utilise pako si disponible, sinon texte brut
 */
function compress(code) {
  try {
    const pako = require("pako");
    const compressed = pako.deflate(code);
    return {
      data: Buffer.from(compressed),
      encoding: "deflate",
      size: compressed.length,
      originalSize: code.length
    };
  } catch (e) {
    return {
      data: code,
      encoding: "none",
      size: code.length,
      originalSize: code.length
    };
  }
}

/**
 * Concatène les fichiers dans l'ordre
 */
function bundle(files, baseDir) {
  const parts = [];
  
  for (const file of files) {
    const filePath = PATH.join(baseDir, file);
    try {
      const content = FS.readFileSync(filePath, "utf-8");
      parts.push(`/* === ${file} === */\n${content}`);
    } catch (e) {
      console.warn(`[WARN] Fichier non trouvé: ${file}`);
    }
  }
  
  return parts.join("\n\n");
}

/**
 * Crée le bundle pour un éditeur
 */
function buildEditor(name, files, sourceDir) {
  console.log(`\n📦 Build ${name}...`);
  
  // 确保dist目录存在
  const distDir = PATH.join(sourceDir, CONFIG.dist);
  if (!FS.existsSync(distDir)) {
    FS.mkdirSync(distDir, { recursive: true });
  }
  
  // Concaténation
  const code = bundle(files, sourceDir);
  console.log(`   • ${files.length} fichiers concaténés`);
  console.log(`   • Taille source: ${(code.length / 1024).toFixed(1)} KB`);
  
  // Minification
  const minified = minify(code);
  console.log(`   • Après minification: ${(minified.length / 1024).toFixed(1)} KB`);
  
  // Compression optionnelle
  let finalCode = minified;
  let meta = { encoding: "none", size: minified.length };
  
  if (CONFIG.compress) {
    meta = compress(minified);
    if (meta.encoding !== "none") {
      finalCode = meta.data;
      console.log(`   • Après compression: ${(meta.size / 1024).toFixed(1)} KB (${meta.encoding})`);
    }
  }
  
  // Écriture
  const bundlePath = PATH.join(distDir, CONFIG.bundleName);
  
  if (meta.encoding !== "none") {
    // Version compressée avec loader
    const loader = createCompressedLoader(meta.encoding);
    FS.writeFileSync(bundlePath + ".js", loader + minified);
    FS.writeFileSync(bundlePath + ".bin", meta.data);
  } else {
    FS.writeFileSync(bundlePath, minified);
  }
  
  // Métadonnées
  const buildMeta = {
    name,
    timestamp: new Date().toISOString(),
    files: files.length,
    originalSize: code.length,
    minifiedSize: minified.length,
    compressedSize: meta.size,
    encoding: meta.encoding
  };
  
  FS.writeFileSync(
    PATH.join(distDir, "manifest.json"),
    JSON.stringify(buildMeta, null, 2)
  );
  
  console.log(`   ✅ Bundle créé: ${bundlePath}`);
  
  return buildMeta;
}

/**
 * Crée le loader pour les bundles compressés
 */
function createCompressedLoader(encoding) {
  if (encoding === "deflate") {
    return `/* WEB_CAO Compressed Bundle - ${encoding} */
(function(){
  var xhr=new XMLHttpRequest();
  xhr.open("GET",location.pathname.replace(/[^/]*$/,"")+"dist/bundle.bin",true);
  xhr.responseType="arraybuffer";
  xhr.onload=function(){
    if(this.status!==200){console.error("Failed to load bundle");return;}
    try{
      var pako=window.pako||(function(){
        var T=Math.pow(2,8),T3=T*T,C={},I=C.length;
        var Z=function(d){var o=[],p=0,b=0,n=0,s=0;while(p<d.length){var c=d[p++];if(c<128){o[b++]=c}else if(c>191&&c<224){var n=d[p++];o[b++]=(c&31)*64+(n&63)}else if(c>239&&c<365){var n=d[p++],i=d[p++],t=d[p++];o[b++]=(c&7)*16384+(n&63)*64+(i&63);o[b++]=(t&63)+64}else{var n=d[p++],i=d[p++],t=d[p++],r=d[p++];o[b++]=(c&3)*16384+(n&63)*64+(i&63);o[b++]=(t&63)*64+(r&63)}}return o};
        window.pako={inflate:function(d){var s=Z(d);var E=8,K=32;var h=new Int32Array(256);var c=new Uint8Array(T*Z.length);var w=0;var p=0;var l=Z.length;while(p<l){var b=s[p++];if(b<Z.length){c[w++]=b}else{var n=s[p++];if(b===Z.length){while(n--)c[w++]=s[p++]}else{var d=s.slice(p,p+n);for(var i=0;i<n*Z.length;i++)c[w++]=d[i%Z.length];p+=n}}}return c}};
        return window.pako;
      })();
      eval(String.fromCharCode.apply(null,Array.from(pako.inflate(new Uint8Array(this.response)))));
    }catch(e){console.error("Bundle error:",e)}
  };
  xhr.send();
})();
`;
  }
  return "";
}

/**
 * Copie les ressources statiques
 */
function copyAssets() {
  console.log("\n📁 Copie des assets...");
  
  const assets = [
    { src: "index.html", dest: "index.html" },
    { src: "commun/test/dom-stub.js", dest: "test/dom-stub.js" }
  ];
  
  for (const asset of assets) {
    try {
      const content = FS.readFileSync(PATH.join(CONFIG.baseDir, asset.src));
      const destPath = PATH.join(CONFIG.baseDir, asset.dest);
      FS.writeFileSync(destPath, content);
      console.log(`   • ${asset.src} -> ${asset.dest}`);
    } catch (e) {
      console.warn(`   ⚠ ${asset.src}: ${e.message}`);
    }
  }
}

/**
 * Build complet
 */
function buildAll() {
  console.log("=".repeat(50));
  console.log("WEB_CAO Build System");
  console.log("=".repeat(50));
  
  const startTime = Date.now();
  
  // Build PCB
  const pcbMeta = buildEditor(
    "PCB Editor",
    CONFIG.pcbFiles,
    PATH.join(CONFIG.baseDir, CONFIG.editeurPcb)
  );
  
  // Build Schématique
  const schemaMeta = buildEditor(
    "Schematic Editor",
    CONFIG.schemaFiles,
    PATH.join(CONFIG.baseDir, CONFIG.editeurSchema)
  );
  
  // Copie des assets
  copyAssets();
  
  // Résumé
  const totalOrig = pcbMeta.originalSize + schemaMeta.originalSize;
  const totalMin = pcbMeta.minifiedSize + schemaMeta.minifiedSize;
  const totalComp = pcbMeta.compressedSize + schemaMeta.compressedSize;
  
  console.log("\n" + "=".repeat(50));
  console.log("RÉSUMÉ");
  console.log("=".repeat(50));
  console.log(`   Original:     ${(totalOrig / 1024).toFixed(1)} KB`);
  console.log(`   Minifié:      ${(totalMin / 1024).toFixed(1)} KB`);
  console.log(`   Compressé:    ${(totalComp / 1024).toFixed(1)} KB`);
  console.log(`   Compression:  ${((1 - totalComp/totalOrig) * 100).toFixed(1)}%`);
  console.log(`   Temps:        ${Date.now() - startTime}ms`);
  console.log("=".repeat(50));
}

// Export pour usage externe
module.exports = { CONFIG, minify, compress, bundle, buildEditor, buildAll };

// Run si appelé directement
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes("--no-compress")) {
    CONFIG.compress = false;
  }
  
  buildAll();
  
  // Watch mode
  if (args.includes("--watch")) {
    console.log("\n👁 Watch mode activé (Ctrl+C pour arrêter)");
    const chokidar = require("chokidar");
    
    const watcher = chokidar.watch([
      CONFIG.editeurPcb + "/**/*.js",
      CONFIG.editeurSchema + "/**/*.js",
      CONFIG.commun + "/**/*.js"
    ], {
      ignored: /(^|[\/\\])\..|node_modules|dist/,
      persistent: true,
      ignoreInitial: true
    });
    
    let debounceTimer = null;
    
    watcher.on("change", (path) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`\n🔄 ${path} modifié - rebuild...`);
        buildAll();
      }, 300);
    });
  }
}
