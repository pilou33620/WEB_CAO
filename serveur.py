#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.4.0
# Date: 2026-08-22
# Explication: Sous Pyto (iOS), l'adresse restait 127.0.0.1 : Python tourne
#   dans le bac a sable de l'application, ou la sonde UDP ne trouve aucune
#   route vers un reseau prive tant que l'autorisation « Reseau local » n'est
#   pas accordee, et ou gethostname() resout sur la boucle locale. On
#   interroge desormais le noyau par getifaddrs() en ctypes : aucun paquet
#   emis, aucune permission requise, et le nom de l'interface permet de
#   preferer en0 (WiFi) a pdp_ip0 (donnees mobiles) ou aux tunnels VPN.
#   Ajout de --diagnostic, plus commode qu'un python -c sur un telephone.
# Fonctions ajoutees/modifiees :
# - interfaces_reseau, _structures_ifaddrs, _rang_interface (nouvelles)
# - adresses_locales (getifaddrs d'abord, sondes UDP ensuite)
# - main (--diagnostic), afficher_diagnostic (nouvelle)
#
# Version: 2.3.1
# Date: 2026-08-22
# Explication: Le navigateur s'ouvrait toujours sur 127.0.0.1 : start_server
#   passait a ouvrir_navigateur l'URL rendue par adresse_locale, qui remplace
#   « :: » par la boucle locale -- correct pour un poste fixe, deroutant quand
#   la machine qui lance le serveur est justement l'iPhone. On ouvre desormais
#   l'adresse reseau des qu'elle est connue, et le recapitulatif affiche les
#   deux adresses.
# Fonctions modifiees : start_server
#
# Version: 2.3.0
# Date: 2026-08-22
# Explication: Lance depuis un iPhone/iPad (a-Shell, iSH, Pythonista),
#   le serveur annoncait « 127.0.0.1 » au lieu de l'adresse WiFi. Deux causes :
#   (1) get_local_ip sondait 10.255.255.255 par une socket UDP ; sous iOS cet
#   appel echoue (autorisation « Reseau local » refusee, pile emulee sous iSH,
#   ou aucune route vers 10.0.0.0/8) et l'OSError etait avalee au profit de
#   127.0.0.1 ; (2) avec --host vide, make_server n'essayait que la socket
#   IPv6 dual-stack : sans IPv6 le bind echouait et la cascade de repli
#   terminait sur 127.0.0.1, port aleatoire, sans acces reseau. On sonde
#   desormais plusieurs cibles, on interroge le resolveur en secours, on
#   prefere une adresse privee (le WiFi, pas la 4G), et l'IPv4 sert de repli a
#   l'IPv6. Le diagnostic est affiche quand aucune adresse reseau n'est
#   trouvee.
# Fonctions modifiees :
# - get_local_ip (sondes multiples, secours getaddrinfo, preference RFC1918)
# - make_server (repli IPv4 quand la socket dual-stack echoue)
# - start_server (message explicite si seul localhost est joignable)
# - send_head (ligne du favicon remise en forme, comportement inchange)
#
# Version: 2.2.0
# Date: 2026-08-21
# Explication: serveur-composants.py (FastAPI/uvicorn, port 8420) est
#   supprime : ce serveur exposait deja /api/tools et /api/tool en
#   bibliotheque standard, et la page recherche-composants interroge d'abord
#   l'origine qui la sert. Seule route qui manquait ici : /favicon.ico, absent
#   du depot -- soit un 404 dans le journal a chaque onglet ouvert. On repond
#   204 desormais. WEB_CAO n'a plus aucune dependance Python (requirements.txt).
# Fonctions modifiees : send_head (204 sur /favicon.ico absent)
#
# Version: 2.1.1
# Date: 2026-08-21
# Explication: Le double-clic ouvrait une console qui affichait « Python est
#   introuvable » puis disparaissait. Cause : le shebang « #!/usr/bin/env
#   python3 » demande a py.exe (associe aux .py) de chercher « python3 » dans
#   le PATH ; il y trouvait d'abord le raccourci Microsoft Store
#   (WindowsApps\python3.exe), qui n'installe rien et rend la main aussitot.
#   Le shebang « #!/usr/bin/python3 » est une commande virtuelle : py.exe
#   utilise directement le Python enregistre (3.12 ici). Meme correction dans
#   passerelle_mcp.py.
# Fonctions modifiees : aucune (ligne 1 uniquement)
#
# Version: 2.1.0
# Date: 2026-08-21
# Explication: La page recherche-composants cherche sa passerelle d'abord sur
#   l'origine qui la sert. Ce serveur ne connaissait pas /api/*, d'ou le
#   « HTTP 404 » puis « Aucune passerelle joignable » quand serveur-composants.py
#   n'etait pas lance en parallele (port 8420). Il relaie maintenant lui-meme
#   vers pcbparts.dev via passerelle_mcp, qui n'utilise que la bibliotheque
#   standard : un seul serveur suffit desormais pour toute l'application.
# Fonctions modifiees/ajoutees :
# - CustomHandler.do_GET / do_HEAD / do_POST / do_OPTIONS (nouvelles : routage API)
# - CustomHandler._api_tools, _api_tool, _envoyer_json, _cors (nouvelles)
# - DualStackServer, make_server (multi-thread : un appel MCP ne bloque plus
#   le service des fichiers)
#
# Version: 2.1.0 -- Le double-clic sous Windows ouvrait une console qui se
#   refermait aussitot : quand le demarrage echoue (port bloque, module
#   manquant), le message d'erreur disparaissait avec la fenetre, et il
#   fallait de toute facon recopier l'adresse a la main dans le navigateur.
#   Desormais le double-clic suffit : le navigateur s'ouvre tout seul et la
#   console reste ouverte jusqu'a ce qu'on appuie sur Entree.
# Fonctions ajoutees/modifiees :
# - adresse_locale, ouvrir_navigateur (nouvelles)
# - console_interactive, attendre_touche, lancer (nouvelles : la fenetre du
#   double-clic ne se referme plus toute seule -- Windows uniquement)
# - start_server (parametre navigateur), main (--sans-navigateur, --sans-pause)
# ==========================================
"""Petit serveur HTTP pour ouvrir les editeurs depuis un autre appareil.

    python serveur.py                 # ecoute sur le reseau local, port 8000
    python serveur.py --local         # localhost uniquement
    python serveur.py --port 9000
    python serveur.py --host 192.168.1.20
    python serveur.py --sans-navigateur   # ne pas ouvrir le navigateur

Un double-clic sur le fichier suffit sous Windows : le navigateur s'ouvre sur
la bonne adresse et la console reste ouverte -- le journal des requetes y
defile, et rien ne disparait si le demarrage echoue. --sans-pause rend la main
tout de suite (scripts, service).

Sert le dossier du depot en lecture seule, et relaie la recherche de
composants vers pcbparts.dev (/api/tools et /api/tool). Par defaut l'ecoute se
fait sur toutes les interfaces, ce qui est le but : ouvrir le schema sur un
iPad du meme reseau WiFi. C'est un serveur de developpement, sans
authentification -- a n'utiliser que sur un reseau de confiance. --local coupe
cet acces.
"""
import argparse
import http.server
import json
import os
import posixpath
import re
import socket
import socketserver
import sys
import threading
import traceback
import urllib.parse
import webbrowser

