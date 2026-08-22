#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WEB_CAO - Build Script Python
============================
Build sans Node.js requis
Usage: python build.py [--no-compress] [--watch]
"""
import os
import re
import sys
import json
import time
import hashlib
from pathlib import Path

# Configuration
BASE_DIR = Path(__file__).parent
DIST_PCB = BASE_DIR / "editeur-pcb" / "dist"
DIST_SCHEMA = BASE_DIR / "editeur-schematique" / "dist"
DIST_COMMUN = BASE_DIR / "commun" / "dist"

PCB_FILES = [
    "js/00-espace-config.js",
    "../commun/workspace.js",
    "../commun/session.js",
    "js/01-core.js",
    "js/02-connectivity.js",
    "js/03-render.js",
    "js/04-fabrication.js",
    "js/05-tools.js",
    "js/06-panels.js",
    "js/07-app.js",
    "js/08-empreinte.js",
]

SCHEMA_FILES = [
    "js/00-espace-config.js",
    "../commun/workspace.js",
    "../commun/session.js",
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
    "js/19-broches.js",
]

COMPRESS = "--no-compress" not in sys.argv


def minify(code):
    """Minification basique compatible Python stdlib."""
    result = code
    
    # Supprime commentaires sur une ligne
    result = re.sub(r'^\s*//.*$', '', result, flags=re.MULTILINE)
    
    # Supprime commentaires multi-lignes
    result = re.sub(r'/\*[\s\S]*?\*/', '', result)
    
    # Supprime docstrings triples quotes
    result = re.sub(r"'''[\s\S]*?'''", '', result)
    result = re.sub(r'"""[\s\S]*?"""', '', result)
    
    # Réduit les espaces multiples
    result = re.sub(r'\s+', ' ', result)
    
    # Supprime espaces autour des opérateurs
    result = re.sub(r'\s*([{};,=+\-*/<>()[\]|&!?~])\s*', r'\1', result)
    
    # Supprime point-virgule de fin inutile
    result = result.replace(';}', '}')
    
    # Supprime points-virgules isolés
    result = re.sub(r';\s*}', '}', result)
    
    return result.strip()


def bundle(files, source_dir):
    """Concatène les fichiers."""
    parts = []
    
    for f in files:
        file_path = BASE_DIR / source_dir / f
        if not file_path.exists():
            print(f"  ⚠ Fichier non trouvé: {f}")
            continue
            
        content = file_path.read_text(encoding='utf-8')
        parts.append(f"/* === {f} === */\n{content}")
    
    return '\n\n'.join(parts)


def build_editor(name, files, source_dir, dist_dir):
    """Build un éditeur."""
    print(f"\n📦 Build {name}...")
    
    # Crée dist
    dist_dir.mkdir(parents=True, exist_ok=True)
    
    # Concaténation
    code = bundle(files, source_dir)
    print(f"   • {len(files)} fichiers concaténés")
    print(f"   • Taille source: {len(code) / 1024:.1f} KB")
    
    # Minification
    minified = minify(code)
    print(f"   • Après minification: {len(minified) / 1024:.1f} KB")
    
    # Compression si demandé
    final = minified
    enc = "none"
    
    if COMPRESS:
        try:
            import zlib
            compressed = zlib.compress(minified.encode('utf-8'), level=9)
            if len(compressed) < len(minified):
                final = compressed
                enc = "deflate"
                print(f"   • Après compression: {len(compressed) / 1024:.1f} KB (deflate)")
        except ImportError:
            pass
    
    # Écriture
    bundle_path = dist_dir / "bundle.js"
    bundle_path.write_bytes(final if isinstance(final, bytes) else final.encode('utf-8'))
    
    # Métadonnées
    meta = {
        "name": name,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "files": len(files),
        "original_size": len(code),
        "minified_size": len(minified),
        "compressed_size": len(final),
        "encoding": enc
    }
    
    meta_path = dist_dir / "manifest.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    
    print(f"   ✅ Bundle: {bundle_path}")
    
    return meta


def copy_assets():
    """Copie les assets."""
    print("\n📁 Copie des assets...")
    
    assets = [
        ("index.html", "index.html"),
        ("commun/test/dom-stub.js", "commun/test/dom-stub.js"),
    ]
    
    for src, dst in assets:
        src_path = BASE_DIR / src
        dst_path = BASE_DIR / dst
        if src_path.exists():
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            dst_path.write_bytes(src_path.read_bytes())
            print(f"   • {src} -> {dst}")


def main():
    print("=" * 50)
    print("WEB_CAO Build System (Python)")
    print("=" * 50)
    
    start = time.time()
    
    # Build PCB
    pcb_meta = build_editor(
        "PCB Editor",
        PCB_FILES,
        BASE_DIR / "editeur-pcb",
        DIST_PCB
    )
    
    # Build Schéma
    schema_meta = build_editor(
        "Schematic Editor",
        SCHEMA_FILES,
        BASE_DIR / "editeur-schematique",
        DIST_SCHEMA
    )
    
    # Copie assets
    copy_assets()
    
    # Résumé
    total_orig = pcb_meta["original_size"] + schema_meta["original_size"]
    total_min = pcb_meta["minified_size"] + schema_meta["minified_size"]
    total_comp = pcb_meta["compressed_size"] + schema_meta["compressed_size"]
    
    print("\n" + "=" * 50)
    print("RÉSUMÉ")
    print("=" * 50)
    print(f"   Original:     {total_orig / 1024:.1f} KB")
    print(f"   Minifié:      {total_min / 1024:.1f} KB")
    print(f"   Compressé:    {total_comp / 1024:.1f} KB")
    print(f"   Compression:  {((1 - total_comp/total_orig) * 100):.1f}%")
    print(f"   Temps:        {(time.time() - start)*1000:.0f}ms")
    print("=" * 50)


if __name__ == "__main__":
    main()
