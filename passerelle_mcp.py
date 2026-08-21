#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 1.0.0
# Date: 2026-08-21
# Explication: Le client MCP vers pcbparts.dev vivait dans
#   serveur-composants.py et dependait de httpx, donc de fastapi/uvicorn.
#   Resultat : la page recherche-composants servie par serveur.py (stdlib,
#   sans dependance) ne trouvait aucune passerelle et repondait « HTTP 404 »
#   sur /api/tools. Le client est deplace ici, reecrit en bibliotheque
#   standard uniquement, pour que les deux serveurs exposent la meme API.
# Fonctions:
# - ErreurPasserelle : erreur portant un code HTTP a renvoyer au navigateur
# - ClientMCP : session MCP Streamable HTTP (initialize + tools/list + tools/call)
# - deballer : structuredContent > content[].text parse > result
# - liste_outils / appeler_outil : les deux reponses JSON attendues par 01-api.js
# ==========================================
"""Passerelle vers le serveur MCP pcbparts.dev, sans dependance externe.

Le navigateur ne peut pas appeler pcbparts.dev directement (CORS + protocole
MCP), il faut donc un relais local. Ce module en contient toute la logique ;
serveur.py et serveur-composants.py ne font que l'exposer en HTTP.
"""

import json
import ssl
import threading
import urllib.error
import urllib.request

MCP_URL = "https://pcbparts.dev/mcp"
TIMEOUT = 30.0

# Outils que le frontend a le droit d'appeler.
ALLOWED_TOOLS = {
    "jlc_search", "jlc_search_help", "jlc_stock_check", "jlc_get_part",
    "jlc_find_alternatives", "jlc_get_pinout", "mouser_get_part",
    "digikey_get_part", "cse_search", "cse_get_kicad", "sensor_recommend",
    "board_search", "board_get", "get_design_rules",
}


class ErreurPasserelle(Exception):
    """Erreur a renvoyer telle quelle au navigateur."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def deballer(enveloppe):
    """Extrait la charge utile : structuredContent > content[].text > result."""
    if not isinstance(enveloppe, dict):
        return enveloppe

    if "error" in enveloppe:
        err = enveloppe["error"] or {}
        raise ErreurPasserelle(502, "Erreur MCP %s : %s"
                               % (err.get("code"), err.get("message")))

    resultat = enveloppe.get("result", enveloppe)
    if not isinstance(resultat, dict):
        return resultat

    if "structuredContent" in resultat:
        return resultat["structuredContent"]

    contenu = resultat.get("content")
    if isinstance(contenu, list) and contenu:
        premier = contenu[0]
        if isinstance(premier, dict) and premier.get("type") == "text":
            texte = premier.get("text", "")
            try:
                return json.loads(texte)
            except json.JSONDecodeError:
                # Le serveur renvoie ses erreurs de validation en texte brut.
                return {"_message": texte}
    return resultat


class ClientMCP:
    """Client MCP Streamable HTTP. Le serveur pcbparts.dev est stateless.

    Les serveurs qui utilisent ce client sont multi-thread : un verrou serialise
    les echanges, la session MCP n'etant pas partageable en parallele.
    """

    def __init__(self, url=MCP_URL, timeout=TIMEOUT):
        self.url = url
        self.timeout = timeout
        self.session_id = None
        self._pret = False
        self._verrou = threading.RLock()
        self._outils = None
        # ssl.create_default_context lit le magasin de certificats du systeme :
        # indispensable derriere un proxy d'entreprise qui reecrit le TLS.
        self._ssl = ssl.create_default_context()

    # -- transport ---------------------------------------------------------
    def _entetes(self):
        entetes = {
            "Content-Type": "application/json",
            # Les deux types sont obligatoires, sinon le serveur renvoie 406.
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            entetes["Mcp-Session-Id"] = self.session_id
        return entetes

    def _lire(self, corps, type_contenu):
        texte = corps.decode("utf-8", "replace")
        if "text/event-stream" in (type_contenu or ""):
            lignes = [l[5:].strip() for l in texte.splitlines()
                      if l.startswith("data:")]
            if not lignes:
                raise ErreurPasserelle(502, "Flux SSE vide")
            return json.loads(lignes[-1])
        return json.loads(texte)

    def _envoyer(self, charge, attendre_reponse=True):
        requete = urllib.request.Request(
            self.url, data=json.dumps(charge).encode("utf-8"),
            headers=self._entetes(), method="POST")
        try:
            with urllib.request.urlopen(requete, timeout=self.timeout,
                                        context=self._ssl) as rep:
                sid = rep.headers.get("Mcp-Session-Id")
                if sid:
                    self.session_id = sid
                corps = rep.read()
                if not attendre_reponse:
                    return None
                return self._lire(corps, rep.headers.get("Content-Type"))
        except urllib.error.HTTPError as exc:
            # remontee brute : rpc() decide s'il faut rouvrir la session
            exc.corps = exc.read()[:300].decode("utf-8", "replace")
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ErreurPasserelle(503, "Connexion impossible : %s" % exc)

    def _initialiser(self):
        if self._pret:
            return
        self._envoyer({
            "jsonrpc": "2.0", "id": 0, "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "pcbparts-local-tool",
                               "version": "2.2.0"},
            },
        })
        self._envoyer({"jsonrpc": "2.0", "method": "notifications/initialized"},
                      attendre_reponse=False)
        self._pret = True

    # -- API ---------------------------------------------------------------
    def rpc(self, methode, params=None):
        """Un appel JSON-RPC, session ouverte si besoin."""
        with self._verrou:
            self._initialiser()
            charge = {"jsonrpc": "2.0", "id": 1, "method": methode}
            if params is not None:
                charge["params"] = params
            try:
                return self._envoyer(charge)
            except urllib.error.HTTPError as exc:
                # Session perimee : on repart de zero une fois.
                if exc.code in (400, 404) and self.session_id:
                    self.session_id, self._pret = None, False
                    self._initialiser()
                    return self._envoyer(charge)
                raise ErreurPasserelle(
                    exc.code, "pcbparts.dev a repondu %d : %s"
                              % (exc.code, getattr(exc, "corps", "")))

    def outils(self):
        """Liste des outils et de leurs schemas, mise en cache."""
        with self._verrou:
            if self._outils is None:
                enveloppe = self.rpc("tools/list")
                self._outils = (enveloppe.get("result", {}) or {}).get("tools", [])
            return self._outils

    def appeler(self, nom, arguments):
        """Appel d'un outil de la liste blanche."""
        if nom not in ALLOWED_TOOLS:
            raise ErreurPasserelle(400, "Outil inconnu : %s" % nom)
        # On retire les valeurs vides pour laisser jouer les defauts du serveur.
        args = {k: v for k, v in (arguments or {}).items()
                if v not in (None, "", [])}
        return deballer(self.rpc("tools/call", {"name": nom, "arguments": args}))


# Client partage : la session MCP est reutilisee d'une requete a l'autre.
client = ClientMCP()


def liste_outils():
    """Reponse de GET /api/tools."""
    return {"tools": client.outils(), "allowed": sorted(ALLOWED_TOOLS)}


def appeler_outil(nom, arguments):
    """Reponse de POST /api/tool."""
    return {"data": client.appeler(nom, arguments)}
