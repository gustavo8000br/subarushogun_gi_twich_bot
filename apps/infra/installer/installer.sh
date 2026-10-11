#!/bin/sh
set -eu

# Built from this source as one downloadable .sh (Linux) or .command (macOS).
# The packager embeds the Compose manifest so the user needs no repository clone.
COMPOSE_B64='__COMPOSE_B64__'
RELEASE_IMAGE_TAG='__IMAGE_TAG__'
INSTALLER_VERSION='__PRODUCT_VERSION__'
APP_NAME='subarushogun-gi-twitch-bot'
PROJECT_NAME='subarushogun-gi-twitch-queue-bot'
IMAGE='ghcr.io/gustavo8000br/subarushogun_gi_twich_bot'
DOCKER_BIN=${QUEUEBOT_DOCKER_BIN:-docker}
INSTALL_HOME=${QUEUEBOT_INSTALL_HOME:-}
TEST_MODE=${QUEUEBOT_TEST_MODE:-0}
NON_INTERACTIVE=0
CLI_ACTION=''
CLI_PORT=''
CLI_LOCALE=''
DATA_POLICY='keep'
ERASE_CONFIRMED=0
DATA_POLICY_EXPLICIT=0

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
    pt-BR:header) printf '%s\n' 'SubaruShogun Twitch Queue Bot — Instalador' ;;
    en:header) printf '%s\n' 'SubaruShogun Twitch Queue Bot — Installer' ;;
    es:header) printf '%s\n' 'SubaruShogun Twitch Queue Bot — Instalador' ;;
    pt-BR:installer_version) printf 'Versão do instalador: %s\n' "$INSTALLER_VERSION" ;;
    en:installer_version) printf 'Installer version: %s\n' "$INSTALLER_VERSION" ;;
    es:installer_version) printf 'Versión del instalador: %s\n' "$INSTALLER_VERSION" ;;
    pt-BR:state_installed) printf '%s\n' 'Instalação local detectada.' ;;
    en:state_installed) printf '%s\n' 'Local installation detected.' ;;
    es:state_installed) printf '%s\n' 'Instalación local detectada.' ;;
    pt-BR:state_not_installed) printf '%s\n' 'Nenhuma instalação local detectada.' ;;
    en:state_not_installed) printf '%s\n' 'No local installation detected.' ;;
    es:state_not_installed) printf '%s\n' 'No se detectó una instalación local.' ;;
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
    pt-BR:input_unavailable) printf '%s\n' 'Não foi possível ler a resposta. Execute o instalador em um terminal interativo.' >&2 ;;
    en:input_unavailable) printf '%s\n' 'Input is unavailable. Run the installer from an interactive terminal.' >&2 ;;
    es:input_unavailable) printf '%s\n' 'No se pudo leer la respuesta. Ejecuta el instalador desde un terminal interactivo.' >&2 ;;
    *:input_unavailable) printf '%s\n' 'Não foi possível ler a resposta. Execute o instalador em um terminal interativo.' >&2 ;;
    pt-BR:architecture_unavailable) printf '%s\n' 'Não foi possível detectar a arquitetura do Docker. Este produto requer amd64/x86_64 ou arm64/aarch64.' ;;
    en:architecture_unavailable) printf '%s\n' 'Could not detect the Docker architecture. This product requires amd64/x86_64 or arm64/aarch64.' ;;
    es:architecture_unavailable) printf '%s\n' 'No se pudo detectar la arquitectura de Docker. Este producto requiere amd64/x86_64 o arm64/aarch64.' ;;
    pt-BR:architecture_unsupported) printf 'A arquitetura Docker "%s" não é compatível. Este produto requer amd64/x86_64 ou arm64/aarch64.\n' "$2" ;;
    en:architecture_unsupported) printf 'Docker architecture "%s" is not supported. This product requires amd64/x86_64 or arm64/aarch64.\n' "$2" ;;
    es:architecture_unsupported) printf 'La arquitectura Docker "%s" no es compatible. Este producto requiere amd64/x86_64 o arm64/aarch64.\n' "$2" ;;
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
    pt-BR:keep_uninstall) printf '%s\n' '1) Remover app e manter volumes/dados   2) Remover app e apagar volumes/dados   0) Voltar' ;;
    en:keep_uninstall) printf '%s\n' '1) Remove app and keep volumes/data   2) Remove app and erase volumes/data   0) Back' ;;
    es:keep_uninstall) printf '%s\n' '1) Quitar app y conservar volúmenes/datos   2) Quitar app y borrar volúmenes/datos   0) Volver' ;;
    pt-BR:progress_docker) printf '%s\n' '[1/4] Verificando Docker Engine e Compose v2...' ;;
    en:progress_docker) printf '%s\n' '[1/4] Checking Docker Engine and Compose v2...' ;;
    es:progress_docker) printf '%s\n' '[1/4] Comprobando Docker Engine y Compose v2...' ;;
    pt-BR:progress_images) printf '%s\n' '[2/4] Imagens necessárias para os serviços:' ;;
    en:progress_images) printf '%s\n' '[2/4] Images required by the services:' ;;
    es:progress_images) printf '%s\n' '[2/4] Imágenes necesarias para los servicios:' ;;
    pt-BR:progress_pull) printf '%s\n' 'Baixando imagens. O Compose exibirá o progresso de cada serviço e camada.' ;;
    en:progress_pull) printf '%s\n' 'Downloading images. Compose will show progress for each service and layer.' ;;
    es:progress_pull) printf '%s\n' 'Descargando imágenes. Compose mostrará el progreso de cada servicio y capa.' ;;
    pt-BR:progress_image_access) printf '%s\n' 'Verificando acesso à imagem do produto no GHCR...' ;;
    en:progress_image_access) printf '%s\n' 'Checking access to the product image on GHCR...' ;;
    es:progress_image_access) printf '%s\n' 'Comprobando el acceso a la imagen del producto en GHCR...' ;;
    pt-BR:image_pull_failed) printf '%s\n' 'Não foi possível baixar a imagem do produto no GHCR. Verifique a conexão e confirme que o pacote está público. O instalador não exige login no GHCR; os dados locais foram preservados.' ;;
    en:image_pull_failed) printf '%s\n' 'Could not download the product image from GHCR. Check your connection and confirm the package is public. This installer does not require GHCR login; local data was preserved.' ;;
    es:image_pull_failed) printf '%s\n' 'No se pudo descargar la imagen del producto desde GHCR. Comprueba la conexión y que el paquete sea público. Este instalador no requiere iniciar sesión en GHCR; se conservaron los datos locales.' ;;
    pt-BR:progress_start) printf '%s\n' '[3/4] Criando/iniciando banco, migrations e bot...' ;;
    en:progress_start) printf '%s\n' '[3/4] Creating/starting database, migrations, and bot...' ;;
    es:progress_start) printf '%s\n' '[3/4] Creando/iniciando base de datos, migraciones y bot...' ;;
    pt-BR:progress_wait) printf '%s\n' '[4/4] Aguardando a verificação de saúde do painel...' ;;
    en:progress_wait) printf '%s\n' '[4/4] Waiting for the panel health check...' ;;
    es:progress_wait) printf '%s\n' '[4/4] Esperando la comprobación de salud del panel...' ;;
    pt-BR:progress_uninstall_inspect) printf '%s\n' 'Inspecionando containers, redes, imagens e volumes deste projeto...' ;;
    en:progress_uninstall_inspect) printf '%s\n' 'Inspecting this project’s containers, networks, images, and volumes...' ;;
    es:progress_uninstall_inspect) printf '%s\n' 'Inspeccionando contenedores, redes, imágenes y volúmenes de este proyecto...' ;;
    pt-BR:progress_uninstall_stop) printf '%s\n' 'Removendo containers e redes do projeto; o Compose mostrará cada recurso.' ;;
    en:progress_uninstall_stop) printf '%s\n' 'Removing project containers and networks; Compose will show each resource.' ;;
    es:progress_uninstall_stop) printf '%s\n' 'Quitando contenedores y redes del proyecto; Compose mostrará cada recurso.' ;;
    pt-BR:progress_uninstall_images) printf '%s\n' 'Removendo imagens do produto que não são usadas por outros containers...' ;;
    en:progress_uninstall_images) printf '%s\n' 'Removing product images not used by other containers...' ;;
    es:progress_uninstall_images) printf '%s\n' 'Quitando imágenes del producto que no usan otros contenedores...' ;;
    pt-BR:progress_uninstall_volumes) printf '%s\n' 'Verificando os volumes deste projeto...' ;;
    en:progress_uninstall_volumes) printf '%s\n' 'Checking this project’s volumes...' ;;
    es:progress_uninstall_volumes) printf '%s\n' 'Comprobando los volúmenes de este proyecto...' ;;
    pt-BR:no_install) printf '%s\n' 'Nenhuma instalação ou recurso deste produto foi encontrado. Nada foi removido.' ;;
    en:no_install) printf '%s\n' 'No installation or product resources were found. Nothing was removed.' ;;
    es:no_install) printf '%s\n' 'No se encontró una instalación ni recursos del producto. No se quitó nada.' ;;
    pt-BR:uninstall_done_keep) printf '%s\n' 'Desinstalação concluída: containers, redes e imagens exclusivas removidos; volumes e dados preservados.' ;;
    en:uninstall_done_keep) printf '%s\n' 'Uninstall complete: containers, networks, and exclusive images removed; volumes and data preserved.' ;;
    es:uninstall_done_keep) printf '%s\n' 'Desinstalación completada: contenedores, redes e imágenes exclusivas quitados; volúmenes y datos conservados.' ;;
    pt-BR:uninstall_done_erase) printf '%s\n' 'Desinstalação concluída: containers, redes, imagens exclusivas, volumes e arquivos locais do produto removidos.' ;;
    en:uninstall_done_erase) printf '%s\n' 'Uninstall complete: containers, networks, exclusive images, volumes, and local product files removed.' ;;
    es:uninstall_done_erase) printf '%s\n' 'Desinstalación completada: contenedores, redes, imágenes exclusivas, volúmenes y archivos locales del producto quitados.' ;;
    pt-BR:uninstall_image_shared) printf 'Imagem mantida porque outro container ainda a utiliza: %s\n' "$2" ;;
    en:uninstall_image_shared) printf 'Image kept because another container still uses it: %s\n' "$2" ;;
    es:uninstall_image_shared) printf 'Imagen conservada porque otro contenedor todavía la usa: %s\n' "$2" ;;
    pt-BR:uninstall_image_removed) printf 'Imagem removida: %s\n' "$2" ;;
    en:uninstall_image_removed) printf 'Image removed: %s\n' "$2" ;;
    es:uninstall_image_removed) printf 'Imagen quitada: %s\n' "$2" ;;
    pt-BR:uninstall_failed) printf '%s\n' 'Desinstalação incompleta. Alguns recursos podem já ter sido removidos; execute novamente para verificar e concluir.' >&2 ;;
    en:uninstall_failed) printf '%s\n' 'Uninstall incomplete. Some resources may already be removed; run again to verify and finish.' >&2 ;;
    es:uninstall_failed) printf '%s\n' 'Desinstalación incompleta. Es posible que algunos recursos ya se hayan quitado; vuelve a ejecutar para verificar y terminar.' >&2 ;;
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
  [ -n "$LOCALE" ] || LOCALE=pt-BR
  if [ "$NON_INTERACTIVE" = 1 ]; then
    [ -n "$CLI_LOCALE" ] && LOCALE=$CLI_LOCALE
    return 0
  fi
  msg language
  while :; do
    msg language_prompt
    if ! IFS= read -r answer; then msg input_unavailable; return 1; fi
    case "$answer" in 1) LOCALE=pt-BR; return ;; 2) LOCALE=en; return ;; 3) LOCALE=es; return ;; *) printf '%s\n' '1 / 2 / 3' ;; esac
  done
}

