#!/bin/sh
set -eu
cd "$(dirname "$0")"
docker compose up --build -d
address="http://localhost:${APP_PORT:-3000}"
attempt=0
until curl --silent --fail "$address/health" >/dev/null 2>&1; do
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
