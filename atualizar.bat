@echo off
setlocal
cd /d "%~dp0"
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Atualizador disponivel somente em uma copia Git com acesso ao GHCR. Autentique o Docker enquanto o pacote estiver privado no pre-lancamento.
  exit /b 1
)
for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not "%CURRENT_BRANCH%"=="main" (
  echo Atualize a partir da branch main. Branch atual: %CURRENT_BRANCH%
  exit /b 1
)
set "DIRTY="
for /f "delims=" %%S in ('git status --porcelain') do set "DIRTY=1"
if defined DIRTY (
  echo Ha alteracoes locais. Salve ou descarte-as antes de atualizar.
  exit /b 1
)
git fetch origin main
if errorlevel 1 exit /b %errorlevel%
git pull --ff-only origin main
if errorlevel 1 exit /b %errorlevel%
docker compose pull
if errorlevel 1 exit /b 1
docker compose up -d
if errorlevel 1 exit /b %errorlevel%
echo Atualizacao concluida. Os volumes de dados e segredos foram preservados.
