"""La LIB des bancs d'essai.

WEB_CAO ne versionne plus de LIB : elle vit dans le depot WEB_SUITE_PROJETS
(WEB_SUITE/PROJETS/LIB_CAO), et c'est celle-la que l'outil prend par defaut
(web_CAO.dossier_lib_defaut). Les bancs lisent la meme, ou celle que designe
la variable WEB_CAO_LIB ; ceux qui ECRIVENT travaillent sur une copie jetable,
jamais sur la vraie bibliotheque.

En integration continue, ci.yml clone WEB_SUITE_PROJETS a cote du depot (depot
prive : avec le secret PROJETS_TOKEN).
"""
import atexit
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_COPIE = None


def source():
    """Le dossier de la LIB a lire, ou un arret net s'il manque."""
    chemin = os.environ.get("WEB_CAO_LIB")
    if not chemin:
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        import web_CAO
        chemin = web_CAO.dossier_lib_defaut()
    if not os.path.isfile(os.path.join(chemin, "LIB_composants.csv")):
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
