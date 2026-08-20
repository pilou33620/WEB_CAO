#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.1.0
# Date: 2026-08-20
# Explication: Le client MCP de la 2.0.0 est repris tel quel (serveur
#   pcbparts.dev stateless, route generique /api/tool, liste blanche des 14
#   outils). Ajouts pour l'integrer au depot WEB_CAO :
#   - le serveur sert aussi le depot complet (accueil + les deux editeurs),
#     avec la meme regle <dossier>/<dossier>.html que serveur.py ;
#   - CORS restreint au reseau local, pour que la page servie par serveur.py
#     (port 8000) puisse quand meme appeler l'API de ce serveur ;
#   - ligne de commande --host / --port / --reseau, ecoute locale par defaut.
# Fonctions modifiees/ajoutees :
# - MCPClient, unwrap_mcp_result, list_tools, call_tool (inchangees)
# - servir_depot (remplace serve_frontend : sert tout le depot)
# - resoudre_chemin, _hors_depot (nouvelles : securite du service statique)
# - main (nouvelle : arguments de ligne de commande)
# ==========================================
"""Passerelle vers pcbparts.dev + service du depot WEB_CAO.

    python serveur-composants.py              # http://127.0.0.1:8420/
    python serveur-composants.py --reseau     # accessible depuis l'iPad
    python serveur-composants.py --port 9000

Necessite fastapi, httpx et uvicorn (pip install fastapi httpx uvicorn).
Les deux editeurs, eux, n'ont besoin d'aucune dependance : serveur.py suffit.
"""

import os
import json
import argparse
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Any

MCP_URL = "https://pcbparts.dev/mcp"
RACINE = os.path.dirname(os.path.abspath(__file__))
DEFAUT_PORT = 8420

# Fichiers de travail : ils n'ont rien a faire sur le reseau.
CACHES = ('.git', '.github', '.gitignore', '.venv', '__pycache__', '.env')

# Outils que le frontend a le droit d'appeler.
ALLOWED_TOOLS = {
    "jlc_search", "jlc_search_help", "jlc_stock_check", "jlc_get_part",
    "jlc_find_alternatives", "jlc_get_pinout", "mouser_get_part",
    "digikey_get_part", "cse_search", "cse_get_kicad", "sensor_recommend",
    "board_search", "board_get", "get_design_rules",
}

# Origines autorisees a appeler l'API : cette machine et le reseau prive, pour
# le cas ou la page est servie par serveur.py sur un autre port.
ORIGINES = (r"http://(localhost|127\.0\.0\.1|\[::1\]"
            r"|192\.168\.\d{1,3}\.\d{1,3}"
            r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
            r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?")


class ToolRequest(BaseModel):
    name: str
    arguments: dict[str, Any] = {}


class MCPClient:
    """Client MCP Streamable HTTP. Le serveur pcbparts.dev est stateless."""

    def __init__(self, url: str):
        self.url = url
        self.session_id: str | None = None
        self._ready = False
        self._client = httpx.AsyncClient(timeout=30.0)

    def _headers(self) -> dict:
        headers = {
            "Content-Type": "application/json",
            # Les deux types sont obligatoires, sinon le serveur renvoie 406.
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        return headers

    def _parse(self, response: httpx.Response) -> dict:
        if "text/event-stream" in response.headers.get("content-type", ""):
            lines = [l[5:].strip() for l in response.text.splitlines()
                     if l.startswith("data:")]
            if not lines:
                raise HTTPException(status_code=502, detail="Flux SSE vide")
            return json.loads(lines[-1])
        return response.json()

    async def _post(self, payload: dict) -> dict:
        response = await self._client.post(self.url, json=payload,
                                           headers=self._headers())
        sid = response.headers.get("Mcp-Session-Id")
        if sid:
            self.session_id = sid
        response.raise_for_status()
        return self._parse(response)

    async def ensure_ready(self):
        if self._ready:
            return
        await self._post({
            "jsonrpc": "2.0", "id": 0, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "pcbparts-local-tool", "version": "2.1.0"},
            },
        })
        await self._client.post(
            self.url,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers=self._headers(),
        )
        self._ready = True

    async def rpc(self, method: str, params: dict | None = None) -> dict:
        await self.ensure_ready()
        payload = {"jsonrpc": "2.0", "id": 1, "method": method}
        if params is not None:
            payload["params"] = params
        try:
            return await self._post(payload)
        except httpx.HTTPStatusError as exc:
            # Session perimee : on repart de zero une fois.
            if exc.response.status_code in (400, 404) and self.session_id:
                self.session_id, self._ready = None, False
                await self.ensure_ready()
                return await self._post(payload)
            raise HTTPException(
                status_code=exc.response.status_code,
                detail="pcbparts.dev a repondu %d : %s"
                       % (exc.response.status_code, exc.response.text[:300]))
        except httpx.RequestError as exc:
            raise HTTPException(status_code=503,
                                detail="Connexion impossible : %s" % exc)

    async def aclose(self):
        await self._client.aclose()


mcp_client = MCPClient(MCP_URL)
_tools_cache: list | None = None


def unwrap_mcp_result(envelope: dict) -> Any:
    """Extrait le payload utile : structuredContent > content[].text parse > result."""
    if not isinstance(envelope, dict):
        return envelope

    if "error" in envelope:
        err = envelope["error"]
        raise HTTPException(status_code=502, detail="Erreur MCP %s : %s"
                            % (err.get("code"), err.get("message")))

    result = envelope.get("result", envelope)
    if not isinstance(result, dict):
        return result

    if "structuredContent" in result:
        return result["structuredContent"]

    content = result.get("content")
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict) and first.get("type") == "text":
            text = first.get("text", "")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                # Le serveur renvoie ses erreurs de validation en texte brut.
                return {"_message": text}
    return result


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await mcp_client.aclose()


app = FastAPI(title="Bibliotheque de composants", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ORIGINES,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/tools")
async def list_tools():
    """Liste les outils MCP et leurs schemas d'arguments."""
    global _tools_cache
    if _tools_cache is None:
        envelope = await mcp_client.rpc("tools/list")
        _tools_cache = envelope.get("result", {}).get("tools", [])
    return {"tools": _tools_cache, "allowed": sorted(ALLOWED_TOOLS)}


@app.post("/api/tool")
async def call_tool(request: ToolRequest):
    """Appel generique d'un outil MCP."""
    if request.name not in ALLOWED_TOOLS:
        raise HTTPException(status_code=400,
                            detail="Outil inconnu : %s" % request.name)
    # On retire les valeurs vides pour laisser jouer les defauts du serveur.
    args = {k: v for k, v in request.arguments.items() if v not in (None, "", [])}
    envelope = await mcp_client.rpc("tools/call",
                                    {"name": request.name, "arguments": args})
    return {"data": unwrap_mcp_result(envelope)}


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
