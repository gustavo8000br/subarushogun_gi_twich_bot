# Cutover da OPS-15 — Onda 2 (catálogos de localização de primeira parte fora de `apps/web`)

[English](../../../stories/OPS-15/cutover-wave-2.md)

- **Data:** 2026-10-28
- **Issue:** ainda não criada (card FT-40; executa a FT-05 e a TS-04); o `@devops` a cria como sub-issue da #69.
- **Executor:** `@dev` (Dex). O veredito final é do `@qa`; o commit é do `@devops`.
- **Veredito do QA:** pendente.
- **Branch / base:** `feat/ops-15-next-panel`, base `1f2fe1b` (Onda 3 = `69e9534`). Nada foi adicionado ao índice nem comitado pelo `@dev`: a movimentação está só no working tree (15 remoções em `apps/web/localization/catalogs` + 15 arquivos não rastreados em `apps/shared/localization/catalogs`, idênticos byte a byte, então `git add -A` nos dois caminhos os registra como renomeações 100 %).
- **Autorização:** proprietário, 2026-10-27, cutover incremental (beta sem usuários ativos, mudança estrutural segura até `rc`, sem shims de compatibilidade; `legacy` = branch protegida `a9279b2`). Caminho de destino DP-3 = `apps/shared/localization/catalogs/` (sem COPY novo no Dockerfile), registrado como resolvido em [`docs/pt-BR/handoffs/resume-agents-2026-10-27.md`](../../handoffs/resume-agents-2026-10-27.md). Plano: [`cutover-plan.md`](cutover-plan.md), Onda 2 (A-05).
- **Escopo:** só a Onda 2. O painel vanilla (`apps/web/app.js`, `index.html`, `styles.css` e seus 8 módulos) fica (Onda 4). Sem mudança em Compose, instaladores, CI, `package.json`, montagem de catálogos comunitários (`.local/community-catalogs`), textos ou idiomas do produto.

## O que foi movido ou mudou

| Arquivo | Mudança |
| --- | --- |
| `apps/web/localization/catalogs/{chat,lifecycle,overlay,panel,setup}/{en,es,pt-BR}.tsv` → `apps/shared/localization/catalogs/…` | 15 arquivos movidos sem alteração. SHA-256 da lista ordenada de hashes por arquivo: `1a4a8e24da8463214a334b63a0ff1054d28babd430ca88134f089b134fbabda7` antes e depois. `apps/web/localization/` não existe mais. |
| `apps/shared/localization/first-party-catalogs.mjs` (novo) | `FIRST_PARTY_CATALOG_DIRECTORY = 'apps/shared/localization/catalogs'` (relativo à raiz do repositório) e `resolveFirstPartyCatalogRoot(repositoryRoot)`. Relativo à raiz de propósito: as páginas do painel Next leem o fallback no `next build` por `process.cwd()`, onde `import.meta.url` apontaria para dentro do bundle. |
| `apps/api/src/server.mjs:42` | `catalogRoot = resolveFirstPartyCatalogRoot(<raiz do repositório a partir de import.meta.url>)` em vez de `new URL('../../web/localization/catalogs/', …)`. |
| `apps/infra/scripts/validate-localization.mjs:10` | Raiz padrão resolvida pela constante compartilhada; um argumento explícito na CLI continua tendo prioridade. |
| `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs` | `resolveFirstPartyCatalogRoot(process.cwd())` em vez de `resolve(process.cwd(), 'apps/web/localization/catalogs')`. |
| `Dockerfile` | Removido `COPY apps/web/localization/catalogs ./apps/web/localization/catalogs` do estágio `frontend-build`. O `COPY apps/shared ./apps/shared` existente (estágio do frontend) e o `COPY apps ./apps` (estágio de runtime) levam os catálogos. |

## Buscas de consumidores

```text
git grep -n -I -e "apps/web/localization" -e "'web', 'localization'" -e "../web/localization" -- ':!docs/**' ':!CHANGELOG*' ':!legacy/**' ':!.aiox/**' ':!.claude/**'
-> nenhum resultado (depois da mudança)
```

