#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'Atualizador disponível somente em uma cópia Git do projeto. Baixe a versão desejada e execute docker compose up --build -d.\n' >&2
  exit 1
fi
branch=$(git branch --show-current)
if [ "$branch" != main ]; then
  printf 'Atualize a partir da branch main (branch atual: %s).\n' "$branch" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  printf 'Há alterações locais. Salve ou descarte-as antes de atualizar.\n' >&2
  exit 1
fi
git fetch origin main
git pull --ff-only origin main
docker compose up --build -d
printf 'Atualização concluída. Os volumes de dados e segredos foram preservados.\n'
