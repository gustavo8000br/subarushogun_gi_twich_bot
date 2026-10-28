# Cutover da OPS-15 — Onda 3 (overlay vanilla e aliases de `/overlay.html` removidos)

[English](../../../stories/OPS-15/cutover-wave-3.md)

- **Data:** 2026-10-27 (código); verificação retomada em 2026-10-28 após interrupção por cota
- **Issue:** #95 (card FT-39), sub-issue da #69
- **Executor:** `@dev` (Dex). O veredito final é do `@qa`; o commit é do `@devops`.
- **Veredito do QA:** CONCERNS, 9,0/10 (gate de fatia, 0 problemas bloqueantes para o commit da Onda 3): [`qa-gate-2026-10-28.md`](qa-gate-2026-10-28.md).
- **Branch / commits:** `feat/ops-15-next-panel`, base `184b259` (Onda 0 = `0eb4fd2`, Onda 1 = `bfff2f1`). Onda 3 comitada pelo `@devops`: `69e9534` (código + docs), seguido de `d97c96c` (docs de arquitetura), `4d2f750` (stories e planejamento) e `75c11c7` (snapshot da memória de governança).
- **Autorização:** proprietário, 2026-10-27, cutover incremental (beta sem usuários ativos, mudança estrutural segura até `rc`, sem shims de compatibilidade; `legacy` = branch protegida `a9279b2`). OW-09 resolvida: os aliases de `/overlay.html` não precisam ser mantidos. O proprietário conferiu o resultado manualmente com `npm run dev:start` ("Tudo Ok"). Plano: [`cutover-plan.md`](cutover-plan.md), Onda 3.
- **Escopo:** só a Onda 3. O painel vanilla (`apps/web/app.js`, `index.html`, `styles.css` e seus módulos) e os catálogos de localização não foram tocados (Ondas 2 e 4). `API_ONLY` e `@fastify/static` ficam (Onda 6). Sem mudança em Compose, instaladores, Dockerfile, CI ou `package.json`.

## O que saiu ou mudou

| Arquivo | Mudança |
| --- | --- |
| `apps/api/src/domain/overlay-widget-service.mjs` | O gerador do link do widget emite `${origin}/overlay?ref=<22 caracteres>#<token>` em vez de `/overlay.html?...`. O segredo de capacidade continua só no fragmento (o navegador nunca o envia em requisição, cabeçalho `Location` ou linha de log). |
| `apps/api/src/http/dev-overlay-alias.mjs` | Apagado. Era o redirecionamento do Fastify só em desenvolvimento, `GET /overlay.html` → 307 para a origem do Next. |
| `apps/api/src/server.mjs` | Saíram o import de `registerDevelopmentOverlayAlias` e o seu registro condicionado a `NODE_ENV === 'development'`. |
| `apps/frontend/scripts/dev-proxy-config.mjs` | Saíram a regra de desenvolvimento `/overlay.html` → `/overlay` e a regra `afterFiles` de produção (agora `afterFiles: []`). |
| `apps/web/overlay.html`, `overlay.js`, `overlay.css` | Apagados (não servidos desde a Onda 1). |
| `tests/unit/dev-overlay-alias.test.js` (3 casos) | Apagado junto com o módulo. |

O overlay do Next (`apps/frontend/app/(overlay)/**`, que importa `apps/frontend/styles/overlay.css`, outro arquivo) e o renderizador `apps/shared/panel/overlay-renderer.mjs` não mudaram.

## Buscas de consumidores

```text
git grep -n -I "overlay\.html\|overlay\.js\b\|overlay\.css\|dev-overlay-alias\|registerDevelopmentOverlayAlias" -- ':!docs/**' ':!CHANGELOG*' ':!legacy/**'
-> apps/frontend/app/(overlay)/layout.jsx:1   importa ../../styles/overlay.css (a folha do Next, não a de apps/web)
-> só testes: asserções de que os caminhos não existem ou respondem 404
   (overlay-browser-only.mjs:51-52, compose-runtime.test.js:374-382, next-static-export.test.js:32-34,
    api-static-surface-contract.test.js:38-55, next-dev-proxy.test.js, next-runtime-config.test.js:38,
    overlay-widget-service.test.js:19-22, shared-panel-boundary.test.js:77)
-> .claude/agent-memory/aiox-po/project_no_shims_until_rc.md (memória de agente, histórico)
```

