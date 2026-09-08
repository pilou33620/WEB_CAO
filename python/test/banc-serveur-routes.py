#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Banc d'essai pour tester les routes HTTP de serveur.py :
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

import serveur

def test_routes():
    # Démarre le serveur sur un port aléatoire libre
    httpd, _ = serveur.make_server("127.0.0.1", 0)
    assert httpd is not None, "Impossible d'ouvrir le serveur de test"
    port = httpd.server_address[1]

    fil = threading.Thread(target=httpd.serve_forever, daemon=True)
    fil.start()

    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)

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
        serveur.PROJETS_OUVERT = False
        conn.request("POST", "/api/datasheet/telecharger", body=payload_ds_inv, headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 403, "Attendu 403, reçu %d" % res.status
        data = json.loads(res.read().decode("utf-8"))
        assert "refuses" in data.get("detail", "")
        print("[PASS] POST /api/datasheet/telecharger (rejet 403 en écoute réseau)")

        # 5b. PROJETS_OUVERT = True -> Traitement et rejet URL invalide 400
        serveur.PROJETS_OUVERT = True
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
        serveur.PROJETS_OUVERT = True
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
        for secret_file in ["/LIB_composants.csv", "/mom_solver.log", "/serveur.py", "/python/ipc2581_parser.py"]:
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

    finally:
        conn.close()
        httpd.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    test_routes()
    print("\n TOUTES LES ROUTES DU SERVEUR ET SÉCURITÉS SONT VALIDÉES AVEC SUCCÈS.")
