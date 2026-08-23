#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.4.1
# Date: 2026-08-23
# Explication: sous Windows, le port 8000 refuse (WinError 10013, courant en
#   entreprise) faisait defiler deux lignes d'erreur AVANT l'explication, alors
#   que le repli sur un port libre fonctionnait : on croyait a un plantage.
#   make_server ne parle plus, il rend compte ; start_server annonce la cause,
#   puis les details indentes, puis la resolution -- et nomme le port retenu.
#   Les tentatives sont designees par « IPv4 »/« IPv6 » plutot que par le nom
#   des classes internes.
# Fonctions modifiees : make_server (renvoie un couple), start_server
#
# Version: 2.4.0
# Date: 2026-08-23
# Explication: diagnostic confirme sur l'iPad (Pyto 19.0.1, Python 3.10,
#   sys.platform == "ios"). Le depot etait dans iCloud Drive, hors du
#   conteneur de l'application : os.listdir y repond « [Errno 1] Operation not
#   permitted ». Le serveur servait donc un dossier illisible -- d'ou le
#   « 404 -- No permission to list directory » dans Safari. Ce n'est pas un
#   defaut de chemin : c'est une autorisation, que seul Pyto peut accorder
#   (« Ouvrir dossier » dans la barre laterale, ou depot place dans le dossier
#   de Pyto). Le message le dit maintenant, et la page d'erreur aussi.
#   Corrige au passage un defaut introduit par la version precedente : sous
#   Pyto, os.getcwd() leve PermissionError des que le repertoire courant est
#   hors de portee. trouver_dossier() plantait donc la ou il devait aider.
# Fonctions ajoutees/modifiees :
# - repertoire_courant, chemin_absolu (nouvelles : plus aucun getcwd nu)
# - trouver_dossier (renvoie un chemin ou "", la decision revient a
#   start_server), verifier_dossier (message : autorisation, pas --dossier)
# - CustomHandler.list_directory (nouvelle : la page d'erreur nomme le dossier,
#   l'erreur systeme et la marche a suivre)
#
# Version: 2.3.0
# Date: 2026-08-23
# Explication: le serveur ne demarrait plus sous Pyto (iPad), et quand il
#   demarrait il repondait « 404 -- No permission to list directory ». Cette
#   page vient de list_directory : os.listdir(ROOT) a leve une OSError, donc le
#   dossier servi n'etait pas le depot (bac a sable iOS, ou __file__ relatif
#   resolu depuis un autre repertoire courant). Meme cause pour le non-
#   demarrage : le fichier voisin passerelle_mcp.py etait illisible lui aussi.
#   D'ou --dossier et un diagnostic explicite au demarrage. Autres causes :
#   1. « import passerelle_mcp » en tete de fichier : sous Pyto le dossier du
#      script n'est pas toujours dans sys.path et le module ssl peut manquer.
#      Un import rate empechait TOUT le serveur de demarrer, alors que seules
#      les deux routes /api/* en dependent. L'import est desormais tolerant et
#      /api/* repond 503 « passerelle indisponible » le cas echeant.
#   2. make_server n'essayait QUE la double pile IPv6 quand --host est vide :
#      si AF_INET6 n'est pas disponible, on retombait en silence sur
#      127.0.0.1 et un port aleatoire (« inaccessible depuis l'iPad »).
#      IPv4 est maintenant essaye en second, et la vraie erreur est affichee
#      au lieu d'etre avalee par « except OSError: continue ».
#   3. get_local_ip : la ruse UDP vers 10.255.255.255 echoue sur iOS sans
#      l'autorisation « Reseau local » et l'adresse affichee etait inutilisable.
#   L'ouverture automatique du navigateur, elle, fonctionne sous Pyto (browser
#   integre, l'application reste au premier plan) : elle est conservee, avec un
#   rappel a l'ecran puisque quitter Pyto met le serveur en pause.
# Fonctions modifiees/ajoutees :
# - sur_ios, verifier_dossier (nouvelles), get_local_ip, make_server
# - start_server, main (--dossier)
# - CustomHandler._api (passerelle absente -> 503)
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

DEFAULT_PORT = 8000
# Le chemin evident, dont depend l'import de la passerelle. start_server peut
# le remplacer par un repli si le depot n'est pas la -- sauf si --dossier a
# tranche explicitement, auquel cas on obeit sans discuter.
ROOT = os.path.dirname(os.path.abspath(__file__))
DOSSIER_IMPOSE = False

# La passerelle composants n'est pas indispensable pour servir les editeurs :
# sous Pyto (iPad) le dossier du script n'est pas toujours dans sys.path et le
# module ssl peut manquer. On ne laisse plus cet import faire tomber le serveur.
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
try:
    import passerelle_mcp
    ERREUR_PASSERELLE = None
except Exception as _exc:                              # noqa: BLE001
    passerelle_mcp = None
    ERREUR_PASSERELLE = _exc

# Taille maximale d'un corps POST : les arguments d'outil sont minuscules.
MAX_CORPS = 64 * 1024

