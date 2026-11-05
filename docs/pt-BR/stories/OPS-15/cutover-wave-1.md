# Cutover da OPS-15 — Onda 1 (o Next assume a `/`)

[English](../../../stories/OPS-15/cutover-wave-1.md)

- **Data:** 2026-10-27
- **Issue:** #93 (FT-38)
- **Executor:** `@dev` (Dex). O veredito final é do `@qa`; o commit é do `@devops`.
- **Branch / base:** `feat/ops-15-next-panel` em `0362c36` (árvore de trabalho sem commit; a Onda 0 é o commit `08e84cb`).
- **Autorização:** proprietário, 2026-10-27, cutover incremental (beta sem usuários ativos, sem shims de compatibilidade; `legacy` = branch protegida `a9279b2`). Decisões do proprietário: DP-0 (OPS-22/OPS-23/FT-23 bloqueiam só a conclusão da OPS-15, não esta onda), DP-1 (a Visão geral do Next é a página inicial de produção; no primeiro uso sem conexão ela mostra o cartão "conectar" em vez de abrir a Conexão), DP-2 (apagar `registerWebRoutes` e `web-route.mjs`, não desligar). Plano: [`cutover-plan.md`](cutover-plan.md), Onda 1, itens A-01 e A-02.
- **Escopo:** só a Onda 1. `apps/web/**`, os arquivos do overlay vanilla e os aliases de `/overlay.html` não foram tocados (Ondas 3 e 4). `API_ONLY` e a dependência `@fastify/static` ficam (Onda 6). Sem mudança em Compose, instaladores, Dockerfile ou CI.

## O que saiu ou mudou

| Arquivo | Mudança | Item do plano |
| --- | --- | --- |
| `apps/frontend/scripts/dev-proxy-config.mjs` | Saíram os três rewrites `beforeFiles` de produção de `/`, `/styles.css` e `/app.js` para o Fastify. Os rewrites restantes para o Fastify são `/api/:path*`, `/overlay/api/:path*`, `/health` e `/callback`; o `afterFiles` mantém `/overlay.html` → `/overlay`. As regras de desenvolvimento não mudaram (nunca tiveram esses três). | A-01 |
| `apps/api/src/server.mjs` | Saíram o import e a chamada de `registerWebRoutes` (raiz estática `apps/web`, prefixos `/shared/browser/` e `/shared/panel/`, opção `apiOnly`). | A-02 |
| `apps/api/src/web-route.mjs` | Apagado (opção A, DP-2). | A-02 |
| `tests/unit/web-route.test.js` (10 casos) | Apagado junto com o módulo. Veja "Testes removidos" abaixo. | A-02 |
| `tests/unit/web-route-vanilla-modules.test.js` (2 casos) | Apagado junto com o módulo. | A-02 |
| `apps/frontend/next.config.mjs` | Não mudou: só chama `buildNextConfig`, que lê as regras acima. | — |

Nenhum código de interface mudou. A Visão geral do Next (`apps/frontend/app/(panel)/page.jsx`) já existia e já era a página em todas as rotas internas; o cartão "conectar canal" do primeiro uso é o comportamento existente de `getOverviewNextAction` (`apps/shared/panel/panel-navigation.mjs:9-14`).

## Buscas de consumidores (antes da mudança, em `0362c36`)

```text
git grep -n -I "registerWebRoutes\|web-route\|API_ONLY\|apiOnly\|fastify/static\|sharedPanelRoot\|sharedBrowserRoot" -- . ':!docs' ':!package-lock.json'
-> apps/api/src/server.mjs:8,128,133,134 (import e chamada)
-> apps/api/src/web-route.mjs (o módulo; único importador de @fastify/static)
-> tests/unit/web-route.test.js, tests/unit/web-route-vanilla-modules.test.js (seus testes)
-> apps/frontend/scripts/dev-runtime-config.mjs:20 (API_ONLY: 'true', fica até a Onda 6)
-> package.json:56 (@fastify/static, fica até a Onda 6)
-> CHANGELOG_INTERNAL.md (histórico)

git grep -n -E "['\"\`]/shared/(browser|panel)/" HEAD -- apps tests ':!apps/web'
-> só web-route.mjs e seus dois testes: nenhum consumidor HTTP dos prefixos compartilhados fora do vanilla
   (o Next e a API importam apps/shared/** pelo sistema de arquivos, não por HTTP)

git grep -n -E "source: '/'|'/styles\.css'|'/app\.js'" -- tests apps
-> tests/unit/next-dev-proxy.test.js, tests/unit/next-runtime-config.test.js:36,
   tests/integration/next-static-export.test.js:31, tests/integration/compose-runtime.test.js:387-391,
   tests/integration/compose-contract.test.js:170-171 (server.mjs contém a URL da raiz web)
```

