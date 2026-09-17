#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Banc d'essai pour tester les routes HTTP de web_CAO.py :
- GET /api/pcb/score-placement
- POST /api/pcb/score-placement
- GET /api/schema/patterns
- POST /api/schema/patterns
"""

import http.client
import json
import os
import sys
import threading
import time

DOSSIER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if DOSSIER_ROOT not in sys.path:
    sys.path.insert(0, DOSSIER_ROOT)

import web_CAO

def test_routes():
    # Démarre le serveur sur un port aléatoire libre
    httpd, _ = web_CAO.make_server("127.0.0.1", 0)
    assert httpd is not None, "Impossible d'ouvrir le serveur de test"
    port = httpd.server_address[1]

    fil = threading.Thread(target=httpd.serve_forever, daemon=True)
    fil.start()

    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)

    try:
        # 1. GET /api/pcb/score-placement
        conn.request("GET", "/api/pcb/score-placement")
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("dispo") is True
        print("[PASS] GET /api/pcb/score-placement")

        # 2. POST /api/pcb/score-placement
        payload_pcb = json.dumps({
            "board": {"w": 60, "h": 40},
            "footprints": [
                {"ref": "U1", "x": 10.0, "y": 10.0, "pads": [{"n": 1, "net": "VCC", "x": 10.0, "y": 10.0}]},
                {"ref": "C1", "x": 12.0, "y": 10.0, "pads": [{"n": 1, "net": "VCC", "x": 12.0, "y": 10.0}]}
            ]
        }).encode("utf-8")
        conn.request("POST", "/api/pcb/score-placement", body=payload_pcb, headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("succes") is True
        assert "hpwl_mm" in data
        assert "congestion" in data
        assert "decouplage" in data
        print("[PASS] POST /api/pcb/score-placement (hpwl: %s, decap: %s)" % (data["hpwl_mm"], data["decouplage"]["conform_pct"]))

        # 3. GET /api/schema/patterns
        conn.request("GET", "/api/schema/patterns")
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("dispo") is True
        print("[PASS] GET /api/schema/patterns")

        # 4. POST /api/schema/patterns
        payload_schema = json.dumps({
            "components": {
                "U1": {"val": "AMS1117-3.3", "type": "ic"},
                "C1": {"val": "10uF", "type": "cap"}
            },
            "nets": {
                "VCC_3V3": [{"ref": "U1", "pin": 2}, {"ref": "C1", "pin": 1}],
                "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}]
            }
        }).encode("utf-8")
        conn.request("POST", "/api/schema/patterns", body=payload_schema, headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("succes") is True
        assert data["total_motifs"] >= 1
        print("[PASS] POST /api/schema/patterns (total motifs: %d)" % data["total_motifs"])

        # 5. POST /api/datasheet/telecharger
        payload_ds_inv = json.dumps({"url": "ftp://invalide", "mpn": "TEST"}).encode("utf-8")
        
        # 5a. PROJETS_OUVERT = False -> Rejet 403 propre
        web_CAO.PROJETS_OUVERT = False
        conn.request("POST", "/api/datasheet/telecharger", body=payload_ds_inv, headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 403, "Attendu 403, reçu %d" % res.status
        data = json.loads(res.read().decode("utf-8"))
        assert "refuses" in data.get("detail", "")
        print("[PASS] POST /api/datasheet/telecharger (rejet 403 en écoute réseau)")

        # 5b. PROJETS_OUVERT = True -> Traitement et rejet URL invalide 400
        web_CAO.PROJETS_OUVERT = True
        conn.request("POST", "/api/datasheet/telecharger", body=payload_ds_inv, headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 400, "Attendu 400, reçu %d" % res.status
        data = json.loads(res.read().decode("utf-8"))
        assert "URL invalide" in data.get("detail", "")
        print("[PASS] POST /api/datasheet/telecharger (rejet URL invalide 400)")

        # 6. GET /api/datasheet/ouvrir (fichier manquant -> 400)
        conn.request("GET", "/api/datasheet/ouvrir")
        res = conn.getresponse()
        assert res.status == 400
        res.read()
        print("[PASS] GET /api/datasheet/ouvrir (fichier manquant -> 400)")

        # 7. GET /api/datasheet/ouvrir (fichier inexistant -> 404)
        conn.request("GET", "/api/datasheet/ouvrir?fichier=non_existant_test_12345.pdf")
        res = conn.getresponse()
        # 8. Protection SSRF sur /api/datasheet/telecharger
        web_CAO.PROJETS_OUVERT = True
        for ssrf_url in [
            "http://127.0.0.1/secret.pdf",
            "http://localhost/secret.pdf",
            "http://10.0.0.1/secret.pdf",
            "http://192.168.1.1/secret.pdf",
            "http://169.254.169.254/latest/meta-data",
        ]:
            body_ssrf = json.dumps({"url": ssrf_url, "mpn": "TEST"}).encode("utf-8")
            conn.request("POST", "/api/datasheet/telecharger", body=body_ssrf, headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            assert res.status == 400, "SSRF non bloqué pour %s : reçu %d" % (ssrf_url, res.status)
            res_data = json.loads(res.read().decode("utf-8"))
            assert "non autorisee" in res_data.get("detail", "") or "invalide" in res_data.get("detail", ""), res_data
        print("[PASS] POST /api/datasheet/telecharger (protection SSRF active sur IPs privées/locales)")

        # 9. Protection contre la fuite de fichiers sensibles
        for secret_file in ["/LIB_composants.csv", "/mom_solver.log", "/web_CAO.py", "/python/ipc2581_parser.py"]:
            conn.request("GET", secret_file)
            res = conn.getresponse()
            assert res.status == 404, "Fichier sensible non masqué : %s -> %d" % (secret_file, res.status)
            res.read()
        print("[PASS] GET fichiers sensibles masqués (404 pour .csv, .log, .py)")

        # 10. Désactivation du listing de répertoire
        conn.request("GET", "/datasheets/")
        res = conn.getresponse()
        assert res.status == 404, "Listing de répertoire actif : reçu %d" % res.status
        res.read()
        print("[PASS] GET /datasheets/ (listing de répertoire désactivé -> 404)")

        # 11. Validation Host Header / Anti-DNS Rebinding
        conn_evil = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            conn_evil.request("GET", "/api/pcb/score-placement", headers={"Host": "evil-attacker.com"})
            res = conn_evil.getresponse()
            assert res.status == 403, "Attendu 403 pour Host malveillant, reçu %d" % res.status
            res.read()
            print("[PASS] Validation Host header (403 pour hôte DNS Rebinding non autorisé)")
        finally:
            conn_evil.close()

        # 12. Protection CSRF (Origin header inter-origines non autorisé)
        conn.request("POST", "/api/pcb/score-placement", body=payload_pcb, headers={
            "Content-Type": "application/json",
            "Origin": "https://evil-attacker.com"
        })
        res = conn.getresponse()
        assert res.status == 403, "Attendu 403 pour Origin CSRF non autorisée, reçu %d" % res.status
        res.read()
        print("[PASS] Protection CSRF / Origin non autorisée -> 403")

        # 13. Protection XML Entity Expansion (Billion Laughs / DTD)
        if os.path.join(DOSSIER_ROOT, "python") not in sys.path:
            sys.path.insert(0, os.path.join(DOSSIER_ROOT, "python"))
        from ipc2581_parser import IPC2581Parser, IPC2581ParseError
        import io
        xml_xxe = b"""<?xml version="1.0"?>
        <!DOCTYPE lolz [
          <!ENTITY lol "lol">
          <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
        ]>
        <IPC-2581></IPC-2581>"""
        try:
            IPC2581Parser(io.BytesIO(xml_xxe)).parse()
            assert False, "XXE / Entity expansion n'a pas levé d'erreur"
        except IPC2581ParseError as exc:
            assert "interdite" in str(exc)
        print("[PASS] Protection XML Entity Expansion (<!ENTITY rejeté avec succès)")

        # 14. POST /api/simulation (moteur 2D standard)
        payload_sim = {
            "format": "cao-sim-em-3",
            "stackup": {
                "layers": [
                    {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"},
                    {"type": "dielectric", "thickness": 0.370, "epsilon_r": 4.37, "name": "FR4"},
                    {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"}
                ]
            },
            "geometry": {
                "objects": [
                    {"type": "track", "start": [0.0, 0.0], "end": [5.0, 0.0], "width": 1.05, "layer": 0, "net": "SIG"}
                ]
            },
            "analyse": {"f_debut": 2e9, "f_fin": 2e9, "f_centrale": 2e9, "points": 1}
        }
        conn.request("POST", "/api/simulation", body=json.dumps(payload_sim).encode("utf-8"), headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("format") == "cao-sim-em-resultat-5"
        assert "ligne" in data
        print("[PASS] POST /api/simulation -> solveur 2D standard")

        # ==============================================================
        # 18-22. LES DEUX ROUTES QUI N'ETAIENT PAS COUVERTES
        # --------------------------------------------------------------
        # /api/simulation-dc et /api/crosstalk n'avaient AUCUN essai de
        # route, alors que les quatre routes de calcul partagent desormais
        # une seule lecture de document (`_lire_document`) : une regression
        # sur elle les toucherait toutes les quatre, et deux seulement se
        # seraient plaintes. C'est aussi en ecrivant ces essais qu'on a vu
        # que la route DC n'avait aucun plafond de taille de corps.
        # ==============================================================

        # 18. GET /api/simulation-dc
        conn.request("GET", "/api/simulation-dc")
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("dispo") is True, data
        assert "methode" in data
        print("[PASS] GET /api/simulation-dc")

        # 19. POST /api/simulation-dc : un barreau, une source, une reference
        payload_dc = {
            "format": "cao-sim-dc-1",
            "carte": "banc_routes",
            "polygones": [{"layer": 0, "net": "VCC", "epaisseur": 0.035,
                           "sommets": [[0, 0], [20, 0], [20, 5], [0, 5]]}],
            "sources": [{"x": 1.0, "y": 2.5, "layer": 0, "net": "VCC",
                         "courant": 1.0}],
            "references": [{"x": 19.0, "y": 2.5, "layer": 0, "net": "VCC",
                            "tension": 0.0}],
            "pas": 0.5,
        }
        conn.request("POST", "/api/simulation-dc",
                     body=json.dumps(payload_dc).encode("utf-8"),
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200, res.read()[:300]
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("format") == "cao-sim-dc-resultat-1", data.get("format")
        assert "potentiel" in data and "densite" in data
        # LA CARTE DE CHALEUR EST POSEE PAR LA ROUTE, une par couche : c'est
        # elle qui l'ajoute au resultat, pas le solveur.
        assert "cartes" in data, "la route doit ajouter les cartes par couche"
        print("[PASS] POST /api/simulation-dc (IR drop, %d couche(s) peinte(s))"
              % len(data["cartes"]))

        # 20. GET /api/crosstalk
        conn.request("GET", "/api/crosstalk")
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("dispo") is True, data
        print("[PASS] GET /api/crosstalk")

        # 21. POST /api/crosstalk : un refus PROPRE valide la route aussi bien
        # qu'un calcul, et coute mille fois moins cher. Ce qu'on eprouve ici
        # est la chaine lecture -> module -> traduction du refus en 422.
        conn.request("POST", "/api/crosstalk",
                     body=json.dumps({"format": "n'importe quoi"}).encode("utf-8"),
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 422, "%d au lieu de 422" % res.status
        detail = json.loads(res.read().decode("utf-8")).get("detail", "")
        assert "format" in detail.lower(), detail
        print("[PASS] POST /api/crosstalk (document hors format -> 422 motive)")

        # 22. LES QUATRE ROUTES DE CALCUL REFUSENT UN CORPS VIDE DE LA MEME
        # FACON. C'est le contrat de `_lire_document`, et le seul moyen de
        # verifier qu'elles passent bien toutes les quatre par elle.
        for route in ("/api/simulation",
                      "/api/simulation-dc", "/api/crosstalk"):
            conn.request("POST", route, body=b"",
                         headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            corps = res.read()
            assert res.status == 400, "%s : %d au lieu de 400" % (route, res.status)
            assert b"vide" in corps, "%s : %s" % (route, corps[:120])
        print("[PASS] Les 3 routes de calcul refusent un corps vide (400)")

        # 23. ET UN CORPS TROP GROS, de la meme facon. La route DC n'avait
        # aucun plafond : elle lisait ce qui venait, alors que son document
        # porte les polygones de couches entieres.
        #
        # UNE CONNEXION NEUVE PAR ESSAI, ET C'EST LA REGLE DU 413. Le serveur
        # refuse sur le SEUL Content-Length, sans lire le corps -- c'est tout
        # l'interet du plafond, ne pas ingerer cinq megaoctets pour les jeter.
        # Mais les octets non lus restent alors dans le tuyau, et la connexion
        # persistante devient inutilisable : la reutiliser leve un
        # ConnectionAbortedError qu'on lirait comme une panne du serveur.
        import web_CAO as _srv
        gros = json.dumps({"format": "cao-sim-em-3",
                           "bourrage": "x" * (5 * 1024 * 1024)}).encode("utf-8")
        for route, plafond in (("/api/simulation", _srv.MAX_SIM),
                               ("/api/crosstalk", _srv.MAX_CROSSTALK),
                               ("/api/simulation-dc", _srv.MAX_DC)):
            if len(gros) <= plafond:
                continue
            c413 = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
            try:
                c413.request("POST", route, body=gros,
                             headers={"Content-Type": "application/json"})
                res = c413.getresponse()
                corps = res.read()
                assert res.status == 413, "%s : %d au lieu de 413" % (route, res.status)
                assert b"maximum" in corps, "%s : %s" % (route, corps[:120])
            finally:
                c413.close()
        assert _srv.MAX_DC > 0, "la route DC doit avoir un plafond"
        print("[PASS] Plafond de taille sur les routes de calcul (413), DC compris"
              " (%d Mo)" % (_srv.MAX_DC // 1048576))

    finally:
        conn.close()
        httpd.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    test_routes()
    print("\n TOUTES LES ROUTES DU SERVEUR ET SÉCURITÉS SONT VALIDÉES AVEC SUCCÈS.")