Nenhum módulo de aplicação (`apps/api/src`, `apps/frontend`, `apps/shared`, `apps/infra`) contém mais `overlay.html`; o novo caso de `api-static-surface-contract` garante isso. As ocorrências restantes de `overlay` em `apps/web/app.js` são o editor de widgets do painel vanilla (Onda 4), não o documento do overlay.

## Test-first (Red → Green)

Testes novos e alterados (o novo contrato):

- `overlay-widget-service.test.js`: o link casa com `^https://localhost:3000/overlay\?ref=[A-Za-z0-9_-]{22}#`, o caminho é `/overlay` e não contém `overlay.html`; o link regenerado também usa `/overlay`.
- `api-static-surface-contract.test.js` (novo `describe`): o `server.mjs` não importa nem registra o alias de desenvolvimento, `http/dev-overlay-alias.mjs` não existe e nenhum módulo de aplicação serve, reescreve ou emite `/overlay.html`.
- `next-dev-proxy.test.js`: nenhuma regra `/overlay.html` em desenvolvimento ou produção; nenhuma regra reescreve para `/overlay`; `/overlay.html` entrou na lista de origens vanilla que nunca chegam ao Fastify; o `afterFiles` de produção é `[]`.
- `next-runtime-config.test.js`: `afterFiles` é `[]`. `next-static-export.test.js`: o `routes-manifest.json` gerado não tem rewrite de `overlay.html`.
- `shared-panel-boundary.test.js`: `apps/web/overlay.html`, `overlay.js`, `overlay.css` não existem (a asserção de `app.js` fica até a Onda 4).
- `compose-runtime.test.js` (posse de rotas): `/overlay.html?ref=...`, `/overlay.html`, `/overlay.js` e `/overlay.css` = 404 respondido pelo Next, sem `Location`, sem a entrada do overlay, nunca JavaScript ou CSS; `/overlay?ref=...` = 200, sem `Location`, com a entrada do overlay do Next.
- `overlay-browser-only.mjs`: abre `/overlay?ref=...#token`, confere que a página fica em `/overlay` (sem redirecionamento) e que `/overlay.html` = 404 com redirecionamentos desligados.
- Só fixtures (sem contrato novo): `overlay-renderer`, `overlay-routes`, `queue-routes`, `next-widgets-page`, `overlay-parity-browser-only.mjs`, `overlay-browser.mjs` (filtro de páginas CDP) e `widget-link-dialog-browser-only.mjs` agora usam URLs `/overlay`.

**Red** (testes como acima, arquivos de produção restaurados temporariamente para o `HEAD` `184b259`: os três módulos alterados e os quatro arquivos apagados; depois as versões da Onda 3 voltaram e foram conferidas por SHA-256):

- `npx vitest run tests/unit/overlay-widget-service.test.js tests/unit/next-dev-proxy.test.js tests/unit/api-static-surface-contract.test.js tests/unit/shared-panel-boundary.test.js tests/unit/next-runtime-config.test.js tests/unit/orphan-module-contract.test.js` → 5 arquivos falharam / 1 passou, **10 falhas / 18 aprovados**: 2 em `overlay-widget-service` (caminho do link), 4 em `next-dev-proxy` (regras de alias presentes), 1 em `next-runtime-config`, 2 em `api-static-surface-contract` (o `server.mjs` registra o alias; `dev-overlay-alias.mjs` emite `overlay.html`), 1 em `shared-panel-boundary` (`apps/web/overlay.html` existe). O `orphan-module-contract` passa nos dois estados (os arquivos do overlay se referenciavam, então ele nunca os apontou).
- `npx vitest run tests/integration/compose-runtime.test.js -t "route ownership"` → exit 1, 1 falha / 6 ignorados, em `compose-runtime.test.js:378`: `/overlay.html?ref=aaaaaaaaaaaaaaaaaaaaaa is retired: expected 200 to be 404` (o rewrite `afterFiles` antigo servia o overlay).