Depois da mudança, `git grep -n -E "registerWebRoutes|web-route" -- . ':!docs' ':!CHANGELOG_INTERNAL.md'` → exit 1 (nenhuma ocorrência).

Não removidos de propósito: os aliases de `/overlay.html` (`dev-proxy-config.mjs`, `apps/api/src/http/dev-overlay-alias.mjs`), `apps/shared/panel/**` e `apps/shared/browser/translate-catalog.mjs` (importados pelo Next e pelo `chat-handler.mjs` pelo sistema de arquivos), os catálogos próprios em `apps/web/localization/catalogs` (ainda lidos por `server.mjs:43`; Onda 2).

## Teste primeiro (Red → Green)

Testes novos e alterados (o novo contrato):

- **Novo** `tests/unit/api-static-surface-contract.test.js`: `server.mjs` não registra nem importa as rotas web e não monta as raízes `../../web/`, `../../shared/browser/` ou `../../shared/panel/`; `apps/api/src/web-route.mjs` não existe; nenhum módulo em `apps/api/src` importa `@fastify/static`. Isso reexpressa o caso de classe 1 "API-only mode without browser UI routes" (`web-route.test.js:16`) para o processo inteiro da API, e não para uma flag.
- `tests/unit/next-dev-proxy.test.js`: as regras exatas de produção não listam mais `/`, `/styles.css`, `/app.js`; caso novo "never rewrites the panel root or a vanilla panel asset to Fastify" (nenhuma origem `/`, `/index.html`, `/styles.css`, `/app.js`, `/overlay.js`, `/overlay.css` ou `/shared/*`; o Fastify recebe só as quatro rotas operacionais; o `afterFiles` mantém `/overlay.html`); o caso de `buildNextConfig` afirma que não há origem `/`.
- `tests/integration/compose-contract.test.js:170-172`: o `server.mjs` **não** deve conter a raiz web `../../web/`.
- `tests/integration/compose-runtime.test.js` (caso de posse das rotas, renomeado "Next owns the root and migrated pages, overlay, and Fastify APIs"): `/` = 200, `text/html`, `x-powered-by: Next.js`, `class="panel-shell"`, `data-next-panel-entry`, sem `app-shell`, sem link para `/styles.css`; `/app.js`, `/styles.css`, `/index.html` e `/shared/panel/panel-navigation.mjs` = 404 respondido pelo Next, nunca JavaScript ou CSS.
- `tests/unit/next-runtime-config.test.js:28-38` e `tests/integration/next-static-export.test.js:30-32`: estes dois também fixavam o rewrite antigo de `/`. **Não** estavam no plano e minha primeira busca (por `styles.css`/`app.js`) não os pegou; a suíte completa os achou depois da mudança de código. Foram invertidos (`beforeFiles` exato com quatro regras; nenhum `/`, `/styles.css`, `/app.js` no `routes-manifest.json` gerado), e o Red deles foi reproduzido contra a configuração de proxy antiga (abaixo).

**Red** (código inalterado):

- `npx vitest run tests/unit/next-dev-proxy.test.js tests/unit/api-static-surface-contract.test.js tests/integration/compose-contract.test.js` → 3 arquivos falharam, 6 falhas / 15 aprovados. Falhas: os dois casos de `api-static-surface-contract` (`server.mjs` casa com `registerWebRoutes`; importadores = `["apps/api/src/web-route.mjs"]`), os três casos de `next-dev-proxy` (origens vanilla `/`, `/styles.css`, `/app.js` presentes), `compose-contract` (`server.mjs` contém a URL da raiz web).
- `npx vitest run tests/integration/compose-runtime.test.js -t "route ownership"` → exit 1, 1 falha / 6 ignorados, em `compose-runtime.test.js:391`: `expected undefined to be 'Next.js'` (o Fastify respondeu a `/`).
- `next-runtime-config.test.js` com só o `dev-proxy-config.mjs` restaurado temporariamente ao `HEAD` (`git stash push -- <arquivo>`, depois `git stash pop`) → exit 1, 1 falha / 4 aprovados. O `next-static-export` falhou na primeira execução da suíte completa depois da mudança de código e antes da sua edição (`expected [...] to deep equally contain { source: '/' ... }`), ou seja, fixava o contrato antigo.