# Origines autorisees a appeler l'API : cette machine et les reseaux prives,
# pour le cas ou la page serait servie depuis un autre port.
ORIGINES = re.compile(
    r"^https?://(localhost|127\.0\.0\.1|\[::1\]"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$")


def get_local_ip():
    """Adresse IP de la machine sur le reseau local."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except OSError:
        ip = ''
    finally:
        s.close()
    if ip in ('', '0.0.0.0'):
        # iOS refuse la sortie vers le reseau local tant que l'autorisation
        # « Reseau local » n'est pas accordee : la ruse UDP ne renvoie rien.
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except OSError:
            ip = '127.0.0.1'
    return ip


def sur_ios():
    """Vrai sous Pyto (iPad/iPhone) : le systeme suspend l'interpreteur des que
    l'application passe en arriere-plan, ce qui merite un rappel a l'ecran."""
    if sys.platform in ("ios", "ipados"):
        return True
    # Pyto ne se signale pas autrement que par ses modules maison ; ils sont
    # integres a l'interpreteur, donc deja charges ou trouvables.
    marqueurs = ("pyto", "pyto_ui", "pyto_core", "pythonista", "objc_util")
    if any(nom in sys.modules for nom in marqueurs):
        return True
    try:
        import importlib.util
        return any(importlib.util.find_spec(nom) is not None
                   for nom in marqueurs)
    except Exception:                                  # noqa: BLE001
        return False


def repertoire_courant():
    """Repertoire courant, ou chaine vide s'il est hors de portee.

    Sous Pyto (iPad), os.getcwd() lui-meme leve PermissionError [Errno 1]
    quand le repertoire courant appartient a un dossier auquel l'application
    n'a pas acces : aucun appel nu a getcwd dans ce fichier.
    """
    try:
        return os.getcwd()
    except OSError:
        return ""


def chemin_absolu(brut):
    """dirname(abspath(brut)), ou chaine vide si le systeme s'y oppose."""
    if not brut:
        return ""
    try:
        return os.path.dirname(os.path.abspath(brut))
    except OSError:                       # abspath appelle getcwd si relatif
        return ""


def trouver_dossier():
    """Dossier du depot, avec repli quand __file__ ne le designe pas.

    Sous Pyto (iPad), le script peut etre execute depuis une copie temporaire
    ou avec un __file__ relatif resolu depuis un tout autre repertoire : le
    dossier deduit ne contient alors pas index.html, et le serveur repondait
    « No permission to list directory ». On regarde les autres candidats
    plausibles avant de renoncer. Renvoie "" si aucun ne tient debout.
    """
    candidats = []
    for chemin in (chemin_absolu(__file__),
                   repertoire_courant(),
                   chemin_absolu(sys.argv[0] if sys.argv else "")):
        if chemin and chemin not in candidats:
            candidats.append(chemin)
    for chemin in candidats:
        try:
            if "index.html" in os.listdir(chemin):
                return chemin
        except OSError:
            continue
    return ""                     # rien de lisible : le message suffira


def verifier_dossier(root):
    """Dit a l'ecran pourquoi le dossier servi ne donnera rien de bon.

    Sans ce controle, un ROOT illisible ne se voyait qu'a l'usage, sous la
    forme d'un « 404 -- No permission to list directory » dans le navigateur.
    """
    if not os.path.isdir(root):
        print("[X] Dossier servi introuvable : %s" % root)
        return False
    try:
        contenu = os.listdir(root)
    except OSError as exc:
        print("[X] Dossier servi illisible : %s" % root)
        print("    %s" % exc)
        print("    Le systeme refuse la lecture de ce dossier : --dossier n'y")
        print("    changera rien, c'est une question d'autorisation.")
        print("    Sous Pyto (iPad), Python ne voit un dossier exterieur a")
        print("    l'application que si celle-ci en detient l'autorisation :")
        print("    barre laterale > « Ouvrir dossier » > choisir le dossier du")
        print("    depot (une fois pour toutes), ou deplacer le depot dans le")
        print("    dossier de Pyto lui-meme.")
        return False
    if "index.html" not in contenu:
        print("[!] %s ne contient pas index.html :" % root)
        print("    ce n'est probablement pas le dossier du depot. Le chemin est")
        print("    deduit de __file__ ; s'il est faux, utilisez --dossier.")
        return False
    return True


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

    def list_directory(self, path):
        """Meme role que la version d'origine, mais l'echec est explique.

        « 404 -- No permission to list directory » n'apprend rien a celui qui
        le lit dans Safari, et sur iPad la console de Pyto n'est pas toujours
        visible : on dit quel dossier, quelle erreur systeme, et quoi faire.
        """
        try:
            os.listdir(path)
        except OSError as exc:
            self.send_error(
                404, "Dossier illisible",
                "%s\n%s\n\nDossier servi (ROOT) : %s\n\n"
                "L'application n'a pas acces a ce dossier (bac a sable iOS /"
                " Pyto), ou le chemin deduit de __file__ ne designe pas le"
                " depot. Relancez le serveur avec --dossier <chemin du depot>,"
                " ou donnez a Pyto l'acces au dossier."
                % (path, exc, ROOT))
            return None
        return super().list_directory(path)

    def send_head(self):
        # le filtrage se fait ici : translate_path est aussi appele par
        # list_directory, ou renvoyer une erreur n'est pas possible
        rel = urllib.parse.urlsplit(self.path).path
        # Le depot n'a pas de favicon : repondre « rien a afficher » plutot
        # qu'un 404 par onglet ouvert dans le journal des requetes.
        if rel == "/favicon.ico" and                 not os.path.exists(os.path.join(ROOT, "favicon.ico")):
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
        if passerelle_mcp is None:
            self._envoyer_json({"detail": "Passerelle composants indisponible"
                                          " : %s" % ERREUR_PASSERELLE}, 503)
            return
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
            # lambda et non passerelle_mcp.liste_outils : le module peut etre
            # absent (import tolerant), _api repond alors 503.
            self._api(lambda: passerelle_mcp.liste_outils())
            return
        super().do_GET()

    def do_HEAD(self):
        if self._route() == "/api/tools":
            self._api(lambda: passerelle_mcp.liste_outils())
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
    """Ouvre un serveur sur (host, port).

    Renvoie (serveur ou None, tentatives ratees). C'est a l'appelant de dire
    ce qu'il en pense : une tentative ratee suivie d'un repli reussi n'est pas
    une erreur, et l'afficher comme telle donne l'impression d'un plantage.
    """
    if host in ("", "::"):
        # Double pile d'abord, IPv4 seule ensuite : AF_INET6 n'est pas
        # disponible partout (Pyto sur iPad, certains conteneurs). Sans ce
        # repli, on retombait en silence sur un acces local uniquement.
        families = [DualStackServer, ThreadedServer]
    else:
        # une adresse explicite peut etre IPv4 : le serveur dual-stack echouerait
        families = [ThreadedServer, DualStackServer]
    echecs = []
    for cls in families:
        pile = "IPv6 (double pile)" if cls is DualStackServer else "IPv4"
        try:
            return cls((host, port), CustomHandler), echecs
        except OSError as exc:
            echecs.append("%s, %s:%d -- %s" % (pile, host or "toutes", port, exc))
    return None, echecs


def start_server(host, port, navigateur=True):
    # Avant toute chose : le dossier servi est-il exploitable ? On previent et
    # on continue -- un serveur qui repond, meme mal, reste diagnosticable.
    global ROOT
    if not verifier_dossier(ROOT) and not DOSSIER_IMPOSE:
        secours = trouver_dossier()
        if secours and secours != ROOT:
            print("[*] Dossier de secours retenu (il contient index.html) :")
            print("    %s" % secours)
            ROOT = secours
    def detailler(echecs):
        for ligne in echecs:
            print("      %s" % ligne)

    httpd, echecs = make_server(host, port)
    if httpd is None and port != 0:
        print("[!] Le port %d est refuse (securite entreprise, ou deja"
              " utilise) :" % port)
        detailler(echecs)
        print("[*] Recherche automatique d'un port alternatif autorise...")
        httpd, echecs = make_server(host, 0)
    if httpd is None and host != "127.0.0.1":
        print("[!] Aucune interface reseau n'accepte l'ecoute :")
        detailler(echecs)
        print("[*] Tentative en mode local uniquement (inaccessible depuis"
              " l'iPad)...")
        httpd, echecs = make_server("127.0.0.1", 0)
    if httpd is None:
        print("[X] Impossible de demarrer le serveur :")
        detailler(echecs)
        return 1

    bound_host, bound_port = httpd.server_address[0], httpd.server_address[1]
    is_local_only = bound_host in ("127.0.0.1", "::1")
    url = adresse_locale(bound_host, bound_port)

    if bound_port != port and port != 0:
        print("[*] Port retenu a la place de %d : %d" % (port, bound_port))
        print()
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

    if navigateur and sur_ios():
        # Pyto ouvre l'URL dans un navigateur integre : l'application reste au
        # premier plan et le serveur continue de repondre. En revanche, si l'on
        # quitte Pyto, iOS suspend l'interpreteur -- d'ou le rappel.
        print("  iOS : gardez Pyto au premier plan, le systeme met le serveur")
        print("  en pause des que l'application passe en arriere-plan.")
        print()

    if navigateur:
        print("  Ouverture du navigateur sur %s" % url)
        ouvrir_navigateur(url)

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
    ap.add_argument("--sans-navigateur", dest="navigateur", action="store_false",
                    help="ne pas ouvrir le navigateur au demarrage")
    ap.add_argument("--sans-pause", action="store_true",
                    help="rendre la main sans attendre Entree a la fermeture"
                         " (Windows)")
    ap.add_argument("--dossier", default=None,
                    help="dossier a servir (defaut : celui de ce script ;"
                         " utile quand __file__ ne le designe pas, sous Pyto)")
    args = ap.parse_args(argv)
    if args.dossier:
        global ROOT, DOSSIER_IMPOSE
        ROOT = os.path.abspath(os.path.expanduser(args.dossier))
        DOSSIER_IMPOSE = True
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
