# Entradas pendentes de changelog (ainda não lançadas)

[English](../../process/pending-changelog-entries.md)

O `docs/pt-BR/VERSIONING.md` proíbe uma seção `Unreleased` nos changelogs públicos, e a seção `v0.3.0-beta` publicada deve ficar como foi lançada (2026-11-06). As entradas da próxima versão esperam aqui e passam para a nova seção `## vX.Y.Z-beta` (nos dois idiomas, com os quadrados coloridos das categorias) quando o `@devops` fizer o próximo bump (D-12, 2026-11-14).

## 🟦 Alterado

- Os contêineres `db` e `bot` agora usam `restart: unless-stopped`. Instalações existentes só recebem isso depois de `docker compose up -d`, que recria `db` e `bot`.

Texto em inglês da mesma entrada: `docs/process/pending-changelog-entries.md`.

Nota: esta entrada tinha sido acrescentada por engano à seção já publicada `v0.3.0-beta` na árvore de trabalho da branch antiga; essa edição não deve ir para a branch nova.
