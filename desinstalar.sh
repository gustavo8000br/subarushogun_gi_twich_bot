#!/bin/sh
set -eu
cd "$(dirname "$0")"
. apps/infra/scripts/host-locale.sh
load_product_locale "$PWD"
confirm_word=$(product_copy "$PWD" lifecycle.uninstall.confirm_word APAGAR)
printf '%s [s/N] ' "$(product_copy "$PWD" lifecycle.uninstall.ask 'Delete this project database and local secrets?')"
IFS= read -r answer || answer=''
case "$answer" in
  s|S|sim|SIM|y|Y|yes|YES)
    printf '%s ' "$(product_copy "$PWD" lifecycle.uninstall.warning 'This deletes queues, history, Twitch credentials, the database password, and private certificates.')"
    product_copy_with_word "$PWD" lifecycle.uninstall.confirm_prompt 'Type {word} to confirm permanent deletion:' "$confirm_word"
    IFS= read -r confirmation || confirmation=''
    if [ "$confirmation" != "$confirm_word" ]; then
      printf '%s\n' "$(product_copy "$PWD" lifecycle.uninstall.cancelled 'Cancelled; nothing was removed.')"
      exit 0
    fi
    docker compose down --volumes --rmi local
    docker image rm "ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:${IMAGE_TAG:-main}" >/dev/null 2>&1 || true
    rm -f .local/localhost-ca.crt
    rmdir .local 2>/dev/null || true
    printf '%s\n' "$(product_copy "$PWD" lifecycle.uninstall.removed 'Application and local data removed.')"
    ;;
  *)
    docker compose down --rmi local
    docker image rm "ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:${IMAGE_TAG:-main}" >/dev/null 2>&1 || true
    printf '%s\n' "$(product_copy "$PWD" lifecycle.uninstall.preserved 'Application removed; database, secrets, and public certificate were preserved.')"
    ;;
esac