Antes da mudança, a mesma busca encontrou os 3 consumidores de runtime acima, `Dockerfile:9`, 11 arquivos de teste (`compose-runtime`, `compose-contract`, `localization-catalog-discovery`, `panel-localization-contract`, `next-call-deadline`, `next-panel-catalogs`, `next-panel-class1-parity`, `next-queue-entry-actions`, `panel-catalog-placeholders`, `panel-confirmation-contract`, `dockerfile-frontend-imports`) e 3 E2E (`widget-link-dialog`, `queue-manual-entry-outcomes`, `queue-reward-resolution` browser-only). A rota da API `/api/localization/catalogs` é uma URL, não um caminho, e não mudou. As menções restantes em docs são histórico (stories, planos, gates de QA, handoffs, inventário).

## Test-first (Red → Green)

Testes novos e alterados (o novo contrato):

- `tests/unit/first-party-catalog-location.test.js` (novo, 6 casos): o módulo compartilhado exporta `apps/shared/localization/catalogs` e o resolve a partir da raiz; exatamente 5 módulos × 3 locales ficam ali e `apps/web/localization` não existe; `server.mjs`, `validate-localization.mjs` e `load-first-party-panel-fallback.mjs` importam `resolveFirstPartyCatalogRoot` do módulo compartilhado e não escrevem `localization/catalogs` por conta própria; a descoberta a partir do caminho compartilhado devolve os mesmos 5 módulos / 3 locales; a raiz padrão do validador é válida com os mesmos módulos/locales; o fallback pt-BR do Next carrega do caminho compartilhado. Os dois últimos são casos de caracterização (passaram antes e depois; fixam "nenhuma mudança observável").
- `tests/unit/shared-panel-boundary.test.js`, caso novo **TS-04**: nenhuma string de caminho `apps/web` (`apps/web`, `'../../web/…'`, `'apps', 'web'`) em arquivo de código, script, SQL, CSS ou Markdown em `apps/frontend`, `apps/shared`, `apps/api`, `apps/infra`. A verificação de imports existente não enxergava caminhos em string.
- `tests/unit/dockerfile-frontend-imports.test.js`: "só os catálogos até o passo C" virou "não copia nada de `apps/web`" (lista vazia) e nenhum `apps/web` em todo o `Dockerfile`.
- `tests/integration/compose-contract.test.js`: o match positivo do COPY dos catálogos virou "o `Dockerfile` não tem `apps/web`".
- Só reapontamento de caminho (nenhuma asserção alterada): `compose-runtime` (o caso de catálogo comunitário copia `en.tsv` do caminho novo), `localization-catalog-discovery`, `panel-localization-contract` (classe B; 10 referências), `next-call-deadline`, `next-panel-catalogs`, `next-panel-class1-parity`, `next-queue-entry-actions`, `panel-catalog-placeholders`, `panel-confirmation-contract` (classe B) e os 3 E2E. Nenhuma asserção de classe B foi removida ou enfraquecida.

**Red** (testes acima, código de produção e catálogos ainda no `HEAD` `1f2fe1b`):

- `npx vitest run` nos 12 arquivos afetados (`first-party-catalog-location`, `shared-panel-boundary`, `dockerfile-frontend-imports`, `next-call-deadline`, `next-panel-catalogs`, `next-panel-class1-parity`, `next-queue-entry-actions`, `panel-catalog-placeholders`, `panel-confirmation-contract`, `localization-catalog-discovery`, `panel-localization-contract`, `compose-contract`) → exit 1, **12 arquivos falharam, 44 falharam / 90 passaram**. Falhas principais: a TS-04 listou exatamente `load-first-party-panel-fallback.mjs:4`, `server.mjs:41`, `validate-localization.mjs:9`; `dockerfile-frontend-imports` recebeu `['apps/web/localization/catalogs']`; `compose-contract` achou `apps/web` no `Dockerfile`; `first-party-catalog-location`: módulo `first-party-catalogs.mjs` inexistente, `apps/shared/localization/catalogs` ausente (ENOENT), consumidores sem a constante; arquivos reapontados: `ENOENT` / "Catalog module directory is unavailable" (`next-call-deadline` e `panel-confirmation-contract` falham no carregamento do arquivo).

**Green** (working tree da Onda 2):

- Os mesmos 12 arquivos + `localization-validator-cli` + `localization-catalog-route` → exit 0, **14 arquivos / 162 testes**.

## Verificação (`@dev`, só desenvolvimento; não é o veredito do `@qa`)

Todos os comandos rodaram com Node 24.20.0 (`nvm use`), em série, sem mais nada usando Docker ou portas.

