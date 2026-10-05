@echo off
setlocal
cd /d "%~dp0"
if not exist ".local" mkdir ".local"
docker compose up --build -d
if errorlevel 1 exit /b %errorlevel%
echo Certificado HTTPS local: %CD%\.local\localhost-ca.crt. Confie-o no Windows antes de conectar a Twitch.
if not defined APP_PORT set "APP_PORT=3000"
set "PANEL_URL=https://localhost:%APP_PORT%"
set /a ATTEMPT=0
:wait_panel
curl --insecure --silent --fail "%PANEL_URL%/health" >nul 2>&1
if not errorlevel 1 goto open_panel
set /a ATTEMPT+=1
if %ATTEMPT% GEQ 60 goto panel_timeout
timeout /t 2 /nobreak >nul
goto wait_panel
:open_panel
start "" "%PANEL_URL%"
exit /b 0
:panel_timeout
echo Painel ainda indisponivel. Acesse %PANEL_URL% e consulte: docker compose logs -f bot
exit /b 1
