@echo off
setlocal
cd /d "%~dp0"
set "DELETE_DATA="
set /p "DELETE_DATA=Deseja apagar banco e segredos locais? [s/N] "
if /I not "%DELETE_DATA%"=="s" if /I not "%DELETE_DATA%"=="sim" goto keep_data
echo Isso apaga filas, historico, credenciais Twitch, senha do banco e certificados privados.
set "CONFIRMATION="
set /p "CONFIRMATION=Digite APAGAR para confirmar: "
if not "%CONFIRMATION%"=="APAGAR" goto cancelled
docker compose down --volumes --rmi local
if errorlevel 1 exit /b %errorlevel%
if exist ".local\localhost-ca.crt" del ".local\localhost-ca.crt"
if exist ".local" rmdir ".local" 2>nul
echo Aplicacao e dados locais removidos.
exit /b 0
:keep_data
docker compose down --rmi local
if errorlevel 1 exit /b %errorlevel%
echo Aplicacao removida; banco, segredos e certificado publico foram preservados.
exit /b 0
:cancelled
echo Cancelado; nada foi removido.
exit /b 0
