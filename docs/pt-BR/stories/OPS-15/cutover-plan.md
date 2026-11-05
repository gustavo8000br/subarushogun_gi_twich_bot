# OPS-15 — Plano de cutover por partes (retirada do painel vanilla)

[English](../../../stories/OPS-15/cutover-plan.md)

- **Autoria:** `@architect` (Aria), 2026-10-27. Análise somente de leitura do código. Nenhum código, teste, configuração, story ou inventário foi alterado; nenhuma operação de servidor, Docker, teste, GitHub ou Twitch.
- **Gatilho:** decisão do proprietário de 2026-10-27 (`docs/session-handoff.md:9`): o painel vanilla legado (`apps/web`) está abandonado. O proprietário **autorizou expressamente** o cutover antecipado do que já foi validado e, conforme o restante for validado, o cutover do restante: parte por parte, veredito do `@qa` por parte, `@dev` test-first, commits pelo `@devops`. Push, PR, tag e release continuam exigindo OK à parte.
- **Recuperação:** a branch `legacy` existe e está protegida (`a9279b2`, 42 arquivos em `apps/web`, ruleset `legacy-no-delete-no-force-push`; `git rev-parse legacy origin/legacy` = `a9279b2c…`, conferido em 2026-10-27). É referência histórica, **não** fallback. O rollback de cada onda = `git revert` do commit da onda.
- **Rótulos:** VERIFICADO = lido no código/documentação; PARCIAL = código lido, runtime não reproduzido; NÃO VERIFICADO = inferência a provar por teste. Classes de evidência: **U** unidade, **I** PostgreSQL isolado com migrations reais, **B** Chromium browser-only com API interceptada, **C** stack Compose de produção (Next + Fastify + PostgreSQL reais), **L** Twitch ao vivo, **N** OBS/CEF nativo.
- **Pesquisa:** nenhuma necessária. Todas as decisões aqui tratam do roteamento e da organização de arquivos deste repositório; nenhuma LACUNA de `docs/research-index.md` se aplica.

## 0. Achado principal: o cutover de runtime já aconteceu em grande parte

Antes de planejar ondas, é preciso descrever com precisão a topologia atual de produção, porque ela muda o que "cortar" significa.

| Fato | Evidência | Rótulo |
|---|---|---|
| Em produção, o Next atende todas as rotas do painel exceto `/`: `/queues/`, `/new-queue/`, `/operations/`, `/commands/`, `/widgets/`, `/settings/` e `/connection` retornam HTML do Next (`panel-shell`, `x-powered-by: Next.js`). | `tests/integration/compose-runtime.test.js:393-418`; Change Log da story `docs/stories/OPS-15/story.md:813-814` | VERIFICADO (C, 2026-10-20) |
| Somente `/`, `/styles.css` e `/app.js` ainda são reescritos para o Fastify (`beforeFiles`). | `apps/frontend/scripts/dev-proxy-config.mjs:46-47`; fixado por `tests/unit/next-dev-proxy.test.js:32-43,50` | VERIFICADO |
| O `/` vanilla em produção é uma **casca que não funciona**: `index.html` carrega `/app.js`, que importa `./application-setup.mjs`, `../shared/panel/*.mjs` e `../shared/browser/*.mjs` (`apps/web/app.js:1-21`); nenhum desses caminhos é reescrito, então chegam ao Next e dão 404. | `structural-review.md` S-02 (`docs/stories/OPS-15/structural-review.md:41-45`); `dev-proxy-config.mjs:40-51` | VERIFICADO na configuração; runtime PARCIAL (o teste Compose só verifica o HTML, `compose-runtime.test.js:387-391`) |
| Em desenvolvimento o vanilla nem é servido: o launcher define `API_ONLY: 'true'` e `registerWebRoutes` retorna cedo. | `apps/frontend/scripts/dev-runtime-config.mjs:20`; `apps/api/src/web-route.mjs:14`; story `:895` | VERIFICADO |
| O Fastify escuta só no loopback do container; o Compose publica apenas a porta do Next, e os instaladores empacotam esse mesmo `compose.yaml`. A raiz estática do Fastify (painel e overlay vanilla) é inalcançável a partir do host. | `compose.yaml:54-57,67-68`; `apps/infra/scripts/package-installer.mjs:41` | VERIFICADO |
| As URLs do OBS `…/overlay.html?ref=…#token` são atendidas pelo Next (rewrite `afterFiles` para `/overlay`), nunca pelo overlay vanilla. | `dev-proxy-config.mjs:49`; `compose-runtime.test.js:374-385`; OBS 32.2.2 / CEF 127 no Linux contra o Next, story `:193` | VERIFICADO (C, N-Linux) |

**Consequência.** O painel vanilla **não é fallback funcional** em lugar nenhum, nem em produção nem em desenvolvimento. O único efeito de runtime que resta é encobrir a Visão geral do Next em `/` com uma casca quebrada. Portanto:

1. Passar `/` para o Next é uma **correção**, não um risco de paridade: nada utilizável se perde.
2. Os defeitos abertos do Next (D-3, D-4, D-7, D-5) são defeitos do painel que as pessoas usuárias já usam em todas as rotas internas. Manter `apps/web` não os atenua. Eles bloqueiam a **conclusão da OPS-15 e o aceite de paridade** (AC 1, AC 7), não a **remoção do código**.
3. O que de fato condiciona a remoção de `apps/web` é a **cobertura de testes** (contratos de classe B ainda verificados só contra arquivos vanilla) e **uma dependência de runtime**: os catálogos de primeira parte ficam em `apps/web/localization/catalogs` (`apps/api/src/server.mjs:41`; linha 43 quando este plano foi escrito, 41 após o commit `906fd5c` da Onda 3; `Dockerfile:9`, `apps/infra/scripts/validate-localization.mjs:9`, `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs:4`).