open_url() {
  if [ "$TEST_MODE" = 1 ] || [ "$NON_INTERACTIVE" = 1 ]; then return 0; fi
  case "$(uname -s)" in
    Darwin) command -v open >/dev/null 2>&1 && open "$1" >/dev/null 2>&1 || true ;;
    *) command -v xdg-open >/dev/null 2>&1 && xdg-open "$1" >/dev/null 2>&1 || true ;;
  esac
}

ensure_docker() {
  if command -v "$DOCKER_BIN" >/dev/null 2>&1 && "$DOCKER_BIN" compose version >/dev/null 2>&1; then
    if ! architecture=$("$DOCKER_BIN" info --format '{{.Architecture}}' 2>/dev/null); then msg architecture_unavailable; return 1; fi
    architecture=$(printf '%s' "$architecture" | tr '[:upper:]' '[:lower:]')
    case "$architecture" in
      amd64|x86_64|arm64|aarch64) return 0 ;;
      *) msg architecture_unsupported "$architecture"; return 1 ;;
    esac
  fi
  msg docker_missing
  if [ "$NON_INTERACTIVE" = 1 ]; then msg docker_manual; return 1; fi
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
  "$DOCKER_BIN" compose --progress plain --project-name "$PROJECT_NAME" --project-directory "$INSTALL_HOME" --file "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

