#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p .local
. apps/infra/scripts/host-locale.sh
load_product_locale "$PWD"
docker compose pull
docker compose up -d
printf '%s: %s/.local/localhost-ca.crt\n' "$(product_copy "$PWD" lifecycle.setup.certificate 'Local HTTPS certificate')" "$PWD"
printf '%s\n' "$(product_copy "$PWD" lifecycle.setup.trust 'Trust this certificate in your operating system before connecting to Twitch.')"
address="https://localhost:${APP_PORT:-3000}"
attempt=0
until curl --insecure --silent --fail "$address/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    printf '%s\n' "$(product_copy "$PWD" lifecycle.setup.timeout 'Panel is still unavailable. Check the bot service logs.')"
    printf '%s: %s\n' "$(product_copy "$PWD" lifecycle.setup.address 'Panel address')" "$address"
    printf 'docker compose logs -f bot\n'
    exit 1
  fi
  sleep 2
done
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$address" >/dev/null 2>&1 || { printf '%s\n' "$(product_copy "$PWD" lifecycle.setup.open_browser 'The browser could not be opened automatically.')"; printf '%s: %s\n' "$(product_copy "$PWD" lifecycle.setup.address 'Panel address')" "$address"; }
elif command -v open >/dev/null 2>&1; then
  open "$address" >/dev/null 2>&1 || { printf '%s\n' "$(product_copy "$PWD" lifecycle.setup.open_browser 'The browser could not be opened automatically.')"; printf '%s: %s\n' "$(product_copy "$PWD" lifecycle.setup.address 'Panel address')" "$address"; }
else
  printf '%s: %s\n' "$(product_copy "$PWD" lifecycle.setup.address 'Panel address')" "$address"
fi
