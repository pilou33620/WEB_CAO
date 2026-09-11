#!/usr/bin/env python3
"""
extraire_bibliotheques.py
Wrapper Python qui exécute l'extraction des bibliothèques et la génération de LIB/
"""
import os
import subprocess
import sys

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script_js = os.path.join(root, "python", "extraire_bibliotheques.js")
    if not os.path.exists(script_js):
        print(f"Erreur: Script JS introuvable : {script_js}", file=sys.stderr)
        return 1
    
    cmd = ["node", script_js]
    res = subprocess.run(cmd, cwd=root)
    return res.returncode

if __name__ == "__main__":
    sys.exit(main())