Este plano separa três vereditos por parte: **runtime** (quem atende), **remoção do código** (o arquivo vanilla e seus testes podem ser apagados?) e **aceite de paridade** (a OPS-15 pode dar a superfície como concluída?). Só os dois primeiros são "cutover"; o terceiro continua sendo gate da OPS-15.

## 1. Inventário de partes

### 1.1 Rotas e páginas do painel

| Parte | O que o Next faz | Evidência por classe | O que falta | Runtime | Remoção do código | Aceite de paridade | O que o `@qa` precisa dar |
|---|---|---|---|---|---|---|---|
| **P-01 `/` Visão geral** (INV-01/04) | Lê `/api/state`, `/api/setup`, `/api/queues`, `/health`; severidade de saúde, conta, operações pendentes, contagens de filas, última reconciliação; atualização manual e polling de 5 s com a aba visível (`apps/frontend/features/panel-shell/panel-shell.jsx:44-57`). | U: `next-overview-panel.test.jsx:104,122,135,156`, `next-overview-projection`, `next-panel-snapshot`, `next-panel-shell`. QA de escopo 10/10 (story `:898`), UX 9,2 (story `:897`); revisão estática de páginas posterior 7,0 (story `:915`). Runtime de dev: `/` é Next (story `:781`). C: **não executado** (encoberto). L/B: nenhum. | Prova C de `/` atendido pelo Next; contratos de classe B de `health-status.test.js` ("não inventa ping", "reconexão mostrada como tentando novamente", `test-suite-audit-2026-10-23.md:70`). A página inicial no primeiro uso difere: o vanilla abria Conexão quando desconectado (`apps/shared/panel/panel-navigation.mjs:4-6`); o Next mostra a Visão geral com um cartão de próximo passo "conectar" (`panel-navigation.mjs:9-12`). | **PRONTA PARA CORTE** (onda 1) | FALTA EVIDÊNCIA (`health-status.mjs` aguarda TS-10) | FALTA EVIDÊNCIA (polimento FT-01, D-7/OPS-23) | Veredito da onda 1: asserção Compose invertida verde, casos de overlay e de propriedade de rotas verdes, smoke de `/` no navegador |
| **P-02 `/connection` + `/callback`** (INV-02) | Credenciais, início do OAuth, elegibilidade, reconciliação; o callback fica no Fastify e devolve 303 para a página do Next. | U: `next-connection-page.test.jsx` (16). Dev: OAuth recusado pelo proxy (`endpoint-catalog-inventory.md`, registro de 2026-10-19). C: `compose-runtime.test.js:420-433`. L: OAuth não executado (OW-04). | Portar "nunca mostrar a mensagem bruta da Twitch/backend na validação de credenciais" (`test-suite-audit-2026-10-23.md:71`). | Já é Next | FALTA EVIDÊNCIA (`application-setup.mjs`, TS-10) | FALTA EVIDÊNCIA (OW-04 ao vivo) | Veredito do port TS-10 |
| **P-03 `/queues`** (INV-05/06, QRA-01, 03–23) | Lista completa, configurações, configurações da recompensa, histórico, mover, prioridade, entrada manual, transições, chamar/reenviar, limpar, abrir/fechar, modo manual, arquivo local, desarquivar, excluir/cancelar. | U+I em todos os QRA; B em 01–04, 08–10, 12, 22, 23; C em 01, 03, 05–07, 11, 13–17, 19–22 (`queue-route-action-inventory.md:9-33`). L parcial: LB-05/06/27–31/34/42/43 (`live-battery-2026-10-26-results.md:7-21`). | D-3 mensagem de exclusão perdida ao desmontar o cartão (`panel-defects-architecture-review.md:40`), D-7 sem atualização automática fora de Visão geral/Operações (`:18`), D-5 exclusão presa em `deleting` (`live-battery-2026-10-26-results.md:38-39`); classe B: diálogo que falha fechado e dupla confirmação com sincronização incerta (`test-suite-audit-2026-10-23.md:68`), diálogo de recompensa responsivo (`:69`). | Já é Next | FALTA EVIDÊNCIA (`panel-confirmation.mjs`, diálogo de recompensa em `index.html`/`styles.css`, TS-10) | **BLOQUEADA** por D-3 (FT-23), D-7 (OPS-23 FT-27..29), D-5 (OPS-22 FT-25/26/36) | Veredito dos ports TS-10; à parte, gates de FT-23/OPS-22/OPS-23 |
| **P-04 `/new-queue`** (QRA-02) | Criação manual e por Pontos do Canal, recuperação de resultado incerto, orientação de onboarding. | U, I, B (`queue-creation-accepted/uncertain-browser-only`), C (manual). L: LB-05/06 PASS. | D-4 não navega para a fila criada (`panel-defects-architecture-review.md:33-36`). | Já é Next | **PRONTA** (a contraparte vanilla `queue-onboarding-flow.mjs` é classe C, portada em 2026-10-21, `test-suite-audit-2026-10-23.md:61`), mas o arquivo é importado por `app.js` e sai na onda 4 | **BLOQUEADA** por D-4 (FT-23) | — |
| **P-05 `/operations`** (INV-07) | Lista de operações, retry, resolve-unknown, reconciliação; laço próprio de 5 s (`operations-page-content.jsx:111-124`). | U: `next-operations` (8), `next-operations-page` (16). L observado: "Estado desconhecido" + Retry (`live-battery-2026-10-26-results.md:37`). B/C: nenhum. | Estados populados no navegador (FT-03 E5); caminho de resolução manual da OPS-22. A contraparte vanilla `panel-error-presentation.mjs` é classe C, mas ainda é importada pelo teste de classe B `web-application-setup.test.js`. | Já é Next | Sai na onda 4 | FALTA EVIDÊNCIA (B) + OPS-22 | — |
| **P-06 `/commands`** (INV-08) | Edição de política de comandos, padrão seguidor, bloqueio de papéis fixos. | U: `next-command-permissions-page` (9), `next-commands-route`. UX 9,1 com axe (story `:117`). | Anel de foco visível e empilhamento mobile das políticas ainda verificados só em `panel-localization-contract.test.js` (`legacy-test-audit.md:55`; `test-suite-audit-2026-10-23.md:74`). | Já é Next | FALTA EVIDÊNCIA (validação no navegador) | FALTA EVIDÊNCIA | Veredito da verificação no navegador |
| **P-07 `/settings` + idioma** (INV-03/08) | Conta/padrão, idioma do produto persistido com revisão. | U: `next-account-settings-page` (6), `next-locale-picker`, `next-locale-persistence`. Runtime de dev: persistência do idioma pelo proxy (story `:158-159`). UX 9,3. | Portar o fallback pt-BR para catálogo persistido incompleto (`test-suite-audit-2026-10-23.md:72`). | Já é Next | FALTA EVIDÊNCIA (`locale-picker-state.mjs`, TS-10) | FALTA EVIDÊNCIA | Veredito do port TS-10 |
| **P-08 `/widgets`** (INV-09) | CRUD de widgets, diálogo de link exibido uma vez, regenerar/revogar/excluir. | U: `next-widgets-page` (23); B: `widget-link-dialog-browser-only` PASS no Chrome 156 (`qa-gate-2026-10-23.md:82`); UX 9,2; QA PASS 9,3 (`:93`). | Nenhum contrato exclusivo do vanilla; o código vanilla fica dentro de `app.js`. | Já é Next | **PRONTA** (sai fisicamente com `app.js`, onda 4) | FALTA EVIDÊNCIA (FT-03 E2 revogar) | — |
| **P-09 overlay OBS `/overlay.html`** (INV-10) | Rota `/overlay` do Next com bundle próprio, polling de 1 s sem cache, remoção do fragmento, armazenamento por ref. | U: `overlay-renderer`, `next-overlay-root`; B: overlay browser-only, paridade (7 tipos / 8 fontes / 10 revisões) e fronteira de bundle (story `:182-184`); C: `compose-runtime.test.js:374-385`; N: OBS 32.2.2 / CEF 127 no Linux (story `:193`). | OBS nativo em Windows/macOS (OW-03, MAC-01). | Já é Next | Arquivos do overlay vanilla **PRONTOS PARA CORTE** após a onda 1 (onda 3) | FALTA EVIDÊNCIA (OW-03) | Veredito da onda 3 |