import passerelle_mcp

DEFAULT_PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))

# Taille maximale d'un corps POST : les arguments d'outil sont minuscules.
MAX_CORPS = 64 * 1024

# Origines autorisees a appeler l'API : cette machine et les reseaux prives,
# pour le cas ou la page serait servie depuis un autre port.
ORIGINES = re.compile(
    r"^https?://(localhost|127\.0\.0\.1|\[::1\]"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$")


# Prefixes des reseaux prives (RFC 1918) : sur un telephone, la sonde peut
# ressortir l'adresse de l'interface cellulaire, inutile pour joindre l'iPad.
PREFIXES_PRIVES = ('192.168.', '10.') + tuple(
    '172.%d.' % octet for octet in range(16, 32))


# Interfaces sans interet pour joindre un iPad du meme WiFi, du meilleur au
# pire : le WiFi d'abord, le cellulaire et les tunnels en dernier recours.
RANGS_INTERFACES = (
    (('en', 'wlan', 'eth', 'wl'), 0),      # WiFi / Ethernet
    (('bridge', 'ap'), 1),                 # partage de connexion
    (('utun', 'ipsec', 'ppp', 'tun'), 3),  # VPN
    (('pdp_ip', 'rmnet'), 4),              # donnees mobiles
)


def _rang_interface(nom):
    for prefixes, rang in RANGS_INTERFACES:
        if nom.startswith(prefixes):
            return rang
    return 2


def _structures_ifaddrs():
    """Declare les structures C de getifaddrs pour la plateforme courante.

    Renvoie (libc, ifaddrs, sockaddr, sockaddr_in, decalage_famille) ou None.
    BSD (donc iOS et macOS) prefixe sockaddr d'un octet de longueur, pas
    Linux : les deux dispositions ne different que par ce detail.
    """
    import ctypes
    import ctypes.util

    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or None,
                           use_errno=True)
        libc.getifaddrs
        libc.freeifaddrs
    except (OSError, AttributeError):
        return None

    try:
        bsd = os.uname().sysname in ("Darwin", "FreeBSD", "OpenBSD", "NetBSD")
    except AttributeError:                  # Windows : pas de getifaddrs
        return None
    bsd = bsd or sys.platform.startswith(("darwin", "ios"))

    if bsd:
        entetes_sockaddr = [("sa_len", ctypes.c_uint8),
                            ("sa_family", ctypes.c_uint8)]
    else:
        entetes_sockaddr = [("sa_family", ctypes.c_uint16)]

    class sockaddr(ctypes.Structure):
        _fields_ = entetes_sockaddr + [("sa_data", ctypes.c_uint8 * 14)]

    class sockaddr_in(ctypes.Structure):
        _fields_ = entetes_sockaddr + [("sin_port", ctypes.c_uint16),
                                       ("sin_addr", ctypes.c_uint8 * 4),
                                       ("sin_zero", ctypes.c_uint8 * 8)]

    class ifaddrs(ctypes.Structure):
        pass

    # ifa_dstaddr sous BSD, union ifa_ifu sous Linux : meme taille, meme place.
    ifaddrs._fields_ = [("ifa_next", ctypes.POINTER(ifaddrs)),
                        ("ifa_name", ctypes.c_char_p),
                        ("ifa_flags", ctypes.c_uint),
                        ("ifa_addr", ctypes.POINTER(sockaddr)),
                        ("ifa_netmask", ctypes.POINTER(sockaddr)),
                        ("ifa_dstaddr", ctypes.POINTER(sockaddr)),
                        ("ifa_data", ctypes.c_void_p)]

    return libc, ifaddrs, sockaddr, sockaddr_in


