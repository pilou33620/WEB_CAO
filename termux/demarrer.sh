#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# WEB_CAO -- Lanceur Android / Termux
# ==============================================================================
# Ce script est concu pour etre execute depuis un terminal Termux ou via
# le raccourci 1-clic sur l'ecran d'accueil (Termux:Widget).
#
# Comportement :
#   1. Localise et se positionne dans le repertoire du projet WEB_CAO.
#   2. Active le wake-lock Android (termux-wake-lock) pour empecher la mise en
#      veille du serveur par le gestionnaire de batterie.
#   3. Lance web_CAO.py en mode local (--local) :
#      - Verifie automatiquement les mises a jour sur GitHub (git pull).
#      - Redemarre transparentement si une mise a jour est appliquee.
#      - Demarre le serveur HTTP local (127.0.0.1:8000).
#      - Ouvre automatiquement le navigateur Android natif (Chrome, etc.).
#   4. Libere proprement le wake-lock a l'arret (Ctrl+C).
# ==============================================================================

# Resolution de l'emplacement reel du depot (gere les liens symboliques ~/.shortcuts/)
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

# Le script est dans le sous-dossier termux/ ; le depot est le parent
if [ -f "$SCRIPT_DIR/../web_CAO.py" ]; then
    ROOT_DIR="$(cd -P "$SCRIPT_DIR/.." && pwd)"
elif [ -f "$HOME/WEB_CAO/web_CAO.py" ]; then
    ROOT_DIR="$HOME/WEB_CAO"
else
    ROOT_DIR="$SCRIPT_DIR"
fi

cd "$ROOT_DIR" || {
    echo "[!] Impossible d'acceder au dossier WEB_CAO : $ROOT_DIR"
    exit 1
}

# 1. Activation du wake-lock Android
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
fi

# Nettoyage automatique du wake-lock a la fermeture
trap 'command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock' EXIT INT TERM

echo "============================================================"
echo " SERVEUR WEB_CAO -- DEMARRAGE SOUS ANDROID (TERMUX)"
echo "============================================================"
echo "  Dossier : $ROOT_DIR"

# 2. Verification de Python
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "[!] Python n'est pas installe dans Termux."
    echo "    Installation automatique en cours..."
    pkg update -y && pkg install -y python
    PYTHON_BIN="python"
fi

# 3. Execution de web_CAO.py
# Note: --local est passe par defaut pour autoriser l'acces aux dossiers de projet
# et isoler le serveur sur l'appareil. La verification des mises a jour GitHub
# et l'ouverture du navigateur sont effectuees automatiquement par web_CAO.py.
$PYTHON_BIN web_CAO.py --local "$@"