| Comando | Exit | Resultado |
| --- | --- | --- |
| `npm test` (suíte completa, pool paralelo padrão) | 0 | 164 arquivos / 1617 testes (171,7 s). Registro da Onda 3: 163 / 1610; +1 arquivo (`first-party-catalog-location`, 6 casos) e +1 caso (TS-04) |
| `npx vitest run tests/integration/compose-runtime.test.js` (isolado, imagem descartável construída do working tree) | 0 | 7/7 em 80,3 s, incluindo o build da imagem (estágio `frontend-build` do Next sem o COPY de `apps/web`, então o `next build` pré-renderizou o painel com o fallback lido do caminho novo), posse de rotas, descoberta de catálogo comunitário, TLS, reinício e a jornada de fila no Chromium. O flake M-1 (jornada de fila, `compose-runtime.test.js:1216-1222`) não ocorreu |
| `npm run test:e2e:widget-link:browser-only` com `APP_ORIGIN=https://localhost:3207` | 0 | PASS (Chromium 156; fixtures de API interceptadas) |
| `npm run test:e2e:manual-entry-outcomes:browser-only` (mesma origem) | 0 | PASS QRA-10 |
| `npm run test:e2e:queue-reward-resolution:browser-only` (mesma origem) | 0 | PASS QRA-08/09 |
| `npm run lint` | 0 | passou |
| `npm run typecheck` | 0 | passou |
| `npm run validate:localization` | 0 | `valid`, módulos `chat`, `lifecycle`, `overlay`, `panel`, `setup`; locales `en`, `es`, `pt-BR` (iguais a antes) |
| `npm run validate:version` | 0 | `v0.2.0-0000000-beta` válida |
| `npm run validate:port-denylist` | 0 | 1038 arquivos, 0 achados |
| `npm run review:static` | 0 | 2 regras em 150 arquivos, 0 achados |
| `git diff --check` | 0 | sem erros de espaço em branco |

Os três E2E precisam de um app HTTPS em loopback. Rodaram contra um `next dev apps/frontend` isolado em `127.0.0.1:3207` com os certificados locais de desenvolvimento em `.local/dev-tls` (as flags que o `npm run dev:start` usa), sem Fastify nem banco (os testes interceptam todas as chamadas de API). O aquecimento `GET /queues` respondeu 200, o que também exercitou em runtime o carregador do fallback do Next a partir do caminho novo; o log do Next dev não teve erro. O servidor foi parado logo depois; em seguida nenhuma porta 3000–3999 estava escutando e nenhum processo `next` ficou.

**Docker:** antes do trabalho: 0 contêineres, 0 volumes, redes `bridge`/`host`/`none`, uma imagem (`postgres:18.6-bookworm`). Só foram usados os recursos descartáveis que o `compose-runtime` e os arquivos de integração PostgreSQL criam e removem. Depois de cada execução: 0 contêineres, 0 volumes, só `postgres:18.6-bookworm`, as mesmas três redes.

**Não executado:** `npm run build:frontend` em um git worktree separado (um worktree faz checkout do `HEAD`, que não tem a movimentação não comitada); a prova de build isolado é o estágio Docker `frontend-build` dentro do `compose-runtime`, que parte de um contexto limpo sem `.next`. O `next-static-export` (dentro do `npm test`) também rodou `next build` no `apps/frontend/.next` compartilhado. `npm run build` avulso (tag da imagem do produto) e `docker compose config --quiet` não rodaram separadamente porque os arquivos Compose não mudaram e a imagem foi construída pelo `compose-runtime`. OBS/CEF nativo, Firefox/WebKit e Twitch ao vivo não são afetados por esta onda e não rodaram.

## Riscos observados

- **Diretório de destino não rastreado.** Até o `@devops` adicionar os dois caminhos, o `git status` mostra 15 remoções e um `apps/shared/localization/catalogs/` não rastreado. Adicionar só um lado quebraria todos os consumidores; adicione `apps/web/localization` e `apps/shared/localization` juntos (o Git então reporta renomeações).
- **Premissa de `process.cwd()` mantida.** O fallback do Next continua dependendo de o processo rodar a partir da raiz do repositório (ou `/app` na imagem), como antes desta onda; agora é uma constante compartilhada em vez de um literal. O `compose-runtime` (imagem) e o `next dev` isolado (raiz do repositório) exercitaram os dois casos.
- **Tradutores da comunidade** que copiavam arquivos do caminho antigo devem usar `apps/shared/localization/catalogs/<module>/pt-BR.tsv` como fonte (TRANSLATION_GUIDE atualizado). O diretório comunitário gerenciado pelo host não mudou.
- **Edições paralelas de outros agentes.** `docs/process/backlog-inventory.md` (+ pt-BR) e as stories OPS-25/OPS-26 foram modificados no working tree por outros agentes durante esta execução; o `@dev` não os tocou. A linha FT-40 do inventário ainda diz "não iniciado" e "a DP-3 … ainda aguarda o proprietário"; quem é dono dela deve atualizá-la.
- Produção não muda com um commit; as pessoas usuárias só veem a mudança quando sair uma release.