### 1.2 Artefatos do servidor e arquivos

| Parte | Papel atual | Evidência / consumidores | Veredito | Onda |
|---|---|---|---|---|
| **A-01** rewrites `/`, `/styles.css`, `/app.js` (`dev-proxy-config.mjs:46-47`) | Encobrem a Visão geral do Next com a casca vanilla quebrada | Fixados por `next-dev-proxy.test.js:32-43,50` e `compose-runtime.test.js:387-391` | **PRONTA PARA CORTE** | 1 |
| **A-02** `registerWebRoutes` + `apps/api/src/web-route.mjs` (raiz estática `apps/web`, prefixos `/shared/browser/`, `/shared/panel/`) | Serve por HTTP o painel vanilla, o overlay vanilla e o ESM compartilhado, só para o vanilla | Chamada em `apps/api/src/server.mjs:128-136`; o único consumidor HTTP é o vanilla (`web-route.mjs:10-11`); `shared/browser/translate-catalog.mjs` é importado diretamente por `chat-handler.mjs:5` e pelo Next, não por HTTP | **PRONTA PARA CORTE** | 1 |
| **A-03** `apps/web/overlay.html`, `overlay.js`, `overlay.css` | Segundo overlay vanilla (preocupação "média" da arquitetura, `legacy-test-audit.md:12`) | Sem rota alcançável pelo host (A-02 privado; `compose.yaml:67-68`); lido por `shared-panel-boundary.test.js:69-71` | **PRONTA PARA CORTE** após a onda 1 | 3 |
| **A-04** `apps/web/app.js`, `index.html`, `styles.css` + 8 módulos vanilla | O painel vanilla | Lidos por testes de classe B (`panel-confirmation-contract`, `reward-dialog-contract`) e de classe C; `shared-panel-boundary.test.js:61` resolve todo import de `app.js`, então módulos importados por `app.js` não podem sair antes dele | **FALTA EVIDÊNCIA** (ports TS-10) | 4 |
| **A-05** catálogos `apps/web/localization/catalogs/**` (15 TSV) | Catálogos de primeira parte para API, validador, fallback do Next e imagem | `server.mjs:41`, `validate-localization.mjs:9`, `load-first-party-panel-fallback.mjs:4`, `Dockerfile:9`; 12 arquivos de teste + 3 E2E; `docs/TRANSLATION_GUIDE.md:12`, `docs/DEVELOPMENT.md:90` | **PRONTA PARA CORTE** (realocação, FT-05) | 2 |
| **A-06** `apps/web/priority-labels.mjs` + `tests/unit/priority-labels.test.js` | Código morto | Sem importador em `apps/` desde a FND-8 (`test-suite-audit-2026-10-23.md:50`) | **PRONTA PARA CORTE** | 0 |
| **A-07** aliases de `/overlay.html`: regra de dev do Next (`dev-proxy-config.mjs:27`), `afterFiles` de produção (`:49`), alias 307 de dev no Fastify (`apps/api/src/http/dev-overlay-alias.mjs:11-18`, registrado em `server.mjs:119-122`), gerador de URL (`apps/api/src/domain/overlay-widget-service.mjs:40`) | Mantêm válida toda URL de capability do OBS já emitida | AC 3 e AC 8 (story `:97,107`); OW-09 | **NÃO É BLOQUEIO — podem sair junto com o overlay vanilla** (OW-09 resolvida em 2026-10-27: sem usuários ativos, sem shims de compatibilidade até `rc`/`stable`; o overlay Next substitui). Antes da remoção, o `@po` reescreve os CA 3/CA 8 (ainda citam a URL exata `/overlay.html`) e o gerador de URL passa para a rota do Next na mesma onda | 3 (opcional, junto com A-03) |
| **A-08** `POST /api/queues/:queueId/archive` (QRA-18) + `repository.archiveQueue` | Rota só de API, sem consumidor em nenhum dos painéis | Rota `apps/api/src/http/queue-routes.mjs:686-697`; método `apps/api/src/persistence/queue-repository.mjs:562-584`; decisão do proprietário de retirá-la junto com o vanilla (`docs/session-handoff.md:84`); ramo `archiveAfterConfirm` do worker (`apps/api/src/outbox/reward-worker.mjs:174`) | **PRONTA PARA CORTE** com condições (seção 3) | 5 |
| **A-09** flag `API_ONLY` (`dev-runtime-config.mjs:20`, `server.mjs:133`) e `@fastify/static` (`package.json:56`) | Só fazem sentido enquanto A-02 existir | O único importador de `@fastify/static` é `web-route.mjs:1` | PRONTA após a onda 1 | 6 |
| **A-10** alvo `web` de lint/typecheck/CI (`package.json:49,52`, `tsconfig.web.json:7-9`, `eslint.config.js:32,43-51`, `.github/workflows/quality-gates.yml:17`, `tests/unit/ci-workflow-contract.test.js:19-27`) | Faz lint/typecheck de `apps/web` + `apps/shared/panel` + `apps/frontend/**/*.jsx` | `web` é o único typecheck de `apps/frontend/**/*.jsx` (`test-suite-audit-2026-10-23.md:81`), então deve ser reapontado, não removido | PRONTA com a onda 4 | 4 |
| **A-11** `apps/frontend/scripts/create-overlay-alias.mjs` | Resto morto do static export | Sem referência no código, scripts ou Dockerfile (`test-suite-audit-2026-10-23.md:93`; FT-04) | **PRONTA PARA CORTE** | 0 |

