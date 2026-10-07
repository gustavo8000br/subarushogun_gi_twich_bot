#!/bin/sh
set -eu

# Built from this source as one downloadable .sh (Linux) or .command (macOS).
# The packager embeds the Compose manifest so the user needs no repository clone.
COMPOSE_B64='__COMPOSE_B64__'
APP_NAME='subarushogun-gi-twitch-bot'
PROJECT_NAME='subarushogun-gi-twitch-queue-bot'
IMAGE='ghcr.io/gustavo8000br/subarushogun_gi_twich_bot'
DOCKER_BIN=${QUEUEBOT_DOCKER_BIN:-docker}
INSTALL_HOME=${QUEUEBOT_INSTALL_HOME:-}
TEST_MODE=${QUEUEBOT_TEST_MODE:-0}

if [ -z "$INSTALL_HOME" ]; then
  if [ "$(uname -s)" = Darwin ]; then
    INSTALL_HOME="$HOME/Library/Application Support/SubaruShogun/$APP_NAME"
  else
    INSTALL_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/$APP_NAME"
  fi
fi
ENV_FILE="$INSTALL_HOME/.env"
COMPOSE_FILE="$INSTALL_HOME/compose.yaml"

if [ -f "$ENV_FILE" ]; then
  CURRENT_LOCALE=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" | head -n 1)
else
  CURRENT_LOCALE=''
fi
case "$CURRENT_LOCALE" in pt-BR|en|es) ;; *) CURRENT_LOCALE='' ;; esac
LOCALE=$CURRENT_LOCALE

