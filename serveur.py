#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.8.0
# Date: 2026-08-26
# Explication: la visionneuse IPC-2581 (visionneuse-ipc2581/) affiche une carte
#   livree par un fabricant, mais le parseur qui la lit est en Python
#   (ipc2581_parser.py) : un navigateur ne peut pas l'executer. D'ou une route
#   de plus, /api/ipc2581 -- la page envoie le fichier tel quel, le serveur
#   rend le modele en JSON. Rien n'est ecrit sur le disque et rien n'est garde
#   apres la reponse : cette route ne lit pas le disque, elle traduit ce qu'on
#   lui donne. C'est aussi pourquoi elle n'a pas le garde-fou d'ecoute locale
#   des routes de projet -- il n'y a pas de chemin a franchir. Import tolerant
#   comme la passerelle : un parseur absent ne doit pas empecher de servir les
#   editeurs, la route repond alors 503 et la page le dit.
# Fonctions ajoutees/modifiees :
# - ErreurIPC (nouvelle), MAX_IPC, import tolerant de ipc2581_json
# - CustomHandler._ipc2581_etat, _ipc2581_importer, _ipc_api (nouvelles)
# - CustomHandler.do_POST / do_GET / do_HEAD / do_OPTIONS (routage)
#
# Version: 2.7.0
# Date: 2026-08-26
# Explication: un projet est desormais un dossier sur le disque, avec un
#   fichier principal projet.cao.json qui porte le nom, la revision et les
#   liens vers le schema et la carte. Donner ce dossier suffit : les outils y
#   trouvent leurs documents et y reecrivent. Un navigateur ne pouvant pas
#   ouvrir un chemin qu'on lui tape, c'est ce serveur qui tient le disque --
#   d'ou trois routes de plus, batties sur le modele de /api/profil.
#   Deux garde-fous, et ils commandent tout le reste : rien ne sort de la
#   racine declaree (--projets, verdict par realpath, liens symboliques
#   compris), et les routes n'existent pas si l'ecoute n'est pas locale. Une
#   API qui ecrit un chemin venu du navigateur, offerte a un reseau sans mot
#   de passe, donnerait le disque entier a qui le demande.
# Fonctions ajoutees/modifiees :
# - ErreurProjet, racine_projets, nom_projet, sous_racine, chemin_projet,
#   nom_fichier_doc (nouvelles)
# - CustomHandler._projet_api, _projet_garde, _projet_params, _projet_dossier,
#   _projet_outil, _projet_corps, _projet_fichier_lire, _projet_fichier_ecrire,
#   _projet_charge, _projet_doc_chemin, _projets_index, _projet_lire,
#   _projet_ecrire, _projet_doc_lire, _projet_doc_ecrire (nouvelles)
# - CustomHandler.do_GET / do_HEAD / do_PUT / do_OPTIONS (routage)
# - start_server (PROJETS_OUVERT selon l'adresse obtenue), main (--projets)
#
# Version: 2.6.0
# Date: 2026-08-24
# Explication: chaque utilisateur a desormais son espace de travail, garde
#   dans profils/<nom>.json -- panneaux, reglages d'affichage, derniers
#   documents. Le navigateur en garde une copie (localStorage) pour le cas ou
#   la page est ouverte en double-clic, mais un fichier est ce qu'on
#   sauvegarde et ce qu'on emporte : ce serveur lui ouvre trois routes. Le
#   dossier profils/ n'est pas servi en tant que fichiers (HIDDEN) : une seule
#   porte, qui verifie le nom demande, plutot que deux chemins a surveiller.
#   Rien de tout cela ne depend de la passerelle composants -- un profil doit
#   se lire meme quand pcbparts.dev est hors de portee, d'ou _profil_api a
#   cote de _api.
# Fonctions ajoutees/modifiees :
# - ErreurProfil, dossier_profils, nom_profil (nouvelles)
# - CustomHandler._profil_api, _profil_nom, _profil_corps, _profils_index,
#   _profil_lire, _profil_ecrire, _profil_effacer (nouvelles)
# - CustomHandler.do_GET / do_HEAD / do_OPTIONS (routage), do_PUT / do_DELETE
#   (nouvelles), HIDDEN (profils)
#
# Version: 2.5.0
# Date: 2026-08-23
# Explication: verifier_dossier jugeait le dossier servi sur os.listdir, et
#   trouver_dossier cherchait index.html dans un listage. Or servir un fichier
#   ne demande jamais de lister son dossier : sous Pyto (iPad), un dossier peut
#   etre non listable et parfaitement lisible -- c'est ainsi que les versions
#   2.2.0 et anterieures fonctionnaient la ou la 2.3.0 renoncait. Le verdict se
#   fonde desormais sur la lecture reelle d'index.html, et le message distingue
#   les deux causes : autorisation refusee, ou chemin faux.
# Fonctions ajoutees/modifiees :
# - lisible (nouvelle), verifier_dossier (verdict par open, plus par listdir),
#   trouver_dossier (idem)
#
# Version: 2.4.2
# Date: 2026-08-23
# Explication: la page d'erreur conseillait « relancez avec --dossier » la ou
#   le systeme refuse une autorisation -- --dossier ne peut rien contre un
#   EPERM. Elle nomme desormais les deux vraies issues (« Ouvrir dossier »
#   dans Pyto, ou depot deplace dans le dossier propre a Pyto) et precise
#   qu'un script Python ne peut pas faire la copie lui-meme.
# Fonctions modifiees : CustomHandler.list_directory (texte)
#
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

