#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 1.2.0
# Date: 2026-08-23
# Explication: le diagnostic disait ce qui echouait, pas ou aller ensuite.
#   Quand iCloud Drive est refuse par le systeme, la sortie est le dossier
#   propre a l'application : on l'imprime, on verifie qu'il est lisible, et on
#   signale toute copie du depot qui s'y trouve deja (avec la commande prete).
# Fonctions modifiees : main (section « ou Python a les pleins droits »)
#
# Version: 1.1.0
# Date: 2026-08-23
# Explication: le diagnostic s'arretait lui-meme sur PermissionError, sous
#   Pyto, des la ligne « repertoire courant » : os.getcwd() est refuse quand le
#   repertoire courant est un dossier auquel l'application n'a pas acces. Un
#   diagnostic doit rapporter l'echec, jamais s'y arreter.
# Fonctions ajoutees : sans_echec
#
# Version: 1.0.0
# Date: 2026-08-23
# Explication: sous Pyto (iPad), serveur.py demarrait sans servir le depot
#   (« 404 -- No permission to list directory ») : le dossier deduit de
#   __file__ n'etait pas lisible, ou n'etait pas le bon. Impossible de trancher
#   a distance -- ce script imprime tout ce qui sert au diagnostic, en
#   bibliotheque standard, sans rien modifier ni ouvrir de socket durable.
# Fonctions:
# - titre, ligne : mise en page
# - main : environnement, dossier servi, imports du serveur, essai d'ecoute
# ==========================================
"""Diagnostic du serveur sur un appareil ou il refuse de fonctionner.

    python diagnostic_ipad.py

A lancer depuis le meme endroit que serveur.py (Pyto, a-Shell, Windows...).
Le resultat tient en un ecran : c'est lui qu'il faut recopier pour comprendre
pourquoi serveur.py ne sert pas le depot.
"""
import os
import socket
import sys


def sans_echec(action, defaut="ECHEC"):
    """Valeur de action(), ou le message d'erreur : sous Pyto, os.getcwd() et
    os.listdir peuvent lever PermissionError -- un diagnostic ne doit surtout
    pas s'arreter la."""
    try:
        return action()
    except Exception as exc:                           # noqa: BLE001
        return "%s : %s" % (defaut, exc)


def titre(texte):
    print("")
    print("-- %s " % texte + "-" * max(0, 56 - len(texte)))


def ligne(cle, valeur):
    print("  %-22s %s" % (cle, valeur))


def main():
    print("=" * 60)
    print("DIAGNOSTIC WEB_CAO")
    print("=" * 60)

    titre("interpreteur")
    ligne("version", sys.version.replace("\n", " "))
    ligne("sys.platform", sys.platform)
    ligne("os.name", os.name)
    ligne("Pyto detecte", any(n in sys.modules for n in
                             ("pyto", "pyto_ui", "pyto_core")))

    titre("chemins")
    ligne("__file__", __file__)
    ligne("repertoire courant", sans_echec(os.getcwd))
    root = os.path.dirname(os.path.abspath(__file__))
    ligne("ROOT (deduit)", root)
    ligne("ROOT est un dossier", sans_echec(lambda: os.path.isdir(root)))
    ligne("sys.path[0]", sys.path[0] if sys.path else "(vide)")

    titre("lecture du dossier servi")
    try:
        contenu = sorted(os.listdir(root))
    except OSError as exc:
        print("  ECHEC os.listdir : %s" % exc)
        print("  >> c'est la cause du « No permission to list directory ».")
        contenu = None
    else:
        ligne("entrees", len(contenu))
        ligne("apercu", ", ".join(contenu[:10]) or "(vide)")
        for attendu in ("index.html", "serveur.py", "passerelle_mcp.py"):
            ligne(attendu, "present" if attendu in contenu else "ABSENT")

    if contenu is not None and "index.html" in contenu:
        titre("lecture d'index.html")
        try:
            with open(os.path.join(root, "index.html"), "rb") as f:
                ligne("premiers octets", len(f.read(64)))
        except OSError as exc:
            print("  ECHEC open : %s" % exc)

    titre("ou Python a les pleins droits")
    # Sous Pyto, le dossier propre a l'application est toujours lisible : c'est
    # la qu'il faut poser le depot quand iCloud Drive est refuse.
    for nom, chemin in (("~", os.path.expanduser("~")),
                        ("~/Documents", os.path.expanduser("~/Documents"))):
        lisible = sans_echec(lambda c=chemin: len(os.listdir(c)))
        ligne(nom, chemin)
        ligne("  lisible", lisible)
        entrees = sans_echec(lambda c=chemin: os.listdir(c))
        if isinstance(entrees, list):
            candidats = [e for e in entrees if "WEB_CAO" in e or "web_cao" in e]
            if candidats:
                ligne("  depot trouve", ", ".join(candidats))
                for cand in candidats:
                    plein = os.path.join(chemin, cand)
                    if sans_echec(lambda c=plein: "index.html" in os.listdir(c)) is True:
                        print("  >> utilisable : python serveur.py --dossier "
                              "'%s'" % plein)

    titre("modules dont depend serveur.py")
    for nom in ("http.server", "socketserver", "ssl", "webbrowser",
                "threading", "urllib.request"):
        try:
            __import__(nom)
            ligne(nom, "ok")
        except Exception as exc:                       # noqa: BLE001
            ligne(nom, "ECHEC : %s" % exc)

    titre("import de la passerelle composants")
    if root not in sys.path:
        sys.path.insert(0, root)
    try:
        import passerelle_mcp                          # noqa: F401
        ligne("passerelle_mcp", "ok")
    except Exception as exc:                           # noqa: BLE001
        ligne("passerelle_mcp", "ECHEC : %s" % exc)
        print("  >> sans le correctif, cet echec empechait tout demarrage.")

    titre("essai d'ecoute")
    for famille, hote in ((socket.AF_INET, ""), (socket.AF_INET6, "")):
        nom = "IPv4" if famille == socket.AF_INET else "IPv6"
        s = socket.socket(famille, socket.SOCK_STREAM)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((hote, 8000))
            s.listen(1)
            ligne("%s port 8000" % nom, "libre")
        except OSError as exc:
            ligne("%s port 8000" % nom, "ECHEC : %s" % exc)
        finally:
            s.close()

    titre("adresse locale")
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ligne("ruse UDP", s.getsockname()[0])
    except OSError as exc:
        ligne("ruse UDP", "ECHEC : %s" % exc)
        print("  >> autorisation « Reseau local » refusee ?")
    finally:
        s.close()
    try:
        ligne("gethostbyname", socket.gethostbyname(socket.gethostname()))
    except OSError as exc:
        ligne("gethostbyname", "ECHEC : %s" % exc)

    print("")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