## 2. Ordem de corte em ondas pequenas e reversíveis

Regras de toda onda: texto da story pelo `@po` antes, quando indicado (seção 5, DP-0/DP-8); um commit por onda pelo `@devops` após o veredito do `@qa`; `@dev` test-first (Red registrado antes do Green); nenhuma onda em paralelo com outra que toque o mesmo arquivo ou rode Compose/suíte completa ao mesmo tempo; push/PR/tag/release fora. Rollback = `git revert <commit da onda>`; nenhuma onda tem migration ou mudança de dados.

### Onda 0 — código morto (sem dependência de paridade)

- **Remove:** `apps/web/priority-labels.mjs`, `tests/unit/priority-labels.test.js` (TS-01); `apps/frontend/scripts/create-overlay-alias.mjs` (parte da FT-04).
- **Testes a portar antes:** nenhum (classe D; o React escapa texto, `test-suite-audit-2026-10-23.md:50`).
- **Red/Green:** aqui o "Red" é prova de contrato: `git grep` mostra que nenhum dos dois arquivos tem importador; após a remoção, `shared-panel-boundary.test.js:61` (todo import relativo resolve) continua passando.
- **Compose / proxy / instaladores / CI:** sem mudança. **Docs:** `CHANGELOG_INTERNAL.md` + pt-BR; File List da story.
- **Reversão:** reverter o commit.
- **Prontidão:** PRONTA PARA CORTE.

### Onda 1 — o Next assume `/` em produção; o Fastify deixa de servir arquivos estáticos (cutover de runtime)

- **Remove:** os três rewrites em `dev-proxy-config.mjs:46-47`; a chamada de `registerWebRoutes` em `server.mjs:128-136` e `apps/api/src/web-route.mjs` (opção A, DP-2). Os arquivos de `apps/web` continuam no disco nesta onda, para que os testes de classe B sigam rodando.
- **Testes alterados no mesmo commit (Red primeiro):**
  - `tests/unit/next-dev-proxy.test.js:32-43,50`: verificar que nenhum rewrite de produção aponta para `/`, `/styles.css`, `/app.js` ou qualquer asset vanilla (o teste de contrato do S-02) e que `/overlay.html` continua em `afterFiles`.
  - `tests/integration/compose-runtime.test.js:387-391`: inverter para `/` = 200, `x-powered-by: Next.js`, `class="panel-shell"`, `data-next-panel-entry`, sem `app-shell`; acrescentar `/app.js` e `/styles.css` → não é 200 HTML/JS vindo do Fastify. Renomear o teste (ele não "documenta mais a raiz vanilla").
  - `tests/unit/web-route.test.js` (10 casos) e `tests/unit/web-route-vanilla-modules.test.js` (2): saem com `web-route.mjs`. Os dois casos de classe 1 (`web-route.test.js:16` "modo API-only sem rotas de UI", `:32` "serve só o ESM de localização compartilhado") são reescritos: o primeiro como "o Fastify não registra handler de arquivo estático" (novo teste de contrato lendo `server.mjs` ou um inject Fastify de `GET /` → 404 JSON, nunca HTML); o segundo fica obsoleto porque não resta consumidor HTTP de `/shared/browser/` (o `@qa` confirma a reclassificação para C).