# -- import IPC-2581 --------------------------------------------------------
# Le parseur est en Python : un navigateur ne peut pas l'executer, d'ou la
# route /api/ipc2581 que la visionneuse appelle avec le fichier tel quel.
# Import tolerant, pour la meme raison que la passerelle : ces trois modules
# ne doivent pas empecher les editeurs d'etre servis s'ils manquent.
try:
    import ipc2581_json
    ERREUR_IPC2581 = None
except Exception as _exc:                              # noqa: BLE001
    ipc2581_json = None
    ERREUR_IPC2581 = _exc

# Un IPC-2581 est un XML bavard : une carte de taille moyenne pese quelques
# dizaines de mega-octets, et l'archive ZIP d'un fabricant guere moins une fois
# ouverte. Le plafond protege la memoire du serveur, rien d'autre.
MAX_IPC = 192 * 1024 * 1024


class ErreurIPC(Exception):
    """Refus explicite de la route d'import : code HTTP + message lisible."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message

# -- profils utilisateur ----------------------------------------------------
# Un fichier par utilisateur, portant son nom : profils/Pilou.json. Le
# navigateur en garde une copie (localStorage) pour le cas ou la page est
# ouverte en double-clic, mais c'est ce fichier-ci qui fait foi -- c'est lui
# qu'on sauvegarde et qu'on emporte. Voir commun/profils.js.
PROFILS = "profils"
MAX_PROFIL = 512 * 1024        # un profil, ce sont des reglages : quelques Ko
NOM_INTERDIT = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
NOMS_RESERVES = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", re.I)


class ErreurProfil(Exception):
    """Refus explicite d'une route de profil : code HTTP + message lisible."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def dossier_profils():
    """Le dossier des profils, a cote d'index.html (ROOT peut changer)."""
    return os.path.join(ROOT, PROFILS)


def nom_profil(brut):
    """Nom d'utilisateur -> nom de fichier sur, ou None.

    Le nom vient du navigateur : il n'a le droit ni de traverser un dossier,
    ni de designer un fichier reserve de Windows. On refuse plutot que de
    corriger en silence -- a moitie nettoye, un nom ne designe plus la meme
    personne, et la page sait dire pourquoi il est refuse.
    """
    nom = " ".join(str(brut or "").split())
    if not nom or len(nom) > 40:
        return None
    if NOM_INTERDIT.search(nom):
        return None
    if nom.strip(".") == "" or nom[0] == "." or nom[-1] in ". ":
        return None
    if NOMS_RESERVES.match(nom):
        return None
    return nom


# -- dossiers de projet -----------------------------------------------------
# Un dossier par projet, et dedans un fichier principal projet.cao.json qui
# porte le nom et fait le lien vers le schema et la carte :
#
#     D:\projets\carte PIR\
#         projet.cao.json          <- le nom, la revision, les liens
#         carte PIR-SCH.json
#         carte PIR-PCB.json
#
# Deux garde-fous, et ils ne sont pas negociables : tout reste sous une racine
# declaree (--projets), et la route ne s'ouvre pas si le serveur ecoute sur le
# reseau. Sans cela, une API qui ecrit un chemin venu du navigateur donnerait a
# quiconque sur le reseau un acces en ecriture a tout le disque.
PROJETS = "projets"               # racine par defaut, a cote d'index.html
RACINES_PROJETS = []              # fixees au demarrage par --projets
PROJETS_PROFONDEUR = 3            # niveaux explores en listant (clients/acme/carte)
PROJETS_OUVERT = False            # vrai seulement si l'ecoute est locale
MAX_PROJET = 16 * 1024 * 1024     # un schema ou une carte : quelques centaines de Ko
PROJET_FICHIER = "projet.cao.json"
PROJET_FORMAT = "cao-projet-1"
PROJET_SUFFIXE = {"schema": "-SCH.json", "pcb": "-PCB.json"}


