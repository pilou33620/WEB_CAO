@echo off
rem Lancement de WEB_CAO, a double-cliquer : garde la fenetre ouverte en cas d'erreur.
rem
rem --local est passe explicitement : lance par ce fichier, le serveur voit une
rem console de shell et non celle de l'Explorateur, donc il ne peut pas deviner
rem qu'il s'agit d'un double-clic.
cd /d "%~dp0"
rem Le serveur sort avec le code 75 quand il vient de se mettre a jour (git pull) :
rem on reprend les executables de la nouvelle version, puis on le relance.
set WEB_CAO_RELANCEUR=1
set WEB_CAO_RACINE=%CD%
:encore
call binaires.cmd
if errorlevel 1 goto echec
bin\web_cao.exe --local %*
if %errorlevel%==75 (
  set WEB_CAO_DEJA_MAJ=1
  goto encore
)
if not errorlevel 1 exit /b 0
:echec
echo.
echo [X] Le demarrage a echoue. La raison est ecrite au-dessus.
echo.
pause
