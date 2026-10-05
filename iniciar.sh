#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p .local
docker compose pull
docker compose up -d
printf 'Certificado HTTPS local: %s/.local/localhost-ca.crt (confie-o no sistema antes de conectar à Twitch)\n' "$PWD"
address="https://localhost:${APP_PORT:-3000}"
attempt=0
until curl --insecure --silent --fail "$address/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    printf 'Painel ainda indisponível. Acesse %s e consulte: docker compose logs -f bot\n' "$address"
    exit 1
  fi
  sleep 2
done
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$address" >/dev/null 2>&1 || printf 'Painel: %s\n' "$address"
elif command -v open >/dev/null 2>&1; then
  open "$address" >/dev/null 2>&1 || printf 'Painel: %s\n' "$address"
else
  printf 'Painel: %s\n' "$address"
fi
