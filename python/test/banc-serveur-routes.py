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
        # le meme document, compresse en gzip et avec une table de grilles :
        # la page envoie ainsi les grosses cartes (`simCorpsJson`)
        import gzip
        doc_g = dict(doc, cavites_grilles={"g0": {"pas": 0.5, "lignes": []}},
                     vias=[{"x": 0, "y": 0, "cavite_grille": "g0"}])
        conn.request("POST", "/api/analyse-carte", body=gzip.compress(json.dumps(doc_g).encode("utf-8")),
                     headers={"Content-Type": "application/json", "Content-Encoding": "gzip"})
        res = conn.getresponse()
        assert res.status == 200, res.read()
        assert [k["regle"] for k in json.loads(res.read().decode("utf-8"))["constats"]][:2] == ["orphelin", "angle_droit"]
        depl = web_CAO._deplier_grilles(json.loads(json.dumps(doc_g)))
        assert "cavites_grilles" not in depl and depl["vias"][0]["cavite_grille"]["pas"] == 0.5, depl
        conn.request("POST", "/api/analyse-carte", body=b"pas du gzip",
                     headers={"Content-Type": "application/json", "Content-Encoding": "gzip"})
        res = conn.getresponse()
        assert res.status == 400 and "gzip" in json.loads(res.read().decode("utf-8"))["detail"]
        print("[PASS] GET/POST /api/analyse-carte")

        # 4c. Les echecs d'un calcul s'ecrivent dans le terminal avec leur
        # code ; une page fermee en plein calcul sort en 499
        import io, socket
        vrai_err, sys.stderr = sys.stderr, io.StringIO()
        vrai_analyser = web_CAO.analyse_carte.analyser_document
        try:
            conn.request("POST", "/api/analyse-carte", body=b'{"format": "autre"}',
                         headers={"Content-Type": "application/json"})
            conn.getresponse().read()
            web_CAO.analyse_carte.analyser_document = lambda d: (time.sleep(0.5), vrai_analyser(d))[1]
            corps = json.dumps(doc).encode("utf-8")
            s = socket.create_connection(("127.0.0.1", port))
            s.sendall(b"POST /api/analyse-carte HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                      b"Content-Type: application/json\r\nContent-Length: %d\r\n\r\n"
                      % len(corps) + corps)
            s.close()                       # la page se ferme pendant le calcul
            time.sleep(1.5)
            journal = sys.stderr.getvalue()
        finally:
            web_CAO.analyse_carte.analyser_document = vrai_analyser
            sys.stderr = vrai_err
        assert "ERREUR 422 /api/analyse-carte" in journal, journal
        assert "ERREUR 499 /api/analyse-carte" in journal, journal
        print("[PASS] erreurs de calcul et page fermee : codes dans le terminal")

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

        # 19 bis. POST /api/thermique-composants : l'echauffement d'un composant qui dissipe
        conn.request("POST", "/api/thermique-composants",
                     body=json.dumps({"thermique": {"epaisseur_stratifie": 1.6},
                                      "composants": [{"ref": "D1", "puissance_w": 1, "surface_mm2": 400,
                                                      "source_mm2": 12, "cuivre_um": 35}]}).encode("utf-8"),
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 200, res.read()[:300]
        data = json.loads(res.read().decode("utf-8"))
        assert data["composants"][0]["ref"] == "D1" and 30 < data["composants"][0]["dT"] < 90, data
        conn.request("POST", "/api/thermique-composants", body=b'{"composants": []}',
                     headers={"Content-Type": "application/json"})
        res = conn.getresponse()
        assert res.status == 422, res.status
        res.read()
        print("[PASS] POST /api/thermique-composants (%.0f K, refus propre)" % data["composants"][0]["dT"])

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
        # Toute IP du poste est acceptee (un Pi a plusieurs adresses), un nom
        # quelconque non.
        for hote, attendu in (("[::1]:%d" % port, 200), ("[evil]:80", 403),
                              ("[", 403), ("LocalHost:%d" % port, 200),
                              ("192.168.1.30:%d" % port, 200),
                              ("evil.example:%d" % port, 403)):
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
            res.read()
            assert res.status == 404, "la route de la cle IA est retiree : %d" % res.status
        finally:
            web_CAO.PROJETS_OUVERT = True
        print("[PASS] Ecoute reseau : LIB en lecture seule (403) ; plus de route de cle IA (404)")

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
        conn.request("GET", "/api/lib/fichiers", headers={"Origin": "http://192.168.1.50:8000"})
        res = conn.getresponse()
        res.read()
        assert res.getheader("Access-Control-Allow-Origin") is None, "LIB lisible par une page d'un autre appareil du LAN"
        assert res.getheader("X-Content-Type-Options") == "nosniff"
        print("[PASS] CORS/CSRF : seule l'origine du serveur est admise, nosniff pose")
        # 30a. Datasheet en local : un corps JSON qui n'est pas un objet est un
        # refus (400), pas une « Erreur interne » 500.
        for corps in (b"null", b"[1]"):
            conn.request("POST", "/api/datasheet/telecharger", body=corps,
                         headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            res.read()
            assert res.status == 400, "datasheet, corps %r : %d au lieu de 400" % (corps, res.status)
        print("[PASS] Datasheet : corps JSON non objet refuse (400)")

        # 30b. Telephone serveur hors des plages privees classiques (partage de
        # connexion, 4G, Tailscale 100.64/10, liaison directe 169.254) : sa propre
        # page doit pouvoir ecrire. Un 403 CSRF y laissait lire le projet sans
        # pouvoir l'enregistrer. Une autre origine reste refusee.
        vrai_ip = web_CAO.get_local_ip
        try:
            for ip in ("100.84.12.7", "169.254.20.3"):
                web_CAO.get_local_ip = lambda ip=ip: ip
                for origine, attendu in (("http://%s:8000" % ip, 200),
                                         ("http://%s:9999" % ip, 403),
                                         ("http://evil.example", 403),
                                         ("null", 403)):
                    conn.request("POST", "/api/pcb/score-placement", body=payload_pcb,
                                 headers={"Content-Type": "application/json", "Origin": origine,
                                          "Host": "%s:8000" % ip})
                    res = conn.getresponse()
                    res.read()
                    assert res.status == attendu, "%s, Origin %s : %d au lieu de %d" % (
                        ip, origine, res.status, attendu)
        finally:
            web_CAO.get_local_ip = vrai_ip
        print("[PASS] CSRF : serveur sur une IP hors plages privees, sa page ecrit, les autres non")

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

        # 31 bis. Modeles STEP de la LIB : lus pour l'export STEP, jamais ecrits ni effaces.
        assert web_CAO.chemin_lib_fichier("step", "0402C.stp").endswith(os.path.join("Models", "0402C.stp"))
        for nom, creer in (("x.json", False), ("x.stp", True), ("../x.stp", False)):
            try:
                web_CAO.chemin_lib_fichier("step", nom, creer=creer)
                assert False, "STEP %s (creer=%s) accepte" % (nom, creer)
            except web_CAO.ErreurLib as exc:
                assert exc.code == 400
        conn.request("DELETE", "/api/lib/fichier?type=step&nom=0402C.stp")
        res = conn.getresponse()
        res.read()
        assert res.status in (400, 403, 405), "effacer un STEP : %d" % res.status
        print("[PASS] LIB : modeles STEP en lecture seule (.stp, .step)")

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

        # 34. L'heure de la derniere sauvegarde suit l'ecriture du document :
        # l'accueil l'affiche, et celle du seul projet.cao.json ne bougeait pas.
        ecrit = data.get("modifie")
        assert isinstance(ecrit, int) and ecrit > 0, data
        conn.request("GET", "/api/projet?chemin=" + _up.quote(dossier))
        res = conn.getresponse()
        lu = json.loads(res.read().decode("utf-8"))
        assert res.status == 200, lu
        assert lu["documents"]["schema"]["modifie"] == ecrit, lu["documents"]
        assert lu["documents"]["pcb"]["modifie"] == 0, lu["documents"]
        assert lu["sauve"] >= ecrit, lu
        os.utime(os.path.join(dossier, "projet.cao.json"), (1, 1))   # fichier projet ancien
        assert web_CAO.derniere_sauvegarde(dossier) == ecrit
        print("[PASS] Projet : heure de la derniere sauvegarde (document, dossier)")

        # 35. Ecriture conditionnelle : la date vue par la page est fausse (le
        # fichier a change ailleurs) -> 409 ; la bonne date ou pas de date -> 200.
        url = "/api/projet/doc?doc=schema&chemin=" + _up.quote(dossier)
        for vu, attendu in ((ecrit - 5000, 409), (ecrit, 200), (None, 200)):
            conn.request("PUT", url + ("&modifie=%d" % vu if vu is not None else ""),
                         body=b'{"a": 2}', headers={"Content-Type": "application/json"})
            res = conn.getresponse()
            rep = json.loads(res.read().decode("utf-8"))
            assert res.status == attendu, (vu, res.status, rep)
        print("[PASS] Projet : document modifie ailleurs -> 409, sinon ecrit")

        # 36. Deux ecritures simultanees du meme document : le fichier reste
        # du JSON entier (un .tmp commun melangeait les deux).
        gros = [json.dumps({"k": "x" * 400000}).encode(), json.dumps({"k": "y" * 300000}).encode()]
        erreurs = []

        def ecrire(corps):
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
            try:
                c.request("PUT", url, body=corps, headers={"Content-Type": "application/json"})
                r = c.getresponse()
                r.read()
                if r.status != 200:
                    erreurs.append(r.status)
            finally:
                c.close()
        for _ in range(15):
            fils = [threading.Thread(target=ecrire, args=(g,)) for g in gros]
            for f in fils:
                f.start()
            for f in fils:
                f.join()
            with open(os.path.join(dossier, "carte-SCH.json"), encoding="utf-8") as f:
                assert json.load(f)["k"][0] in "xy"
        assert not erreurs, erreurs
        assert not [n for n in os.listdir(dossier) if n.endswith(".tmp")]
        print("[PASS] Projet : ecritures simultanees, fichier toujours entier")

        # 36 bis. Brouillon (sauvegarde automatique) : ecrit a cote du document
        # sans 409, relu avec sa date, absent du releve, efface par DELETE --
        # qui n'efface jamais le document ; memes gardes que le document.
        def req(methode, route, corps=None, entetes=None):
            conn.request(methode, route, body=corps,
                         headers=dict({"Content-Type": "application/json"}, **(entetes or {})))
            r = conn.getresponse()
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
        brou = url + "&brouillon=1"
        st, rep = req("PUT", brou + "&modifie=1", b'{"b": 1}')    # date fausse : pas de 409
        assert st == 200 and rep["fichier"] == "carte-SCH.brouillon.json", (st, rep)
        assert os.path.isfile(os.path.join(dossier, "carte-SCH.brouillon.json"))
        with open(os.path.join(dossier, "carte-SCH.json"), encoding="utf-8") as f:
            assert "b" not in json.load(f)                       # le document n'a pas bouge
        st, rep = req("GET", brou)
        assert st == 200 and rep["document"] == {"b": 1} and rep["modifie"] > 0, (st, rep)
        st, rep = req("GET", url)
        assert st == 200 and "b" not in rep["document"], rep
        st, lu = req("GET", "/api/projet?chemin=" + _up.quote(dossier))
        assert lu["documents"]["schema"]["fichier"] == "carte-SCH.json", lu["documents"]
        assert web_CAO.derniere_sauvegarde(dossier) == lu["documents"]["schema"]["modifie"]
        # seul le brouillon reste : le repli au suffixe ne le prend pas pour le document
        os.rename(os.path.join(dossier, "carte-SCH.json"), os.path.join(dossier, "_sch"))
        st, lu = req("GET", "/api/projet?chemin=" + _up.quote(dossier))
        assert lu["documents"]["schema"]["present"] is False, lu["documents"]
        assert req("GET", url)[0] == 404
        os.rename(os.path.join(dossier, "_sch"), os.path.join(dossier, "carte-SCH.json"))
        # memes gardes : autre origine (CSRF), puis hors racine en ecoute reseau
        for m, c in (("PUT", b'{"x": 1}'), ("DELETE", None)):
            assert req(m, brou, c, {"Origin": "http://evil.example"})[0] == 403, m
        avant = web_CAO.PROJETS_OUVERT, web_CAO.PROJETS_RESEAU
        web_CAO.PROJETS_OUVERT, web_CAO.PROJETS_RESEAU = False, True
        try:
            for m, c in (("GET", None), ("PUT", b'{"x": 1}'), ("DELETE", None)):
                assert req(m, brou, c)[0] == 403, m
        finally:
            web_CAO.PROJETS_OUVERT, web_CAO.PROJETS_RESEAU = avant
        st, rep = req("GET", brou)
        assert rep["document"] == {"b": 1}, rep                  # rien n'a ete ecrit ni efface
        assert req("DELETE", url)[0] == 405                      # sans brouillon=1 : refuse
        assert os.path.isfile(os.path.join(dossier, "carte-SCH.json"))
        assert req("DELETE", brou) == (200, {"ok": True})
        assert not os.path.exists(os.path.join(dossier, "carte-SCH.brouillon.json"))
        assert req("DELETE", brou)[0] == 200                     # absent : pas une erreur
        assert req("GET", brou)[0] == 404
        print("[PASS] Projet : brouillon ecrit sans 409, relu, efface, hors releve, memes gardes")

        # 37. Une grille de cavite qui se cite elle-meme ne bloque plus le serveur.
        doc = web_CAO._deplier_grilles({"cavites_grilles": {"a": {"cavite_grille": "a"}},
                                        "v": {"cavite_grille": "a"}})
        assert doc["v"]["cavite_grille"] == {"cavite_grille": "a"}
        print("[PASS] Grilles de cavite : pas de boucle sur une grille qui se cite")

        # 38. Content-Length negatif : 400, pas de lecture sans fin.
        import socket
        s = socket.create_connection(("127.0.0.1", port), timeout=5)
        try:
            s.sendall(b"PUT /api/profil?nom=neg HTTP/1.1\r\nHost: 127.0.0.1\r\n"
                      b"Content-Type: application/json\r\nContent-Length: -1\r\n\r\n")
            ligne = s.recv(64)                  # avant : aucune reponse, fil bloque
            assert b" 400 " in ligne.split(b"\r\n")[0], ligne
        finally:
            s.close()
        assert not os.path.exists(os.path.join(web_CAO.dossier_profils(), "neg.json"))
        print("[PASS] Content-Length negatif refuse")

        # 39. Fichiers caches insensibles a la casse (disques macOS / Windows).
        h = web_CAO.CustomHandler.__new__(web_CAO.CustomHandler)
        for nom in ("API_KEY_free_ia_studio.txt", "Profils/x.json", "LIB_COMPOSANTS.CSV"):
            assert h._hidden(os.path.join(web_CAO.ROOT, nom)), nom
        print("[PASS] Fichiers caches : casse ignoree")

        # 40. Appairage : la pause double a chaque code brule d'affilee, plafond
        # 1 h, et repart de 60 s apres un succes.
        import appairage
        a = appairage.Appairage(afficher=lambda t: None)
        pauses = []
        for _ in range(8):
            a.bloque = 0.0
            a.preparer()
            for _ in range(a.ESSAIS):
                ok, _msg = a.essayer("x")
            pauses.append(round(a.bloque - time.monotonic()))
        assert pauses[:3] == [60, 120, 240] and pauses[-1] == 3600, pauses
        a.bloque = 0.0
        a.preparer()
        assert a.essayer(a.code)[0] and a.grilles == 0
        print("[PASS] Appairage : pause doublee a chaque code brule (60 s -> 1 h)")

        # 41. Canal de pilotage (pilote.py, module canal-pilote du MCP de web_suite) :
        # une page bat, le MCP de ce poste voit l'onglet ; une autre origine est refusée
        def pilote(methode, route, corps=None, origine=None):
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
            entetes = {"Content-Type": "application/json"}
            if origine:
                entetes["Origin"] = origine
            c.request(methode, route, body=None if corps is None else json.dumps(corps), headers=entetes)
            r = c.getresponse()
            donnees = r.read()
            c.close()
            return r.status, (json.loads(donnees) if donnees[:1] == b"{" else None)
        onglet = {"id": "o1", "page": "pcb", "projet": "essai", "focus_il_y_a": 0}
        assert pilote("POST", "/api/pilote/battement", {"navigateur": "n1", "onglets": [onglet]},
                      origine="http://evil.example")[0] == 403
        assert pilote("POST", "/api/pilote/battement", {"navigateur": "n1", "onglets": [onglet]},
                      origine="http://127.0.0.1:%d" % port)[0] == 200
        code, liste = pilote("GET", "/api/pilote/onglets")
        assert code == 200 and [o["id"] for o in liste["onglets"]] == ["o1"], liste
        print("[PASS] Canal de pilotage : battement de la page, onglets vus par le MCP, autre origine refusée")

        # 42. Pas d'affichage dans le cadre d'un autre site (clic piégé sur « Appliquer » du panneau Claude)
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        c.request("GET", "/index.html")
        r = c.getresponse(); r.read(); c.close()
        assert r.getheader("X-Frame-Options") == "SAMEORIGIN", r.getheader("X-Frame-Options")
        assert "frame-ancestors 'self'" in (r.getheader("Content-Security-Policy") or "")
        print("[PASS] Cadres : même origine seulement (X-Frame-Options, frame-ancestors)")

        # 43. Lier un modele de simulation a une reference (MCP lib_simulation_lier) : seule la case
        # « Modèle Simulation » de cette ligne change, les autres lignes restent octet pour octet.
        import tempfile as _tf
        lib = _tf.mkdtemp(prefix="webcao_lier_")
        os.makedirs(os.path.join(lib, "lib_simulation"))
        for f in ("as179_b.s3p", "r.sub"):
            open(os.path.join(lib, "lib_simulation", f), "w").close()
        csv_ = os.path.join(lib, "LIB_composants.csv")
        brut = ("Part Name;Value;Description;Modèle Simulation\r\nR1;1k;\"sur\r\ndeux lignes\";\r\n"
                "AS179;;switch;lib/simulation/as179_a.s3p\r\nC1;;\"a;b\";-\r\n").encode("latin1")
        with open(csv_, "wb") as f:
            f.write(brut)
        actif = web_CAO.DOSSIER_LIB_ACTIF
        web_CAO.definir_dossier_lib(lib, initialiser=False, persister=False)

        def lier(part, modele):
            conn.request("POST", "/api/lib/composants", headers={"Content-Type": "application/json"},
                         body=json.dumps({"lier_simulation": {"part": part, "modele": modele}}).encode("utf-8"))
            r = conn.getresponse()
            return r.status, json.loads(r.read().decode("utf-8"))
        try:
            code, rep = lier("as179", "lib/simulation/as179_b.s3p")
            assert code == 200 and rep["modeles"] == ["lib/simulation/as179_a.s3p", "lib/simulation/as179_b.s3p"], rep
            apres = open(csv_, "rb").read()
            assert apres == brut.replace(b"as179_a.s3p\r\n", b"as179_a.s3p | lib/simulation/as179_b.s3p\r\n"), apres
            code, rep = lier("AS179", "lib/simulation/as179_b.s3p")
            assert code == 200 and rep.get("deja") and open(csv_, "rb").read() == apres, rep
            code, rep = lier("C1", "lib/simulation/r.sub")       # « - » vaut « rien de lie »
            assert code == 200 and rep["modeles"] == ["lib/simulation/r.sub"], rep
            assert open(csv_, "rb").read().endswith(b'C1;;"a;b";lib/simulation/r.sub\r\n')
            avant = open(csv_, "rb").read()
            for part, modele, attendu in (("X", "lib/simulation/r.sub", 404), ("R1", "lib/simulation/absent.s2p", 404),
                                          ("R1", "lib/simulation/../r.sub", 400), ("R1", "r.sub", 400),
                                          ("R1", "lib/simulation/x.html", 400), ("", "lib/simulation/r.sub", 400)):
                code, rep = lier(part, modele)
                assert code == attendu, (part, modele, code, rep)
            assert open(csv_, "rb").read() == avant, "un refus a ecrit"
            with open(csv_, "wb") as f:                             # colonne absente : ajoutee en fin d'en-tete
                f.write(b"Part Name;Value\nR1;1k\nR2;2k\n")
            code, rep = lier("R2", "lib/simulation/r.sub")
            assert code == 200 and open(csv_, "rb").read() == (
                "Part Name;Value;Modèle Simulation\nR1;1k\nR2;2k;lib/simulation/r.sub\n").encode("utf-8"), rep
        finally:
            web_CAO.DOSSIER_LIB_ACTIF = actif
        print("[PASS] LIB : lier un modele de simulation reecrit une seule case (octets des autres lignes gardes)")

        # 44. Modifier une reference existante (MCP lib_composant_modifier) : seules les cases donnees
        # changent, la ligne lue a change = 409, les autres lignes restent octet pour octet.
        brut = ("Part Name;Value;Description;Brochage\r\nR1;1k;\"sur\r\ndeux lignes\";\r\n"
                "U1;;ldo;IN=1,GND=2\r\nC1;;\"a;b\";\r\n").encode("latin1")
        with open(csv_, "wb") as f:
            f.write(brut)
        web_CAO.definir_dossier_lib(lib, initialiser=False, persister=False)

        def modifier(demande):
            conn.request("POST", "/api/lib/composants", headers={"Content-Type": "application/json"},
                         body=json.dumps({"modifier": demande}).encode("utf-8"))
            r = conn.getresponse()
            return r.status, json.loads(r.read().decode("utf-8"))
        try:
            code, rep = modifier({"part": "u1", "champs": {"Brochage": "IN=1,GND=2,OUT=3", "Value": " 3.3V "},
                                  "avant": {"Brochage": "IN=1,GND=2", "Value": ""}})
            assert code == 200 and rep["champs"] == {"Brochage": "IN=1,GND=2,OUT=3", "Value": "3.3V"}, rep
            apres = open(csv_, "rb").read()
            assert apres == brut.replace(b"U1;;ldo;IN=1,GND=2\r\n", b"U1;3.3V;ldo;IN=1,GND=2,OUT=3\r\n"), apres
            for demande, attendu in (
                    ({"part": "U1", "champs": {"Value": "5V"}, "avant": {"Value": ""}}, 409),     # lue avant le changement
                    ({"part": "X", "champs": {"Value": "1"}}, 404),
                    ({"part": "U1", "champs": {"Part Name": "U2"}}, 400),
                    ({"part": "U1", "champs": {"Inconnue": "1"}}, 400),
                    ({"part": "U1", "champs": {"Value": "=1+1"}}, 400),
                    ({"part": "U1", "champs": {}}, 400)):
                code, rep = modifier(demande)
                assert code == attendu, (demande, code, rep)
            assert open(csv_, "rb").read() == apres, "un refus a ecrit"
        finally:
            web_CAO.DOSSIER_LIB_ACTIF = actif
        print("[PASS] LIB : modifier une reference reecrit ses seules cases, refuse une ligne qui a change")

    finally:
        conn.close()
        httpd.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    test_routes()
    print("\n TOUTES LES ROUTES DU SERVEUR ET SÉCURITÉS SONT VALIDÉES AVEC SUCCÈS.")