- **Compose / instaladores:** `compose.yaml` inalterado na opção A (a opção B acrescentaria `API_ONLY=true` ali e em todo Compose gerado pelos instaladores). Instaladores inalterados (`package-installer.mjs:41` empacota o mesmo arquivo).
- **Docs (en + pt-BR juntos):** `docs/front-end-architecture/runtime-and-boundaries.md`, `files-and-modules.md`, `verification.md`, `docs/fullstack-architecture/application-modules.md`, `docs/architecture/responsibilities.md` ("`/` vanilla transitório" → o Next atende `/`); `docs/DEVELOPMENT.md:90`; changelog interno; entrada no changelog beta voltada ao produto, se o proprietário quiser (DP-7). Linhas da story/inventário (INV-11) são atualizadas por quem é dono delas (`@po`/`@dev`), não por este plano.
- **Reversão:** reverter o commit; `/` volta para a casca vanilla quebrada. Sem efeito em dados.
- **Prontidão:** **PRONTA PARA CORTE.** A única evidência faltante é a que a própria onda produz (prova C de `/`).

### Onda 2 — tirar os catálogos de primeira parte de `apps/web` (FT-05)

- **Destino:** `apps/shared/localization/catalogs/<módulo>/<locale>.tsv` via `git mv` (DP-3). Motivo: `apps/shared` já é copiado para os dois estágios da imagem (`Dockerfile:10`, `:19`) e fica ao lado do código carregador (`apps/shared/localization/discover-catalog-bundle.mjs`).
- **Mudanças:** `server.mjs:41` (`../../shared/localization/catalogs/`), `validate-localization.mjs:9`, `load-first-party-panel-fallback.mjs:4` (manter uma única constante de caminho exportada em `apps/shared/localization`, usada pelos três; mantê-la relativa à raiz do repositório porque as páginas do painel são pré-renderizadas no `next build` do estágio `frontend-build`, o que é NÃO VERIFICADO até o build isolado passar), apagar `Dockerfile:9`. Montagem comunitária inalterada (`compose.yaml:73-74`, `.local/community-catalogs`), então os instaladores não mudam.
- **Testes:** reapontar os 12 arquivos de teste e 3 E2E que leem o caminho antigo (`tests/integration/panel-localization-contract.test.js`, `localization-catalog-discovery.test.js:29`, `tests/unit/next-queue-entry-actions.test.js`, `next-panel-catalogs`, `panel-catalog-placeholders`, `next-call-deadline`, `next-panel-class1-parity`, `dockerfile-frontend-imports`, `panel-confirmation-contract`; `tests/e2e/widget-link-dialog-browser-only.mjs`, `queue-manual-entry-outcomes-browser-only.mjs`, `queue-reward-resolution-browser-only.mjs`). Trocar `dockerfile-frontend-imports.test.js:86` de "só os catálogos até o passo C" para "nenhum COPY de `apps/web`". Acrescentar a TS-04: verificação de caminho em string que falha em qualquer caminho `apps/web` dentro de `apps/frontend`, `apps/shared`, `apps/api`, `apps/infra` (Red hoje em `load-first-party-panel-fallback.mjs:4` e `server.mjs:41`).
- **Docs:** `docs/TRANSLATION_GUIDE.md:12` + pt-BR (tradutores da comunidade), `docs/DEVELOPMENT.md` + `DESENVOLVIMENTO.md`, `files-and-modules.md` da arquitetura (en/pt-BR), changelog.
- **Reversão:** reverter o commit (movimentação pura).
- **Prontidão:** **PRONTA PARA CORTE.** Independente da onda 1, mas ambas editam `server.mjs`: execute em sequência.

### Onda 3 — remover o overlay vanilla

- **Remove:** `apps/web/overlay.html`, `overlay.js`, `overlay.css`. Ajustar `tests/unit/shared-panel-boundary.test.js:69-71` (mantém a asserção de `app.js` até a onda 4).
- **Pré-condição:** onda 1 integrada (o Fastify não serve mais a raiz estática). O overlay do Next fica intacto. Os aliases (A-07) podem ser removidos nesta onda (OW-09 resolvida em 2026-10-27), somente depois de o `@po` reescrever os CA 3/CA 8 e com o gerador de URL do OBS e os testes do overlay passando para a rota do Next no mesmo commit; caso contrário, ficam intactos.
- **Testes a portar antes:** nenhum; os contratos do overlay já rodam contra o Next (trio B, C, N-Linux).
- **Reversão:** reverter o commit.
- **Prontidão:** **PRONTA PARA CORTE** após a onda 1.

### Onda 4 — remover o painel vanilla (`app.js`, `index.html`, `styles.css`, módulos restantes) e o diretório `apps/web`

- **Deve ser portado ANTES (TS-10), lista exata de `legacy-test-audit.md` e da classe B de `test-suite-audit-2026-10-23.md`:**
  1. `panel-confirmation-contract.test.js`: o diálogo falha fechado quando não consegue abrir ou já está aberto; dupla confirmação quando a sincronização da recompensa é incerta (`test-suite-audit-2026-10-23.md:68`). Já portado: sem `confirm()` nativo, sem a redação de ocultar/arquivar (`next-panel-class1-parity.test.js`, `legacy-test-audit.md:54`).
  2. `reward-dialog-contract.test.js`: espaço responsivo do diálogo e ações separadas, verificação no navegador (`:69`). Já portado: fechar/cancelar com `type="button"`.
  3. `health-status.test.js`: não inventar ping para canal não configurado; reconexão automática mostrada como tentando novamente (`:70`).
  4. `web-application-setup.test.js`: nunca mostrar a mensagem bruta da Twitch/backend na falha de validação de credenciais (`:71`).
  5. `locale-picker-state.test.js`: fallback pt-BR quando o catálogo persistido está incompleto (`:72`).
  6. `panel-localization-contract.test.js`: anel de foco visível e empilhamento mobile das políticas de comando (validação no navegador, `legacy-test-audit.md:55`); os casos de catálogo já foram reapontados na onda 2.
  7. Casos de classe 1 de `web-route.test.js`: feitos na onda 1.
  Para contratos portados que passam de imediato (caracterização), o `@qa` prova que não são vazios quebrando o comportamento uma vez (verificação por mutação), em vez de um Red histórico.