**Green** (árvore da Onda 3):

- Os arquivos unitários afetados acima mais `overlay-renderer`, `overlay-routes`, `queue-routes`, `next-widgets-page` → exit 0, 10 arquivos / 234 testes.
- `npx vitest run tests/integration/compose-runtime.test.js` (arquivo completo, imagem descartável gerada da árvore de trabalho) → exit 0, 7/7 em 110,7 s.

## Verificação (`@dev`, só desenvolvimento; não é o veredito do `@qa`)

Todos os comandos rodaram com Node 24.20.0 (`nvm use`).

| Comando | Exit | Resultado |
| --- | --- | --- |
| `npm run test:e2e:overlay:browser-only` com `APP_ORIGIN=https://localhost:3207` | 0 | `/overlay` do Next sem redirecionamento, `/overlay.html` = 404, limpeza do fragmento, bearer sem cookies, limpeza em 401/403/404, 8 fontes isoladas (Chrome headless; fixtures de API interceptadas) |
| `npm run test:e2e:overlay:parity-browser-only` com a mesma origem | 0 | 7 tipos de fonte, 8 fontes simultâneas, 10 revisões rápidas, última atualização em 956 ms, isolamento de bundle por rota (fixtures interceptadas) |
| `npm run test:e2e:overlay:bundle-boundary` | 0 | entrada do overlay com 1 chunk; do painel com 3; 3 chunks só do painel excluídos |
| `npx vitest run tests/integration/compose-runtime.test.js` | 0 | 7/7 |
| `npm test` (suíte completa) | 0 | 163 arquivos / 1610 testes (120,6 s). Registro da Onda 1: 164 / 1609; −1 arquivo / −3 casos (`dev-overlay-alias`), +4 casos (2 `api-static-surface-contract`, 1 `next-dev-proxy`, 1 `shared-panel-boundary`) |
| `npm run lint` | 0 | passa |
| `npm run typecheck` | 0 | passa |
| `npm run review:static` | 0 | 2 regras em 149 arquivos, 0 achados |
| `npm run validate:localization` | 0 | passa |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` válida |
| `npm run validate:port-denylist` | 0 | 1037 arquivos, 0 achados |
| `docker compose -f compose.yaml -f compose.build.yaml config --quiet` | 0 | válido (só renderização) |
| `git diff --check` | 0 | sem erros de espaço em branco |

Os dois E2E `browser-only` precisam de um app HTTPS em loopback. Sem ele, falham com `net::ERR_CONNECTION_REFUSED` em `https://localhost:3000` (primeira tentativa, exit 1, nenhum app no ar). Depois rodaram contra um `next dev` isolado em `127.0.0.1:3207`, com as mesmas flags `--experimental-https` e os certificados locais de desenvolvimento que o `npm run dev:start` usa, sem Fastify nem banco (os testes interceptam `/overlay/api/widget`). Antes dos testes esse servidor respondeu `/overlay` = 200 e `/overlay.html` = 404 com `Location` vazio. Ele foi encerrado no mesmo comando; depois nenhuma porta 3000–3999 ficou escutando e não sobrou processo do Next.

**Docker:** antes do trabalho havia 0 containers, 0 volumes, as redes `bridge`/`host`/`none` e uma imagem (`postgres:18.6-bookworm`). Os únicos recursos criados foram os descartáveis que o `compose-runtime` (Green do arquivo completo, Red de um caso e dentro do `npm test`) e os arquivos de integração com PostgreSQL criam e removem. Depois de cada execução: 0 containers, 0 volumes, só `postgres:18.6-bookworm`, as mesmas três redes. Nenhum recurso ativo existia nem foi tocado.