## File List da story (sugestão para o `@po`)

O `@dev` não editou `docs/stories/OPS-15/story.md` (dono: `@po`). Acréscimo sugerido para File List / Change Log da OPS-15:

- Movidos: `apps/web/localization/catalogs/**` (15 TSV) → `apps/shared/localization/catalogs/**`.
- Criados: `apps/shared/localization/first-party-catalogs.mjs`, `tests/unit/first-party-catalog-location.test.js`, `docs/stories/OPS-15/cutover-wave-2.md` (+ pt-BR).
- Alterados: `apps/api/src/server.mjs`, `apps/infra/scripts/validate-localization.mjs`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs`, `Dockerfile`, os testes e docs listados abaixo.
- Linha do Change Log: "2026-10-28 — Onda 2 do cutover (FT-40): catálogos de primeira parte movidos para `apps/shared/localization/catalogs` (DP-3); teste de fronteira TS-04 acrescentado; veredito do `@qa` pendente."

## Arquivos alterados

- Movidos (só no working tree): 15 catálogos TSV, `apps/web/localization/catalogs/` → `apps/shared/localization/catalogs/`.
- Criados: `apps/shared/localization/first-party-catalogs.mjs`, `tests/unit/first-party-catalog-location.test.js`, este arquivo e sua cópia em inglês.
- Alterados (código): `apps/api/src/server.mjs`, `apps/infra/scripts/validate-localization.mjs`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs`, `Dockerfile`.
- Alterados (testes): `tests/unit/shared-panel-boundary.test.js`, `tests/unit/dockerfile-frontend-imports.test.js`, `tests/integration/compose-contract.test.js`, `tests/integration/compose-runtime.test.js`, `tests/integration/localization-catalog-discovery.test.js`, `tests/integration/panel-localization-contract.test.js`, `tests/unit/next-call-deadline.test.jsx`, `tests/unit/next-panel-catalogs.test.js`, `tests/unit/next-panel-class1-parity.test.js`, `tests/unit/next-queue-entry-actions.test.js`, `tests/unit/panel-catalog-placeholders.test.js`, `tests/unit/panel-confirmation-contract.test.js`, `tests/e2e/widget-link-dialog-browser-only.mjs`, `tests/e2e/queue-manual-entry-outcomes-browser-only.mjs`, `tests/e2e/queue-reward-resolution-browser-only.mjs`.
- Alterados (docs, en + pt-BR): `docs/TRANSLATION_GUIDE.md`, `docs/DEVELOPMENT.md` / `docs/pt-BR/DESENVOLVIMENTO.md`, `docs/architecture.md`, `docs/architecture/responsibilities.md`, `docs/front-end-architecture.md`, `docs/front-end-architecture/files-and-modules.md`, `docs/fullstack-architecture.md`, `docs/fullstack-architecture/application-modules.md`, `CHANGELOG_INTERNAL.md` / `docs/pt-BR/CHANGELOG_INTERNAL.md`.
- Não alterados (de propósito): `apps/web/app.js`, `index.html`, `styles.css` e os outros módulos vanilla (Onda 4), `compose*.yaml`, instaladores, CI, `package.json`, `eslint.config.js`, `tsconfig*.json`, a story, o inventário do backlog e o quadro.

## Como reverter

Reverta o commit da Onda 2 (`git revert <commit>`). Isso devolve os 15 catálogos para `apps/web/localization/catalogs`, restaura os caminhos literais nos três consumidores e o COPY no `Dockerfile`, apaga `first-party-catalogs.mjs` e restaura os testes anteriores. Não há efeito em dados, schema, Compose ou instaladores; o conteúdo dos catálogos é idêntico dos dois lados.