**Green** (depois da mudança):

- Os 7 arquivos afetados diretamente (`next-dev-proxy`, `api-static-surface-contract`, `compose-contract`, `shared-panel-boundary`, `orphan-module-contract`, `next-dev-runtime-config`, `dockerfile-frontend-imports`) → 7 arquivos / 38 testes aprovados.
- `npx vitest run tests/unit/next-runtime-config.test.js tests/integration/next-static-export.test.js` → exit 0, 2 arquivos / 6 testes (inclui um `next build` real).
- `npx vitest run tests/integration/compose-runtime.test.js` (arquivo inteiro, constrói uma imagem descartável) → exit 0, 7/7 aprovados em 120,5 s: posse das rotas, overlay, jornada no Chromium, catálogo da comunidade, TLS e reinício.

## Testes removidos e onde cada contrato vive agora

| Teste removido | Classe (auditoria) | Contrato agora mantido por |
| --- | --- | --- |
| `web-route.test.js` "API-only mode without browser UI routes" | 1 (contrato mantido) | `api-static-surface-contract.test.js` (nenhum handler estático no processo da API) + `compose-runtime` (`/app.js` = 404 do Next) |
| `web-route.test.js` "serves only shared localization ESM from the browser module prefix" | 1 | Obsoleto: não sobra consumidor HTTP de `/shared/browser/` (busca acima). O `translate-catalog.mjs` continua importado pelo sistema de arquivos e coberto pelos próprios testes unitários. A reclassificação para C deve ser confirmada pelo `@qa` (plano, Onda 1). |
| `web-route.test.js` "transitional /shared/panel/ prefix" e "does not expose the shared panel prefix in API-only mode" | C (transitório) | `compose-runtime` afirma `/shared/panel/panel-navigation.mjs` = 404 do Next |
| `web-route.test.js`, seis casos que leem `/`, `/app.js`, `/styles.css` (marcação da página, seletor de idioma, reenvio, diálogos de configuração, confirmação de exclusão) | C (UI vanilla, `legacy-test-audit.md:30`) | Testes das páginas Next já listados na auditoria (`next-overview-panel`, `next-queues-*`, `next-locale-*`, `next-panel-class1-parity` etc.); não foram portados de novo |
| `web-route-vanilla-modules.test.js` (2) | C (grafo HTTP S-03 do vanilla) | `shared-panel-boundary.test.js` continua verificando que todo import relativo de `app.js`/`overlay.js` resolve para um arquivo até as Ondas 3/4 |

Nenhum arquivo de contrato de classe B foi tocado: `panel-confirmation-contract`, `reward-dialog-contract`, `health-status`, `web-application-setup`, `locale-picker-state` e `panel-localization-contract` leem arquivos em disco, não por HTTP, e continuam passando.

## Verificação (`@dev`, só desenvolvimento; não é o veredito do `@qa`)

Todos os comandos rodaram com Node 24.20.0 (`nvm use`).