msg() {
  case "$LOCALE:$1" in
    pt-BR:menu) printf '%s\n' '1) Instalar / Iniciar   2) Atualizar   3) Desinstalar   0) Sair' ;;
    en:menu) printf '%s\n' '1) Install / Start   2) Update   3) Uninstall   0) Exit' ;;
    es:menu) printf '%s\n' '1) Instalar / Iniciar   2) Actualizar   3) Desinstalar   0) Salir' ;;
    pt-BR:choice) printf 'Escolha uma opção: ' ;;
    en:choice) printf 'Choose an option: ' ;;
    es:choice) printf 'Elige una opción: ' ;;
    pt-BR:language) printf '%s\n' 'Idioma do produto: 1) Português brasileiro  2) English  3) Español' ;;
    en:language) printf '%s\n' 'Product language: 1) Português brasileiro  2) English  3) Español' ;;
    es:language) printf '%s\n' 'Idioma del producto: 1) Português brasileño  2) English  3) Español' ;;
    pt-BR:language_prompt) printf 'Escolha o idioma (1-3): ' ;;
    en:language_prompt) printf 'Choose a language (1-3): ' ;;
    es:language_prompt) printf 'Elige un idioma (1-3): ' ;;
    pt-BR:port) printf 'Porta local do painel [3000]: ' ;;
    en:port) printf 'Local panel port [3000]: ' ;;
    es:port) printf 'Puerto local del panel [3000]: ' ;;
    pt-BR:port_invalid) printf '%s\n' 'Informe uma porta entre 1 e 65535.' ;;
    en:port_invalid) printf '%s\n' 'Enter a port from 1 to 65535.' ;;
    es:port_invalid) printf '%s\n' 'Indica un puerto entre 1 y 65535.' ;;
    pt-BR:port_busy) printf '%s\n' 'Essa porta parece ocupada. Escolha outra; o instalador não troca a porta sozinho.' ;;
    en:port_busy) printf '%s\n' 'That port appears busy. Choose another; the installer never changes it silently.' ;;
    es:port_busy) printf '%s\n' 'Ese puerto parece ocupado. Elige otro; el instalador no lo cambia sin avisar.' ;;
    pt-BR:callback) printf 'A URL de callback da Twitch será https://localhost:%s/callback\n' "$PORT" ;;
    en:callback) printf 'The Twitch callback URL will be https://localhost:%s/callback\n' "$PORT" ;;
    es:callback) printf 'La URL de callback de Twitch será https://localhost:%s/callback\n' "$PORT" ;;
    pt-BR:docker_missing) printf '%s\n' 'Docker Engine/Desktop com Compose v2 não está disponível.' 'Abrir a documentação oficial para instalar Docker? (s/N)' ;;
    en:docker_missing) printf '%s\n' 'Docker Engine/Desktop with Compose v2 is unavailable.' 'Open the official Docker installation guide? (y/N)' ;;
    es:docker_missing) printf '%s\n' 'Docker Engine/Desktop con Compose v2 no está disponible.' '¿Abrir la guía oficial de instalación de Docker? (s/N)' ;;
    pt-BR:docker_manual) printf '%s\n' 'Instale Docker manualmente conforme a documentação oficial e abra novamente este arquivo.' ;;
    en:docker_manual) printf '%s\n' 'Install Docker manually using the official guide, then reopen this file.' ;;
    es:docker_manual) printf '%s\n' 'Instala Docker manualmente con la guía oficial y vuelve a abrir este archivo.' ;;
    pt-BR:confirm_clean) printf '%s\n' 'Isso apaga filas, histórico, autorização Twitch, segredos, certificado local e volumes do produto.' 'Digite APAGAR para confirmar:' ;;
    en:confirm_clean) printf '%s\n' 'This erases queues, history, Twitch authorization, secrets, local certificate, and product volumes.' 'Type DELETE to confirm:' ;;
    es:confirm_clean) printf '%s\n' 'Esto elimina colas, historial, autorización de Twitch, secretos, certificado local y volúmenes del producto.' 'Escribe ELIMINAR para confirmar:' ;;
    pt-BR:keep_update) printf '%s\n' '1) Manter dados e atualizar (padrão)   2) Apagar dados e instalar do zero   0) Voltar' ;;
    en:keep_update) printf '%s\n' '1) Keep data and update (default)   2) Erase data and install cleanly   0) Back' ;;
    es:keep_update) printf '%s\n' '1) Mantener datos y actualizar (predeterminado)   2) Borrar datos e instalar desde cero   0) Volver' ;;
    pt-BR:keep_uninstall) printf '%s\n' '1) Desinstalar e manter dados   2) Apagar todos os dados do produto   0) Voltar' ;;
    en:keep_uninstall) printf '%s\n' '1) Uninstall and keep data   2) Erase all product data   0) Back' ;;
    es:keep_uninstall) printf '%s\n' '1) Desinstalar y mantener datos   2) Borrar todos los datos del producto   0) Volver' ;;
    pt-BR:confirm_uninstall) printf '%s\n' 'Digite APAGAR para confirmar a exclusão permanente:' ;;
    en:confirm_uninstall) printf '%s\n' 'Type DELETE to confirm permanent removal:' ;;
    es:confirm_uninstall) printf '%s\n' 'Escribe ELIMINAR para confirmar la eliminación permanente:' ;;
    pt-BR:host_deps) printf '%s\n' 'Docker, virtualização, gerenciadores de pacotes e outras dependências do computador permanecem instalados. Remova-as manualmente pelas instruções oficiais dos fornecedores, se desejar. O arquivo de instalador baixado continua com você.' ;;
    en:host_deps) printf '%s\n' 'Docker, virtualization, package managers, and other computer dependencies remain installed. Remove them manually using official vendor instructions if desired. Your downloaded installer file remains under your control.' ;;
    es:host_deps) printf '%s\n' 'Docker, virtualización, gestores de paquetes y otras dependencias del equipo siguen instalados. Si quieres, elimínalos manualmente siguiendo las instrucciones oficiales. El instalador descargado permanece bajo tu control.' ;;
    pt-BR:updated) printf '%s\n' 'Atualização concluída. Banco, segredos e configurações foram preservados.' ;;
    en:updated) printf '%s\n' 'Update complete. Database, secrets, and settings were preserved.' ;;
    es:updated) printf '%s\n' 'Actualización completada. Se conservaron la base de datos, los secretos y la configuración.' ;;
    pt-BR:failure) printf '%s\n' 'A operação não terminou. Os dados existentes foram preservados. Consulte os logs com: docker compose logs -f bot' ;;
    en:failure) printf '%s\n' 'The operation did not finish. Existing data was preserved. Check logs with: docker compose logs -f bot' ;;
    es:failure) printf '%s\n' 'La operación no terminó. Se conservaron los datos existentes. Consulta los registros con: docker compose logs -f bot' ;;
    pt-BR:open_failed) printf '%s\n' 'O painel ainda não respondeu. Verifique os logs do bot e tente novamente.' ;;
    en:open_failed) printf '%s\n' 'The panel did not respond yet. Check bot logs and try again.' ;;
    es:open_failed) printf '%s\n' 'El panel todavía no respondió. Revisa los registros del bot e inténtalo de nuevo.' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