- **Remove depois que os ports passarem:** `apps/web/app.js`, `index.html`, `styles.css`, `application-setup.mjs`, `call-notification-actions.mjs`, `dom-localization.mjs`, `health-status.mjs`, `locale-picker-state.mjs`, `panel-confirmation.mjs`, `panel-error-presentation.mjs`, `queue-onboarding-flow.mjs` → `apps/web` deixa de existir. Testes removidos: classe C `call-notification-actions`, `dom-localization`, `panel-error-presentation`, `vanilla-fulfillment-feedback`, `queue-onboarding-flow` (`test-suite-audit-2026-10-23.md:55-62`) e os cinco arquivos de classe B acima, depois que seus ports no Next passarem.
- **Mudanças acopladas (mesmo commit):** `shared-panel-boundary.test.js` (casos em `:46`, `:61`, `:69`: verificar que `apps/web` não existe em vez de percorrê-lo), `dockerfile-frontend-imports.test.js:73,81` (tirar os ramos de `apps/web`; fundir o duplicado com `shared-panel-boundary`, TS-04), `package.json:49` `lint:web` → `apps/shared/panel` (+ JSX coberto pelo lint raiz), `tsconfig.web.json:7-8`, `eslint.config.js:32` (tirar o glob `apps/web/**/*.js`) e `:43-51` (manter a regra de import restrito como guarda, reescrevendo a mensagem), `ci-workflow-contract.test.js:19-27` e `quality-gates.yml:17` (manter o job `web`, opcionalmente renomeado `frontend`, DP-5).
- **Docs:** todo documento de arquitetura/desenvolvimento listado em A-05/A-10 da seção 1.2 (en + pt-BR); as frases de `AGENTS.md`/`CLAUDE.md` sobre "remover o painel vanilla" viram histórico; changelog.
- **Coordenação:** a OPS-24 (FT-30..35) migra o lint de ESLint para Biome e toca `eslint.config.js`/`package.json`; faça a onda 4 antes do commit do Biome ou faça rebase explícito. A FT-28 da OPS-23 toca `apps/frontend/app/(panel)/layout.jsx`/`panel-shell.jsx`; a onda 4 não.
- **Reversão:** reverter o commit; nada em runtime depende dos arquivos restaurados.
- **Prontidão:** **FALTA EVIDÊNCIA** (itens 1–6).

### Onda 5 — retirar `POST /api/queues/:queueId/archive` (QRA-18)

- **Remove:** rota `queue-routes.mjs:686-697`; `repository.archiveQueue` (`queue-repository.mjs:562-584`) — o único chamador é a rota (VERIFICADO por `git grep`). **Mantém** o ramo `archiveAfterConfirm` do worker de recompensas (`reward-worker.mjs:174`) e o `unarchive` (usado pelo Next, `apps/frontend/features/queues/queue-lifecycle.mjs:67`).
- **Testes:** remover/substituir os casos de arquivamento em `tests/unit/queue-routes.test.js` (12 referências), `tests/integration/qra-postgres-fixtures.test.js:740-754`, `tests/integration/queue-repository.test.js:1384`; acrescentar um teste Red de que `POST /api/queues/:id/archive` passa a responder o 404 JSON genérico (nunca HTML, nunca sem sessão).
- **Docs:** lista de rotas do INV-06 (`endpoint-catalog-inventory.md`), linha QRA-18, FR-10 "archive" em `docs/prd/functional-requirements.md:16` e `docs/front-end-spec/information-architecture.md:7` (o arquivamento pelo operador agora é `archive-local`; redação do `@po`/`@pm`, en + pt-BR); a publicação dos formatos de resposta da OPS-21 não deve listá-la.
- **Reversão:** reverter o commit (sem mudança de schema).
- **Prontidão:** **PRONTA PARA CORTE** quando o `@data-engineer` confirmar que manter o ramo do worker basta para linhas `reward.set_open` com `archiveAfterConfirm: true` já existentes em bancos instalados, e o `@po` aceitar a redação do FR-10.

### Onda 6 — limpeza final

- **Remove:** `API_ONLY` (`dev-runtime-config.mjs:20`; o `apiOnly` de `server.mjs:133` já sai com a onda 1), `@fastify/static` de `package.json:56` + lockfile (só se não houver outro importador), redação transitória obsoleta ("removido com o painel vanilla") em comentários e docs. ACs 9/15 da story marcados como superados ou fechados pelo `@po`.
- **Prontidão:** PRONTA após as ondas 1 e 4.

**Sequência recomendada:** 0 → 1 → 3 → 2 → 5 → (ports TS-10) → 4 → 6. As ondas 0, 1, 3 e 2 podem ir ao `@dev` já, uma de cada vez.

## 3. O que ainda não pode ser cortado, e por quê

