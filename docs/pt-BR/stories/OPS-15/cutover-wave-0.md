# Cutover da OPS-15 — Onda 0 (código morto)

[English](../../../stories/OPS-15/cutover-wave-0.md)

- **Data:** 2026-10-27
- **Executor:** `@dev` (Dex). O veredito final é do `@qa`; o commit é do `@devops`.
- **Branch / base:** `feat/ops-15-next-panel` em `fb828d3` (árvore de trabalho não comitada).
- **Autorização:** proprietário, 2026-10-27, cutover incremental (beta sem usuários ativos; `legacy` = branch protegida `a9279b2`). Plano: [`cutover-plan.md`](cutover-plan.md), Onda 0, itens A-06 e A-11.
- **Escopo:** somente a Onda 0. Nenhuma rota, rewrite, alias ou tratamento de `/overlay.html` mudou (isso é a Onda 3). Nada da Onda 1 foi feito.

## O que foi removido

| Arquivo | Item do plano | Por que está morto |
| --- | --- | --- |
| `apps/web/priority-labels.mjs` | A-06 / TS-01 | O único consumidor era o próprio teste. O `app.js` parou de importá-lo na FND-8 (`a906756`, `test-suite-audit-2026-10-23.md:50`). |
| `tests/unit/priority-labels.test.js` | A-06 / TS-01 | Classe D: testava só o módulo morto. O React escapa texto por padrão, então a garantia de "não refletir dados arbitrários" não precisa de porte para o Next (linha 50 da auditoria). |
| `apps/frontend/scripts/create-overlay-alias.mjs` | A-11 / FT-04 (parte) | Resíduo do antigo export estático: copiava `out/overlay/index.html` para `out/overlay.html`. O painel não usa mais export estático (`out/` não existe) e nada executa o script. |

Nada mais dependia desses arquivos, então nada mais foi removido. Nenhum script do `package.json`, linha do Dockerfile, arquivo Compose, workflow de CI ou instalador os referenciava.

## Prova de que não havia importadores (antes da remoção)

Comandos executados na raiz do repositório em 2026-10-27:

```text
git grep -n -I "priority-labels" -- . ':!docs'
-> tests/unit/priority-labels.test.js:2 (só o próprio teste)

git grep -n -I "create-overlay-alias" -- . ':!docs'
-> (sem saída)

git grep -n "frontend/scripts\|apps/web" -- Dockerfile .dockerignore apps/infra .github compose*.yaml apps/frontend/next.config.* apps/frontend/package.json
-> Dockerfile:9 (só os catálogos de localização) e apps/infra/scripts/start-product.mjs:5 (só start-production.mjs)
```

O `Dockerfile:18` (`COPY apps ./apps`) copiava os dois arquivos para a imagem de runtime como bytes soltos, mas nada os importava nem os executava. Removê-los só retira esses bytes; o Dockerfile não mudou. As menções restantes em `docs/**` são históricas (auditorias, pesquisas, gates de QA, handoffs) e foram mantidas como estão.

Varredura por nome de arquivo em `apps/**`, `package.json`, `Dockerfile`, `compose*.yaml` e `.github/**`, contando arquivos que não são testes e citam o nome de cada módulo: `create-overlay-alias.mjs` = 0 e `priority-labels.mjs` = 0. Todos os outros módulos de `apps/web` e `apps/frontend/scripts` tinham ≥ 1.

## Teste primeiro (Red → Green)

Novo teste de contrato: `tests/unit/orphan-module-contract.test.js`.

- **Regra:** todo módulo `.mjs`/`.js` de primeiro nível em `apps/web` e `apps/frontend/scripts` precisa ser citado pelo nome em pelo menos um arquivo que não seja teste (código, HTML, JSON ou YAML em `apps/**`, `package.json` da raiz, `Dockerfile`, `compose*.yaml`, `.github/workflows`). Código que só um teste importa conta como morto. A comparação é por nome inteiro (`dev-server.mjs` não casa com `dev-server-state.mjs`), e um segundo caso verifica esse comparador.
- **Por que uma regra geral, e não uma lista fixa:** ela volta a falhar se alguém adicionar código morto novo nesses dois diretórios durante as próximas ondas. Ela não substitui o `shared-panel-boundary.test.js` (fronteira de imports S-03), que as Ondas 3 e 4 vão alterar.
- **Limite conhecido:** uma menção desatualizada em comentário ou string em outro ponto de `apps/**` conta como consumidor, então a verificação pode deixar passar código morto. Ela nunca faz código vivo falhar.

**Red** (antes da remoção): `npx vitest run tests/unit/orphan-module-contract.test.js` → exit 1, 1 falhou / 1 passou. Recebido `["apps/web/priority-labels.mjs", "apps/frontend/scripts/create-overlay-alias.mjs"]`, esperado `[]`.

**Green** (depois da remoção): `npx vitest run tests/unit/orphan-module-contract.test.js tests/unit/shared-panel-boundary.test.js tests/unit/dockerfile-frontend-imports.test.js` → exit 0, 3 arquivos / 10 testes passaram. Isso inclui o caso do `shared-panel-boundary` "resolves every relative import of apps, the vanilla entrypoints and tests to an existing file", que o plano indica como verificação pós-remoção da Onda 0.

## Verificação (`@dev`, só de desenvolvimento; não é o veredito do `@qa`)

Todos os comandos rodaram com Node 24.20.0 (`nvm use`).

| Comando | Exit | Resultado |
| --- | --- | --- |
| `npm run lint` | 0 | passou |
| `npm run typecheck` | 0 | passou |
| `npm test` (suíte completa, uma vez) | 0 | 165 arquivos / 1618 testes passaram (151,8 s); último baseline registrado 165 / 1621 (entrada da FT-24 no changelog, não reexecutado aqui): −5 casos removidos do priority-labels, +2 casos novos de contrato |
| `npm run review:static` | 0 | 2 regras em 152 arquivos, 0 achados |
| `npm run validate:localization` | 0 | passou |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` válida |
| `npm run validate:port-denylist` | 0 | 1037 arquivos, 0 achados |
| `git diff --check` (+ verificação `--no-index` do teste novo não rastreado) | 0 | sem erros de espaço em branco |
| `docker compose -f compose.yaml -f compose.build.yaml config --quiet` | 0 | válido (só renderização; nada criado) |

**Docker:** os únicos recursos Docker criados foram os recursos descartáveis que o `npm test` cria e remove nos arquivos de integração com PostgreSQL/Compose. A Onda 0 não criou mais nada, e nenhum contêiner, volume ou imagem ativo foi tocado. Nenhum build de imagem foi executado: o Dockerfile não mudou e não citava nenhum dos dois arquivos.

**Não executado:** `next build`, build da imagem Docker, navegador, OBS/CEF e Twitch. A Onda 0 não altera nenhum caminho de runtime.

## Arquivos alterados

- Removidos: `apps/web/priority-labels.mjs`, `tests/unit/priority-labels.test.js`, `apps/frontend/scripts/create-overlay-alias.mjs`.
- Criados: `tests/unit/orphan-module-contract.test.js`, este arquivo e sua cópia em inglês.
- Alterados: `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Não alterados (de propósito): `package.json`, `Dockerfile`, arquivos Compose, CI, instaladores, a story e sua File List. Outro agente estava comitando documentos da story ao mesmo tempo, então `@po`/`@dev` atualizam a File List da story em uma etapa posterior.

## Como reverter

Reverta o commit da Onda 0 (`git revert <commit>`). Isso restaura os três arquivos e remove o teste de contrato. Não há efeito em dados, schema, runtime ou configuração.