def interfaces_reseau():
    """[(nom, ip), ...] IPv4 de chaque interface, lues dans le noyau.

    Passe par getifaddrs() plutot que par une sonde reseau : sous iOS (Pyto),
    Python tourne dans le bac a sable de l'application, ou aucune route n'est
    visible tant que l'autorisation « Reseau local » n'a pas ete accordee.
    Cet appel-la, lui, n'emet rien et aboutit toujours.
    """
    import ctypes

    outils = _structures_ifaddrs()
    if outils is None:
        return []
    libc, ifaddrs, _sockaddr, sockaddr_in = outils

    tete = ctypes.POINTER(ifaddrs)()
    try:
        if libc.getifaddrs(ctypes.byref(tete)) != 0:
            return []
    except OSError:
        return []

    resultat = []
    try:
        entree = tete
        while entree:
            courant = entree.contents
            adresse = courant.ifa_addr
            if adresse and adresse.contents.sa_family == socket.AF_INET:
                brut = ctypes.cast(adresse,
                                   ctypes.POINTER(sockaddr_in)).contents
                ip = socket.inet_ntop(socket.AF_INET, bytes(brut.sin_addr))
                nom = (courant.ifa_name or b"").decode("utf-8", "replace")
                if not ip.startswith("127."):
                    resultat.append((nom, ip))
            entree = courant.ifa_next
    finally:
        libc.freeifaddrs(tete)

    resultat.sort(key=lambda couple: _rang_interface(couple[0]))
    return resultat


