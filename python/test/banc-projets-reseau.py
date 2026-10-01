#!/usr/bin/env python3
"""
banc-projets-reseau.py
--projets-reseau : en ecoute reseau, les projets (sous les racines declarees)
et l'ecriture dans la LIB active s'ouvrent ; le reste reste local.
Autonome : une racine de projets et une LIB jetables, rien du depot.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
import web_CAO


class TestProjetsReseau(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="webcao_reseau_")
        self.racine = os.path.join(self.tmp, "CAO")
        self.lib = os.path.join(self.tmp, "LIB_CAO")
        os.makedirs(os.path.join(self.racine, "carte PIR"))
        os.makedirs(os.path.join(self.lib, "lib_empreinte_pcb"))
        with open(os.path.join(self.racine, "carte PIR", "projet.cao.json"), "w",
                  encoding="utf-8") as f:
            json.dump({"format": "cao-projet-1", "nom": "carte PIR"}, f)
        self.etat = (web_CAO.PROJETS_OUVERT, web_CAO.PROJETS_RESEAU,
                     web_CAO.RACINES_PROJETS, web_CAO.DOSSIER_LIB_ACTIF,
                     web_CAO.DOSSIER_LIB_IMPOSE)
        web_CAO.RACINES_PROJETS = [self.racine]
        web_CAO.definir_dossier_lib(self.lib, initialiser=False, persister=False)
        web_CAO.DOSSIER_LIB_IMPOSE = True
        web_CAO.PROJETS_OUVERT = False          # ecoute reseau
        self.httpd = web_CAO.ThreadedServer(("127.0.0.1", 0), web_CAO.CustomHandler)
        self.base = "http://127.0.0.1:%d" % self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        (web_CAO.PROJETS_OUVERT, web_CAO.PROJETS_RESEAU, web_CAO.RACINES_PROJETS,
         web_CAO.DOSSIER_LIB_ACTIF, web_CAO.DOSSIER_LIB_IMPOSE) = self.etat
        shutil.rmtree(self.tmp, ignore_errors=True)

    def code(self, methode, route, corps=None):
        req = urllib.request.Request(
            self.base + route, method=methode,
            data=json.dumps(corps).encode("utf-8") if corps is not None else None,
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as rep:
                return rep.status
        except urllib.error.HTTPError as exc:
            return exc.code

    def test_sans_option_tout_reste_ferme(self):
        web_CAO.PROJETS_RESEAU = False
        self.assertEqual(self.code("GET", "/api/projets"), 403)
        self.assertEqual(self.code("PUT", "/api/lib/fichier",
                                   {"type": "pcb", "nom": "x.json", "data": {}}), 403)

    def test_option_ouvre_projets_et_lib_seulement(self):
        web_CAO.PROJETS_RESEAU = True
        self.assertEqual(self.code("GET", "/api/projets"), 200)
        self.assertEqual(self.code("GET", "/api/projet?chemin=carte%20PIR"), 200)
        self.assertEqual(self.code("PUT", "/api/lib/fichier",
                                   {"type": "pcb", "nom": "x.json", "data": {"name": "x"}}), 200)
        self.assertTrue(os.path.isfile(os.path.join(self.lib, "lib_empreinte_pcb", "x.json")))
        # un chemin complet hors des racines : toujours refuse au reseau
        dehors = os.path.join(self.tmp, "ailleurs")
        os.makedirs(dehors)
        self.assertEqual(self.code("GET", "/api/projet?chemin=" +
                                   urllib.request.quote(dehors)), 403)
        # deplacer la LIB, la cle IA, les datasheets : toujours local
        self.assertEqual(self.code("POST", "/api/lib/config", {"chemin": dehors}), 403)
        self.assertEqual(self.code("GET", "/api/datasheet/ouvrir?fichier=a.pdf"), 403)


if __name__ == "__main__":
    unittest.main()