pull_product_image() {
  msg progress_image_access
  if "$DOCKER_BIN" pull "$IMAGE:$RELEASE_IMAGE_TAG"; then return 0; fi
  msg image_pull_failed
  return 1
}

clear_screen() {
  if [ -t 1 ] && [ -n "${TERM:-}" ] && [ "$TERM" != dumb ] && command -v clear >/dev/null 2>&1; then
    clear
  fi
}

show_header() {
  msg header
  msg installer_version
  if [ -f "$ENV_FILE" ] || [ -f "$COMPOSE_FILE" ]; then msg state_installed; else msg state_not_installed; fi
  printf '\n'
}

project_resource_ids() {
  resource_kind=$1
  case "$resource_kind" in
    containers) "$DOCKER_BIN" ps --all --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" ;;
    networks) "$DOCKER_BIN" network ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" ;;
    volumes) "$DOCKER_BIN" volume ls --quiet --filter "label=com.docker.compose.project=$PROJECT_NAME" ;;
    *) return 2 ;;
  esac
}

collect_product_image_ids() {
  if [ -f "$COMPOSE_FILE" ]; then
    compose_images=$(compose config --images) || return 1
    compose_project_images=$(compose images --quiet) || return 1
  else
    compose_images=''
    compose_project_images=''
  fi
  image_names=$(printf '%s\n%s\n' "$compose_project_images" "$compose_images")
  image_ids=''
  for image_name in $image_names; do
    [ -n "$image_name" ] || continue
    case "$image_name" in sha256:*) image_ids="$image_ids $image_name"; continue ;; esac
    if found_ids=$("$DOCKER_BIN" image ls --quiet --no-trunc "$image_name"); then :; else return 1; fi
    image_ids="$image_ids $found_ids"
  done
  if app_image_ids=$("$DOCKER_BIN" image ls --quiet --no-trunc "$IMAGE"); then :; else return 1; fi
  PRODUCT_IMAGE_IDS=$(printf '%s\n%s\n' "$image_ids" "$app_image_ids" | awk 'NF && !seen[$0]++')
}

