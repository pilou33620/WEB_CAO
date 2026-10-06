#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Banc d'essai du relai « Enregistrer + GitHub » de web_CAO.py :

    GET  /api/github             -- l'envoi est-il possible d'ici ?
    POST /api/github/envoyer     -- relaye au lanceur WEB_SUITE (/api/envoyer)
    POST /api/github/identite    -- relaye au lanceur WEB_SUITE (/api/identite)

Un faux lanceur, sur la boucle locale, note ce qu'il recoit et repond comme le
vrai. Rien n'est commite ni pousse. Ce qui compte surtout ici : un autre
appareil du reseau ne passe qu'avec le jeton du lanceur, comme chez le lanceur
lui-meme -- sans quoi n'importe qui pousserait sur GitHub avec les identifiants
du poste.
"""

import http.client
import http.server
import json
import os
import sys
import threading

DOSSIER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if DOSSIER_ROOT not in sys.path:
    sys.path.insert(0, DOSSIER_ROOT)

import web_CAO  # noqa: E402

JETON = "jeton-du-lanceur-0123456789"
RECUS = []


class FauxLanceur(http.server.BaseHTTPRequestHandler):
    reponse = {"ok": True, "message": "Envoyé sur GitHub.", "outils": []}

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        RECUS.append({"route": self.path, "entetes": dict(self.headers),
                      "corps": json.loads(self.rfile.read(n) or b"{}")})
        corps = json.dumps(FauxLanceur.reponse).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)


def demarrer(serveur):
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    return serveur.server_address[1]


lanceur = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FauxLanceur)
PORT_LANCEUR = demarrer(lanceur)
httpd, _ = web_CAO.make_server("127.0.0.1", 0)
PORT = demarrer(httpd)

LOCAL = web_CAO.CustomHandler._client_local


def req(methode, route, corps=None, entetes=None):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=30)
    h = {"Content-Type": "application/json"}
    h.update(entetes or {})
    c.request(methode, route, body=json.dumps(corps).encode("utf-8") if corps is not None else None,
              headers=h)
    r = c.getresponse()
    texte = r.read().decode("utf-8")
    c.close()
    try:
        return r.status, json.loads(texte)
    except ValueError:
        return r.status, {}


def regler(lanceur=True, local=True, ouvert=True, reseau=False, jeton=JETON):
    web_CAO.LANCEUR = ("http://127.0.0.1:%d" % PORT_LANCEUR) if lanceur is True else (lanceur or "")
    web_CAO.JETON_LANCEUR = jeton
    web_CAO.PROJETS_OUVERT = ouvert
    web_CAO.PROJETS_RESEAU = reseau
    web_CAO.CustomHandler._client_local = LOCAL if local else (lambda self: False)
    del RECUS[:]


def verifier(nom, cond, detail=""):
    assert cond, "%s %s" % (nom, detail)
    print("[PASS] " + nom)


try:
    # -- sans lanceur : la route n'existe pas ---------------------------
    regler(lanceur=False)
    s, d = req("GET", "/api/github")
    verifier("sans lanceur, GET /api/github -> 404", s == 404, (s, d))
    s, d = req("POST", "/api/github/envoyer", {"message": "x"})
    verifier("sans lanceur, rien n'est relaye", s == 404 and not RECUS, (s, d))

    # -- un « lanceur » hors de ce poste n'est jamais appele ------------
    regler(lanceur="http://192.168.1.50:8100")
    s, d = req("GET", "/api/github")
    verifier("lanceur hors boucle locale refuse", s == 404, (s, d))

    # -- ce poste, ecoute locale ------------------------------------------
    regler()
    s, d = req("GET", "/api/github")
    verifier("ce poste : envoi disponible", s == 200 and d.get("disponible") is True, (s, d))
    s, d = req("POST", "/api/github/envoyer", {"message": "Schema : ajout du regulateur"})
    verifier("ce poste : envoi relaye au lanceur", s == 200 and d.get("ok") is True
             and d.get("message") == "Envoyé sur GitHub.", (s, d))
    r = RECUS[-1]
    verifier("relai : route /api/envoyer, outil web_cao, message transmis",
             r["route"] == "/api/envoyer" and r["corps"] == {"id": "web_cao",
                                                             "message": "Schema : ajout du regulateur"}, r)
    verifier("relai : en-tete X-WebSuite et Host local (exiges par le lanceur)",
             r["entetes"].get("X-WebSuite") == "1"
             and r["entetes"].get("Host") == "127.0.0.1:%d" % PORT_LANCEUR, r["entetes"])

    # -- poste neuf : le lanceur demande l'identite git --------------------
    FauxLanceur.reponse = {"ok": False, "identite": True, "message": "git ne connaît pas encore"}
    s, d = req("POST", "/api/github/envoyer", {"message": "x"})
    verifier("identite manquante transmise a l'editeur", s == 200 and d.get("identite") is True
             and d.get("ok") is False, (s, d))
    FauxLanceur.reponse = {"ok": True, "message": "Identité git enregistrée pour PROJETS."}
    s, d = req("POST", "/api/github/identite", {"nom": "Pilou", "email": "p@example.com"})
    verifier("identite relayee", s == 200 and d.get("ok") is True
             and RECUS[-1]["route"] == "/api/identite"
             and RECUS[-1]["corps"] == {"nom": "Pilou", "email": "p@example.com"}, (s, d, RECUS[-1:]))
    FauxLanceur.reponse = {"ok": True, "message": "Envoyé sur GitHub.", "outils": []}

    # -- autre appareil du reseau : le jeton du lanceur est exige ----------
    regler(local=False, ouvert=False, reseau=True)
    s, d = req("POST", "/api/github/envoyer", {"message": "x"})
    verifier("autre appareil sans jeton : refuse, rien de relaye", s == 403 and not RECUS, (s, d))
    s, d = req("POST", "/api/github/envoyer", {"message": "x"},
               {"Cookie": "websuite_jeton=mauvais-jeton-0000000000"})
    verifier("autre appareil, mauvais jeton : refuse", s == 403 and not RECUS, (s, d))
    s, d = req("GET", "/api/github", entetes={"Cookie": "autre=1; websuite_jeton=" + JETON})
    verifier("autre appareil, bon jeton (cookie du lanceur) : disponible", s == 200, (s, d))
    s, d = req("POST", "/api/github/envoyer", {"message": "depuis l'iPad"},
               {"Cookie": "websuite_jeton=" + JETON})
    verifier("autre appareil, bon jeton : envoi relaye", s == 200 and d.get("ok") is True
             and RECUS[-1]["corps"]["message"] == "depuis l'iPad", (s, d))

    regler(local=False, ouvert=False, reseau=True, jeton="")
    s, d = req("POST", "/api/github/envoyer", {"message": "x"}, {"Cookie": "websuite_jeton="})
    verifier("lanceur sans jeton : un autre appareil ne passe jamais", s == 403 and not RECUS, (s, d))

    # -- ecoute reseau sans --projets-reseau : fermee comme les projets ----
    regler(ouvert=False, reseau=False)
    s, d = req("POST", "/api/github/envoyer", {"message": "x"})
    verifier("ecoute reseau sans --projets-reseau : refuse", s == 403 and not RECUS, (s, d))

    # -- page d'un autre site : protection CSRF ----------------------------
    regler()
    s, d = req("POST", "/api/github/envoyer", {"message": "x"}, {"Origin": "https://exemple.com"})
    verifier("origine inter-site refusee", s == 403 and not RECUS, (s, d))

    # -- lanceur arrete -----------------------------------------------------
    lanceur.shutdown()
    lanceur.server_close()
    s, d = req("POST", "/api/github/envoyer", {"message": "x"})
    verifier("lanceur injoignable : 502 lisible", s == 502 and "injoignable" in d.get("detail", ""), (s, d))
finally:
    web_CAO.CustomHandler._client_local = LOCAL
    httpd.shutdown()

print("OK")
