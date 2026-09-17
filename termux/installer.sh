#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# WEB_CAO -- Script d'installation automatique pour Android / Termux
# ==============================================================================
# Ce script installe toutes les dependances systeme (Git, Python, termux-tools),
# clone ou met a jour le depot WEB_CAO, installe les solveurs SI/PI (numpy, scipy),
# configure le raccourci 1-clic (Termux:Widget) et cree la commande « web-cao ».
# ==============================================================================

set -e

REPO_URL="https://github.com/pilou33620/WEB_CAO.git"
INSTALL_DIR="$HOME/WEB_CAO"

echo "============================================================"
echo "    INSTALLATION DE WEB_CAO SOUS ANDROID (TERMUX)"
echo "============================================================"
echo

# 1. Mise a jour des paquets et outils de base
echo "[1/5] Mise a jour des paquets et installation de Git, Python..."
pkg update -y
pkg install -y git python termux-tools

# 2. Telechargement ou mise a jour du depot GitHub
echo
echo "[2/5] Verification du depot WEB_CAO..."
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "  Depot deja present dans $INSTALL_DIR. Mise a jour..."
    cd "$INSTALL_DIR"
    git fetch origin
    git pull --ff-only || true
elif [ -f "$(dirname "$0")/../web_CAO.py" ]; then
    # Le script est execute depuis un dossier WEB_CAO existant
    CURRENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
    if [ "$CURRENT_DIR" != "$INSTALL_DIR" ]; then
        echo "  Creation du lien symbolique $INSTALL_DIR -> $CURRENT_DIR"
        ln -sfn "$CURRENT_DIR" "$INSTALL_DIR"
    fi
else
    echo "  Clonage du depot depuis $REPO_URL..."
    git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true

# 3. Rendre les scripts executables
echo
echo "[3/5] Configuration des permissions d'execution..."
chmod +x "$INSTALL_DIR/termux/demarrer.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/termux/installer.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/termux/setup.sh" 2>/dev/null || true

# 4. Installation des bibliotheques de calcul (numpy, scipy pour les simulations SI / PI)
echo
echo "[4/5] Installation des bibliotheques de simulation SI / PI (NumPy, SciPy)..."
echo "  -> Installation de python-numpy..."
pkg install -y python-numpy || true

echo "  -> Installation de python-scipy via tur-repo..."
pkg install -y tur-repo 2>/dev/null || true
pkg install -y python-scipy 2>/dev/null || true

echo
echo "  Verification des modules dans Python :"
python3 -c "import numpy; print('    [OK] NumPy version ' + numpy.__version__ + ' (solveurs MoM, impédance & diaphonie)')" 2>/dev/null || echo "    [!] NumPy non actif (solveurs EM avances indisponibles)"
python3 -c "import scipy; print('    [OK] SciPy version ' + scipy.__version__ + ' (solveur de chute DC & thermique)')" 2>/dev/null || echo "    [!] SciPy non actif (solveur DC indisponible)"

# 5. Creation du raccourci Termux:Widget et de la commande globale
echo
echo "[5/5] Configuration des raccourcis..."

# Dossier des raccourcis Termux:Widget
SHORTCUTS_DIR="$HOME/.shortcuts"
mkdir -p "$SHORTCUTS_DIR"
ln -sf "$INSTALL_DIR/termux/demarrer.sh" "$SHORTCUTS_DIR/WEB_CAO.sh"
chmod +x "$SHORTCUTS_DIR/WEB_CAO.sh"

# Commande directe « web-cao » utilisable n'importe ou dans Termux
if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    ln -sf "$INSTALL_DIR/termux/demarrer.sh" "$PREFIX/bin/web-cao"
    chmod +x "$PREFIX/bin/web-cao"
fi

echo
echo "============================================================"
echo "           INSTALLATION TERMINEE AVEC SUCCES !             "
echo "============================================================"
echo
echo "  Comment lancer WEB_CAO des maintenant :"
echo "  ----------------------------------------"
echo "  1. En ligne de commande : tapez simplement « web-cao »"
echo
echo "  2. Raccourci 1-clic sur votre ecran d'accueil (Recommande) :"
echo "     - Installez l'application gratuite « Termux:Widget » depuis F-Droid"
echo "       (https://f-droid.org/packages/com.termux.widget/)"
echo "     - Sur l'ecran d'accueil de votre telephone, faites un appui long"
echo "     - Choisissez « Widgets » > « Termux:Widget » (1x1)"
echo "     - Selectionnez « WEB_CAO.sh »"
echo
echo "  A chaque lancement :"
echo "    -> Le script verifie automatiquement les mises a jour GitHub (git pull)."
echo "    -> Il active le wake-lock pour empecher la mise en veille."
echo "    -> Il demarre le serveur local (127.0.0.1:8000)."
echo "    -> Il ouvre instantanement votre navigateur web sur l'outil !"
echo "============================================================"
echo