choose_language() {
  msg language
  while :; do
    msg language_prompt; IFS= read -r answer || answer=''
    case "$answer" in 1) LOCALE=pt-BR; return ;; 2) LOCALE=en; return ;; 3) LOCALE=es; return ;; *) printf '%s\n' '1 / 2 / 3' ;; esac
  done
}

open_url() {
  [ "$TEST_MODE" = 1 ] && return 0
  case "$(uname -s)" in
    Darwin) command -v open >/dev/null 2>&1 && open "$1" >/dev/null 2>&1 || true ;;
    *) command -v xdg-open >/dev/null 2>&1 && xdg-open "$1" >/dev/null 2>&1 || true ;;
  esac
}

ensure_docker() {
  if command -v "$DOCKER_BIN" >/dev/null 2>&1 && "$DOCKER_BIN" compose version >/dev/null 2>&1 && "$DOCKER_BIN" info >/dev/null 2>&1; then return 0; fi
  msg docker_missing
  IFS= read -r answer || answer=''
  case "$LOCALE:$answer" in
    pt-BR:[sS]|pt-BR:[sS][iI][mM]|en:[yY]|en:[yY][eE][sS]|es:[sS]|es:[sS][iI])
      case "$(uname -s)" in
        Darwin) open_url 'https://docs.docker.com/desktop/setup/install/mac-install/' ;;
        *) open_url 'https://docs.docker.com/engine/install/' ;;
      esac ;;
  esac
  msg docker_manual
  return 1
}

compose() {
  "$DOCKER_BIN" compose --project-name "$PROJECT_NAME" --project-directory "$INSTALL_HOME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

decode_compose() {
  mkdir -p "$INSTALL_HOME/.local"
  if printf '%s' "$COMPOSE_B64" | base64 -d >/dev/null 2>&1; then
    printf '%s' "$COMPOSE_B64" | base64 -d > "$COMPOSE_FILE"
  else
    printf '%s' "$COMPOSE_B64" | base64 -D > "$COMPOSE_FILE"
  fi
}

valid_port() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }

port_busy() {
  if command -v nc >/dev/null 2>&1; then nc -z -w 1 127.0.0.1 "$1" >/dev/null 2>&1; return $?; fi
  if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; return $?; fi
  return 1
}

ask_port() {
  while :; do
    msg port; IFS= read -r PORT || PORT=''
    [ -n "$PORT" ] || PORT=3000
    if ! valid_port "$PORT"; then msg port_invalid; continue; fi
    if port_busy "$PORT"; then msg port_busy; continue; fi
    return 0
  done
}

write_config() {
  umask 077
  printf 'APP_PORT=%s\nIMAGE_TAG=main\nPRODUCT_INITIAL_LOCALE=%s\n' "$PORT" "$LOCALE" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  decode_compose
}

wait_for_panel() {
  [ "$TEST_MODE" = 1 ] && return 0
  ATTEMPT=0
  while [ "$ATTEMPT" -lt 60 ]; do
    if command -v curl >/dev/null 2>&1 && curl --insecure --silent --fail --max-time 2 "https://localhost:$PORT/health" >/dev/null 2>&1; then
      printf '%s\n' "https://localhost:$PORT" "https://localhost:$PORT/callback"
      printf '%s\n' "$(printf '%s' "$INSTALL_HOME")/.local/localhost-ca.crt"
      open_url "https://localhost:$PORT"
      return 0
    fi
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
  done
  msg open_failed
  compose logs --tail 80 bot || true
  return 1
}