remove_unused_product_images() {
  image_ids=$1
  msg progress_uninstall_images
  for image_id in $image_ids; do
    [ -n "$image_id" ] || continue
    if ! image_users=$("$DOCKER_BIN" ps --all --quiet --filter "ancestor=$image_id"); then return 1; fi
    if [ -n "$image_users" ]; then
      msg uninstall_image_shared "$image_id"
    elif "$DOCKER_BIN" image rm "$image_id"; then
      msg uninstall_image_removed "$image_id"
    else
      return 1
    fi
  done
}

verify_uninstall_resources() {
  volume_policy=$1
  image_ids=$2
  msg progress_uninstall_volumes
  if ! remaining_containers=$(project_resource_ids containers) || ! remaining_networks=$(project_resource_ids networks) || ! remaining_volumes=$(project_resource_ids volumes); then
    return 1
  fi
  if [ -n "$remaining_containers" ] || [ -n "$remaining_networks" ]; then return 1; fi
  original_volumes=$(printf '%s\n' "$original_volumes" | awk 'NF && !seen[$0]++' | sort)
  remaining_volumes=$(printf '%s\n' "$remaining_volumes" | awk 'NF && !seen[$0]++' | sort)
  case "$volume_policy" in
    keep) [ "$original_volumes" = "$remaining_volumes" ] ;;
    remove) [ -z "$remaining_volumes" ] ;;
    *) return 2 ;;
  esac || return 1
  all_image_ids=$("$DOCKER_BIN" image ls --quiet --no-trunc) || return 1
  for image_id in $image_ids; do
    image_users=$("$DOCKER_BIN" ps --all --quiet --filter "ancestor=$image_id") || return 1
    if [ -z "$image_users" ] && printf '%s\n' "$all_image_ids" | grep -Fxq "$image_id"; then return 1; fi
  done
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
  if [ "$NON_INTERACTIVE" = 1 ]; then
    PORT=${CLI_PORT:-${PORT:-3000}}
    if ! valid_port "$PORT"; then msg port_invalid; return 1; fi
    if port_busy "$PORT"; then msg port_busy; return 1; fi
    return 0
  fi
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
  printf 'APP_PORT=%s\nIMAGE_TAG=%s\nPRODUCT_INITIAL_LOCALE=%s\n' "$PORT" "$RELEASE_IMAGE_TAG" "$LOCALE" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  decode_compose
}

