# OPS-4 — Adotar a licença MIT

[English](../../../stories/OPS-4/story.md)

**Status:** Pronta para revisão  
**Tipo:** Documentação e metadados do repositório  
**Versão:** `0.4.1-alpha` (PATCH; estágio alpha mantido)

## História do usuário

Como pessoa que contribui com o projeto, quero que o repositório publique termos claros da licença MIT para que todos entendam as permissões e condições de uso e contribuição.

## Critérios de aceite

- [x] Adicionar o texto integral padrão da licença MIT com o titular dos direitos autorais do projeto e o ano atual.
- [x] Declarar `MIT` em `package.json` e manter `package-lock.json` consistente.
- [x] Substituir os avisos de ausência de licença nos dois READMEs por referências MIT corretas e recíprocas.
- [x] Incrementar a versão base em PATCH para `0.4.1`; manter o estágio `alpha` e o marcador de origem zero até que um build materialize o SHA do commit.
- [x] Registrar mudanças concisas para usuários e detalhes internos nos changelogs em inglês e pt-BR.
- [x] Manter alinhados os registros de versionamento e stories em inglês e pt-BR, incluindo corrigir OPS-3 para o estado mesclado (PR #24).
- [x] Executar os gates de qualidade exigidos pelo repositório; registrar abaixo comandos e resultados reais.

## Registro de TDD / verificações

Esta story altera metadados de licença e documentação, não o comportamento da aplicação. Nenhum teste de comportamento da aplicação foi adicionado. `npm run validate:version`, verificações de JSON/lockfile e documentação recíproca passaram. `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, `npm audit --audit-level=high`, configuração Compose e `git diff --check` passaram; a saída de validação da PR registra os resultados exatos. `npm run build` não existe neste repositório; o build da imagem Docker é o caminho de produção e os arquivos da aplicação/runtime não mudaram.

## Lista de arquivos

- [x] `LICENSE`
- [x] `package.json`, `package-lock.json`, `VERSION`
- [x] `README.md`, `README.pt-BR.md`
- [x] `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- [x] `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- [x] `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- [x] `docs/stories.md`, `docs/pt-BR/stories.md`
- [x] `docs/stories/OPS-3/story.md`, `docs/pt-BR/stories/OPS-3/story.md`
- [x] `docs/stories/OPS-4/story.md`, `docs/pt-BR/stories/OPS-4/story.md`
