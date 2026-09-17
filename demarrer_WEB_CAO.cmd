@echo off
rem ==========================================================================
rem Lancement de secours de WEB_CAO, a double-cliquer.
rem
rem Un .py double-clique disparait avec sa fenetre quand Python lui-meme ne
rem demarre pas : interpreteur introuvable, fichier abime par une modification,
rem erreur de syntaxe. Rien, dans le script, ne peut retenir une fenetre qui se
rem ferme avant que son premier octet ne soit lu. Un .cmd, si -- d'ou ce
rem fichier : il garde le message a l'ecran, et c'est lui qui dit pourquoi.
rem
rem --local est passe explicitement : lance par ce fichier, le serveur voit une
rem console de shell et non celle de l'Explorateur, donc il ne peut pas deviner
rem qu'il s'agit d'un double-clic.
rem ==========================================================================
cd /d "%~dp0"

set LANCEUR=py
where py >nul 2>nul || set LANCEUR=python

%LANCEUR% web_CAO.py --local %*

if errorlevel 1 (
  echo.
  echo [X] Le demarrage a echoue. La raison est ecrite au-dessus.
  echo.
  pause
)