wait_for_panel() {
  [ "$TEST_MODE" = 1 ] && return 0
  msg progress_wait
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
    if [ $((ATTEMPT % 5)) -eq 0 ]; then printf '.'; fi
  done
  printf '\n'
  msg open_failed
  compose logs --tail 80 bot || true
  return 1
}

install_or_start() {
  msg progress_docker
  ensure_docker || return 1
  mkdir -p "$INSTALL_HOME"
  if [ -f "$ENV_FILE" ]; then
    PORT=$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | head -n 1)
    CURRENT_LOCALE=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" | head -n 1)
    case "$CURRENT_LOCALE" in pt-BR|en|es) LOCALE=$CURRENT_LOCALE ;; esac
    if [ "$NON_INTERACTIVE" = 1 ]; then
      [ -n "$CLI_LOCALE" ] && LOCALE=$CLI_LOCALE
      [ -n "$CLI_PORT" ] && PORT=$CLI_PORT
      ask_port || return 1
    else
    printf 'Current settings: locale=%s port=%s\n' "$LOCALE" "${PORT:-3000}"
    if [ "$TEST_MODE" != 1 ]; then
      case "$LOCALE" in pt-BR) printf 'Manter configurações? [S/n]: ' ;; en) printf 'Keep settings? [Y/n]: ' ;; es) printf '¿Mantener configuración? [S/n]: ' ;; esac
      IFS= read -r change || change=''
      case "$LOCALE:$change" in pt-BR:n|pt-BR:N|en:n|en:N|es:n|es:N) choose_language; ask_port ;; *) : ;; esac
    fi
    fi
    valid_port "$PORT" || PORT=3000
  else
    mkdir -p "$INSTALL_HOME"
    [ -n "$LOCALE" ] || choose_language || return 1
    ask_port || return 1
  fi
  msg callback
  write_config
  msg progress_images
  if ! compose config --images; then msg failure; return 1; fi
  pull_product_image || return 1
  msg progress_pull
  if ! compose pull; then msg failure; return 1; fi
  msg progress_start
  if ! compose up -d || ! wait_for_panel; then msg failure; return 1; fi
  printf '%s\n' "https://localhost:$PORT"
}

confirm_word() { case "$LOCALE" in pt-BR) CONFIRM_WORD=APAGAR ;; en) CONFIRM_WORD=DELETE ;; es) CONFIRM_WORD=ELIMINAR ;; esac; }