def adresses_locales():
    """Toutes les adresses IPv4 plausibles de cette machine, sans doublon."""
    trouvees = []

    def ajouter(ip):
        if ip and ip not in trouvees:
            trouvees.append(ip)

    # Le noyau d'abord : c'est la seule source qui reponde sous iOS.
    try:
        for _nom, ip in interfaces_reseau():
            ajouter(ip)
    except Exception:                                  # noqa: BLE001
        pass                        # ctypes indisponible : on sonde plus bas

    # Sonde sans emission : connect() sur une socket UDP ne fait que demander
    # au noyau quelle interface servirait a joindre la cible. Plusieurs cibles,
    # car sous iOS la premiere echoue souvent (pas de route vers 10.0.0.0/8,
    # ou autorisation « Reseau local » non accordee a l'application).
    for cible in ('10.255.255.255', '192.168.1.1', '172.16.0.1', '8.8.8.8'):
        sonde = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sonde.settimeout(0.3)
            sonde.connect((cible, 1))
            ajouter(sonde.getsockname()[0])
        except OSError:
            pass
        finally:
            sonde.close()

    # Secours quand toutes les sondes echouent (iSH, reseau restreint) :
    # demander au resolveur les adresses associees au nom de la machine.
    try:
        for infos in socket.getaddrinfo(socket.gethostname(), None,
                                        socket.AF_INET):
            ajouter(infos[4][0])
    except OSError:
        pass

    return trouvees


def get_local_ip():
    """Adresse IP de la machine sur le reseau local, ou 127.0.0.1 a defaut."""
    trouvees = adresses_locales()
    for ip in trouvees:                     # le WiFi avant l'interface mobile
        if ip.startswith(PREFIXES_PRIVES):
            return ip
    for ip in trouvees:
        if not ip.startswith('127.'):
            return ip
    return '127.0.0.1'


def adresse_locale(host, port):
    """URL a ouvrir sur CETTE machine pour un serveur lie a (host, port)."""
    if host in ("", "::", "0.0.0.0", "::1"):
        host = "127.0.0.1"
    if ":" in host:                       # IPv6 litterale
        host = "[%s]" % host
    return "http://%s:%d/" % (host, port)


def ouvrir_navigateur(url, delai=0.8):
    """Ouvre le navigateur par defaut, une fois le serveur en ecoute."""
    def _ouvrir():
        try:
            webbrowser.open(url)
        except Exception as exc:                       # noqa: BLE001
            print("[!] Ouverture du navigateur impossible : %s" % exc)

    minuteur = threading.Timer(delai, _ouvrir)
    minuteur.daemon = True
    minuteur.start()


def console_interactive():
    """Vrai si une console est attachee : inutile d'attendre sinon."""
    try:
        return sys.stdin is not None and sys.stdin.isatty()
    except (AttributeError, ValueError, OSError):
        return False


