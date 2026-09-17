# 📱 WEB_CAO sur Android avec Termux

Utilisez la suite **WEB_CAO** directement sur votre smartphone ou tablette Android grâce à **Termux**, avec :
- **Raccourci 1-clic** sur votre écran d'accueil d'Android (icône d'application via [Termux:Widget](https://f-droid.org/packages/com.termux.widget/)).
- **Mise à jour automatique** au démarrage depuis GitHub (`git fetch` + `git pull`).
- **Gestion automatique de la mise en veille** (`termux-wake-lock`).
- **Ouverture instantanée de votre navigateur web** (Chrome, Firefox, Samsung Internet...) sur `http://127.0.0.1:8000/`.
- **Accès complet aux dossiers de projet** en mode local sécurisé.

---

## ⚡ Installation ultra-rapide en 1 commande

### Étape 1 : Installer Termux et Termux:Widget
Téléchargez et installez les deux applications depuis **F-Droid** :
1. **[Termux sur F-Droid](https://f-droid.org/packages/com.termux/)**
2. **[Termux:Widget sur F-Droid](https://f-droid.org/packages/com.termux.widget/)**

> [!CAUTION]
> **N'utilisez PAS la version du Google Play Store** : celle-ci est abandonnée depuis plusieurs années et les dépôts de paquets y sont cassés. Utilisez toujours les versions de **F-Droid** ou des [Releases GitHub officielles de Termux](https://github.com/termux/termux-app/releases).

---

### Étape 2 : Lancer l'installation automatique
Ouvrez l'application **Termux** sur votre téléphone et copiez-collez cette commande unique :

```bash
pkg update -y && pkg install -y git && git clone https://github.com/pilou33620/WEB_CAO.git ~/WEB_CAO && bash ~/WEB_CAO/termux/installer.sh
```

Cette commande effectue automatiquement toutes les étapes suivantes :
1. Mise à jour des dépôts de paquets Termux.
2. Installation de **Git**, **Python** et **termux-tools**.
3. Téléchargement du dépôt officiel `WEB_CAO`.
4. Création de la commande globale `web-cao`.
5. Configuration du raccourci dans `~/.shortcuts/WEB_CAO.sh`.

---

### Étape 3 : Créer le raccourci 1-clic sur l'écran d'accueil

1. Allez sur l'**écran d'accueil** de votre téléphone.
2. Faites un **appui long** sur un espace vide de l'écran, puis touchez **Widgets**.
3. Défilez jusqu'à **Termux:Widget** et choisissez le format :
   - **Raccourci Termux (1x1)** : agit exactement comme une icône d'application normale.
   - ou **Widget liste Termux**.
4. Sélectionnez **`WEB_CAO.sh`**.

C'est tout ! Vous avez maintenant une icône dédiée sur l'écran d'accueil de votre téléphone.

---

## 🚀 Utilisation quotidienne

### Méthode 1 : Raccourci écran d'accueil (Recommandé)
- Touchez simplement l'icône **`WEB_CAO.sh`** sur votre écran d'accueil.
- Termux démarre, active le wake-lock, vérifie les mises à jour GitHub, lance le serveur et ouvre automatiquement votre navigateur sur WEB_CAO.

### Méthode 2 : En ligne de commande
Dans l'application Termux, vous pouvez également taper à tout moment :
```bash
web-cao
```
ou directement :
```bash
bash ~/WEB_CAO/termux/demarrer.sh
```

---

## 🔄 Comment fonctionne la mise à jour automatique ?

À chaque lancement :
1. `web_CAO.py` contacte GitHub en arrière-plan (`git fetch origin`).
2. Si vous êtes **hors ligne**, l'outil démarre instantanément sans bloquer.
3. Si une **mise à jour est disponible** :
   - Vos éventuelles modifications locales sont mises en réserve de façon sécurisée (`git stash`).
   - Les nouveautés sont téléchargées (`git pull`).
   - Le serveur se relance immédiatement avec la nouvelle version sans intervention de votre part.

---

## 🛑 Arrêt du serveur

Pour arrêter le serveur :
- Ouvrez la fenêtre Termux ou la notification Termux.
- Appuyez sur `Ctrl + C` (ou le bouton **Exit** dans Termux).
- Le wake-lock est automatiquement libéré pour préserver votre batterie.