**Não executado:** OBS/CEF nativo com um link `/overlay` novo; Firefox/WebKit; Twitch ao vivo; `test:e2e:overlay` (variante CDP contra uma stack em execução); `npm run build:frontend` em worktree isolada (o `next-static-export` rodou `next build` no `apps/frontend/.next` compartilhado).

## Riscos observados

- **Links antigos do OBS deixam de funcionar.** Uma fonte de navegador configurada com `/overlay.html?ref=...#token` agora recebe 404 e precisa de um link gerado de novo. Aceito pelo proprietário (beta sem usuários ativos, OW-09). Nenhum redirecionamento foi mantido de propósito: seria um shim de compatibilidade.
- **A documentação ainda descreve o alias.** `docs/front-end-architecture.md`, `docs/front-end-architecture/runtime-and-boundaries.md`, `screen-model.md`, `verification.md`, `docs/fullstack-architecture.md`, `docs/fullstack-architecture/runtime-topology.md` e `docs/DEVELOPMENT.md` (en + pt-BR) ainda citam `/overlay.html` ou "a ser removido na Onda 3". Ficaram fora do conjunto de escrita do `@dev` nesta execução; outro agente cuida dessas atualizações.
- **Texto da story.** Os AC 3/AC 8 da OPS-15 citavam `/overlay.html`; o plano condicionou a onda à reescrita deles pelo `@po`. O `@po` editava a story em paralelo; o `@qa` deve confirmar a redação antes do gate.
- **Diretório de build do Next compartilhado.** O `next-static-export` e o `next dev` isolado usaram `apps/frontend/.next`; o `dev:start` do proprietário o refaz, então não há ação necessária, mas um servidor de desenvolvimento do proprietário em execução teria conflitado (nenhum estava no ar).
- Um commit não muda produção; as pessoas usuárias só veem a mudança quando um release sair.

## Arquivos alterados

- Removidos: `apps/web/overlay.html`, `apps/web/overlay.js`, `apps/web/overlay.css`, `apps/api/src/http/dev-overlay-alias.mjs`, `tests/unit/dev-overlay-alias.test.js`.
- Criados: este arquivo e a cópia em inglês.
- Alterados: `apps/api/src/domain/overlay-widget-service.mjs`, `apps/api/src/server.mjs`, `apps/frontend/scripts/dev-proxy-config.mjs`, `tests/unit/overlay-widget-service.test.js`, `tests/unit/api-static-surface-contract.test.js`, `tests/unit/next-dev-proxy.test.js`, `tests/unit/next-runtime-config.test.js`, `tests/unit/shared-panel-boundary.test.js`, `tests/unit/overlay-renderer.test.js`, `tests/unit/overlay-routes.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/next-widgets-page.test.jsx`, `tests/integration/next-static-export.test.js`, `tests/integration/compose-runtime.test.js`, `tests/e2e/overlay-browser-only.mjs`, `tests/e2e/overlay-parity-browser-only.mjs`, `tests/e2e/overlay-browser.mjs`, `tests/e2e/widget-link-dialog-browser-only.mjs`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Não alterados (de propósito): `apps/web/app.js`, `index.html`, `styles.css` e os demais módulos do painel vanilla, os catálogos, `apps/frontend/next.config.mjs`, `package.json`, `Dockerfile`, arquivos do Compose, CI, instaladores, a story e o seu File List (o `@po` e o `@sm` editavam stories ao mesmo tempo).

## Como reverter

Reverta o commit da Onda 3 (`git revert <commit>`). Isso restaura os três arquivos do overlay vanilla, o `dev-overlay-alias.mjs` e o seu registro, os dois rewrites de `/overlay.html`, o gerador de link `/overlay.html` e os testes anteriores. Links emitidos durante a Onda 3 (`/overlay?ref=...#token`) continuam funcionando depois da reversão, porque a rota `/overlay` do Next já existia antes desta onda. Não há efeito em dados, schema ou Compose.
