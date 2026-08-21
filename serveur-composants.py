#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.2.0
# Date: 2026-08-21
# Explication: Le client MCP maison (httpx) est remplace par le module partage
#   passerelle_mcp, qui n'utilise que la bibliotheque standard. serveur.py peut
#   ainsi exposer exactement la meme API : la page recherche-composants n'a
#   plus besoin d'un second serveur sur le port 8420 pour fonctionner. Ce
#   serveur reste utile pour qui prefere uvicorn, et sa version FastAPI ne
#   dupliquera plus la logique de protocole.
# Fonctions modifiees/ajoutees :
# - MCPClient, unwrap_mcp_result (supprimees : voir passerelle_mcp)
# - list_tools, call_tool (delegent au module partage, hors event loop)
# - servir_depot, resoudre_chemin, _hors_depot, main (inchangees)
# ==========================================
"""Passerelle vers pcbparts.dev + service du depot WEB_CAO.

    python serveur-composants.py              # http://127.0.0.1:8420/
    python serveur-composants.py --reseau     # accessible depuis l'iPad
    python serveur-composants.py --port 9000

Necessite fastapi et uvicorn (pip install fastapi uvicorn). Ce serveur est
optionnel : serveur.py rend le meme service, recherche de composants incluse,
sans aucune dependance.
"""

import os
import asyncio
import argparse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Any

import passerelle_mcp
from passerelle_mcp import ErreurPasserelle

RACINE = os.path.dirname(os.path.abspath(__file__))
DEFAUT_PORT = 8420

# Fichiers de travail : ils n'ont rien a faire sur le reseau.
CACHES = ('.git', '.github', '.gitignore', '.venv', '__pycache__', '.env')

# Origines autorisees a appeler l'API : cette machine et le reseau prive, pour
# le cas ou la page est servie par serveur.py sur un autre port.
ORIGINES = (r"http://(localhost|127\.0\.0\.1|\[::1\]"
            r"|192\.168\.\d{1,3}\.\d{1,3}"
            r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
            r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?")


class ToolRequest(BaseModel):
    name: str
    arguments: dict[str, Any] = {}


async def _relais(fonction, *args):
    """Appelle le client MCP (bloquant) sans figer l'event loop."""
    try:
        return await asyncio.to_thread(fonction, *args)
    except ErreurPasserelle as exc:
        raise HTTPException(status_code=exc.code, detail=exc.message)


app = FastAPI(title="Bibliotheque de composants")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ORIGINES,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/tools")
async def list_tools():
    """Liste les outils MCP et leurs schemas d'arguments."""
    return await _relais(passerelle_mcp.liste_outils)


@app.post("/api/tool")
async def call_tool(request: ToolRequest):
    """Appel generique d'un outil MCP."""
    return await _relais(passerelle_mcp.appeler_outil,
                         request.name, request.arguments)


@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Service statique du depot : accueil + editeurs + recherche de composants.
# Meme regle que serveur.py, pour que les liens /editeur-pcb/ fonctionnent.
# ---------------------------------------------------------------------------

def _hors_depot(cible: str) -> bool:
    """Vrai si le chemin sort du depot ou touche un fichier de travail."""
    try:
        reel = os.path.realpath(cible)
    except OSError:
        return True
    racine = os.path.realpath(RACINE)
    if reel != racine and not reel.startswith(racine + os.sep):
        return True                      # remontee hors du depot
    rel = os.path.relpath(reel, racine)
    return any(part in CACHES or part.startswith('.')
               for part in rel.split(os.sep) if part not in ('.', '..'))


def resoudre_chemin(chemin: str) -> str:
    """URL -> fichier du depot. Un dossier sert <dossier>/<dossier>.html."""
    cible = os.path.normpath(os.path.join(RACINE, chemin.lstrip("/")))
    if _hors_depot(cible):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    if os.path.isdir(cible):
        index = os.path.join(cible, "index.html")
        if os.path.exists(index):
            return index
        dossier = os.path.basename(cible.rstrip(os.sep)) or "index"
        candidat = os.path.join(cible, dossier + ".html")
        if os.path.exists(candidat):
            return candidat
    if not os.path.isfile(cible):
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return cible


@app.get("/{chemin:path}")
async def servir_depot(chemin: str = ""):
    fichier = resoudre_chemin(chemin)
    return FileResponse(fichier, headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    })


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=DEFAUT_PORT,
                    help="port d'ecoute (defaut : %d)" % DEFAUT_PORT)
    ap.add_argument("--host", default=None,
                    help="adresse d'ecoute (defaut : 127.0.0.1)")
    ap.add_argument("--reseau", action="store_true",
                    help="ecouter sur toutes les interfaces (acces iPad)")
    args = ap.parse_args(argv)
    host = args.host or ("0.0.0.0" if args.reseau else "127.0.0.1")

    print("=" * 60)
    print("RECHERCHE DE COMPOSANTS - pcbparts.dev")
    print("=" * 60)
    print("  dossier servi : %s" % RACINE)
    print("  adresse       : http://%s:%d/" % (
        "127.0.0.1" if host in ("0.0.0.0", "::") else host, args.port))
    if host in ("0.0.0.0", "::"):
        print()
        print("  ATTENTION : le serveur ecoute sur toutes les interfaces et")
        print("  relaie les requetes vers pcbparts.dev sans authentification.")
        print("  A reserver a un reseau de confiance.")
    print("=" * 60)
    print()

    import uvicorn
    uvicorn.run(app, host=host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
