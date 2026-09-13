#!/usr/bin/env python3
"""
banc-lib-routes.py
Banc de test pour les routes API de gestion des bibliothèques (/api/lib/...)
"""
import json
import os
import sys
import unittest
import urllib.request
import urllib.error
import threading
import time

# Assurer l'import de serveur
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
import serveur

PORT = 8991
BASE_URL = f"http://127.0.0.1:{PORT}"

class TestLibRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        serveur.ROOT = ROOT
        cls.httpd = serveur.ThreadedServer(("127.0.0.1", PORT), serveur.CustomHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_01_lib_fichiers(self):
        req = urllib.request.Request(f"{BASE_URL}/api/lib/fichiers")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("pcb", data)
            self.assertIn("schematique", data)
            self.assertIn("simulation", data)
            self.assertGreater(len(data["pcb"]), 0)
            self.assertGreater(len(data["schematique"]), 0)
            self.assertGreater(len(data["simulation"]), 0)
            self.assertIn("0603.json", data["pcb"])
            self.assertIn("resistor.json", data["schematique"])

    def test_02_lib_fichier_pcb(self):
        req = urllib.request.Request(f"{BASE_URL}/api/lib/fichier?type=pcb&nom=0603.json")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("type"), "pcb")
            self.assertEqual(data.get("nom"), "0603.json")
            fp = data.get("data")
            self.assertEqual(fp.get("name"), "0603")
            self.assertEqual(fp.get("pins"), 2)
            self.assertIsInstance(fp.get("pads"), list)

    def test_03_lib_fichier_schematique(self):
        req = urllib.request.Request(f"{BASE_URL}/api/lib/fichier?type=schematique&nom=resistor.json")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("type"), "schematique")
            sym = data.get("data")
            self.assertEqual(sym.get("id"), "resistor")
            self.assertEqual(sym.get("prefix"), "R")

    def test_04_lib_fichier_simulation(self):
        req = urllib.request.Request(f"{BASE_URL}/api/lib/fichier?type=simulation&nom=resistor.sub")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("type"), "simulation")
            self.assertIn("RESISTOR", data.get("contenu", ""))

    def test_05_lib_composants(self):
        req = urllib.request.Request(f"{BASE_URL}/api/lib/composants")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("colonnes", data)
            self.assertIn("composants", data)
            self.assertGreater(data.get("total", 0), 500)
            self.assertIn("Empreinte PCB", data["colonnes"])
            self.assertIn("Empreinte Schématique", data["colonnes"])
            self.assertIn("Modèle Simulation", data["colonnes"])

    def test_06_traversal_rejet(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(f"{BASE_URL}/api/lib/fichier?type=pcb&nom=../../serveur.py")
        self.assertEqual(ctx.exception.code, 400)

    def test_07_ia_cle(self):
        req = urllib.request.Request(f"{BASE_URL}/api/ia/cle")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("dispo", data)
            self.assertIn("cle", data)

    def test_08_creer_modifier_fichier_lib(self):
        # 1. Créer une nouvelle empreinte de test
        nom_test = "_test_tmp_fp.json"
        body_data = {
            "type": "pcb",
            "nom": nom_test,
            "data": {
                "format": "pcbfp-1",
                "name": "TEST_FP",
                "pkg": "TEST",
                "pins": 2,
                "pads": [
                    {"n": 1, "x": -1.0, "y": 0, "w": 0.8, "h": 1.0, "shape": "rect", "drill": 0, "rot": 0},
                    {"n": 2, "x": 1.0, "y": 0, "w": 0.8, "h": 1.0, "shape": "rect", "drill": 0, "rot": 0}
                ]
            }
        }
        req = urllib.request.Request(f"{BASE_URL}/api/lib/fichier",
                                     data=json.dumps(body_data).encode("utf-8"),
                                     headers={"Content-Type": "application/json"},
                                     method="POST")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            res = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(res.get("ok"))

        # 2. Relire le fichier créé
        req_get = urllib.request.Request(f"{BASE_URL}/api/lib/fichier?type=pcb&nom={nom_test}")
        with urllib.request.urlopen(req_get) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["data"]["name"], "TEST_FP")

        # 3. Supprimer le fichier de test pour laisser le dossier propre
        req_del = urllib.request.Request(f"{BASE_URL}/api/lib/fichier?type=pcb&nom={nom_test}", method="DELETE")
        with urllib.request.urlopen(req_del) as resp:
            self.assertEqual(resp.status, 200)

    def test_09_exact_39_colonnes_catalogue(self):
        colonnes_attendues = [
            "Part Name", "Part Type", "Description", "Par class",
            "Reference designator Prefix", "Number Of pins", "Maximun Height",
            "Standoof Height", "Value", "Device type", "Part Number",
            "Manufacturer", "manufacturer part Number", "Vendor",
            "Dielectrique", "vendor reference", "Source alternative",
            "2nd source P/N", "2nd source Manufacturer", "3nd source P/N",
            "3nd source Manufacturer", "4nd source P/N", "4nd source Manufacturer",
            "tolerance", "wattage", "fréquency", "PPM", "Voltage Rating",
            "current Rating", "Maximum operating temperature",
            "Minimum operating temperature", "Package type", "Dimenssions",
            "terminal pitch", "mounting type", "gender",
            "Empreinte PCB", "Empreinte Schématique", "Modèle Simulation"
        ]
        self.assertEqual(len(colonnes_attendues), 39)
        req = urllib.request.Request(f"{BASE_URL}/api/lib/composants")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            cols = data.get("colonnes", [])
            self.assertEqual(len(cols), 39)
            self.assertEqual(cols, colonnes_attendues)

    def test_10_lib_config_get(self):
        req = urllib.request.Request(f"{BASE_URL}/api/lib/config")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("chemin", data)
            self.assertIn("defaut", data)
            self.assertTrue(data.get("est_defaut"))
            self.assertTrue(data.get("existe"))
            self.assertIn("statistiques", data)
            self.assertGreater(data["statistiques"].get("composants", 0), 0)

    def test_11_lib_config_post_personnalise_et_reset(self):
        import shutil
        dossier_tmp = os.path.join(ROOT, "_test_tmp_lib_custom")
        if os.path.exists(dossier_tmp):
            shutil.rmtree(dossier_tmp, ignore_errors=True)

        try:
            # 1. Configurer un dossier personnalisé avec initialisation automatique
            payload = json.dumps({"chemin": dossier_tmp, "initialiser": True}).encode("utf-8")
            req = urllib.request.Request(f"{BASE_URL}/api/lib/config", data=payload, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(data.get("ok"))
                self.assertFalse(data.get("est_defaut"))
                self.assertGreater(data.get("fichiers_copies", 0), 0)
                self.assertTrue(os.path.exists(os.path.join(dossier_tmp, "LIB_composants.csv")))

            # 2. Vérifier que GET /api/lib/config reflète ce nouveau dossier
            req_get = urllib.request.Request(f"{BASE_URL}/api/lib/config")
            with urllib.request.urlopen(req_get) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.assertFalse(data.get("est_defaut"))
                self.assertEqual(os.path.realpath(data["chemin"]), os.path.realpath(dossier_tmp))

            # 3. Réinitialiser par défaut
            payload_reset = json.dumps({"chemin": "", "initialiser": False}).encode("utf-8")
            req_reset = urllib.request.Request(f"{BASE_URL}/api/lib/config", data=payload_reset, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req_reset) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(data.get("ok"))
                self.assertTrue(data.get("est_defaut"))

        finally:
            if os.path.exists(dossier_tmp):
                shutil.rmtree(dossier_tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()

