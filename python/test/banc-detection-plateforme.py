#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
banc-detection-plateforme.py
Banc d'essai unitaire pour la detection de plateforme (Windows vs Raspberry Pi vs terminal Linux)
et le choix d'ouverture automatique du navigateur au demarrage de web_CAO.py.
"""
import os
import sys
import unittest
from unittest.mock import patch, mock_open

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import web_CAO


class TestDetectionPlateforme(unittest.TestCase):
    """Tests unitaires pour sur_raspberry_pi, doit_ouvrir_navigateur_par_defaut et les flags CLI."""

    def test_01_windows_par_defaut(self):
        """Sous Windows, sur_raspberry_pi est False et le navigateur s'ouvre par defaut."""
        with patch("os.name", "nt"):
            self.assertFalse(web_CAO.sur_raspberry_pi())
            self.assertTrue(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_02_raspberry_pi_device_tree(self):
        """Sur un Raspberry Pi detecte via /proc/device-tree/model, le navigateur ne s'ouvre pas."""
        def fake_exists(path):
            return path == "/proc/device-tree/model"

        with patch("os.name", "posix"), \
             patch("sys.platform", "linux"), \
             patch("os.path.exists", side_effect=fake_exists), \
             patch("builtins.open", mock_open(read_data="Raspberry Pi 4 Model B Rev 1.4\x00")):
            self.assertTrue(web_CAO.sur_raspberry_pi())
            self.assertFalse(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_03_raspberry_pi_os_release(self):
        """Sur un Raspberry Pi detecte via /etc/os-release (Raspbian), le navigateur ne s'ouvre pas."""
        def fake_exists(path):
            return path == "/etc/os-release"

        fake_os_release = 'PRETTY_NAME="Raspbian GNU/Linux 11 (bullseye)"\nNAME="Raspbian GNU/Linux"\n'
        with patch("os.name", "posix"), \
             patch("sys.platform", "linux"), \
             patch("os.path.exists", side_effect=fake_exists), \
             patch("builtins.open", mock_open(read_data=fake_os_release)):
            self.assertTrue(web_CAO.sur_raspberry_pi())
            self.assertFalse(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_04_raspberry_pi_rpi_issue(self):
        """Sur un Raspberry Pi avec fichier /etc/rpi-issue, la detection est positive."""
        def fake_exists(path):
            return path == "/etc/rpi-issue"

        with patch("os.name", "posix"), \
             patch("sys.platform", "linux"), \
             patch("os.path.exists", side_effect=fake_exists):
            self.assertTrue(web_CAO.sur_raspberry_pi())
            self.assertFalse(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_05_linux_terminal_headless(self):
        """Sur Linux standard (non Pi) sans DISPLAY ni WAYLAND_DISPLAY (ex: SSH/terminal), pas de navigateur."""
        with patch("os.name", "posix"), \
             patch("sys.platform", "linux"), \
             patch("os.path.exists", return_value=False), \
             patch.dict(os.environ, {}, clear=True):
            self.assertFalse(web_CAO.sur_raspberry_pi())
            self.assertFalse(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_06_linux_desktop_gui(self):
        """Sur Linux avec bureau graphique (DISPLAY defini), le navigateur s'ouvre par defaut."""
        with patch("os.name", "posix"), \
             patch("sys.platform", "linux"), \
             patch("os.path.exists", return_value=False), \
             patch.dict(os.environ, {"DISPLAY": ":0"}):
            self.assertFalse(web_CAO.sur_raspberry_pi())
            self.assertTrue(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_07_macos(self):
        """Sous macOS, le navigateur s'ouvre par defaut."""
        with patch("os.name", "posix"), \
             patch("sys.platform", "darwin"), \
             patch("os.path.exists", return_value=False):
            self.assertFalse(web_CAO.sur_raspberry_pi())
            self.assertTrue(web_CAO.doit_ouvrir_navigateur_par_defaut())

    def test_08_cli_override(self):
        """Les arguments CLI --navigateur et --sans-navigateur ont priorite sur la detection."""
        with patch("web_CAO.start_server", return_value=0) as mock_start:
            # 1. --sans-navigateur desactive meme sur Windows
            with patch("os.name", "nt"):
                web_CAO.main(["--sans-navigateur"])
                mock_start.assert_called_with("", 8000, False)

            # 2. --navigateur force meme sur Raspberry Pi
            with patch("web_CAO.sur_raspberry_pi", return_value=True):
                web_CAO.main(["--navigateur"])
                mock_start.assert_called_with("", 8000, True)


if __name__ == "__main__":
    unittest.main()
