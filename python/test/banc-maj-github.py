#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
banc-maj-github.py
Banc d'essai unitaire pour le mécanisme de recherche et application automatique
des mises à jour GitHub au démarrage de serveur.py.
"""
import os
import sys
import unittest
from unittest.mock import patch, MagicMock
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import serveur


class TestMajGitHub(unittest.TestCase):
    """Tests unitaires pour verifier_et_appliquer_maj et redemarrer_application."""

    def test_01_git_non_installe(self):
        """Si Git n'est pas installé, la fonction retourne False sans lever d'erreur."""
        with patch("shutil.which", return_value=None):
            maj = serveur.verifier_et_appliquer_maj(ROOT)
            self.assertFalse(maj)

    def test_02_dossier_non_git(self):
        """Si le dossier n'est pas un dépôt Git, retourne False proprement."""
        with patch("shutil.which", return_value="git"):
            with patch("os.path.isdir", return_value=False):
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = MagicMock(returncode=128, stdout="", stderr="fatal: not a git repo")
                    maj = serveur.verifier_et_appliquer_maj(ROOT)
                    self.assertFalse(maj)

    def test_03_timeout_reseau_fetch(self):
        """Si la recherche GitHub dépasse le délai imparti, retourne False sans bloquer."""
        with patch("shutil.which", return_value="git"):
            with patch("os.path.isdir", return_value=True):
                with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="git fetch", timeout=10)):
                    maj = serveur.verifier_et_appliquer_maj(ROOT)
                    self.assertFalse(maj)

    def test_04_echec_reseau_fetch(self):
        """Si GitHub est inaccessible (erreur réseau), retourne False."""
        with patch("shutil.which", return_value="git"):
            with patch("os.path.isdir", return_value=True):
                with patch("subprocess.run") as mock_run:
                    mock_run.return_value = MagicMock(returncode=1, stderr="fatal: unable to access github")
                    maj = serveur.verifier_et_appliquer_maj(ROOT)
                    self.assertFalse(maj)

    def test_05_logiciel_deja_a_jour(self):
        """Si aucun commit distant n'est en retard, retourne False."""
        def fake_run(cmd, *args, **kwargs):
            if "fetch" in cmd:
                return MagicMock(returncode=0)
            if "rev-parse" in cmd:
                return MagicMock(returncode=0, stdout="origin/main\n")
            if "rev-list" in cmd:
                return MagicMock(returncode=0, stdout="0\n")
            return MagicMock(returncode=0)

        with patch("shutil.which", return_value="git"):
            with patch("os.path.isdir", return_value=True):
                with patch("subprocess.run", side_effect=fake_run):
                    maj = serveur.verifier_et_appliquer_maj(ROOT)
                    self.assertFalse(maj)

    def test_06_mise_a_jour_detectee_et_appliquee(self):
        """Si des commits distants sont disponibles, git pull est exécuté et retourne True."""
        commandes_executees = []

        def fake_run(cmd, *args, **kwargs):
            commandes_executees.append(cmd[0:2])
            if "fetch" in cmd:
                return MagicMock(returncode=0)
            if "rev-parse" in cmd:
                return MagicMock(returncode=0, stdout="origin/main\n")
            if "rev-list" in cmd:
                return MagicMock(returncode=0, stdout="2\n")
            if "status" in cmd:
                return MagicMock(returncode=0, stdout="")  # propre
            if "pull" in cmd:
                return MagicMock(returncode=0, stdout="Updating 4dccbb6..abcdef1\nFast-forward\n")
            return MagicMock(returncode=0)

        with patch("shutil.which", return_value="git"):
            with patch("os.path.isdir", return_value=True):
                with patch("subprocess.run", side_effect=fake_run):
                    maj = serveur.verifier_et_appliquer_maj(ROOT)
                    self.assertTrue(maj)
                    self.assertTrue(any("pull" in c for c in commandes_executees))

    def test_07_mise_a_jour_avec_modifications_locales_stash(self):
        """Si des modifications locales existent, stash puis pull puis stash pop."""
        commandes_executees = []

        def fake_run(cmd, *args, **kwargs):
            commandes_executees.append(" ".join(cmd[:3]))
            if "fetch" in cmd:
                return MagicMock(returncode=0)
            if "rev-parse" in cmd:
                return MagicMock(returncode=0, stdout="origin/main\n")
            if "rev-list" in cmd:
                return MagicMock(returncode=0, stdout="1\n")
            if "status" in cmd:
                return MagicMock(returncode=0, stdout=" M serveur.py\n")  # dirty
            if "stash" in cmd and "push" in cmd:
                return MagicMock(returncode=0)
            if "pull" in cmd:
                return MagicMock(returncode=0, stdout="Fast-forward\n")
            if "stash" in cmd and "pop" in cmd:
                return MagicMock(returncode=0)
            return MagicMock(returncode=0)

        with patch("shutil.which", return_value="git"):
            with patch("os.path.isdir", return_value=True):
                with patch("subprocess.run", side_effect=fake_run):
                    maj = serveur.verifier_et_appliquer_maj(ROOT)
                    self.assertTrue(maj)
                    self.assertTrue(any("stash push" in c for c in commandes_executees))
                    self.assertTrue(any("stash pop" in c for c in commandes_executees))

    def test_08_option_sans_maj_cli(self):
        """L'argument CLI --sans-maj désactive la recherche de mise à jour."""
        with patch("serveur.verifier_et_appliquer_maj") as mock_verifier:
            with patch("serveur.start_server", return_value=0):
                serveur.main(["--sans-maj", "--local", "--port", "0", "--sans-navigateur"])
                mock_verifier.assert_not_called()

    def test_09_variable_environnement_evite_boucle_redemarrage(self):
        """Si WEB_CAO_DEJA_MAJ=1 est présent dans os.environ, la recherche est ignorée."""
        with patch.dict(os.environ, {"WEB_CAO_DEJA_MAJ": "1"}):
            with patch("serveur.verifier_et_appliquer_maj") as mock_verifier:
                with patch("serveur.start_server", return_value=0):
                    serveur.main(["--local", "--port", "0", "--sans-navigateur"])
                    mock_verifier.assert_not_called()


if __name__ == "__main__":
    unittest.main()
