#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Petit serveur HTTP pour ouvrir les editeurs depuis un autre appareil.

    python serveur.py                 # ecoute sur le reseau local, port 8000
    python serveur.py --local         # localhost uniquement
    python serveur.py --port 9000
    python serveur.py --host 192.168.1.20

Sert le dossier du depot en lecture seule. Par defaut l'ecoute se fait sur
toutes les interfaces, ce qui est le but : ouvrir le schema sur un iPad du
meme reseau WiFi. C'est un serveur de developpement, sans authentification --
a n'utiliser que sur un reseau de confiance. --local coupe cet acces.
"""
import argparse
import http.server
import os
import posixpath
import socket
import socketserver
import sys
import urllib.parse

DEFAULT_PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


def get_local_ip():
    """Adresse IP de la machine sur le reseau local."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    """Sert ROOT, sans cache, avec redirection vers <dossier>/<dossier>.html."""

    # les fichiers de travail n'ont rien a faire sur le reseau
    HIDDEN = ('.git', '.github', '.gitignore', '.venv', '__pycache__', '.env')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _hidden(self, path):
        """Vrai si le chemin sort de ROOT ou touche un fichier de travail."""
        try:
            real = os.path.realpath(path)
        except OSError:
            return True
        root = os.path.realpath(ROOT)
        if real != root and not real.startswith(root + os.sep):
            return True            # remontee hors du depot
        rel = os.path.relpath(real, root)
        return any(part in self.HIDDEN or part.startswith('.')
                   for part in rel.split(os.sep) if part not in ('.', '..'))

    def translate_path(self, path):
        filepath = super().translate_path(path)

        # dossier sans index.html : on cherche <dossier>/<dossier>.html
        if os.path.isdir(filepath) and \
                not os.path.exists(os.path.join(filepath, "index.html")):
            folder = os.path.basename(filepath.rstrip('/\\'))
            candidate = os.path.join(filepath, folder + ".html")
            if os.path.exists(candidate):
                return candidate

        return filepath

    def send_head(self):
        # le filtrage se fait ici : translate_path est aussi appele par
        # list_directory, ou renvoyer une erreur n'est pas possible
        rel = urllib.parse.urlsplit(self.path).path
        target = self.translate_path(posixpath.normpath(rel))
        if self._hidden(target):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def handle(self):
        try:
            super().handle()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass          # le client s'est deconnecte en cours de route

    def log_message(self, fmt, *args):
        # une ligne par requete, sans l'horodatage verbeux par defaut
        sys.stderr.write("  %s\n" % (fmt % args))


class DualStackServer(socketserver.TCPServer):
    """Ecoute IPv4 et IPv6 sur la meme socket quand le systeme le permet."""

    address_family = socket.AF_INET6
    allow_reuse_address = True

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def make_server(host, port):
    """Ouvre un serveur sur (host, port). Renvoie None en cas d'echec."""
    families = [DualStackServer]
    if host not in ("", "::"):
        # une adresse explicite peut etre IPv4 : le serveur dual-stack echouerait
        families.insert(0, socketserver.TCPServer)
    for cls in families:
        try:
            return cls((host, port), CustomHandler)
        except OSError:
            continue
    return None


def start_server(host, port):
    httpd = make_server(host, port)
    if httpd is None and port != 0:
        print("[!] Le port %d est bloque (securite entreprise ou deja utilise)." % port)
        print("[*] Recherche automatique d'un port alternatif autorise...")
        httpd = make_server(host, 0)
    if httpd is None and host != "127.0.0.1":
        print("[*] Tentative en mode local uniquement (inaccessible depuis l'iPad)...")
        httpd = make_server("127.0.0.1", 0)
    if httpd is None:
        print("[X] Impossible de demarrer le serveur.")
        return 1

    bound_host, bound_port = httpd.server_address[0], httpd.server_address[1]
    is_local_only = bound_host in ("127.0.0.1", "::1")

    print("=" * 60)
    print("SERVEUR CAO WEB DEMARRE")
    print("=" * 60)
    print("  dossier servi : %s" % ROOT)
    if is_local_only:
        print("  adresse       : http://127.0.0.1:%d/" % bound_port)
        print()
        print("  Mode local : le serveur n'est PAS accessible depuis un autre")
        print("  appareil. Relancez sans --local pour ouvrir l'acces au reseau.")
    else:
        print("  adresse       : http://%s:%d/" % (get_local_ip(), bound_port))
        print()
        print("  Depuis un autre appareil du meme reseau WiFi (iPad par exemple),")
        print("  ouvrez le navigateur et tapez cette adresse.")
        print()
        print("  ATTENTION : le serveur ecoute sur toutes les interfaces et n'a")
        print("  aucune authentification. A reserver a un reseau de confiance ;")
        print("  utilisez --local pour un acces limite a cette machine.")
    print()
    print("=" * 60)
    print("(Ctrl+C pour arreter)")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrete.")
    finally:
        httpd.server_close()
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=DEFAULT_PORT,
                    help="port d'ecoute (defaut : %d ; 0 = au choix du systeme)"
                         % DEFAULT_PORT)
    ap.add_argument("--host", default="",
                    help="adresse d'ecoute (defaut : toutes les interfaces)")
    ap.add_argument("--local", action="store_true",
                    help="n'ecouter que sur 127.0.0.1 : aucun acces reseau")
    args = ap.parse_args(argv)
    host = "127.0.0.1" if args.local else args.host
    return start_server(host, args.port)


if __name__ == '__main__':
    sys.exit(main())
