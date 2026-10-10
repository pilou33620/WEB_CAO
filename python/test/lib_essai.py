"""La LIB des bancs d'essai.

WEB_CAO ne versionne plus de LIB : elle vit dans le depot WEB_SUITE_PROJETS
(WEB_SUITE/PROJETS/LIB_CAO), et c'est celle-la que l'outil prend par defaut
(web_CAO.dossier_lib_defaut). Les bancs lisent la meme, ou celle que designe
la variable WEB_CAO_LIB ; ceux qui ECRIVENT travaillent sur une copie jetable,
jamais sur la vraie bibliotheque.

En integration continue, ci.yml clone WEB_SUITE_PROJETS a cote du depot si le
secret PROJETS_TOKEN existe (depot prive). Sinon, WEB_CAO_LIB_MINIMALE=1 donne
aux bancs qui n'eprouvent pas le CONTENU de la LIB (routes, securites) une LIB
factice minimale ; ceux qui l'eprouvent (banc-lib-routes, banc-rf, catalogue)
sont alors sautes par ci.yml, avec un avertissement.
"""
import atexit
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_COPIE = None


def minimale():
    """Une LIB factice, vide ou presque : de quoi demarrer le serveur et
    eprouver ses routes et ses securites sans la vraie bibliotheque."""
    tmp = tempfile.mkdtemp(prefix="webcao_lib_minimale_")
    atexit.register(shutil.rmtree, tmp, True)
    for d in ("lib_empreinte_pcb", "lib_empreinte_schematique", "lib_simulation"):
        os.makedirs(os.path.join(tmp, d))
    with open(os.path.join(tmp, "LIB_composants.csv"), "w", encoding="utf-8") as f:
        f.write("Part Name;Part Type;Description\n")
    with open(os.path.join(tmp, "lib_empreinte_pcb", "0603.json"), "w", encoding="utf-8") as f:
        f.write("{}\n")
    return tmp


def source():
    """Le dossier de la LIB a lire, ou un arret net s'il manque."""
    chemin = os.environ.get("WEB_CAO_LIB")
    if not chemin:
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        import web_CAO
        chemin = web_CAO.dossier_lib_defaut()
    if not os.path.isfile(os.path.join(chemin, "LIB_composants.csv")):
        if os.environ.get("WEB_CAO_LIB_MINIMALE") == "1":
            return minimale()
        raise SystemExit("[X] LIB introuvable (%s). Clonez WEB_SUITE_PROJETS en"
                         " ../PROJETS, ou indiquez-la par WEB_CAO_LIB." % chemin)
    return chemin


def copie():
    """Une copie jetable de la LIB, faite une fois par processus.

    Les milliers de modeles Murata de lib_simulation ne sont pas recopies :
    aucun banc qui ecrit n'en a besoin (banc-rf les lit dans source())."""
    global _COPIE
    if _COPIE is None:
        tmp = tempfile.mkdtemp(prefix="webcao_lib_essai_")
        atexit.register(shutil.rmtree, tmp, True)
        _COPIE = os.path.join(tmp, "LIB")
        shutil.copytree(source(), _COPIE, symlinks=True,
                        ignore=shutil.ignore_patterns("CAPA G*", "INDUC *", "*.zip"))
    return _COPIE


def brancher(web_CAO):
    """Fait de la copie la LIB par defaut du serveur ; renvoie son chemin."""
    c = copie()
    web_CAO.dossier_lib_defaut = lambda: c
    return c
