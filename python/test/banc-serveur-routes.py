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
import math
import os
import sys
import threading
import time

DOSSIER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if DOSSIER_ROOT not in sys.path:
    sys.path.insert(0, DOSSIER_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import web_CAO
import lib_essai

# Une copie jetable de la LIB sert de LIB par defaut (voir lib_essai.py)
LIB = lib_essai.brancher(web_CAO)

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

        # 4b. /api/analyse-carte : la piste reliée à rien sort en critique
        # (orphelin), son coude à 90° en vigilance ; un document d'un autre
        # format est refusé en clair (422)
        conn.request("GET", "/api/analyse-carte")
        res = conn.getresponse()
        assert res.status == 200 and json.loads(res.read().decode("utf-8")).get("dispo") is True
        doc = {"format": "cao-analyse-carte-1", "unite_mm": 1,
               "pistes": [{"c": "Top", "n": "CLK", "w": 0.2, "p": [0, 0, 10, 0, 10, 10]}]}
        conn.request("POST", "/api/analyse-carte", body=json.dumps(doc).encode("utf-8"),
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert [k["regle"] for k in data["constats"]] == ["orphelin", "angle_droit"], data
        assert data["compte"]["critique"] == 1 and data["compte"]["vigilance"] == 1
        assert data["constats"][0]["n"] == "CLK"
        conn.request("POST", "/api/analyse-carte", body=b'{"format": "autre"}',
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 422 and "cao-analyse-carte-1" in json.loads(res.read().decode("utf-8"))["detail"]
        print("[PASS] GET/POST /api/analyse-carte")

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
        res.read()
        assert res.status == 404, "Attendu 404, reçu %d" % res.status
        print("[PASS] GET /api/datasheet/ouvrir (fichier inexistant -> 404)")
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

        # 21b. /api/simulation-rf : l'etat, puis un vrai calcul -- un fil
        # entre la sortie d'une puce a 14+8j et 50 ohms, dont le S21 est le
        # gain de desadaptation 4 R1 R2 / |Z1+Z2|^2 --, puis un refus motive.
        conn.request("GET", "/api/simulation-rf")
        res = conn.getresponse()
        assert res.status == 200
        data = json.loads(res.read().decode("utf-8"))
        assert data.get("dispo") is True, data
        doc_rf = {"format": "cao-sim-rf-1",
                  "stackup": {"layers": [
                      {"name": "TOP", "type": "copper", "thickness": 0.035,
                       "role": "signal"},
                      {"name": "PP", "type": "dielectric", "thickness": 0.2,
                       "epsilon_r": 4.2, "tan_delta": 0.02},
                      {"name": "GND", "type": "copper", "thickness": 0.035,
                       "role": "plane"}]},
                  "ports": [{"noeud": "a", "z": [14, 8]},
                            {"noeud": "b", "z": [50, 0]}],
                  "composants": [{"ref": "R0", "noeuds": ["a", "b"],
                                  "modele": {"type": "ideal", "genre": "R",
                                             "valeur": 0}}],
                  "analyse": {"f_debut": 2e9, "f_fin": 3e9, "points": 3,
                              "f_centre": 2.44e9}}
        conn.request("POST", "/api/simulation-rf",
                     body=json.dumps(doc_rf).encode("utf-8"),
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200, res.read()[:300]
        data = json.loads(res.read().decode("utf-8"))
        attendu = 10 * math.log10(4 * 14 * 50 / abs(64 + 8j) ** 2)
        assert abs(data["bilan"]["s21_db"] - attendu) < 1e-3, data["bilan"]
        conn.request("POST", "/api/simulation-rf",
                     body=json.dumps({"format": "?"}).encode("utf-8"),
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 422, "%d au lieu de 422" % res.status
        res.read()
        print("[PASS] /api/simulation-rf (etat, fil 14+8j -> 50 ohms, refus 422)")

        # 22. LES QUATRE ROUTES DE CALCUL REFUSENT UN CORPS VIDE DE LA MEME
        # FACON. C'est le contrat de `_lire_document`, et le seul moyen de
        # verifier qu'elles passent bien toutes les quatre par elle.
        for route in ("/api/simulation", "/api/simulation-dc",
                      "/api/crosstalk", "/api/simulation-rf"):
            conn.request("POST", route, body=b"",
                         headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            corps = res.read()
            assert res.status == 400, "%s : %d au lieu de 400" % (route, res.status)
            assert b"vide" in corps, "%s : %s" % (route, corps[:120])
        print("[PASS] Les 4 routes de calcul refusent un corps vide (400)")

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

        # 24. Host IPv6 : « [::1]:port » est accepte, un Host entre crochets
        # quelconque ne contourne plus le controle (il etait coupe a « [ »).
        assert web_CAO.hote_sans_port("[::1]:8000") == "::1"
        assert web_CAO.hote_sans_port("127.0.0.1:8000") == "127.0.0.1"
        assert web_CAO.hote_sans_port("LocalHost") == "localhost"
        for hote, attendu in (("[::1]:%d" % port, 200), ("[evil]:80", 403),
                              ("[", 403)):
            c6 = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            try:
                c6.request("GET", "/api/pcb/score-placement", headers={"Host": hote})
                res = c6.getresponse()
                res.read()
                assert res.status == attendu, "Host %s : %d au lieu de %d" % (hote, res.status, attendu)
            finally:
                c6.close()
        print("[PASS] Host IPv6 analyse correctement (plus de contournement par « [ »)")

        # 25. Ecoute reseau : la bibliotheque est en lecture seule, et la cle
        # IA n'est pas donnee.
        web_CAO.PROJETS_OUVERT = False
        try:
            for methode, route, corps in (
                    ("POST", "/api/lib/config", {"chemin": "C:/nulle-part"}),
                    ("POST", "/api/lib/fichier", {"type": "pcb", "nom": "x.json", "data": {}}),
                    ("POST", "/api/lib/composants", {"colonnes": ["a"], "composants": []}),
                    ("DELETE", "/api/lib/fichier?type=pcb&nom=0603.json", None)):
                cl = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                try:
                    cl.request(methode, route,
                               body=None if corps is None else json.dumps(corps).encode("utf-8"),
                               headers={"Content-Type": "application/json"})
                    res = cl.getresponse()
                    detail = json.loads(res.read().decode("utf-8")).get("detail", "")
                    assert res.status == 403, "%s %s : %d au lieu de 403" % (methode, route, res.status)
                    assert "lecture seule" in detail, detail
                finally:
                    cl.close()
            assert os.path.exists(os.path.join(LIB, "lib_empreinte_pcb", "0603.json"))
            conn.request("GET", "/api/lib/fichiers")
            res = conn.getresponse()
            res.read()
            assert res.status == 200, "la lecture de la LIB doit rester ouverte"
            conn.request("GET", "/api/ia/cle")
            res = conn.getresponse()
            data = json.loads(res.read().decode("utf-8"))
            assert res.status == 200 and data.get("dispo") is False and data.get("cle") == "", data
        finally:
            web_CAO.PROJETS_OUVERT = True
        print("[PASS] Ecoute reseau : LIB en lecture seule (403) et cle IA non partagee")

        # 26. profils/fabricants/ est servi, les profils d'utilisateur non.
        conn.request("GET", "/profils/fabricants/jlcpcb.json")
        res = conn.getresponse()
        corps = res.read()
        assert res.status == 200 and b"jlcpcb" in corps.lower(), res.status
        for cache in ("/profils/LISEZ-MOI.md", "/profils/Pilou.json",
                      "/profils/fabricants/../Pilou.json"):
            conn.request("GET", cache)
            res = conn.getresponse()
            res.read()
            assert res.status == 404, "%s -> %d" % (cache, res.status)
        print("[PASS] profils/fabricants/ servi, profils utilisateur masques")

        # 27. Un chemin complet tape hors des racines n'elargit PLUS la liste
        # des racines : la racine par defaut reste celle ou l'on cree.
        avant = web_CAO.racines_projets()
        hors = os.path.join(os.path.dirname(DOSSIER_ROOT), "_hors_racine_test", "carte")
        assert web_CAO.chemin_projet(hors) == os.path.abspath(hors)
        assert web_CAO.racines_projets() == avant, web_CAO.racines_projets()
        assert web_CAO.chemin_projet("carte PIR").startswith(avant[0])
        try:
            web_CAO.chemin_projet(os.path.abspath(os.sep))
            assert False, "la racine d'un disque ne doit pas etre un projet"
        except web_CAO.ErreurProjet as exc:
            assert exc.code == 400
        web_CAO.PROJETS_OUVERT = False
        try:
            web_CAO.chemin_projet(hors)
            assert False, "hors racine en ecoute reseau : doit etre refuse"
        except web_CAO.ErreurProjet as exc:
            assert exc.code == 403
        finally:
            web_CAO.PROJETS_OUVERT = True
        print("[PASS] chemin_projet : les racines declarees ne bougent plus")

        # 28. DNS rebinding : un DNS qui repond une IP publique au controle
        # de l'URL puis 127.0.0.1 a la connexion. La connexion verifiee juge
        # l'adresse A LAQUELLE elle se connecte, et refuse.
        import socket as _s
        vrai_gai = _s.getaddrinfo
        appels = []
        def dns_changeant(hote, port, *a, **k):
            appels.append(hote)
            ip = "93.184.216.34" if len(appels) == 1 else "127.0.0.1"
            return [(_s.AF_INET, _s.SOCK_STREAM, 6, "", (ip, port or 80))]
        _s.getaddrinfo = dns_changeant
        try:
            url = web_CAO._valider_url_telechargement("http://rebind.example/fiche.pdf")
            ouvreur = web_CAO.ouvreur_telechargement(url)
            try:
                ouvreur.open(url, timeout=5)
                assert False, "rebinding vers 127.0.0.1 non bloque"
            except OSError as exc:
                assert "privee ou locale" in str(exc), exc
        finally:
            _s.getaddrinfo = vrai_gai
        assert len(appels) == 2, appels
        for ip in ("127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "169.254.1.1"):
            try:
                web_CAO._verifier_ip_publique(ip)
                assert False, "%s acceptee" % ip
            except ValueError:
                pass
        web_CAO._verifier_ip_publique("93.184.216.34")
        print("[PASS] Datasheets : IP verifiee a la connexion (DNS rebinding bloque)")

        # 29. Passerelle MCP : un refus des la premiere requete (initialize)
        # doit remonter avec son code et son message, pas en « Erreur interne ».
        import http.server as _hs
        class Refus(_hs.BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length") or 0))
                corps = b"quota depasse"
                self.send_response(429)
                self.send_header("Content-Length", str(len(corps)))
                self.end_headers()
                self.wfile.write(corps)
            def log_message(self, *a):
                pass
        faux = _hs.HTTPServer(("127.0.0.1", 0), Refus)
        threading.Thread(target=faux.serve_forever, daemon=True).start()
        try:
            import passerelle_mcp
            client = passerelle_mcp.ClientMCP(url="http://127.0.0.1:%d/mcp" % faux.server_address[1], timeout=5)
            try:
                client.appeler("jlc_search", {"query": "10k"})
                assert False, "le refus aurait du remonter"
            except passerelle_mcp.ErreurPasserelle as exc:
                assert exc.code == 429 and "quota" in exc.message, (exc.code, exc.message)
            try:
                client.appeler("jlc_search", ["pas", "un", "objet"])
                assert False, "arguments non objet acceptes"
            except passerelle_mcp.ErreurPasserelle as exc:
                assert exc.code == 400
        finally:
            faux.shutdown()
            faux.server_close()
        print("[PASS] Passerelle MCP : refus a l'ouverture de session remonte tel quel")

        # 30. Origine : ce serveur-ci seulement, plus tout le reseau prive.
        web_CAO.PROJETS_OUVERT = True
        for origine, attendu in (("http://127.0.0.1:%d" % port, 200),
                                 ("http://192.168.1.50:8000", 403),
                                 ("http://127.0.0.1:1", 403),
                                 ("null", 403)):
            conn.request("POST", "/api/pcb/score-placement", body=payload_pcb,
                         headers={"Content-Type": "application/json", "Origin": origine})
            res = conn.getresponse()
            res.read()
            assert res.status == attendu, "Origin %s : %d au lieu de %d" % (origine, res.status, attendu)
        conn.request("GET", "/api/ia/cle", headers={"Origin": "http://192.168.1.50:8000"})
        res = conn.getresponse()
        res.read()
        assert res.getheader("Access-Control-Allow-Origin") is None, "cle IA lisible par un autre appareil du LAN"
        assert res.getheader("X-Content-Type-Options") == "nosniff"
        print("[PASS] CORS/CSRF : seule l'origine du serveur est admise, nosniff pose")

        # 31. LIB : pas de page ni d'executable, pas de racine de disque.
        for nom in ("x.html", "x.bat", "x.svg", "x.json::$DATA"):
            conn.request("POST", "/api/lib/fichier",
                         body=json.dumps({"type": "pcb", "nom": nom, "contenu": "<script>"}).encode("utf-8"),
                         headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            res.read()
            assert res.status == 400, "%s : %d au lieu de 400" % (nom, res.status)
        web_CAO.chemin_lib_fichier("simulation", "modele.sub")     # lecture : admis
        try:
            web_CAO.definir_dossier_lib(os.path.abspath(os.sep), persister=False)
            assert False, "racine de disque acceptee comme LIB"
        except web_CAO.ErreurLib as exc:
            assert exc.code == 400
        print("[PASS] LIB : extensions de donnees seulement, racine de disque refusee")

        # 32. Flux NTFS : « ::$DATA » ne contourne plus la liste des caches.
        for chemin in ("/LIB_composants.csv::$DATA", "/config_lib.json::$DATA"):
            conn.request("GET", chemin)
            res = conn.getresponse()
            res.read()
            assert res.status == 404, "%s -> %d" % (chemin, res.status)
        print("[PASS] Flux NTFS ::$DATA masques (404)")

        # 33. Un projet.cao.json ne designe plus n'importe quel .json.
        import tempfile, urllib.parse as _up
        dossier = os.path.join(tempfile.mkdtemp(), "carte")
        os.makedirs(dossier)
        with open(os.path.join(dossier, "projet.cao.json"), "w", encoding="utf-8") as f:
            json.dump({"format": "cao-projet-1", "nom": "carte",
                       "fichiers": {"schema": "settings.json"}}, f)
        conn.request("PUT", "/api/projet/doc?doc=schema&chemin=" + _up.quote(dossier),
                     body=b'{"a": 1}', headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        data = json.loads(res.read().decode("utf-8"))
        assert res.status == 200 and data["fichier"] == "carte-SCH.json", data
        assert not os.path.exists(os.path.join(dossier, "settings.json"))
        print("[PASS] Projet : nom de document limite au suffixe de l'outil")

    finally:
        conn.close()
        httpd.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    test_routes()
    print("\n TOUTES LES ROUTES DU SERVEUR ET SÉCURITÉS SONT VALIDÉES AVEC SUCCÈS.")