do_update() {
  msg progress_docker
  ensure_docker || return 1
  [ -f "$ENV_FILE" ] || { LOCALE=pt-BR; msg failure; return 1; }
  LOCALE=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" | head -n 1)
  case "$LOCALE" in pt-BR|en|es) ;; *) LOCALE=pt-BR ;; esac
  CURRENT_LOCALE=$LOCALE
  PORT=$(sed -n 's/^APP_PORT=//p' "$ENV_FILE" | head -n 1); valid_port "$PORT" || PORT=3000
  if [ "$NON_INTERACTIVE" = 1 ]; then
    [ "$DATA_POLICY" = erase ] && answer=2 || answer=1
  else
    msg keep_update
    msg choice; IFS= read -r answer || answer=''
  fi
  case "$answer" in
    1|'')
      decode_compose
      msg progress_images
      if ! IMAGE_TAG="$RELEASE_IMAGE_TAG" compose config --images; then msg failure; return 1; fi
      pull_product_image || return 1
      msg progress_pull
      if ! IMAGE_TAG="$RELEASE_IMAGE_TAG" compose pull; then msg failure; return 1; fi
      set_image_tag "$RELEASE_IMAGE_TAG" || { msg failure; return 1; }
      msg progress_start
      if compose up -d; then msg updated; wait_for_panel; else msg failure; return 1; fi
      ;;
    2)
      if [ "$NON_INTERACTIVE" != 1 ]; then
        msg confirm_clean; confirm_word; IFS= read -r answer || answer=''
        [ "$answer" = "$CONFIRM_WORD" ] || return 0
      fi
      pull_product_image || return 1
      IMAGE_TAG="$RELEASE_IMAGE_TAG" compose pull || { msg failure; return 1; }
      compose down --volumes --remove-orphans || { msg failure; return 1; }
      rm -rf "$INSTALL_HOME/.local" "$ENV_FILE"
      if [ "$NON_INTERACTIVE" = 1 ]; then
        LOCALE=$CURRENT_LOCALE
        PORT=${CLI_PORT:-$PORT}
      else
        LOCALE=''; choose_language; ask_port
      fi
      write_config
      if compose up -d && wait_for_panel; then return 0; else msg failure; return 1; fi
      ;;
    *) return 0 ;;
  esac
}

set_image_tag() {
  CONFIG_TMP="$ENV_FILE.tmp.$$"
  awk -v tag="$1" 'BEGIN { seen=0 } /^IMAGE_TAG=/ { if (!seen) print "IMAGE_TAG=" tag; seen=1; next } { print } END { if (!seen) print "IMAGE_TAG=" tag }' "$ENV_FILE" > "$CONFIG_TMP" || { rm -f "$CONFIG_TMP"; return 1; }
  chmod 600 "$CONFIG_TMP" && mv "$CONFIG_TMP" "$ENV_FILE"
}

