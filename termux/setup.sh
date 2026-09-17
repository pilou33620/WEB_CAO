#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# WEB_CAO -- Script d'amorcage rapide (bootstrap) pour Termux
# ==============================================================================
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/installer.sh" ]; then
    bash "$DIR/installer.sh" "$@"
else
    bash <(curl -fsSL https://raw.githubusercontent.com/pilou33620/WEB_CAO/main/termux/installer.sh) "$@"
fi
