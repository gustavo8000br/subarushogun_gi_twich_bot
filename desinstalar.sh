#!/bin/sh
set -eu
cd "$(dirname "$0")"
printf 'Deseja apagar o banco e os segredos deste projeto? [s/N] '
IFS= read -r answer || answer=''
case "$answer" in
  s|S|sim|SIM)
    printf 'Isso apaga filas, histórico, credenciais Twitch, senha do banco e certificados privados. Digite APAGAR para confirmar: '
    IFS= read -r confirmation || confirmation=''
    if [ "$confirmation" != APAGAR ]; then
      printf 'Cancelado; nada foi removido.\n'
      exit 0
    fi
    docker compose down --volumes --rmi local
    docker image rm "ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:${IMAGE_TAG:-main}" >/dev/null 2>&1 || true
    rm -f .local/localhost-ca.crt
    rmdir .local 2>/dev/null || true
    printf 'Aplicação e dados locais removidos.\n'
    ;;
  *)
    docker compose down --rmi local
    docker image rm "ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:${IMAGE_TAG:-main}" >/dev/null 2>&1 || true
    printf 'Aplicação removida; banco, segredos e certificado público foram preservados.\n'
    ;;
esac