do_uninstall() {
  saved_locale=$(sed -n 's/^PRODUCT_INITIAL_LOCALE=//p' "$ENV_FILE" 2>/dev/null | head -n 1)
  case "$saved_locale" in pt-BR|en|es) LOCALE=$saved_locale ;; *) [ -n "$LOCALE" ] || LOCALE=pt-BR ;; esac
  msg progress_docker
  ensure_docker || return 1
  msg progress_uninstall_inspect
  if ! existing_containers=$(project_resource_ids containers) || ! existing_networks=$(project_resource_ids networks) || ! existing_volumes=$(project_resource_ids volumes); then
    msg uninstall_failed
    return 1
  fi
  if collect_product_image_ids; then image_ids=$PRODUCT_IMAGE_IDS; else msg uninstall_failed; return 1; fi
  if [ ! -f "$COMPOSE_FILE" ] && [ ! -f "$ENV_FILE" ] && [ -z "$existing_containers$existing_networks$existing_volumes$image_ids" ]; then
    msg no_install
    return 0
  fi
  if [ "$NON_INTERACTIVE" = 1 ]; then
    [ "$DATA_POLICY" = erase ] && answer=2 || answer=1
  else
    msg keep_uninstall
    msg choice; IFS= read -r answer || answer=''
  fi
  case "$answer" in
    1)
      if [ ! -f "$ENV_FILE" ]; then PORT=3000; write_config; elif [ ! -f "$COMPOSE_FILE" ]; then decode_compose; fi
      original_volumes=$(printf '%s\n' "$existing_volumes" | awk 'NF && !seen[$0]++')
      msg progress_uninstall_stop
      compose down --remove-orphans || { msg uninstall_failed; return 1; }
      remove_unused_product_images "$image_ids" || { msg uninstall_failed; return 1; }
      verify_uninstall_resources keep "$image_ids" || { msg uninstall_failed; return 1; }
      rm -f "$COMPOSE_FILE"
      msg uninstall_done_keep
      msg host_deps
      ;;
    2)
      if [ "$NON_INTERACTIVE" != 1 ]; then
        msg confirm_clean; confirm_word; IFS= read -r answer || answer=''
        [ "$answer" = "$CONFIRM_WORD" ] || return 0
      fi
      if [ ! -f "$ENV_FILE" ]; then PORT=3000; write_config; elif [ ! -f "$COMPOSE_FILE" ]; then decode_compose; fi
      original_volumes=$(printf '%s\n' "$existing_volumes" | awk 'NF && !seen[$0]++')
      msg progress_uninstall_stop
      compose down --volumes --remove-orphans || { msg uninstall_failed; return 1; }
      remove_unused_product_images "$image_ids" || { msg uninstall_failed; return 1; }
      verify_uninstall_resources remove "$image_ids" || { msg uninstall_failed; return 1; }
      rm -rf "$INSTALL_HOME"
      msg uninstall_done_erase
      msg host_deps
      ;;
    *) return 0 ;;
  esac
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --silent|--non-interactive) NON_INTERACTIVE=1 ;;
      install|update|uninstall)
        [ -z "$CLI_ACTION" ] || { printf '%s\n' 'Choose only one action.' >&2; return 2; }
        CLI_ACTION=$1; NON_INTERACTIVE=1 ;;
      --locale|--port)
        [ "$#" -ge 2 ] || { printf 'Missing value for %s.\n' "$1" >&2; return 2; }
        case "$1" in
          --locale) case "$2" in pt-BR|en|es) CLI_LOCALE=$2 ;; *) printf '%s\n' 'Locale must be pt-BR, en, or es.' >&2; return 2 ;; esac ;;
          --port) valid_port "$2" || { msg port_invalid >&2; return 2; }; CLI_PORT=$2 ;;
        esac
        shift ;;
      --keep-data)
        if [ "$DATA_POLICY_EXPLICIT" = 1 ] && [ "$DATA_POLICY" != keep ]; then printf '%s\n' 'Choose either --keep-data or --erase-data.' >&2; return 2; fi
        DATA_POLICY=keep; DATA_POLICY_EXPLICIT=1 ;;
      --erase-data)
        if [ "$DATA_POLICY_EXPLICIT" = 1 ] && [ "$DATA_POLICY" != erase ]; then printf '%s\n' 'Choose either --keep-data or --erase-data.' >&2; return 2; fi
        DATA_POLICY=erase; DATA_POLICY_EXPLICIT=1 ;;
      --confirm-erase) ERASE_CONFIRMED=1 ;;
      --help|-h)
        printf '%s\n' 'Usage: installer.sh [--silent] [install|update|uninstall] [--locale pt-BR|en|es] [--port 1-65535] [--keep-data | --erase-data --confirm-erase]'
        return 3 ;;
      *) printf 'Unknown installer option: %s\n' "$1" >&2; return 2 ;;
    esac
    shift
  done
  if [ "$NON_INTERACTIVE" = 1 ] && [ -z "$CLI_ACTION" ]; then printf '%s\n' 'A silent run requires install, update, or uninstall.' >&2; return 2; fi
  if [ "$ERASE_CONFIRMED" = 1 ] && [ "$DATA_POLICY" != erase ]; then printf '%s\n' '--confirm-erase requires --erase-data.' >&2; return 2; fi
  if [ "$DATA_POLICY" = erase ] && [ "$ERASE_CONFIRMED" != 1 ]; then printf '%s\n' 'Erasing data requires both --erase-data and --confirm-erase.' >&2; return 2; fi
  if [ -n "$CLI_PORT$CLI_LOCALE" ] && [ "$CLI_ACTION" != install ]; then printf '%s\n' '--locale and --port are supported only for install.' >&2; return 2; fi
  if [ "$DATA_POLICY" = erase ] && [ "$CLI_ACTION" = install ]; then printf '%s\n' 'Use update or uninstall with --erase-data.' >&2; return 2; fi
  return 0
}
if parse_args "$@"; then parse_status=0; else parse_status=$?; fi
case "$parse_status" in 0) ;; 3) exit 0 ;; *) exit "$parse_status" ;; esac
if [ -z "$LOCALE" ]; then choose_language || exit 1; fi
clear_screen
show_header
if [ "$NON_INTERACTIVE" = 1 ]; then
  case "$CLI_ACTION" in
    install) install_or_start ;;
    update) do_update ;;
    uninstall) do_uninstall ;;
  esac
  exit $?
fi
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