install_or_start() {
  ensure_docker || return 1
  mkdir -p "$INSTALL_HOME"
  if [ -f "$ENV_FILE" ]; then
    PORT=$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | head -n 1)
    CURRENT_LOCALE=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" | head -n 1)
    case "$CURRENT_LOCALE" in pt-BR|en|es) LOCALE=$CURRENT_LOCALE ;; esac
    printf 'Current settings: locale=%s port=%s\n' "$LOCALE" "${PORT:-3000}"
    if [ "$TEST_MODE" != 1 ]; then
      case "$LOCALE" in pt-BR) printf 'Manter configurações? [S/n]: ' ;; en) printf 'Keep settings? [Y/n]: ' ;; es) printf '¿Mantener configuración? [S/n]: ' ;; esac
      IFS= read -r change || change=''
      case "$LOCALE:$change" in pt-BR:n|pt-BR:N|en:n|en:N|es:n|es:N) choose_language; ask_port ;; *) : ;; esac
    fi
    valid_port "$PORT" || PORT=3000
  else
    mkdir -p "$INSTALL_HOME"
    ask_port
  fi
  msg callback
  write_config
  if ! compose pull || ! compose up -d || ! wait_for_panel; then msg failure; return 1; fi
  printf '%s\n' "https://localhost:$PORT"
}

confirm_word() { case "$LOCALE" in pt-BR) CONFIRM_WORD=APAGAR ;; en) CONFIRM_WORD=DELETE ;; es) CONFIRM_WORD=ELIMINAR ;; esac; }

remove_image_if_unused() {
  TAG=$(sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE" 2>/dev/null | head -n 1)
  [ -n "$TAG" ] || TAG=main
  IMAGE_REF="$IMAGE:$TAG"
  if "$DOCKER_BIN" ps -aq --filter "ancestor=$IMAGE_REF" | grep -q .; then return 0; fi
  "$DOCKER_BIN" image rm "$IMAGE_REF" >/dev/null 2>&1 || true
}

do_update() {
  ensure_docker || return 1
  [ -f "$ENV_FILE" ] || { LOCALE=pt-BR; msg failure; return 1; }
  LOCALE=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" | head -n 1)
  case "$LOCALE" in pt-BR|en|es) ;; *) LOCALE=pt-BR ;; esac
  PORT=$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | head -n 1); valid_port "$PORT" || PORT=3000
  msg keep_update
  msg choice; IFS= read -r answer || answer=''
  case "$answer" in
    1|'') decode_compose; if compose pull && compose up -d; then msg updated; wait_for_panel; else msg failure; return 1; fi ;;
    2)
      msg confirm_clean; confirm_word; IFS= read -r answer || answer=''
      [ "$answer" = "$CONFIRM_WORD" ] || return 0
      compose pull || { msg failure; return 1; }
      compose down --volumes --remove-orphans || { msg failure; return 1; }
      rm -rf "$INSTALL_HOME/.local" "$ENV_FILE"
      LOCALE=''; choose_language; ask_port; write_config
      if compose up -d && wait_for_panel; then return 0; else msg failure; return 1; fi
      ;;
    *) return 0 ;;
  esac
}

do_uninstall() {
  LOCALE=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" 2>/dev/null | head -n 1)
  case "$LOCALE" in pt-BR|en|es) ;; *) LOCALE=pt-BR ;; esac
  [ -f "$COMPOSE_FILE" ] || { msg host_deps; return 0; }
  ensure_docker || return 1
  msg keep_uninstall
  msg choice; IFS= read -r answer || answer=''
  case "$answer" in
    1)
      compose down --remove-orphans || { msg failure; return 1; }
      remove_image_if_unused
      rm -f "$COMPOSE_FILE"
      msg host_deps
      ;;
    2)
      msg confirm_clean; confirm_word; IFS= read -r answer || answer=''
      [ "$answer" = "$CONFIRM_WORD" ] || return 0
      compose down --volumes --remove-orphans || { msg failure; return 1; }
      remove_image_if_unused
      rm -rf "$INSTALL_HOME"
      msg host_deps
      ;;
    *) return 0 ;;
  esac
}

if [ -z "$LOCALE" ]; then choose_language; fi
while :; do
  printf '\n'; msg menu; msg choice; IFS= read -r ACTION || ACTION=0
  case "$ACTION" in
    1) install_or_start ;;
    2) do_update ;;
    3) do_uninstall ;;
    0|'') exit 0 ;;
    *) printf '%s\n' '1 / 2 / 3 / 0' ;;
  esac
done