def attendre_touche():
    """Retient la fenetre ouverte a la fin (double-clic Windows)."""
    try:
        print("")
        input("Appuyez sur Entree pour fermer cette fenetre...")
    except (EOFError, KeyboardInterrupt, OSError):
        pass


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
        # Le depot n'a pas de favicon : repondre « rien a afficher » plutot
        # qu'un 404 par onglet ouvert dans le journal des requetes.
        if rel == "/favicon.ico" and not os.path.exists(
                os.path.join(ROOT, "favicon.ico")):
            self.send_response(204)
            self.end_headers()
            return None
        target = self.translate_path(posixpath.normpath(rel))
        if self._hidden(target):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    # -- passerelle composants --------------------------------------------
    # La page recherche-composants essaie d'abord l'origine qui la sert : ces
    # deux routes evitent d'avoir a lancer un second serveur.

    def _route(self):
        return urllib.parse.urlsplit(self.path).path.rstrip('/') or '/'

    def _cors(self):
        """Autorise la page si elle vient d'une origine du reseau prive."""
        origine = self.headers.get("Origin")
        if origine and ORIGINES.match(origine):
            self.send_header("Access-Control-Allow-Origin", origine)
            self.send_header("Vary", "Origin")

    def _envoyer_json(self, charge, code=200):
        corps = json.dumps(charge).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self._cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)

    def _api(self, action):
        """Execute action() et traduit les erreurs en JSON {"detail": ...}."""
        try:
            self._envoyer_json(action())
        except passerelle_mcp.ErreurPasserelle as exc:
            self._envoyer_json({"detail": exc.message}, exc.code)
        except Exception as exc:                       # noqa: BLE001
            self._envoyer_json({"detail": "Erreur interne : %s" % exc}, 500)

    def _lire_json(self):
        """Corps de la requete, ou leve ErreurPasserelle."""
        try:
            taille = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise passerelle_mcp.ErreurPasserelle(400, "Content-Length invalide")
        if taille > MAX_CORPS:
            raise passerelle_mcp.ErreurPasserelle(413, "Requete trop grande")
        try:
            return json.loads(self.rfile.read(taille) or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise passerelle_mcp.ErreurPasserelle(400, "Corps JSON illisible")

    def do_OPTIONS(self):
        if self._route() not in ("/api/tools", "/api/tool"):
            self.send_error(405, "Unsupported method (OPTIONS)")
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self._route() != "/api/tool":
            self.send_error(404, "File not found")
            return

        def appel():
            charge = self._lire_json()
            if not isinstance(charge, dict) or not charge.get("name"):
                raise passerelle_mcp.ErreurPasserelle(400, "Outil non precise")
            return passerelle_mcp.appeler_outil(charge["name"],
                                                charge.get("arguments") or {})

        self._api(appel)

    def do_GET(self):
        if self._route() == "/api/tools":
            self._api(passerelle_mcp.liste_outils)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._route() == "/api/tools":
            self._api(passerelle_mcp.liste_outils)
            return
        super().do_HEAD()

    def handle(self):
        try:
            super().handle()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass          # le client s'est deconnecte en cours de route

    def log_message(self, fmt, *args):
        # une ligne par requete, sans l'horodatage verbeux par defaut
        sys.stderr.write("  %s\n" % (fmt % args))


class ThreadedServer(socketserver.ThreadingTCPServer):
    """Une requete par thread : un appel a pcbparts.dev (jusqu'a 30 s) ne doit
    pas geler le service des fichiers."""

    allow_reuse_address = True
    daemon_threads = True


class DualStackServer(ThreadedServer):
    """Ecoute IPv4 et IPv6 sur la meme socket quand le systeme le permet."""

    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()


def make_server(host, port):
    """Ouvre un serveur sur (host, port). Renvoie None en cas d'echec."""
    if host in ("", "::"):
        # dual-stack d'abord ; l'IPv4 seule reste indispensable la ou IPv6
        # n'existe pas (iSH sur iOS, conteneurs, reseaux d'entreprise) --
        # sinon le bind echoue et la cascade de repli enferme le serveur
        # sur localhost.
        familles = [(DualStackServer, host), (ThreadedServer, "0.0.0.0")]
    else:
        # une adresse explicite peut etre IPv4 : le serveur dual-stack echouerait
        familles = [(ThreadedServer, host), (DualStackServer, host)]
    for cls, adresse in familles:
        try:
            return cls((adresse, port), CustomHandler)
        except OSError:
            continue
    return None


def start_server(host, port, navigateur=True):
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
    url = adresse_locale(bound_host, bound_port)
    ip_reseau = "127.0.0.1" if is_local_only else get_local_ip()
    # Ecoute ouverte mais aucune adresse reseau trouvee : le serveur est
    # peut-etre joignable malgre tout, seule la detection a echoue.
    detection_muette = not is_local_only and ip_reseau == "127.0.0.1"

    print("=" * 60)
    print("SERVEUR CAO WEB DEMARRE")
    print("=" * 60)
    print("  dossier servi : %s" % ROOT)
    print("  passerelle    : /api/tools et /api/tool -> pcbparts.dev")
    if is_local_only:
        print("  adresse       : %s" % url)
        print()
        print("  Mode local : le serveur n'est PAS accessible depuis un autre")
        print("  appareil. Relancez sans --local pour ouvrir l'acces au reseau.")
    elif detection_muette:
        print("  adresse       : %s (sur cette machine)" % url)
        print()
        print("  Le serveur ecoute sur toutes les interfaces, mais aucune")
        print("  adresse reseau n'a pu etre determinee. Sous iOS, c'est le plus")
        print("  souvent l'autorisation « Reseau local » qui manque a")
        print("  l'application (Reglages -> l'application -> Reseau local).")
        print()
        print("  Relevez l'adresse a la main -- Reglages -> Wi-Fi -> (i), ou la")
        print("  commande ifconfig -- puis ouvrez http://<adresse>:%d/ depuis"
              % bound_port)
        print("  l'autre appareil. --host <adresse> force aussi l'ecoute.")
        print()
        print("  ATTENTION : le serveur ecoute sur toutes les interfaces et n'a")
        print("  aucune authentification. A reserver a un reseau de confiance ;")
        print("  utilisez --local pour un acces limite a cette machine.")
    else:
        print("  adresse       : http://%s:%d/" % (ip_reseau, bound_port))
        print("  sur ce poste  : %s" % url)
        print()
        print("  Depuis un autre appareil du meme reseau WiFi (iPad par exemple),")
        print("  ouvrez le navigateur et tapez la premiere adresse.")
        print()
        print("  ATTENTION : le serveur ecoute sur toutes les interfaces et n'a")
        print("  aucune authentification. A reserver a un reseau de confiance ;")
        print("  utilisez --local pour un acces limite a cette machine.")
    print()
    print("=" * 60)
    print("(Ctrl+C pour arreter)")
    print()

    if navigateur:
        # L'adresse reseau plutot que la boucle locale : quand le serveur
        # tourne sur le telephone lui-meme, c'est celle que l'on veut voir
        # dans la barre d'adresse (a copier vers l'iPad, a mettre en favori).
        # La boucle locale reste le repli quand aucune IP n'a ete trouvee.
        url_ouverture = url if (is_local_only or detection_muette) else \
            "http://%s:%d/" % (ip_reseau, bound_port)
        print("  Ouverture du navigateur sur %s" % url_ouverture)
        ouvrir_navigateur(url_ouverture)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrete.")
    finally:
        httpd.server_close()
    return 0


def afficher_diagnostic():
    """Ce que la machine sait de son propre reseau (--diagnostic)."""
    print("=" * 60)
    print("DIAGNOSTIC RESEAU")
    print("=" * 60)
    print("  plateforme    : %s / Python %s"
          % (sys.platform, sys.version.split()[0]))
    try:
        print("  machine       : %s" % socket.gethostname())
    except OSError as exc:
        print("  machine       : indisponible (%s)" % exc)

    interfaces = []
    try:
        interfaces = interfaces_reseau()
    except Exception as exc:                           # noqa: BLE001
        print("  getifaddrs    : echec (%s)" % exc)
    if interfaces:
        print("  interfaces    :")
        for nom, ip in interfaces:
            print("      %-10s %s" % (nom, ip))
    else:
        print("  interfaces    : aucune adresse IPv4 hors boucle locale")

    print("  toutes IP     : %s" % ", ".join(adresses_locales()))
    retenue = get_local_ip()
    print("  retenue       : %s" % retenue)
    print()
    if retenue == "127.0.0.1":
        print("  Aucune adresse reseau : cette machine ne se voit sur aucun")
        print("  reseau. Verifiez le WiFi, et sous iOS l'autorisation")
        print("  « Reseau local » de l'application dans les Reglages.")
    else:
        print("  Le serveur sera annonce sur http://%s:<port>/" % retenue)
    print("=" * 60)
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
    ap.add_argument("--sans-navigateur", dest="navigateur", action="store_false",
                    help="ne pas ouvrir le navigateur au demarrage")
    ap.add_argument("--sans-pause", action="store_true",
                    help="rendre la main sans attendre Entree a la fermeture"
                         " (Windows)")
    ap.add_argument("--diagnostic", action="store_true",
                    help="afficher les interfaces reseau detectees et quitter")
    args = ap.parse_args(argv)
    if args.diagnostic:
        return afficher_diagnostic()
    host = "127.0.0.1" if args.local else args.host
    return start_server(host, args.port, args.navigateur)


def lancer(argv=None):
    """Point d'entree double-clic : la fenetre ne se ferme plus sur l'erreur."""
    argv = sys.argv[1:] if argv is None else list(argv)
    try:
        code = main(argv)
    except KeyboardInterrupt:
        return 0
    except SystemExit as exc:                          # --help, argument invalide
        code = exc.code if isinstance(exc.code, int) else (0 if exc.code is None else 1)
    except Exception:                                  # noqa: BLE001
        traceback.print_exc()
        code = 1
    # Un double-clic sous Windows ouvre une console qui se referme des que le
    # script rend la main : sans cette attente, ni l'erreur de demarrage ni le
    # dernier message d'arret n'ont le temps d'etre lus. Ailleurs, le terminal
    # survit au script : ne rien attendre.
    muet = {"--sans-pause", "--help", "-h"}.intersection(argv)
    if os.name == "nt" and not muet and console_interactive():
        attendre_touche()
    return code


if __name__ == '__main__':
    sys.exit(lancer())