| Comando | Exit | Resultado |
| --- | --- | --- |
| `npm run lint` | 0 | aprovado |
| `npm run typecheck` | 0 | aprovado |
| `npm test` (suíte completa, execução final) | 0 | 164 arquivos / 1609 testes aprovados (109,2 s). Base da Onda 0: 165 / 1618: −12 (`web-route` 10 + `web-route-vanilla-modules` 2), +2 (`api-static-surface-contract`), +1 (`next-dev-proxy`). A execução completa anterior, antes das duas edições extras de teste, deu exit 1 com exatamente as 2 falhas descritas acima. |
| `npx vitest run tests/integration/compose-runtime.test.js` | 0 | 7/7 (imagem descartável construída a partir da árvore de trabalho; `/` respondida pelo Next) |
| `npm run review:static` | 0 | 2 regras em 151 arquivos, 0 achados |
| `npm run validate:localization` | 0 | aprovado |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` válida |
| `npm run validate:port-denylist` | 0 | 1037 arquivos, 0 achados |
| `npm run sync:ide:check` | 0 | aprovado |
| `docker compose -f compose.yaml -f compose.build.yaml config --quiet` | 0 | válido (só renderização) |
| `git diff --check` (+ verificação `--no-index` do teste novo não rastreado) | 0 | sem erros de espaço em branco |

**Docker:** antes do trabalho havia 0 containers, 0 volumes e uma imagem (`postgres:18.6-bookworm`). Os únicos recursos criados foram os descartáveis que o `compose-runtime` (três execuções: Red, Green e dentro de cada suíte completa) e os arquivos de integração com PostgreSQL criam e removem. Depois de cada execução: 0 containers, 0 volumes, só `postgres:18.6-bookworm`, nenhuma rede extra. Nenhum recurso ativo existia ou foi tocado. As portas 3000/3109 não foram usadas manualmente e nenhum servidor de desenvolvimento foi iniciado.

**Não executado:** smoke em navegador de `/` em 390×844 / 768×900 / 1440×900 e os E2E do overlay `browser-only`, `parity-browser-only` e `bundle-boundary` (gates da Onda 1 para o `@qa`); `npm run build:frontend` em worktree isolada (o teste `next-static-export` rodou `next build` no `apps/frontend/.next` compartilhado); Twitch ao vivo; OBS/CEF nativo.

## Riscos observados

- **Duas fixações fora da lista.** `next-runtime-config.test.js` e `next-static-export.test.js` também fixavam o rewrite de `/`; o plano listava só `next-dev-proxy` e `compose-runtime`. Os dois foram invertidos nesta onda. O `@qa` deve repetir a busca ampla `git grep -n -E "source: '/'|'/styles\.css'|'/app\.js'" -- tests apps`.
- **Página do primeiro uso (R2, DP-1).** Uma primeira visita sem conexão agora cai na Visão geral com o cartão "conectar canal", em vez da página Conexão. É o comportamento aceito; está coberto por testes unitários da Visão geral e não foi verificado em navegador nesta onda.
- **Arquivos mortos ainda em disco.** `apps/web/**` (painel e overlay) e o `@fastify/static` agora estão inalcançáveis/sem uso em runtime até as Ondas 3, 4 e 6. O `orphan-module-contract` não os aponta porque `index.html`/`overlay.html` ainda os referenciam.
- **Documentação não atualizada nesta onda.** O plano lista `docs/front-end-architecture/runtime-and-boundaries.md`, `files-and-modules.md`, `verification.md`, `docs/fullstack-architecture/application-modules.md`, `docs/architecture/responsibilities.md` e `docs/DEVELOPMENT.md:90` (en + pt-BR). Eles ficaram fora do conjunto de escrita dado ao `@dev` nesta execução (outro agente editava a documentação da story), então ainda descrevem a `/` vanilla transitória. A linha do changelog beta voltada ao produto (DP-7, `CHANGELOG-beta.md`) também está pendente, para a preparação do release.
- **Um commit não muda a produção.** As pessoas usuárias só veem isto quando um release sair (R7).
- Só um navegador real confirma a ausência de estouro de layout e o polling de 5 s em `/`; só um release publicado confirma a página inicial das instalações.

## Arquivos alterados

- Removidos: `apps/api/src/web-route.mjs`, `tests/unit/web-route.test.js`, `tests/unit/web-route-vanilla-modules.test.js`.
- Criados: `tests/unit/api-static-surface-contract.test.js`, este arquivo e a cópia em inglês.
- Alterados: `apps/api/src/server.mjs`, `apps/frontend/scripts/dev-proxy-config.mjs`, `tests/unit/next-dev-proxy.test.js`, `tests/unit/next-runtime-config.test.js`, `tests/integration/next-static-export.test.js`, `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Não alterados (de propósito): `apps/frontend/next.config.mjs`, `package.json`, `Dockerfile`, arquivos do Compose, CI, instaladores, `apps/web/**`, a story e sua File List (o `@po` editava a story ao mesmo tempo; `@po`/`@dev` atualizam a File List depois).

## Como reverter

Reverter o commit da Onda 1 (`git revert <commit>`). Isso restaura os três rewrites, o `web-route.mjs`, sua chamada em `server.mjs` e os dois testes removidos, e desfaz as inversões de teste; a `/` volta ao shell vanilla. Não há efeito em dados, schema ou Compose.
