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

    finally:
        conn.close()
        httpd.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    test_routes()
    print("\n TOUTES LES ROUTES DU SERVEUR SONT VALIDÉES AVEC SUCCÈS.")