| Item | Por quê | Depende de |
|---|---|---|
| ~~`/overlay.html` e todos os seus aliases (A-07)~~ | **Não é mais bloqueio (OW-09 resolvida em 2026-10-27).** Não há usuários ativos, então nenhum shim de compatibilidade é mantido até `rc`/`stable`; os aliases podem sair junto com o overlay vanilla (onda 3). | Só a reescrita dos CA 3/CA 8 pelo `@po` antes da remoção dos aliases |
| `apps/shared/panel/*` e `apps/shared/browser/translate-catalog.mjs` | Usados pelo Next (`overlay-root.jsx:4`, features) e pela API (`chat-handler.mjs:5`); só o serviço deles por HTTP some na onda 1 | — |
| Arquivos vanilla lidos por testes de classe B (onda 4) | Os contratos de comportamento se perderiam | TS-10 (`legacy-test-audit.md:43,55`) |
| Ramo `archiveAfterConfirm` do worker de recompensas | Linhas duráveis da outbox podem já existir em bancos instalados | `@data-engineer` |
| Aceite de paridade de `/queues` e `/new-queue` (não a remoção do código) | D-3/D-4 (FT-23), D-7 (OPS-23), D-5 (OPS-22). Pelas próprias stories, são "dependências do cutover da OPS-15" (`docs/stories/OPS-22/story.md:7,89`; `docs/stories/OPS-23/story.md:7,82`; AC 7 em story `:105`). Este plano lê isso como dependência da **conclusão da OPS-15**, porque o vanilla não oferece fallback funcional (seção 0); a DP-0 foi confirmada pelo proprietário em 2026-10-27 e registrada no CA 15 da story | OPS-22, OPS-23, FT-23 |
| Aceites exclusivos do proprietário: instalador Windows com Docker real (OW-01), fluxo de dev no Windows (OW-02), OBS nativo no Windows (OW-03), Twitch ao vivo (OW-04, OW-16), tecnologia assistiva (OW-06), macOS (OW-07) | Não reproduzíveis por agentes; exigidos para a OPS-15 Done, **não** para as ondas acima, porque nenhuma onda altera o overlay do Next, os instaladores ou caminhos da Twitch | Proprietário |
| D-1/D-2 (FT-21/FT-22) | Defeitos de chat/outbox, sem relação com `apps/web`; nenhuma onda toca `chat-handler.mjs` | Já sequenciados |

## 4. Critérios de aceite por onda e veredito do `@qa`

Gates comuns a toda onda (executados pelo `@qa`, em série, sem outro processo usando Docker ou portas): `npm run lint`, `npm run typecheck`, `npm test` (suíte completa), `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`, `npm run sync:ide:check`, `git diff --check`; paridade en/pt-BR das docs; changelogs atualizados (mais recente primeiro); sem sobras no Docker.

| Onda | Gates adicionais | Evidência manual do proprietário | Veredito esperado do `@qa` |
|---|---|---|---|
| 0 | Prova por `git grep` de zero importadores antes da remoção | nenhuma | PASS / CONCERNS com a lista READY-TO-COMMIT |
| 1 | Red registrado para as asserções invertidas de `next-dev-proxy` e `compose-runtime`; `npm run build:frontend` em worktree isolado (sem `.next` compartilhado); `npm run build` (imagem); `docker compose config --quiet`; `compose-runtime.test.js` completo (propriedade de rotas, jornada Chromium, catálogo comunitário, TLS, reinício); overlay `browser-only`, `parity-browser-only`, `bundle-boundary`; smoke Chromium de `/` em 390×844/768×900/1440×900 (sem overflow, Visão geral renderiza, polling roda) | opcional: o proprietário abre `/` no próximo build local | PASS obrigatório (a classe C é mandatória aqui) |
| 2 | TS-04 Red e depois Green; testes de integração de localização; caso de catálogo comunitário do `compose-runtime`; `build:frontend` (isolado) + build da imagem; os 3 E2E que leem catálogos | nenhuma | PASS |
| 3 | trio de E2E do overlay; caso de overlay do `compose-runtime` | nenhuma (a evidência do OBS no Linux continua válida: o overlay do Next não muda) | PASS |
| 4 | cada port da TS-10 verde e demonstrado não vazio; validação no navegador do anel de foco / empilhamento mobile (axe + viewport); os 15 E2E browser-only; `actionlint`; `ci-workflow-contract`; contagem de `typecheck:web` registrada (59 pré-existentes em `qa-gate-2026-10-27.md:29`, não pode crescer) | nenhuma exigida para o commit; OW-06 (TA) continua gate da OPS-15 Done | PASS; CONCERNS aceitável só para achados documentados que não sejam de contrato |
| 5 | Red do 404 JSON do arquivamento; `queue-routes`, `qra-postgres-fixtures`, `queue-repository` em PostgreSQL isolado com migrations reais | nenhuma | PASS |
| 6 | `npm ls @fastify/static` vazio se removido; diff do lockfile revisado | nenhuma | PASS |

O `@qa` também deve declarar, por onda, quais classes de evidência foram executadas e quais não (L e N nunca são implicadas por estas ondas).

## 5. Riscos, estimativas e decisões do proprietário

### Riscos

| ID | Risco | Mitigação |
|---|---|---|
| R1 | A afirmação "`/` vanilla quebrado" está VERIFICADA na configuração, mas não reproduzida em runtime | A execução Compose da onda 1 é a prova; se `/` funcionasse (não deveria), a decisão não muda, porque o proprietário abandonou o vanilla |
| R2 | Muda a página inicial do primeiro uso: quem está desconectado vê a Visão geral com um cartão "conectar" em vez da Conexão (`panel-navigation.mjs:4-12`) | DP-1; nota de escopo do `@ux-design-expert`; nenhuma UI nova |
| R3 | A mudança dos catálogos quebra o build do Next porque o fallback é lido no build com `process.cwd()` (NÃO VERIFICADO) | `build:frontend` isolado + build da imagem são gates da onda 2; manter uma única constante de caminho compartilhada |
| R4 | Conjuntos de escrita concorrentes: Biome da OPS-24 (config do ESLint), FT-28 da OPS-23 (layout do painel), outros agentes editando story/inventário agora | Serializar as ondas; onda 4 antes do commit do Biome; edições de story/inventário só pelos donos |
| R5 | A contagem de testes cai e é lida como perda de cobertura | O `@qa` registra, para cada teste removido, o teste do Next que mantém o contrato (ou o motivo de classe C/D) |
| R6 | O texto da story contradiz o plano: o AC 9 e a linha 37 ainda citam `legacy` = `845a58f` como ponteiro local e exigem ensaio de rollback (story `:37,109,195`); o AC 15 e a `:197` proíbem remoção antes da transferência completa (`:118`) | DP-8: o `@po` reescreve antes de o `@dev` começar (Artigos III/IV). **Resolvido em 2026-10-27:** o CA 9, o CA 15, o item da `legacy` e as duas caixas de gate foram reescritos pelo `@po` |
| R7 | Commit não é implantação: as pessoas usuárias só veem o cutover quando um release sair | Release continua exigindo OK separado do proprietário; DP-7 para a redação do changelog beta |
| R8 | A mudança de escopo do `typecheck:web` altera a linha de base de 59 erros pré-existentes | Registrar a contagem antes/depois na onda 4; hoje não é gate do projeto (`qa-gate-2026-10-27.md:29`) |