class ErreurProjet(Exception):
    """Refus explicite d'une route de projet : code HTTP + message lisible."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def racines_projets():
    """Les racines declarees, sous lesquelles tout projet doit se trouver.

    Plusieurs, parce que les projets ne vivent pas tous au meme endroit -- un
    disque de travail, un dossier client. Elles se declarent au demarrage et
    nulle part ailleurs : c'est ce qui fait de cette liste une frontiere. Si le
    navigateur pouvait en ajouter une, il n'y aurait plus de frontiere du tout.
    """
    if RACINES_PROJETS:
        return list(RACINES_PROJETS)
    return [os.path.abspath(os.path.join(ROOT, PROJETS))]


def racine_projets():
    """La racine par defaut : celle ou l'on cree quand rien n'est precise."""
    return racines_projets()[0]


def nom_projet(brut):
    """Nom de projet -> nom de dossier sur, ou None.

    Memes regles que pour un profil : ni traversee de dossier, ni nom reserve
    de Windows, et un refus franc plutot qu'un nettoyage silencieux.
    """
    nom = " ".join(str(brut or "").split())
    if not nom or len(nom) > 60:
        return None
    if NOM_INTERDIT.search(nom):
        return None
    if nom.strip(".") == "" or nom[0] == "." or nom[-1] in ". ":
        return None
    if NOMS_RESERVES.match(nom):
        return None
    return nom


def sous_racine(chemin):
    """La racine qui contient ce chemin, ou None s'il n'en a aucune.

    Le verdict se fonde sur realpath : un lien symbolique qui sortirait des
    racines est donc vu comme ce qu'il est, et refuse. C'est la vraie frontiere
    de securite -- les controles de nom, eux, ne font que donner des messages
    clairs.
    """
    cible = os.path.realpath(chemin)
    for racine in racines_projets():
        vraie = os.path.realpath(racine)
        if cible == vraie or cible.startswith(vraie + os.sep):
            return racine
    return None


def chemin_projet(brut, base=None):
    """Ce que le navigateur designe -> dossier de projet, ou une erreur.

    On accepte un simple nom (« carte PIR »), un chemin relatif avec des
    sous-dossiers (« clients/acme/carte PIR ») et un chemin complet
    (« D:\\projets\\carte PIR ») : dire ou un projet se range est justement ce
    qu'on veut pouvoir faire. Mais tape ou construit, il doit tomber sous une
    des racines declarees.

    `base` designe la racine visee pour un chemin relatif ; a defaut c'est la
    premiere. Elle doit elle-meme etre declaree -- sinon il suffirait de
    l'inventer pour sortir.
    """
    brut = str(brut or "").strip().strip('"')
    if not brut:
        raise ErreurProjet(400, "Aucun projet indique")
    if len(brut) > 400:
        raise ErreurProjet(400, "Chemin de projet trop long")
    if "\x00" in brut:
        raise ErreurProjet(400, "Chemin de projet invalide")
    depart = racine_projets()
    if base:
        depart = sous_racine(base)
        if not depart or os.path.realpath(base) != os.path.realpath(depart):
            raise ErreurProjet(403, "Racine inconnue : « %s ». Declarez-la au"
                                    " demarrage avec --projets." % base)
    dossier = os.path.abspath(os.path.join(depart, os.path.expanduser(brut)))
    racine = sous_racine(dossier)
    if not racine:
        raise ErreurProjet(403, "Hors des racines declarees : refuse. Racines :"
                                " %s" % " ; ".join(racines_projets()))
    # Chaque element du chemin doit etre un nom acceptable : le confinement
    # suffirait a la surete, mais un « .. » avale en silence rendrait le
    # message incomprehensible le jour ou il faudra le lire.
    reste = os.path.relpath(dossier, racine)
    if reste != ".":
        for part in reste.replace(os.altsep or os.sep, os.sep).split(os.sep):
            if not nom_projet(part):
                raise ErreurProjet(400, "Element de chemin invalide : « %s »" % part)
    return dossier


def nom_fichier_doc(valeur):
    """Nom de fichier declare dans projet.cao.json -> sur, ou None.

    Ce nom vient d'un fichier sur le disque, pas d'un champ de formulaire :
    a demi confiance seulement. Un simple nom de fichier .json, sans dossier.
    """
    nom = str(valeur or "").strip()
    if not nom or len(nom) > 120:
        return None
    if os.path.basename(nom) != nom:
        return None
    if not nom.lower().endswith(".json"):
        return None
    if NOM_INTERDIT.search(nom) or nom[0] == ".":
        return None
    return nom


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


def lisible(fichier):
    """Vrai si ce fichier peut vraiment etre ouvert et lu.

    Le service des fichiers ne liste jamais le dossier : sous Pyto (iPad),
    os.listdir peut etre refuse alors que open() fonctionne. Juger sur le
    listage ferait renoncer un serveur qui aurait tres bien fonctionne.
    """
    try:
        with open(fichier, "rb") as flux:
            flux.read(1)
        return True
    except OSError:
        return False


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
        if lisible(os.path.join(chemin, "index.html")):
            return chemin
    return ""                     # rien de lisible : le message suffira


def verifier_dossier(root):
    """Dit a l'ecran pourquoi le dossier servi ne donnera rien de bon.

    Le verdict se fonde sur la lecture d'index.html, seule chose dont le
    serveur ait besoin : un dossier non listable mais lisible fonctionne, et
    l'ancienne version le declarait perdu a tort. Quand la lecture echoue, on
    distingue les deux causes -- autorisation refusee, ou mauvais chemin.
    """
    accueil = os.path.join(root, "index.html")
    if lisible(accueil):
        return True

    print("[X] Page d'accueil illisible : %s" % accueil)
    try:
        with open(accueil, "rb"):
            pass
    except OSError as exc:
        print("    %s" % exc)
    try:
        os.listdir(root)
    except OSError as exc:
        print("    Le dossier n'est pas listable non plus : %s" % exc)
        print("    C'est une autorisation qui manque, non un chemin : sous")
        print("    Pyto, barre laterale > « Ouvrir dossier » > ce dossier, ou")
        print("    deplacer le depot dans le dossier propre a Pyto")
        print("    (Fichiers > Sur mon iPad > Pyto).")
    else:
        print("    Le dossier est lisible mais index.html n'y est pas : le")
        print("    chemin deduit de __file__ n'est pas celui du depot.")
        print("    --dossier <chemin> le corrige.")
    return False


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
    # profils/ n'est pas cache par pudeur : il n'a qu'une porte, /api/profil,
    # qui verifie le nom demande. Servir le dossier en plus n'ajouterait
    # rien et donnerait un second chemin a surveiller.
    HIDDEN = ('.git', '.github', '.gitignore', '.venv', '__pycache__', '.env',
              'profils')

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
                "Le systeme refuse la lecture de ce dossier : c'est une"
                " autorisation qui manque, et --dossier n'y changera rien."
                " Sous Pyto (iPad), deux issues : barre laterale >"
                " « Ouvrir dossier » > choisir ce dossier ; ou, plus sur,"
                " deplacer le depot dans le dossier propre a Pyto"
                " (Fichiers > Sur mon iPad > Pyto) et le relancer de la."
                " Le copier depuis Python est impossible : la lecture du"
                " dossier d'origine est justement ce que le systeme refuse."
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

    # -- profils utilisateur ----------------------------------------------
    # Trois routes, et un seul dossier : profils/. La page d'accueil liste les
    # utilisateurs, chaque outil lit et reecrit celui qui travaille.

    def _profil_api(self, action):
        """Execute action() et traduit les refus en JSON {"detail": ...}.

        Jumeau de _api pour les profils, a une difference pres qui compte :
        rien ici ne depend de la passerelle composants. Un profil doit se lire
        et s'ecrire meme quand pcbparts.dev est hors de portee.
        """
        try:
            self._envoyer_json(action())
        except ErreurProfil as exc:
            self.close_connection = True    # le corps n'a peut-etre pas ete lu
            self._envoyer_json({"detail": exc.message}, exc.code)
        except Exception as exc:                       # noqa: BLE001
            self.close_connection = True
            self._envoyer_json({"detail": "Erreur interne : %s" % exc}, 500)

    def _profil_nom(self):
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        nom = nom_profil((params.get("nom") or [""])[0])
        if not nom:
            raise ErreurProfil(400, "Nom d'utilisateur invalide")
        return nom

    def _profil_corps(self):
        try:
            taille = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ErreurProfil(400, "Content-Length invalide")
        if taille > MAX_PROFIL:
            raise ErreurProfil(413, "Profil trop volumineux")
        try:
            return json.loads(self.rfile.read(taille) or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise ErreurProfil(400, "Corps JSON illisible")

    def _profils_index(self):
        """La liste des utilisateurs, c'est le contenu du dossier."""
        try:
            fichiers = sorted(os.listdir(dossier_profils()))
        except OSError:
            fichiers = []                   # dossier absent : aucun profil, pas une erreur
        out = []
        for f in fichiers:
            if not f.lower().endswith(".json"):
                continue
            nom = nom_profil(f[:-len(".json")])
            if not nom:
                continue
            try:
                quand = int(os.path.getmtime(os.path.join(dossier_profils(), f)) * 1000)
            except OSError:
                quand = 0
            out.append({"nom": nom, "t": quand})
        return {"profils": out}

    def _profil_lire(self):
        nom = self._profil_nom()
        chemin = os.path.join(dossier_profils(), nom + ".json")
        try:
            with open(chemin, encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            raise ErreurProfil(404, "Aucun profil pour « %s »" % nom)
        except OSError as exc:
            raise ErreurProfil(500, "Profil illisible : %s" % exc)
        except ValueError:
            raise ErreurProfil(422, "Profil illisible : ce n'est pas du JSON")

    def _profil_ecrire(self):
        # le corps d'abord : un nom refuse ne doit pas laisser la requete a
        # moitie lue dans la connexion
        charge = self._profil_corps()
        nom = self._profil_nom()
        if not isinstance(charge, dict) or charge.get("format") != "cao-profil-1":
            raise ErreurProfil(400, "Ce n'est pas un profil (format attendu :"
                                    " cao-profil-1)")
        dos = dossier_profils()
        try:
            os.makedirs(dos, exist_ok=True)
        except OSError as exc:
            raise ErreurProfil(500, "Dossier profils/ impossible a creer : %s" % exc)
        charge["nom"] = nom
        chemin = os.path.join(dos, nom + ".json")
        temp = chemin + ".tmp"
        # ecriture en deux temps : une coupure de courant au mauvais moment
        # laisse l'ancien profil entier plutot qu'un fichier a moitie ecrit
        try:
            with open(temp, "w", encoding="utf-8") as f:
                f.write(json.dumps(charge, ensure_ascii=False, indent=1))
            os.replace(temp, chemin)
        except OSError as exc:
            try:
                os.remove(temp)
            except OSError:
                pass
            raise ErreurProfil(500, "Profil non enregistre : %s" % exc)
        return {"ok": True, "nom": nom, "t": charge.get("t", 0)}

    def _profil_effacer(self):
        nom = self._profil_nom()
        try:
            os.remove(os.path.join(dossier_profils(), nom + ".json"))
        except FileNotFoundError:
            pass                            # deja parti : le resultat est celui voulu
        except OSError as exc:
            raise ErreurProfil(500, "Profil non supprime : %s" % exc)
        return {"ok": True, "nom": nom}

    # -- dossiers de projet -----------------------------------------------
    # Un dossier, un fichier principal (projet.cao.json), les documents a
    # cote. La page d'accueil designe le dossier ; chaque outil y lit et y
    # reecrit le sien, et c'est ainsi que schema et carte restent lies.

    def _projet_api(self, action):
        """Jumeau de _profil_api pour les projets."""
        try:
            self._envoyer_json(action())
        except ErreurProjet as exc:
            self.close_connection = True    # le corps n'a peut-etre pas ete lu
            self._envoyer_json({"detail": exc.message}, exc.code)
        except Exception as exc:                       # noqa: BLE001
            self.close_connection = True
            self._envoyer_json({"detail": "Erreur interne : %s" % exc}, 500)

    def _projet_garde(self):
        """Ces routes n'existent que sur une ecoute locale.

        Ecrire sur le disque a la demande du navigateur est deja beaucoup ;
        l'offrir au reseau serait offrir le disque. Le refus dit quoi faire.
        """
        if not PROJETS_OUVERT:
            raise ErreurProjet(403, "Dossiers de projet refuses : ce serveur"
                                    " ecoute sur le reseau. Relancez-le avec"
                                    " --local pour ouvrir cette route.")

    def _projet_params(self):
        return urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)

    def _projet_dossier(self):
        self._projet_garde()
        params = self._projet_params()
        brut = (params.get("chemin") or params.get("nom") or [""])[0]
        # « racine » dit sous laquelle des racines declarees ranger un chemin
        # relatif ; elle doit etre declaree, sinon l'inventer suffirait a sortir
        base = (params.get("racine") or [""])[0]
        return chemin_projet(brut, base or None)

    def _projet_outil(self):
        outil = (self._projet_params().get("doc") or [""])[0]
        if outil not in PROJET_SUFFIXE:
            raise ErreurProjet(400, "Document inconnu : « %s » (attendu :"
                                    " schema ou pcb)" % outil)
        return outil

    def _projet_corps(self):
        try:
            taille = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ErreurProjet(400, "Content-Length invalide")
        if taille > MAX_PROJET:
            raise ErreurProjet(413, "Fichier trop volumineux")
        try:
            return json.loads(self.rfile.read(taille) or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise ErreurProjet(400, "Corps JSON illisible")

    def _projet_fichier_lire(self, chemin, quoi):
        try:
            with open(chemin, encoding="utf-8") as flux:
                return json.load(flux)
        except FileNotFoundError:
            raise ErreurProjet(404, "%s : introuvable" % quoi)
        except OSError as exc:
            raise ErreurProjet(500, "%s : illisible (%s)" % (quoi, exc))
        except ValueError:
            raise ErreurProjet(422, "%s : ce n'est pas du JSON" % quoi)

    def _projet_fichier_ecrire(self, chemin, charge, quoi):
        try:
            os.makedirs(os.path.dirname(chemin), exist_ok=True)
        except OSError as exc:
            raise ErreurProjet(500, "Dossier impossible a creer : %s" % exc)
        temp = chemin + ".tmp"
        # ecriture en deux temps, comme pour les profils : une coupure de
        # courant laisse l'ancien fichier entier plutot qu'un fichier a
        # moitie ecrit -- et un schema a moitie ecrit, c'est du travail perdu
        try:
            with open(temp, "w", encoding="utf-8") as flux:
                flux.write(json.dumps(charge, ensure_ascii=False, indent=1))
            os.replace(temp, chemin)
        except OSError as exc:
            try:
                os.remove(temp)
            except OSError:
                pass
            raise ErreurProjet(500, "%s : non enregistre (%s)" % (quoi, exc))

    def _projet_charge(self, dossier):
        return self._projet_fichier_lire(
            os.path.join(dossier, PROJET_FICHIER),
            "Le fichier projet (%s)" % PROJET_FICHIER)

    def _projet_doc_chemin(self, dossier, outil, charge=None, lire=False):
        """Le fichier d'un outil dans ce dossier.

        projet.cao.json a le dernier mot : c'est lui qui fait le lien. A
        defaut de declaration lisible, le nom se deduit du projet -- un
        dossier prepare a la main reste donc utilisable.

        `lire` autorise un dernier repli, et seulement en lecture : si le nom
        attendu ne designe rien, on prend le premier fichier du dossier qui
        porte le suffixe de l'outil. Un projet renomme, ou un dossier rempli a
        la main, s'ouvre ainsi au lieu de paraitre vide -- mais on n'ecrit
        jamais sur un fichier trouve de cette facon : ce qu'on ecrit porte le
        nom canonique.
        """
        nom = None
        if isinstance(charge, dict):
            fichiers = charge.get("fichiers")
            if isinstance(fichiers, dict):
                nom = nom_fichier_doc(fichiers.get(outil))
        if not nom:
            base = nom_projet(charge.get("nom")) if isinstance(charge, dict) else None
            base = base or os.path.basename(dossier.rstrip(os.sep + (os.altsep or ""))) 
            nom = base + PROJET_SUFFIXE[outil]
        chemin = os.path.join(dossier, nom)
        if lire and not lisible(chemin):
            trouve = self._projet_doc_trouver(dossier, outil)
            if trouve:
                return trouve
        return chemin

    def _projet_doc_trouver(self, dossier, outil):
        """Le premier fichier du dossier qui porte le suffixe de l'outil."""
        suffixe = PROJET_SUFFIXE[outil].lower()
        try:
            entrees = sorted(os.listdir(dossier))
        except OSError:
            return None
        for entree in entrees:
            if not entree.lower().endswith(suffixe):
                continue
            chemin = os.path.join(dossier, entree)
            if nom_fichier_doc(entree) and lisible(chemin):
                return chemin
        return None

    def _projets_index(self):
        """Les projets, c'est ce que contiennent les racines declarees.

        Un dossier compte comme projet s'il porte un projet.cao.json ; le
        reste du disque n'est pas notre affaire. On explore les sous-dossiers
        jusqu'a une profondeur fixee : clients/acme/carte PIR, c'est un projet
        range dans sa filiere, et on veut qu'il remonte dans l'index.
        """
        self._projet_garde()
        out = []
        for racine in racines_projets():
            try:
                self._explorer_projets(racine, racine, 0, out)
            except OSError:
                pass               # racine absente : aucun projet, pas une erreur
        out.sort(key=lambda p: (-p["t"], p["chemin"].lower()))
        return {"racines": racines_projets(), "projets": out}

    def _explorer_projets(self, racine, courant, niveau, accumule):
        """Parcourt recursivement un dossier pour trouver les projets."""
        if niveau > PROJETS_PROFONDEUR:
            return
        for entree in sorted(os.listdir(courant)):
            chemin = os.path.join(courant, entree)
            if not os.path.isdir(chemin):
                continue
            principal = os.path.join(chemin, PROJET_FICHIER)
            if lisible(principal):
                relatif = os.path.relpath(chemin, racine)
                nom = relatif
                try:
                    with open(principal, encoding="utf-8") as flux:
                        nom = nom_projet(json.load(flux).get("nom")) or relatif
                except (OSError, ValueError):
                    pass               # illisible : liste sous son nom de dossier
                try:
                    quand = int(os.path.getmtime(principal) * 1000)
                except OSError:
                    quand = 0
                accumule.append({"nom": nom, "chemin": relatif, "racine": racine, "t": quand})
            else:
                self._explorer_projets(racine, chemin, niveau + 1, accumule)

    def _projet_lire(self):
        dossier = self._projet_dossier()
        charge = self._projet_charge(dossier)
        etat = {}
        for outil in PROJET_SUFFIXE:
            chemin = self._projet_doc_chemin(dossier, outil, charge, lire=True)
            etat[outil] = {"fichier": os.path.basename(chemin),
                           "present": lisible(chemin)}
        return {"projet": charge, "dossier": dossier, "documents": etat}

    def _projet_ecrire(self):
        # le corps d'abord : un chemin refuse ne doit pas laisser la requete a
        # moitie lue dans la connexion
        charge = self._projet_corps()
        dossier = self._projet_dossier()
        if not isinstance(charge, dict) or charge.get("format") != PROJET_FORMAT:
            raise ErreurProjet(400, "Ce n'est pas un fichier projet (format"
                                    " attendu : %s)" % PROJET_FORMAT)
        if not nom_projet(charge.get("nom")):
            raise ErreurProjet(400, "Le fichier projet n'a pas de nom valide")
        self._projet_fichier_ecrire(os.path.join(dossier, PROJET_FICHIER),
                                    charge, "Le fichier projet")
        return {"ok": True, "dossier": dossier, "nom": charge.get("nom")}

    def _projet_doc_lire(self):
        dossier = self._projet_dossier()
        outil = self._projet_outil()
        chemin = self._projet_doc_chemin(dossier, outil, self._projet_charge(dossier),
                                         lire=True)
        return {"document": self._projet_fichier_lire(chemin,
                                                      "Le document %s" % outil),
                "fichier": os.path.basename(chemin)}

    def _projet_doc_ecrire(self):
        charge = self._projet_corps()
        dossier = self._projet_dossier()
        outil = self._projet_outil()
        if not isinstance(charge, dict):
            raise ErreurProjet(400, "Document illisible")
        # le fichier projet est l'ancre : sans lui, ce dossier n'est pas un
        # projet et on n'y ecrit pas de document
        chemin = self._projet_doc_chemin(dossier, outil, self._projet_charge(dossier))
        self._projet_fichier_ecrire(chemin, charge, "Le document %s" % outil)
        return {"ok": True, "fichier": os.path.basename(chemin)}

    # -- import IPC-2581 ---------------------------------------------------
    # La visionneuse envoie le fichier tel quel, le serveur rend le modele en
    # JSON. Le parseur est en Python (ipc2581_parser.py) : c'est la seule
    # raison pour laquelle cette route existe -- le navigateur ne peut pas
    # l'executer. Rien n'est ecrit sur le disque, rien n'est garde en memoire
    # au-dela de la reponse : le fichier arrive, il repart traduit.

    def _ipc2581_etat(self):
        """Ce que le serveur sait faire : la page le demande avant d'ouvrir."""
        if ipc2581_json is None:
            return {"dispo": False,
                    "detail": "Parseur IPC-2581 indisponible : %s" % ERREUR_IPC2581}
        return {"dispo": True, "format": ipc2581_json.FORMAT,
                "extensions": list(ipc2581_json.EXTENSIONS) + [".zip"],
                "max": MAX_IPC}

    def _ipc2581_importer(self):
        """Corps de la requete (XML ou ZIP) -> modele JSON de la carte."""
        if ipc2581_json is None:
            raise ErreurIPC(503, "Parseur IPC-2581 indisponible : %s"
                                 % ERREUR_IPC2581)
        try:
            taille = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ErreurIPC(400, "Content-Length invalide")
        if taille <= 0:
            raise ErreurIPC(400, "Fichier vide")
        if taille > MAX_IPC:
            raise ErreurIPC(413, "Fichier trop grand : %.1f Mo, maximum %d Mo"
                                 % (taille / 1048576.0, MAX_IPC // 1048576))

        data = self.rfile.read(taille)
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        nom = os.path.basename((params.get("nom") or [""])[0])[:200]

        try:
            modele = ipc2581_json.ipc2581_en_dict(data, nom)
        except ipc2581_json.IPC2581ParseError as exc:
            raise ErreurIPC(422, str(exc))
        except MemoryError:
            raise ErreurIPC(413, "Fichier trop volumineux pour la memoire"
                                 " disponible")
        sys.stderr.write("  IPC-2581 « %s » : %d composant(s), %d piste(s),"
                         " %d percage(s)\n"
                         % (nom or "(sans nom)", modele["stats"]["composants"],
                            modele["stats"]["pistes"],
                            modele["stats"]["percages"]))
        return modele

    def _ipc_api(self, action):
        """Execute action() et traduit les refus en JSON {"detail": ...}.

        Troisieme jumeau de _api, pour la meme raison que _profil_api : un
        import IPC-2581 ne depend ni de pcbparts.dev ni des dossiers de projet.
        """
        try:
            self._envoyer_json(action())
        except ErreurIPC as exc:
            self.close_connection = True    # le corps n'a peut-etre pas ete lu
            self._envoyer_json({"detail": exc.message}, exc.code)
        except Exception as exc:                       # noqa: BLE001
            self.close_connection = True
            self._envoyer_json({"detail": "Erreur interne : %s" % exc}, 500)

    def do_OPTIONS(self):
        route = self._route()
        if route in ("/api/profils", "/api/profil",
                     "/api/projets", "/api/projet", "/api/projet/doc"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Methods",
                             "GET, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self._cors()
            self.end_headers()
            return
        if route not in ("/api/tools", "/api/tool", "/api/ipc2581"):
            self.send_error(405, "Unsupported method (OPTIONS)")
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self._cors()
        self.end_headers()

    def do_PUT(self):
        route = self._route()
        if route == "/api/profil":
            self._profil_api(self._profil_ecrire)
            return
        if route == "/api/projet":
            self._projet_api(self._projet_ecrire)
            return
        if route == "/api/projet/doc":
            self._projet_api(self._projet_doc_ecrire)
            return
        self.send_error(405, "Unsupported method (PUT)")

    def do_DELETE(self):
        if self._route() != "/api/profil":
            self.send_error(405, "Unsupported method (DELETE)")
            return
        self._profil_api(self._profil_effacer)

    def do_POST(self):
        route = self._route()
        if route == "/api/ipc2581":
            self._ipc_api(self._ipc2581_importer)
            return
        if route != "/api/tool":
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
        route = self._route()
        if route == "/api/tools":
            # lambda et non passerelle_mcp.liste_outils : le module peut etre
            # absent (import tolerant), _api repond alors 503.
            self._api(lambda: passerelle_mcp.liste_outils())
            return
        if route == "/api/profils":
            self._profil_api(self._profils_index)
            return
        if route == "/api/profil":
            self._profil_api(self._profil_lire)
            return
        if route == "/api/projets":
            self._projet_api(self._projets_index)
            return
        if route == "/api/projet":
            self._projet_api(self._projet_lire)
            return
        if route == "/api/projet/doc":
            self._projet_api(self._projet_doc_lire)
            return
        if route == "/api/ipc2581":
            self._ipc_api(self._ipc2581_etat)
            return
        super().do_GET()

    def do_HEAD(self):
        route = self._route()
        if route == "/api/tools":
            self._api(lambda: passerelle_mcp.liste_outils())
            return
        if route == "/api/profils":
            self._profil_api(self._profils_index)
            return
        if route == "/api/profil":
            self._profil_api(self._profil_lire)
            return
        if route == "/api/projets":
            self._projet_api(self._projets_index)
            return
        if route == "/api/projet":
            self._projet_api(self._projet_lire)
            return
        if route == "/api/projet/doc":
            self._projet_api(self._projet_doc_lire)
            return
        if route == "/api/ipc2581":
            self._ipc_api(self._ipc2581_etat)
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

    # Les dossiers de projet ne s'ouvrent que sur une ecoute locale. Le choix
    # se fait ici, sur l'adresse reellement obtenue -- pas sur l'intention :
    # un repli sur 127.0.0.1 apres un port refuse doit compter comme local.
    global PROJETS_OUVERT
    PROJETS_OUVERT = is_local_only

    if bound_port != port and port != 0:
        print("[*] Port retenu a la place de %d : %d" % (port, bound_port))
        print()
    print("=" * 60)
    print("SERVEUR CAO WEB DEMARRE")
    print("=" * 60)
    print("  dossier servi : %s" % ROOT)
    print("  passerelle    : /api/tools et /api/tool -> pcbparts.dev")
    if PROJETS_OUVERT:
        print("  projets       : /api/projets, /api/projet, /api/projet/doc")
        for i, racine in enumerate(racines_projets()):
            print("                  %s %s"
                  % ("racine :" if i == 0 else "        ", racine))
        if len(racines_projets()) > 1:
            print("                  (la premiere sert de defaut a la creation)")
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
        print("  Les dossiers de projet sont refuses dans ce mode : lire et")
        print("  ecrire sur le disque ne s'ouvre pas a un reseau sans mot de")
        print("  passe. Relancez avec --local pour les utiliser.")
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
    ap.add_argument("--projets", action="append", default=None, metavar="DOSSIER",
                    help="racine des dossiers de projet (defaut : projets/ a"
                         " cote d'index.html). Repetable, ou plusieurs chemins"
                         " separes par « %s ». Aucun projet ne peut etre lu ni"
                         " ecrit hors de ces racines" % os.pathsep)
    args = ap.parse_args(argv)
    if args.dossier:
        global ROOT, DOSSIER_IMPOSE
        ROOT = os.path.abspath(os.path.expanduser(args.dossier))
        DOSSIER_IMPOSE = True
    if args.projets:
        global RACINES_PROJETS
        # --projets se repete, et chaque valeur peut en contenir plusieurs :
        # « --projets D:\projets;E:\clients » comme « --projets a --projets b »
        vues = []
        for brut in args.projets:
            for part in str(brut).split(os.pathsep):
                part = part.strip().strip('"')
                if not part:
                    continue
                chemin = os.path.abspath(os.path.expanduser(part))
                if chemin not in vues:
                    vues.append(chemin)
        RACINES_PROJETS = vues
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
