#!/bin/sh
set -eu
cd "$(dirname "$0")"
. apps/infra/scripts/host-locale.sh
load_product_locale "$PWD"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '%s\n' "$(product_copy "$PWD" lifecycle.update.git_required 'The updater requires a Git checkout and access to GHCR.')" >&2
  exit 1
fi
branch=$(git branch --show-current)
if [ "$branch" != main ]; then
  printf '%s (%s: %s).\n' "$(product_copy "$PWD" lifecycle.update.main_only 'Update only from the main branch.')" "$(product_copy "$PWD" lifecycle.update.current_branch 'Current branch')" "$branch" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  printf '%s\n' "$(product_copy "$PWD" lifecycle.update.dirty 'Local changes are present. Save or discard them before updating.')" >&2
  exit 1
fi
git fetch origin main
git pull --ff-only origin main
docker compose pull
docker compose up -d
printf '%s\n' "$(product_copy "$PWD" lifecycle.update.done 'Update complete. Data and secret volumes were preserved.')"