### Estimativas (esforço dos agentes, em faixas; o tempo do `@qa` inclui a suíte completa e as execuções Compose)

| Onda | `@dev` | `@qa` |
|---|---|---|
| 0 | 0,5–1 h | 0,5–1 h |
| 1 | 3–6 h | 2–3 h |
| 2 | 3–5 h | 1,5–2,5 h |
| 3 | 1–2 h | 1 h |
| 5 | 2–4 h (+ `@data-engineer` 0,5–1 h) | 1,5–2 h |
| Ports TS-10 | 6–12 h (+ validação no navegador 2–4 h) | 2–3 h |
| 4 | 3–5 h | 3–4 h |
| 6 | 1–2 h | 1 h |
| **Total** | **≈ 20–41 h** | **≈ 12–18 h** |

### Decisões que dependem do proprietário (opção recomendada primeiro)

| ID | Decisão | Recomendação e trade-off |
|---|---|---|
| DP-0 | OPS-22/OPS-23/FT-23 bloqueiam a **remoção** do vanilla ou só a **conclusão da OPS-15**? | **RESOLVIDA (proprietário, 2026-10-27): só a conclusão da OPS-15**, não a remoção do vanilla. Registrada no CA 15 da story |
| DP-1 | Aceitar a Visão geral atual do Next (revisão estática 7,0, story `:915`) como página inicial de produção antes do polimento FT-01, incluindo a diferença do primeiro uso | **RESOLVIDA (proprietário, 2026-10-27): aceita.** A Visão geral do Next vira a página inicial de produção; a diferença do primeiro uso (sem conexão aparece o cartão "conectar" em vez da página Conexão) vai no changelog beta (DP-7) |
| DP-2 | Onda 1, opção A (apagar `registerWebRoutes`) vs B (`API_ONLY=true` no Compose e em todo Compose gerado pelos instaladores) | **RESOLVIDA (proprietário, 2026-10-27): opção A**, apagar `registerWebRoutes` e `web-route.mjs` |
| DP-3 | Caminho de destino dos catálogos | `apps/shared/localization/catalogs/` (sem COPY novo no Dockerfile). Alternativa: `localization/catalogs/` na raiz exige COPY novos nos dois estágios e novo escopo de lint/tipos |
| DP-4 | Validação no navegador do anel de foco / empilhamento mobile na onda 4: `@ux-design-expert` com Playwright + axe, ou verificação visual do proprietário | `@ux-design-expert` + `@qa`; a verificação de TA do proprietário (OW-06) continua gate da OPS-15 Done |
| DP-5 | Renomear o job `web` do CI para `frontend` na onda 4 | Renomear junto com `ci-workflow-contract` e `package.json`; ou manter o nome para não mexer nas configurações de checks obrigatórios (aí o `@devops` não altera nada no GitHub) |
| DP-6 | QRA-18: remover `repository.archiveQueue` junto com a rota | **RESOLVIDA (proprietário, 2026-10-27): sim**, apagar `archiveQueue` e `POST /api/queues/:queueId/archive`, mantendo o ramo `archiveAfterConfirm` do worker. O `@data-engineer` (linhas vivas) e o `@po` (redação da FR-10) ainda confirmam antes da onda 5 |
| DP-7 | Linha no changelog voltado ao produto: "a página inicial do painel agora é a Visão geral do Next" | Incluir em `CHANGELOG-beta.md` (en/pt-BR conforme a regra do projeto) quando o release for preparado |
| DP-8 | O `@po` reescreve o AC 9, o AC 15 e as linhas 37/195/197 da story conforme a decisão de 2026-10-27 (`legacy` remota protegida = `a9279b2`, cutover por partes, sem ensaio de rollback) | **RESOLVIDA (`@po`, 2026-10-27):** story reescrita (en + pt-BR, linha no Histórico de alterações). A onda 0 pode ir para o `@dev` |
| OW-09 | Manter os aliases de `/overlay.html` | **RESOLVIDA (proprietário, 2026-10-27): não é necessário.** Não há usuário ativo até `rc`/`stable`, então qualquer alteração estrutural é segura e nenhum shim de compatibilidade é mantido; os aliases podem ser removidos junto com o overlay vanilla e o overlay Next o substitui. Regra permanente do projeto: sem shims de compatibilidade enquanto não houver usuários; revisar ao entrar em `rc`/`stable`. Pendente: reescrita dos CA 3/CA 8 pelo `@po` antes da remoção |

**Ordem da primeira onda (proprietário, 2026-10-27):** Onda 0 (código morto: `priority-labels.mjs` e seu teste, `create-overlay-alias.mjs`), depois Onda 1 (`/` para o Next). Uma onda por vez, veredito do `@qa` depois de cada uma. O proprietário autorizou expressamente o cutover antecipado e o cutover do restante conforme for validado.

## Não executado

Nenhuma operação de teste, build, servidor, Docker, navegador, GitHub ou Twitch. A tarefa de diagnóstico SYNAPSE anexada ao pedido está fora desta missão de arquitetura somente de leitura e não foi executada. Os números de linha foram lidos em `feat/ops-15-next-panel` no `9ca394b` (árvore limpa) em 2026-10-27; outros agentes estão editando stories e inventários agora, então referências a linhas da story podem se deslocar.
