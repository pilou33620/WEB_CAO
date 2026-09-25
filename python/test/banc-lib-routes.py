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

# Assurer l'import de web_CAO
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
import web_CAO

PORT = 8991
BASE_URL = f"http://127.0.0.1:{PORT}"

class TestLibRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        web_CAO.ROOT = ROOT
        cls.httpd = web_CAO.ThreadedServer(("127.0.0.1", PORT), web_CAO.CustomHandler)
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
            urllib.request.urlopen(f"{BASE_URL}/api/lib/fichier?type=pcb&nom=../../web_CAO.py")
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


class TestLibDossierTemporaire(unittest.TestCase):
    """Les essais qui ECRIVENT : une bibliotheque jetable hors du depot.

    L'enregistrement du catalogue recopie aussi le CSV a la racine du depot :
    celui-ci est sauve avant chaque essai et remis tel quel apres, de meme que
    config_lib.json et l'etat global du serveur.
    """
    PORT = PORT + 1

    @classmethod
    def setUpClass(cls):
        web_CAO.ROOT = ROOT
        cls.httpd = web_CAO.ThreadedServer(("127.0.0.1", cls.PORT), web_CAO.CustomHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        import shutil
        import tempfile
        self.base = f"http://127.0.0.1:{self.PORT}"
        self.tmp = tempfile.mkdtemp(prefix="webcao_lib_")
        shutil.copy2(os.path.join(ROOT, "LIB", "LIB_composants.csv"), self.tmp)
        os.makedirs(os.path.join(self.tmp, "lib_empreinte_pcb"))
        self.sauvegardes = {}
        for nom in ("LIB_composants.csv", "config_lib.json"):
            chemin = os.path.join(ROOT, nom)
            self.sauvegardes[chemin] = (open(chemin, "rb").read()
                                        if os.path.exists(chemin) else None)
        self.etat = (web_CAO.DOSSIER_LIB_ACTIF, web_CAO.DOSSIER_LIB_IMPOSE,
                     web_CAO.PROJETS_OUVERT)

    def tearDown(self):
        import shutil
        (web_CAO.DOSSIER_LIB_ACTIF, web_CAO.DOSSIER_LIB_IMPOSE,
         web_CAO.PROJETS_OUVERT) = self.etat
        for chemin, contenu in self.sauvegardes.items():
            if contenu is None:
                if os.path.exists(chemin):
                    os.remove(chemin)
            else:
                with open(chemin, "wb") as f:
                    f.write(contenu)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _json(self, url, corps=None):
        req = urllib.request.Request(
            self.base + url,
            data=None if corps is None else json.dumps(corps).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="GET" if corps is None else "POST")
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def test_12_catalogue_enregistre_sans_ligne_vide_et_relu_a_l_identique(self):
        web_CAO.definir_dossier_lib(self.tmp, initialiser=False, persister=False)
        cat = self._json("/api/lib/composants")
        total = cat["total"]
        # le cas qui cassait la relecture : un champ sur deux lignes, avec
        # le separateur et des guillemets dedans
        piege = 'ligne 1\nligne 2 ; "cite"'
        cat["composants"][3]["Description"] = piege
        self._json("/api/lib/composants", {"colonnes": cat["colonnes"],
                                           "composants": cat["composants"]})

        brut = open(os.path.join(self.tmp, "LIB_composants.csv"), "rb").read()
        self.assertNotIn(b"\r\r\n", brut, "fins de ligne doublees a l'ecriture")
        self.assertNotIn(b"\r\n\r\n", brut, "ligne vide dans le CSV enregistre")

        relu = self._json("/api/lib/composants")
        self.assertEqual(relu["total"], total)
        self.assertEqual(relu["colonnes"], cat["colonnes"])
        self.assertEqual(relu["composants"][3]["Description"], piege)
        self.assertEqual(relu["composants"][4]["Part Name"],
                         cat["composants"][4]["Part Name"])

    def test_12b_corps_trop_gros_refuse_en_413_et_non_en_500(self):
        web_CAO.definir_dossier_lib(self.tmp, initialiser=False, persister=False)
        ancien = web_CAO.MAX_LIB
        web_CAO.MAX_LIB = 1024
        try:
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                self._json("/api/lib/composants",
                           {"colonnes": ["Part Name"],
                            "composants": [{"Part Name": "x" * 4096}]})
            self.assertEqual(ctx.exception.code, 413)
        finally:
            web_CAO.MAX_LIB = ancien

    def test_13_catalogue_ancien_format_crcrlf_toujours_lisible(self):
        chemin = os.path.join(self.tmp, "LIB_composants.csv")
        propre = open(chemin, "rb").read()
        with open(chemin, "wb") as f:
            f.write(propre.replace(b"\r\n", b"\r\r\n"))
        web_CAO.definir_dossier_lib(self.tmp, initialiser=False, persister=False)
        cat = self._json("/api/lib/composants")
        self.assertGreater(cat["total"], 500)
        self.assertTrue(all(c.get("Part Name") for c in cat["composants"]),
                        "une ligne vide est devenue un composant")

    def test_14_lib_en_ligne_de_commande_non_persistee(self):
        cfg = os.path.join(ROOT, "config_lib.json")
        if os.path.exists(cfg):
            os.remove(cfg)
        web_CAO.DOSSIER_LIB_ACTIF = None
        web_CAO.definir_dossier_lib(self.tmp, initialiser=False, persister=False)
        self.assertEqual(os.path.realpath(web_CAO.dossier_lib()),
                         os.path.realpath(self.tmp))
        self.assertFalse(os.path.exists(cfg),
                         "--lib ne doit pas s'ecrire dans config_lib.json")
        # le choix fait depuis la page d'accueil, lui, se retient
        web_CAO.definir_dossier_lib(self.tmp, initialiser=False)
        self.assertTrue(os.path.exists(cfg))

    def test_15_lib_statique_suit_le_dossier_actif(self):
        with open(os.path.join(self.tmp, "lib_empreinte_pcb", "_marqueur.json"),
                  "w", encoding="utf-8") as f:
            f.write('{"marqueur": "dossier actif"}')
        web_CAO.definir_dossier_lib(self.tmp, initialiser=False, persister=False)
        url = self.base + "/LIB/lib_empreinte_pcb/_marqueur.json"

        # ecoute locale : la bibliotheque hors du depot est servie
        web_CAO.PROJETS_OUVERT = True
        with urllib.request.urlopen(url) as resp:
            self.assertIn(b"dossier actif", resp.read())

        # ecoute reseau : un dossier hors du depot ne s'ouvre pas
        web_CAO.PROJETS_OUVERT = False
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(url)
        self.assertEqual(ctx.exception.code, 404)

        # et la remontee hors de la bibliotheque reste refusee
        web_CAO.PROJETS_OUVERT = True
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/LIB/..%2F..%2Fweb_CAO.py")
        self.assertIn(ctx.exception.code, (400, 403, 404))


if __name__ == "__main__":
    unittest.main()

