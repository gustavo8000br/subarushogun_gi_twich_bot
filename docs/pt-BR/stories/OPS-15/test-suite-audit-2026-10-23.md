# OPS-15 — Auditoria da suíte de testes (relevância, obsolescência e custo de CI), 2026-10-23

[English](../../../stories/OPS-15/test-suite-audit-2026-10-23.md)

**Autor:** `@qa` (Quinn). **Branch:** `feat/ops-15-next-panel` (árvore de trabalho com mudanças não comitadas do @dev na limpeza Docker dos testes). **Modo:** somente leitura. Nenhum teste, código, config ou doc existente foi alterado ou removido.

**Pergunta do proprietário:** os ~1.579 testes ainda valem para o trabalho atual, ou parte deles virou obsoleta e só consome tempo de CI?

**Resposta curta:** quase todos são relevantes. 135 de 163 arquivos (≈90% dos testes) exercitam o produto atual (classe A). Um arquivo está obsoleto agora (classe D: o módulo-alvo não tem importador). Seis arquivos do vanilla saem no cutover (C). Sete arquivos do vanilla ainda guardam contratos que precisam de equivalente Next antes (B). Dois arquivos de integração são redundantes ou estão na camada errada (E), e doze são contratos de governança/documentação, quase todos vigentes (F). Remover testes obsoletos economizaria **segundos, não minutos**. O tempo real de CI está na camada de integração (containers PostgreSQL, um `next build` completo, o stack Compose) e na inicialização de worker por arquivo do Vitest. É aí que acelerar compensa.

## Níveis de evidência (o que foi medido e o que não foi)

| Item | Nível | Nota |
|---|---|---|
| Inventário (arquivos, contagem de `it`/`test`, imports, existência do alvo, importadores em produção) | **Estático, verificado** | Scripts somente leitura sobre `tests/` e `apps/`; todo import relativo e todo caminho do repositório referenciado existe (0 ausentes) |
| Contagem da unidade (142 arquivos, 1.286 testes, todos passando) | **Medido** | `vitest run tests/unit --reporter=json`, exit 0 |
| Durações da unidade (por arquivo e por fase) | **Medido, NÃO confiável** | Duas execuções enquanto outra suíte rodava em paralelo na mesma máquina/worktree (load average 9,01 em 4 núcleos às 23:42). Execução 1: 50,1 s de relógio, 304% de CPU. Execução 2: 76,4 s (testes 43%, environment 31%, import 18%, transform 6%). Use **só para ordenar**. **Não** use para decidir remoções. Medição isolada pendente |
| Contagem da integração | **Limite inferior estático + derivado** | Contagem por regex ≥254 em 21 arquivos (`it.each` expande em runtime). Total derivado ≈284 = 1.565 (gate de 2026-10-23) − 1.281 testes de unidade na época do gate. Não executado |
| Durações da integração | **Pendente de medição** | Não executado (instrução do coordenador: nada de Docker/integração nesta auditoria). Únicos números registrados: `npm test` completo 105 s em paralelo / 240 s serial (`qa-gate-2026-10-23.md`) |
| Durações dos jobs de CI | **Medido (histórico)** | `gh run view` das 5 últimas execuções de CI de PR e de 1 Main CD (2026-10-14/15, `main`). A branch atual **não tem execução de CI** (19 commits à frente de `main`), então esses números são anteriores aos testes do painel Next |
| Economias | **Estimativas** | Marcadas como "est." abaixo; derivadas das medições com contenção e do diagnóstico do Vitest |

O número ~1.579 do proprietário é coerente com 1.286 testes de unidade (medido) mais ≈284 de integração (derivado) ≈ 1.570. A diferença provavelmente são as mudanças de teste em andamento do @dev; não verificado.

## O que o `npm test` e a CI executam

- `npm test` = `vitest run`, `include: ['tests/**/*.test.{js,jsx}']` (`vitest.config.js`): **142 arquivos de unidade + 21 de integração**. `tests/e2e/*.mjs` (15 scripts de navegador, scripts npm `test:e2e:*` separados) e `tests/platform/installer-native.mjs` **não** entram no `npm test`.
- CI (`.github/workflows/quality-gates.yml`, reutilizado por `ci.yml` nos PRs e por `main-cd.yml` na `main`): matriz `app-quality` (api, infra, web: lint + typecheck), `lint-tests` (`npm run lint` + `npm run typecheck`), `installer-smoke` (linux/macos/windows, roda `tests/platform/installer-native.mjs`), `tests` (`npm test`, unidade + PostgreSQL + Compose, timeout de 35 min), `static-analysis` (actionlint, OpenGrep, `validate:version`, `validate:localization`), `container-build` (config Compose + build da imagem) e o agregador `quality-gate`.

## Totais por classe

Legenda: **A** produto atual (manter), **B** vanilla com contrato a portar antes, **C** vanilla já coberto pelo Next (remover junto com o vanilla), **D** obsoleto agora, **E** duplicado/redundante ou na camada errada, **F** contrato de governança/docs/framework.

| Classe | Arquivos de unidade | Testes de unidade (medido) | Arquivos de integração | Testes de integração (estático ≥) | Total de arquivos | Total de testes |
|---|---|---|---|---|---|---|
| A | 119 | 1.174 | 16 | ≥220 | 135 | ≥1.394 |
| B | 6 | 35 | 1 | ≥22 | 7 | ≥57 |
| C | 6 | 18 | 0 | 0 | 6 | 18 |
| D | 1 | 5 | 0 | 0 | 1 | 5 |
| E | 0 | 0 | 2 | ≥4 | 2 | ≥4 |
| F | 10 | 54 | 2 | ≥8 | 12 | ≥62 |
| **Total** | **142** | **1.286** | **21** | **≥254 (≈284 derivado)** | **163** | **≥1.540 (≈1.570)** |

Achados dentro de arquivos, que a classe do arquivo não mostra: 3 testes de `fnd7-documentation-contract` (F) se comportam como D, 1 teste de `dockerfile-frontend-imports` (A) é E, e 8 dos 10 testes de `web-route` (B) são C.

## Evidências da classificação

### D — obsoleto agora

- `tests/unit/priority-labels.test.js` (5 testes) → `apps/web/priority-labels.mjs`. Nada em `apps/` importa `priorityBenefitLabel` ou `priority-labels`; o único consumidor é o teste (`grep -rn "priorityBenefitLabel\|priority-labels" apps` → só o próprio módulo). `git log -S"priority-labels" -- apps/web/app.js` mostra que o `app.js` deixou de usá-lo na FND-8 (`a906756`). A auditoria preliminar o pôs na classe 2; hoje é código morto, independentemente do cutover. O React escapa texto por padrão, então a garantia "não reflete dados arbitrários" não precisa de teste Next novo.
- `tests/unit/fnd7-documentation-contract.test.js`, 3 de 6 testes: "reports FND-7 completion and independent QA…" (afirma o texto do roadmap `qa pass 9.2/10`), "records that Chrome link copy…" (afirma notas de validação) e "keeps the focused roadmap aligned with the merged FND-6 status". Eles congelam **texto histórico de status** de stories fechadas. Não protegem nenhuma regra vigente e quebram edições legítimas da documentação. Os outros 3 testes (orientação de widget/HTTPS, caminhos de certificado, passos do macOS) protegem documentação vigente da pessoa usuária (F).

### C — vanilla já coberto pelo Next (remover na mudança do cutover)

| Arquivo | Testes | Cobertura no Next (evidência) |
|---|---|---|
| `unit/call-notification-actions.test.js` | 1 | testes de reenvio em entry-actions; E2E `queue-call-resend-browser-only` (auditoria preliminar) |
| `unit/dom-localization.test.js` | 5 | a tradução de nós de texto do DOM só existe em `apps/web/app.js` |
| `unit/panel-error-presentation.test.js` | 4 | testes de erro do Next em operações/entry-actions (auditoria preliminar) |
| `unit/vanilla-fulfillment-feedback.test.js` | 2 | testes de fulfillment pendente em `next-queue-entry-actions` |
| `unit/queue-onboarding-flow.test.js` | 4 | **Promovido de 1 para C**: portado em 2026-10-21 (`next-queue-onboarding.test.jsx`, `getQueueSettingsFeedback`), conforme a seção de fechamento de `legacy-test-audit.md` |
| `unit/web-route-vanilla-modules.test.js` | 2 | Novo desde a auditoria preliminar (S-03). Serve o grafo de módulos de `app.js`/`overlay.js`; cai junto com o vanilla |

### B — vanilla, contrato ainda a portar (não remover antes de o equivalente Next passar)

| Arquivo | Testes | Contrato que ainda falta no Next |
|---|---|---|
| `unit/panel-confirmation-contract.test.js` | 11 | `next-panel-class1-parity` já cobre a ausência de `confirm()` nativo e os textos de ocultar/arquivar. Falta: falhar fechado quando o diálogo não abre ou já está aberto, e dupla confirmação quando o sync da recompensa é incerto |
| `unit/reward-dialog-contract.test.js` | 2 | Fechar/cancelar com `type="button"` portado; "espaço responsivo do diálogo e ações separadas" não portado (exige navegador) |
| `unit/health-status.test.js` | 7 | **Rebaixado de 2 para B**: `next-overview-panel.test.jsx` não tem teste explícito de "não inventa ping para canal não configurado" nem de "reconexão automática exibida como tentando" (só um teste de severidade, :122). A auditoria preliminar dizia "senão, classe 1" |
| `unit/web-application-setup.test.js` | 2 | **Rebaixado de 2 para B**: `next-connection-page.test.jsx` cobre os alertas do callback, mas não "nunca mostrar a mensagem bruta da Twitch/backend quando a validação de credenciais falha" |
| `unit/locale-picker-state.test.js` | 3 | **Rebaixado de 2 para B**: não há teste Next explícito do fallback pt-BR quando o catálogo persistido está incompleto |
| `unit/web-route.test.js` | 10 | 2 casos ficam como contratos vigentes da API ("modo API-only sem rotas de UI", "serve só o ESM de localização compartilhado"); 8 casos (`/`, `/app.js`, páginas vanilla) são C |
| `integration/panel-localization-contract.test.js` | ≥22 | Misto 1/2 (auditoria preliminar): anel de foco e empilhamento mobile das políticas de comando exigem validação em navegador; redirecionar os testes de catálogo |

### E — duplicado, redundante ou na camada errada

- `integration/queue-repository-chat.test.js` (3 testes): usa Prisma mockado (`vi.fn`, 19 ocorrências) dentro de `tests/integration`. Regra do projeto: garantias de PostgreSQL exigem PostgreSQL real com migrations reais, nunca mocks de Prisma. É um teste de unidade na camada errada. A prova em PG real do mesmo comportamento está em `queue-repository.test.js:1005-1064` (horário de nova tentativa persistido, reenvio sem mudar o prazo, confirmação tardia). Recomendação: mover para `tests/unit` (ou apagar os casos já provados em PG). Impacto em tempo: neutro; o ganho é evidência correta.
- `integration/next-static-export.test.js` (1 teste): roda um `next build apps/frontend` completo dentro do `npm test`, e o job `container-build` da CI compila o mesmo frontend dentro da imagem (`compose-contract.test.js:164` afirma `RUN npm run build:frontend` no Dockerfile). As asserções de rotas/manifestos são únicas; o **build é duplicado** na CI. O nome está obsoleto (a produção é um servidor em runtime, não um static export).
- `unit/dockerfile-frontend-imports.test.js`, teste "never imports apps/web from the Next frontend after the S-03 relocation", duplica o "forbids Next, shared and API server code from importing apps/web" de `shared-panel-boundary.test.js`. Nenhum dos dois pega o caminho restante baseado em `process.cwd()` para `apps/web/localization/catalogs` em `apps/frontend/lib/i18n/load-first-party-panel-fallback.mjs:4`, porque esse caminho é string, não import.
- Nível de CI (não é arquivo de teste): as entradas api e infra da matriz `app-quality` são subconjuntos estritos de `lint-tests` (`eslint apps tests` e o `tsconfig.json` raiz com `apps/**/*.mjs`). A entrada `web` **não** é redundante: é o único typecheck de `apps/frontend/**/*.jsx` (o `tsconfig.json` raiz inclui só `.js`/`.mjs`).

### F — contratos de governança, documentação e framework

Os 12 arquivos referenciam caminhos que existem e refletem regras vigentes: OpenGrep como único revisor (`aiox-static-review`, `opengrep-quality-gate`), política de release/changelog/instalação (`documentation-contract`), links dos READMEs (`readme-structure`), `.gitignore` (`local-ignore-policy`), pin do Prisma, scripts de qualidade, descoberta do Vitest, Codespaces (`.devcontainer/` existe), o workflow de publicação da imagem e o gate agregado da CI. Exceção: os 3 testes de status histórico de `fnd7-documentation-contract` (ver D). No cutover, `ci-workflow-contract.test.js:21` (alvo de lint `web` = `apps/web apps/shared/panel`) muda junto com `lint:web`/`typecheck:web` do `package.json`.

### A — produto atual, com notas

- Todo módulo de `apps/shared/panel/*` e `apps/shared/browser/*` é importado por `apps/frontend` (verificado um a um), então os testes deles são A. Isso inclui `call-deadline-presentation.test.js`, lacuna classe 1 na auditoria preliminar, hoje usado pelo `call-deadline.jsx` do Next.
- Os testes de helpers de teste (`compose-origin-environment`, `obs-websocket-auth`, `png-alpha`, `with-timeout`) protegem `tests/e2e/overlay-browser.mjs`; `isolated-*-cleanup`/`isolated-postgres-image` protegem a infraestrutura de integração (em alteração pelo @dev agora).
- Pontos de entrada sem importador são válidos (arquivos do app router do Next, `dev-stop.mjs`, `validate-port-denylist.mjs`, `create-release-notes.mjs`, todos chamados por scripts npm, pelo Next ou pelo `release.yml`).
- Testes A acoplados ao cutover: `next-dev-proxy.test.js:32-39` (fixa `/`, `/styles.css`, `/app.js`), `compose-runtime.test.js:372` (afirma o `/` vanilla), `shared-panel-boundary`, `dockerfile-frontend-imports`.
- Observação fora da classificação de testes: `apps/frontend/scripts/create-overlay-alias.mjs` não tem referência em código, scripts nem no Dockerfile ("resto de static export" apontado pela arquitetura) e não tem teste.

## Tempo

### 15 arquivos de unidade mais lentos (execução 1, com contenção, só para ordenar)

| # | Arquivo | ms | Testes | Causa (lida no código / tempos por teste) |
|---|---|---|---|---|
| 1 | `unit/bootstrap-secret.test.js` | 8.091 | 10 | 3 testes de TLS geram chave/certificado com OpenSSL real (3,6 s + 3,0 s + 1,5 s) |
| 2 | `unit/next-widgets-page.test.jsx` | 7.784 | 23 | jsdom + React Testing Library, 23 fluxos de interação |
| 3 | `unit/port-denylist-validation.test.js` | 3.643 | 2 | 1 teste varre o checkout inteiro (3,6 s) |
| 4 | `unit/queue-routes.test.js` | 2.928 | 165 | inject do Fastify; 165 testes (≈18 ms cada) |
| 5 | `unit/next-operations-page.test.jsx` | 2.426 | 16 | jsdom/RTL |
| 6 | `unit/next-queue-clear-ui.test.jsx` | 2.283 | 4 | jsdom/RTL, fluxos com `waitFor` (≈1 s em um teste) |
| 7 | `unit/next-connection-page.test.jsx` | 1.850 | 16 | jsdom/RTL |
| 8 | `unit/next-command-permissions-page.test.jsx` | 1.848 | 9 | jsdom/RTL |
| 9 | `unit/next-overview-panel.test.jsx` | 1.707 | 4 | jsdom/RTL |
| 10 | `unit/next-queue-reward-settings-dialog.test.jsx` | 1.528 | 6 | jsdom/RTL |
| 11 | `unit/next-account-settings-page.test.jsx` | 1.500 | 6 | jsdom/RTL |
| 12 | `unit/next-locale-picker.test.jsx` | 1.468 | 4 | jsdom/RTL |
| 13 | `unit/next-queue-lifecycle-actions.test.jsx` | 1.181 | 5 | jsdom/RTL |
| 14 | `unit/next-queue-creation-form.test.js` | 1.102 | 11 | jsdom/RTL |
| 15 | `unit/next-queue-onboarding.test.jsx` | 969 | 8 | jsdom/RTL |

Os 15 são classe A. Os 6 arquivos C somam ≈0,3 s de tempo de teste; os 7 B, ≈0,5 s; o D, 9 ms. Diagnóstico do próprio Vitest (execução 2): "142 workers spawned · ~827 ms startup each … at least ~38.29 s faster with `isolate: false`". A inicialização por arquivo (spawn + environment) custa mais que todos os testes do vanilla juntos.

### Integração (pendente de medição)

Não executada. Registrado: suíte completa em 105 s em paralelo e 240 s serial (`qa-gate-2026-10-23.md`, 162 arquivos, 1.565 testes, imagem aquecida), e um pull frio de `postgres:18.6-bookworm` estourou o timeout de 30 s do `docker run` na execução 1. Lido no código: 7 arquivos sobem o próprio container PostgreSQL e rodam `prisma migrate deploy` (`postgres-foundation`, `queue-repository`, `command-policy-persistence`, `command-policy-v3-migration`, `overlay-widget-repository`, `tombstone-index-plan`, `qra-postgres-fixtures`); `compose-runtime` sobe o stack Compose completo; `next-static-export` roda `next build`. **Medir por arquivo depois que o @dev terminar o trabalho de limpeza Docker**, com `--reporter=json` e nada mais rodando.

### CI (histórico, `main`, 2026-10-14/15)

| Job | Duração (6 execuções) |
|---|---|
| Vitest unit, PostgreSQL, and Compose integration (`npm test`) | 72–83 s (caminho crítico) |
| Native windows installer smoke | 59–73 s |
| Compose configuration and production image build | 50–59 s |
| Workflow lint, OpenGrep, version/localization | 25–33 s |
| Native macos installer smoke | 18–31 s |
| api / infra / web lint and typecheck (cada) | 17–25 s |
| Lint tests and shared project files | 18–24 s |
| Native linux installer smoke | 17–22 s |
| Required quality gate | 2–4 s |
| Main CD: publicação da imagem multiplataforma | 175 s |
| Main CD: instalador Windows beta | 60 s |

O `gh run view --json` não traz o tempo de cada etapa (timestamps nulos), então a divisão entre `npm ci` e `npm test` é desconhecida. Essas execuções são anteriores aos testes do painel Next (a `main` tem 106 arquivos de teste, a branch tem 163). Nesta branch, espera-se que o job `tests` continue no caminho crítico e cresça (est. 2–3 min em runner de 4 vCPU, por analogia com os 105 s locais). A primeira execução de CI da branch vai medir isso.

## Recomendações (priorizadas)

Nada é apagado sem story + issue no GitHub (@devops) + decisão do proprietário. A classe B só sai depois de o equivalente Next passar. As economias são estimativas, e os números de unidade vêm de execuções com contenção.

1. **Acelerar (maior ganho, classe A).**
   a. PostgreSQL da integração: um container por execução (`globalSetup` do Vitest) com banco novo por arquivo (por exemplo `CREATE DATABASE … TEMPLATE` depois de um único `migrate deploy`), em vez de 7 containers × migrate. Est. 20–60 s dos 105 s; pendente de medição. Coordenar com o trabalho de limpeza em andamento do @dev e com o @data-engineer.
   b. `next-static-export`: evitar o segundo `next build` na CI (reaproveitar o artefato do `container-build` ou mover as asserções de manifesto para esse job). Est. um build completo (30–90 s de CPU); pendente de medição.
   c. Inicialização de workers do Vitest: avaliar `isolate: false` (ou um projeto separado) **só para arquivos de ambiente node sem estado em nível de módulo**. O Vitest estima ≤38 s; o ganho real é desconhecido até medir isolado. Exige provar que nenhum teste vaza estado.
   d. `bootstrap-secret`: gerar a CA/certificado TLS uma vez por arquivo (`beforeAll`) e afirmar a idempotência sobre ela. Est. −4 a −5 s no arquivo.
   e. `port-denylist-validation`: rodar a varredura real como etapa da CI (`npm run validate:port-denylist` no `static-analysis`, onde hoje não existe) e manter na unidade o teste com scanner falso. Est. −3,6 s na unidade; a garantia continua.
2. **Remover já (D), com story/issue:** `priority-labels.test.js` junto com o `apps/web/priority-labels.mjs` morto (≈1 s com a inicialização do worker, est.); reescrever ou remover os 3 testes de status histórico de `fnd7-documentation-contract` (tempo ≈0; menos fragilidade na documentação).
3. **Fundir/mover (E):** mover `queue-repository-chat` para `tests/unit` (conformidade com a regra); fundir o teste duplicado de "sem import de apps/web" em `shared-panel-boundary` e acrescentar checagem de caminhos `process.cwd()`/string para `apps/web`; na CI, retirar as entradas api/infra do `app-quality` (≈2 jobs × 20 s de runner mais um `npm ci` cada; sem mudança no tempo de relógio, porque rodam em paralelo); manter `web`, renomeado para frontend no cutover.
4. **Portar antes de remover (B):** "não inventa ping" e "reconexão = tentando" (visão geral), "sem mensagem bruta da Twitch" (página de conexão), fallback pt-BR com catálogo incompleto (seletor de idioma), diálogo que falha fechado e dupla confirmação (confirmação), diálogo de recompensa responsivo e anel de foco/layout mobile (validação em navegador). Manter os 2 casos API-only/ESM compartilhado de `web-route`.
5. **Remover no cutover (C):** os 6 arquivos C e os 8 casos vanilla de `web-route`, na mesma mudança que remove `apps/web` e atualiza `next-dev-proxy:32-39`, `compose-runtime:372`, `ci-workflow-contract:21`, `lint:web`/`typecheck:web` e os scripts E2E que leem `apps/web/localization/catalogs` ou abrem `/overlay.html`. Est. ≈0,3 s de teste + ≈5 s de CPU de inicialização de workers (≈1,5 s de relógio com 4 workers).

## Pendências

- Tempo isolado da unidade (nada mais rodando), com o mesmo comando e `--reporter=json`.
- Tempo por arquivo da integração depois do trabalho de limpeza Docker do @dev.
- Contagem exata da integração (executada, não estática).
- Primeira execução de CI desta branch (duração dos jobs com os testes do Next).
- A classificação do vanilla (B/C) continua **preliminar** até a migração completa; precisa ser repetida com as revisões finais de QA e arquitetura, como exige `legacy-test-audit.md`.
- Fora do escopo: `tests/e2e/*` (15 scripts manuais de navegador) e `tests/platform/installer-native.mjs` (smoke do instalador na CI) não foram classificados teste a teste.

## Apêndice — inventário por arquivo

Os tempos são da execução 1 (com contenção, só para ordenar). As contagens de integração são limites inferiores estáticos. "Alvo" lista até 2 módulos de produção importados (caminhos relativos a `apps/`); "—" significa que o teste lê arquivos, roda scripts ou testa helpers.

| Arquivo | Área | Testes | ms | Alvo | Classe | Nota |
|---|---|---|---|---|---|---|
| `unit/aiox-static-review.test.js` | Helpers de teste / governança | 4 | 286 | — | **F** | Regra vigente: OpenGrep é o único revisor; bloqueia o nome do provedor antigo |
| `unit/api-runtime-config.test.js` | Runtime da API | 2 | 9 | `api/src/runtime-config.mjs` | **A** |  |
| `unit/bootstrap-secret.test.js` | Infra / instalador / release | 10 | 8091 | — | **A** | Arquivo de unidade mais lento: 3 testes TLS rodam OpenSSL real (~8 s); grava no tmpdir do SO |
| `unit/call-deadline-presentation.test.js` | Painel compartilhado (usado pelo Next) | 4 | 7 | `shared/panel/call-deadline-presentation.mjs` | **A** | Era lacuna classe 1; o módulo agora é compartilhado e usado pelo `call-deadline.jsx` do Next |
| `unit/call-notification-actions.test.js` | Painel vanilla | 1 | 14 | `web/call-notification-actions.mjs` | **C** | Coberto pelos testes de reenvio do Next + E2E |
| `unit/call-timeout-loop.test.js` | Workers de outbox | 1 | 14 | `api/src/outbox/timeout-loop.mjs` | **A** |  |
| `unit/chat-command-handler.test.js` | Comandos de chat | 32 | 169 | `api/src/commands/chat-handler.mjs`, `api/src/domain/clear-confirmation.mjs` +1 | **A** |  |
| `unit/chat-outbox-worker.test.js` | Workers de outbox | 4 | 17 | `api/src/outbox/chat-worker.mjs` | **A** |  |
| `unit/ci-workflow-contract.test.js` | Helpers de teste / governança | 10 | 97 | — | **F** | Vigente; alvo de lint `web` (`apps/web apps/shared/panel`, :21) muda no cutover |
| `unit/clear-confirmation.test.js` | Domínio | 2 | 13 | `api/src/domain/clear-confirmation.mjs` | **A** |  |
| `unit/command-authorization.test.js` | Comandos de chat | 10 | 30 | `api/src/commands/authorization.mjs` | **A** |  |
| `unit/command-catalog-view.test.js` | Painel compartilhado (usado pelo Next) | 7 | 18 | `shared/panel/command-catalog-view.mjs` | **A** |  |
| `unit/command-catalog.test.js` | Comandos de chat | 5 | 14 | `api/src/commands/catalog.mjs` | **A** |  |
| `unit/command-help.test.js` | Comandos de chat | 6 | 16 | `api/src/commands/help.mjs` | **A** |  |
| `unit/command-parser.test.js` | Comandos de chat | 39 | 32 | `api/src/commands/parser.mjs` | **A** |  |
| `unit/compose-origin-environment.test.js` | Infra / instalador / release | 2 | 7 | — | **A** | Helper de `tests/e2e/overlay-browser.mjs` |
| `unit/database-url.test.js` | Infra / instalador / release | 3 | 33 | `infra/src/database-url.mjs` | **A** |  |
| `unit/dev-overlay-alias.test.js` | API HTTP | 3 | 188 | `api/src/http/dev-overlay-alias.mjs` | **A** |  |
| `unit/dev-preflight.test.js` | Ferramentas de dev | 9 | 33 | `frontend/scripts/dev-preflight.mjs` | **A** |  |
| `unit/dev-stop.test.js` | Ferramentas de dev | 17 | 75 | `frontend/scripts/dev-database.mjs`, `frontend/scripts/dev-server-state.mjs` +1 | **A** |  |
| `unit/dockerfile-frontend-imports.test.js` | Fronteira de arquitetura | 4 | 76 | — | **A** | O teste "nunca importa apps/web do Next" duplica `shared-panel-boundary` (E, 1 teste) |
| `unit/documentation-contract.test.js` | Helpers de teste / governança | 18 | 118 | — | **F** | Política vigente de release/changelog/instalação |
| `unit/dom-localization.test.js` | Painel vanilla | 5 | 14 | `web/dom-localization.mjs` | **C** | Tradução de DOM é só do vanilla |
| `unit/entry-transitions.test.js` | Domínio | 22 | 27 | `api/src/domain/entry-transitions.mjs` | **A** |  |
| `unit/error-diagnostics.test.js` | Observabilidade | 3 | 11 | `api/src/observability/error-diagnostics.mjs` | **A** |  |
| `unit/eventsub-runtime.test.js` | Integração Twitch | 8 | 31 | `api/src/twitch/eventsub-runtime.mjs`, `api/src/commands/authorization.mjs` +1 | **A** |  |
| `unit/financial-outbox-worker.test.js` | Workers de outbox | 9 | 37 | `api/src/outbox/financial-worker.mjs` | **A** |  |
| `unit/fnd7-documentation-contract.test.js` | Helpers de teste / governança | 6 | 13 | — | **F** | 3 de 6 testes congelam texto histórico de status FND-7/FND-6 (roadmap "qa pass 9,2/10", notas de validação): candidatos D |
| `unit/health-route.test.js` | API HTTP | 11 | 365 | — | **A** |  |
| `unit/health-status.test.js` | Painel vanilla | 7 | 18 | `web/health-status.mjs` | **B** | Era classe 2 com ressalva. `next-overview-panel` não tem teste explícito de "não inventa ping" nem "reconexão = tentando" |
| `unit/hierarchical-command-policy.test.js` | Comandos de chat | 2 | 9 | `api/src/commands/catalog.mjs` | **A** |  |
| `unit/installer-locale-default.test.js` | PostgreSQL / persistência | 2 | 20 | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `unit/isolated-compose-cleanup.test.js` | Infra / instalador / release | 3 | 11 | — | **A** | Helper de `compose-runtime` |
| `unit/isolated-postgres-cleanup.test.js` | PostgreSQL / persistência | 11 | 31 | — | **A** | Helper da integração PG; em alteração pelo @dev agora |
| `unit/isolated-postgres-image.test.js` | PostgreSQL / persistência | 5 | 11 | — | **A** | Novo, não comitado (@dev, limpeza Docker) |
| `unit/local-ignore-policy.test.js` | Helpers de teste / governança | 4 | 12 | — | **F** | Política vigente do .gitignore |
| `unit/local-session.test.js` | API HTTP | 6 | 220 | `api/src/http/local-session.mjs` | **A** |  |
| `unit/locale-picker-state.test.js` | Painel vanilla | 3 | 6 | `web/locale-picker-state.mjs` | **B** | Era classe 2 com ressalva. Fallback pt-BR para catálogo incompleto não é explícito no Next |
| `unit/localization-byte-catalog.test.js` | Localização | 3 | 9 | `shared/localization/parse-catalog-bytes.mjs` | **A** |  |
| `unit/localization-catalog.test.js` | Localização | 9 | 16 | `shared/localization/tsv-catalog.mjs` | **A** |  |
| `unit/localization-decoding.test.js` | Localização | 4 | 11 | `shared/localization/decode-catalog-bytes.mjs` | **A** |  |
| `unit/localization-parity.test.js` | Localização | 11 | 25 | `shared/localization/validate-catalog-set.mjs` | **A** |  |
| `unit/localization-translation.test.js` | Localização | 10 | 57 | `shared/localization/translate-catalog.mjs` | **A** |  |
| `unit/next-account-settings-page.test.jsx` | Painel Next | 6 | 1500 | `frontend/features/settings/account-settings-page-content.jsx` | **A** |  |
| `unit/next-api-client.test.js` | Painel Next | 8 | 129 | `frontend/lib/api/client.mjs`, `frontend/features/queues/queue-entry-actions.mjs` | **A** |  |
| `unit/next-call-deadline.test.jsx` | Painel Next | 9 | 179 | `frontend/features/queues/call-deadline.jsx` | **A** |  |
| `unit/next-command-permissions-page.test.jsx` | Painel Next | 9 | 1848 | `frontend/features/commands/command-permissions-page-content.jsx` | **A** |  |
| `unit/next-commands-route.test.js` | Painel Next | 1 | 6 | — | **A** |  |
| `unit/next-connection-page.test.jsx` | Painel Next | 16 | 1850 | `frontend/features/connection/connection-page-content.jsx` | **A** |  |
| `unit/next-dev-env.test.js` | Ferramentas de dev | 5 | 48 | `frontend/scripts/dev-env.mjs`, `frontend/scripts/dev-database.mjs` | **A** |  |
| `unit/next-dev-proxy.test.js` | Ferramentas de dev | 6 | 16 | `frontend/scripts/dev-proxy-config.mjs`, `frontend/scripts/next-runtime-config.mjs` | **A** | Linhas 32-39 fixam `/`, `/styles.css`, `/app.js` do vanilla; atualizar no cutover |
| `unit/next-dev-runtime-config.test.js` | Ferramentas de dev | 7 | 10 | `frontend/scripts/dev-runtime-config.mjs` | **A** |  |
| `unit/next-frontend-config.test.js` | Painel Next | 2 | 10 | — | **A** |  |
| `unit/next-locale-persistence.test.js` | Painel Next | 5 | 22 | `frontend/lib/i18n/persist-product-locale.mjs` | **A** |  |
| `unit/next-locale-picker.test.jsx` | Painel Next | 4 | 1468 | `frontend/features/panel-shell/panel-shell.jsx` | **A** |  |
| `unit/next-operations-page.test.jsx` | Painel Next | 16 | 2426 | `frontend/features/operations/operations-page-content.jsx` | **A** |  |
| `unit/next-operations.test.js` | Painel Next | 8 | 21 | `frontend/features/operations/operations.mjs` | **A** |  |
| `unit/next-overlay-root.test.js` | Painel Next | 3 | 90 | `frontend/app/(overlay)/overlay/overlay-root.jsx`, `frontend/app/(overlay)/overlay/page.jsx` | **A** |  |
| `unit/next-overview-panel.test.jsx` | Painel Next | 4 | 1707 | `frontend/features/panel-shell/panel-shell.jsx`, `frontend/lib/api/client.mjs` | **A** |  |
| `unit/next-overview-projection.test.js` | Painel Next | 6 | 14 | `frontend/features/overview/queue-summary.mjs` | **A** |  |
| `unit/next-panel-catalogs.test.js` | Painel Next | 5 | 52 | `shared/localization/tsv-catalog.mjs`, `frontend/lib/i18n/panel-catalogs.mjs` | **A** |  |
| `unit/next-panel-class1-parity.test.js` | Painel Next | 4 | 24 | — | **A** |  |
| `unit/next-panel-shell.test.js` | Painel Next | 3 | 60 | `frontend/features/panel-shell/panel-shell.jsx`, `frontend/features/overview/queue-summary-cards.jsx` | **A** |  |
| `unit/next-panel-snapshot.test.js` | Painel Next | 5 | 29 | `frontend/features/panel-shell/load-panel-snapshot.mjs`, `frontend/features/overview/queue-summary.mjs` | **A** |  |
| `unit/next-queue-clear-ui.test.jsx` | Painel Next | 4 | 2283 | `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-clear.test.js` | Painel Next | 4 | 16 | `frontend/features/queues/queue-clear.mjs` | **A** |  |
| `unit/next-queue-creation-form.test.js` | Painel Next | 11 | 1102 | `frontend/features/queues/new-queue-form.jsx` | **A** |  |
| `unit/next-queue-creation.test.js` | Painel Next | 20 | 35 | `frontend/features/queues/queue-creation.mjs` | **A** |  |
| `unit/next-queue-entry-actions-feedback.test.jsx` | Painel Next | 2 | 251 | `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-entry-actions.test.js` | Painel Next | 64 | 68 | `frontend/features/queues/queue-entry-actions.mjs` | **A** |  |
| `unit/next-queue-history.test.js` | Painel Next | 5 | 20 | `frontend/features/queues/queue-history.mjs` | **A** |  |
| `unit/next-queue-lifecycle-actions.test.jsx` | Painel Next | 5 | 1181 | `frontend/features/queues/queue-lifecycle-actions.jsx` | **A** |  |
| `unit/next-queue-lifecycle-recovery.test.jsx` | Painel Next | 1 | 468 | `frontend/lib/api/client.mjs`, `frontend/features/panel-shell/panel-provider.jsx` | **A** |  |
| `unit/next-queue-lifecycle.test.js` | Painel Next | 14 | 30 | `frontend/features/queues/queue-lifecycle.mjs` | **A** |  |
| `unit/next-queue-list.test.js` | Painel Next | 25 | 463 | `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-onboarding.test.jsx` | Painel Next | 8 | 969 | `frontend/features/queues/queue-settings-form.jsx`, `frontend/features/queues/queue-list.jsx` | **A** |  |
| `unit/next-queue-reward-recovery.test.jsx` | Painel Next | 1 | 658 | `frontend/lib/api/client.mjs`, `frontend/features/panel-shell/panel-provider.jsx` | **A** |  |
| `unit/next-queue-reward-resolution.test.js` | Painel Next | 4 | 18 | `frontend/features/queues/queue-reward-resolution.mjs` | **A** |  |
| `unit/next-queue-reward-settings-dialog.test.jsx` | Painel Next | 6 | 1528 | `frontend/features/queues/queue-reward-settings-dialog.jsx`, `frontend/features/queues/queue-reward-resolution-dialog.jsx` | **A** |  |
| `unit/next-queue-reward-settings.test.js` | Painel Next | 19 | 30 | `frontend/features/queues/queue-reward-settings.mjs` | **A** |  |
| `unit/next-queue-settings-form.test.jsx` | Painel Next | 2 | 959 | `frontend/features/queues/queue-settings-form.jsx`, `shared/browser/translate-catalog.mjs` +1 | **A** |  |
| `unit/next-queue-settings-recovery.test.jsx` | Painel Next | 1 | 968 | `frontend/lib/api/client.mjs`, `frontend/features/panel-shell/panel-provider.jsx` +1 | **A** |  |
| `unit/next-queue-settings.test.js` | Painel Next | 22 | 28 | `frontend/features/queues/queue-settings.mjs` | **A** |  |
| `unit/next-root-layout-hydration.test.js` | Painel Next | 2 | 5 | `frontend/app/(panel)/layout.jsx`, `frontend/app/(overlay)/layout.jsx` | **A** |  |
| `unit/next-runtime-config.test.js` | Ferramentas de dev | 5 | 15 | `frontend/scripts/next-runtime-config.mjs` | **A** |  |
| `unit/next-settings-route.test.js` | Painel Next | 1 | 3 | — | **A** |  |
| `unit/next-widgets-page.test.jsx` | Painel Next | 23 | 7784 | `frontend/features/widgets/widgets-page-content.jsx`, `frontend/lib/i18n/panel-catalogs.mjs` | **A** |  |
| `unit/obs-websocket-auth.test.js` | Helpers de teste / governança | 1 | 4 | — | **A** | Helper de `tests/e2e/overlay-browser.mjs` |
| `unit/opengrep-quality-gate.test.js` | Helpers de teste / governança | 1 | 10 | — | **F** | Vigente (decisão do proprietário sobre OpenGrep) |
| `unit/outbox-loop.test.js` | Workers de outbox | 2 | 71 | `api/src/outbox/loop.mjs` | **A** |  |
| `unit/overlay-projection-service.test.js` | Domínio | 4 | 25 | `api/src/domain/overlay-projection-service.mjs` | **A** |  |
| `unit/overlay-renderer.test.js` | Painel compartilhado (usado pelo Next) | 13 | 40 | `shared/panel/overlay-renderer.mjs` | **A** |  |
| `unit/overlay-routes.test.js` | API HTTP | 5 | 297 | `api/src/http/local-session.mjs`, `api/src/http/overlay-routes.mjs` | **A** |  |
| `unit/overlay-widget-form.test.js` | Painel compartilhado (usado pelo Next) | 4 | 16 | `shared/panel/overlay-widget-form.mjs` | **A** |  |
| `unit/overlay-widget-policy.test.js` | Domínio | 5 | 17 | `api/src/domain/overlay-widget-policy.mjs` | **A** |  |
| `unit/overlay-widget-service.test.js` | Domínio | 4 | 18 | `api/src/domain/overlay-widget-service.mjs` | **A** |  |
| `unit/panel-catalog-placeholders.test.js` | Painel compartilhado (usado pelo Next) | 6 | 39 | `shared/panel/panel-catalog.mjs`, `shared/browser/translate-catalog.mjs` | **A** |  |
| `unit/panel-confirmation-contract.test.js` | Painel vanilla | 11 | 49 | `web/panel-confirmation.mjs` | **B** | Parcialmente portado (`next-panel-class1-parity`: sem `confirm()`, textos). Falta portar: falhar fechado quando o diálogo não abre, dupla confirmação com sync incerto |
| `unit/panel-error-presentation.test.js` | Painel vanilla | 4 | 11 | `web/panel-error-presentation.mjs` | **C** | Coberto pelos testes de erro do Next |
| `unit/panel-navigation.test.js` | Painel compartilhado (usado pelo Next) | 6 | 19 | `shared/panel/panel-navigation.mjs` | **A** |  |
| `unit/pending-queue-reward-compatibility.test.js` | Integração Twitch | 4 | 29 | `api/src/twitch/pending-queue-reward-compatibility.mjs` | **A** |  |
| `unit/png-alpha.test.js` | Helpers de teste / governança | 2 | 11 | — | **A** | Helper de `tests/e2e/overlay-browser.mjs` |
| `unit/port-denylist-validation.test.js` | Infra / instalador / release | 2 | 3643 | `infra/scripts/validate-port-denylist.mjs` | **A** | Varre o checkout inteiro (~3,6 s); única aplicação na CI da denylist de portas (a CI não roda `validate:port-denylist`) |
| `unit/priority-labels.test.js` | Painel vanilla | 5 | 9 | `web/priority-labels.mjs` | **D** | `apps/web/priority-labels.mjs` não tem nenhum importador (saiu do `app.js` na FND-8, a906756) |
| `unit/prisma-dependency-security.test.js` | Helpers de teste / governança | 2 | 8 | — | **F** | Pin de dependência vigente |
| `unit/quality-script-contract.test.js` | Helpers de teste / governança | 1 | 5 | — | **F** | Scripts vigentes |
| `unit/queue-action-state.test.js` | Painel compartilhado (usado pelo Next) | 13 | 25 | `shared/panel/queue-action-state.mjs` | **A** |  |
| `unit/queue-confirmation-copy.test.js` | Painel compartilhado (usado pelo Next) | 3 | 5 | `shared/panel/queue-confirmation-copy.mjs` | **A** |  |
| `unit/queue-domain-service.test.js` | Domínio | 7 | 32 | `api/src/domain/queue-service.mjs` | **A** |  |
| `unit/queue-keys.test.js` | Domínio | 28 | 21 | `api/src/domain/queue-keys.mjs` | **A** |  |
| `unit/queue-onboarding-flow.test.js` | Painel vanilla | 4 | 9 | `web/queue-onboarding-flow.mjs` | **C** | Era classe 1; portado em 2026-10-21 (`next-queue-onboarding`, `getQueueSettingsFeedback`) |
| `unit/queue-routes.test.js` | API HTTP | 165 | 2928 | `api/src/http/local-session.mjs`, `api/src/http/queue-routes.mjs` +4 | **A** |  |
| `unit/queue-settings-version.test.js` | Painel compartilhado (usado pelo Next) | 2 | 6 | `shared/panel/queue-settings-version.mjs` | **A** |  |
| `unit/queue-sync-status.test.js` | Painel compartilhado (usado pelo Next) | 2 | 5 | `shared/panel/queue-sync-status.mjs` | **A** |  |
| `unit/queue-transition-boundary.test.js` | PostgreSQL / persistência | 1 | 16 | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `unit/readme-structure.test.js` | Helpers de teste / governança | 7 | 34 | — | **F** | Vigente (checagem de links quebrados) |
| `unit/release-notes.test.js` | Infra / instalador / release | 4 | 15 | `infra/scripts/create-release-notes.mjs` | **A** |  |
| `unit/reward-dialog-contract.test.js` | Painel vanilla | 2 | 7 | — | **B** | Botão fechar portado; "espaço responsivo do diálogo" não portado |
| `unit/reward-link-dialog.test.js` | Painel compartilhado (usado pelo Next) | 4 | 29 | `shared/panel/reward-link-dialog.mjs` | **A** |  |
| `unit/reward-outbox-worker.test.js` | Workers de outbox | 29 | 101 | `api/src/outbox/reward-worker.mjs` | **A** |  |
| `unit/runtime-composition.test.js` | API HTTP | 5 | 314 | `api/src/runtime.mjs`, `api/src/health-route.mjs` | **A** |  |
| `unit/safe-http-error-handler.test.js` | API HTTP | 1 | 220 | `api/src/http/safe-http-error-handler.mjs` | **A** |  |
| `unit/setup-messages.test.js` | Painel compartilhado (usado pelo Next) | 44 | 44 | `shared/panel/setup-messages.mjs` | **A** |  |
| `unit/shared-panel-boundary.test.js` | Fronteira de arquitetura | 4 | 135 | — | **A** | Fronteira de arquitetura; partes do vanilla mudam no cutover |
| `unit/structured-logger.test.js` | Observabilidade | 5 | 19 | `api/src/observability/structured-logger.mjs` | **A** |  |
| `unit/test-discovery-contract.test.js` | Helpers de teste / governança | 1 | 5 | — | **F** | Include do Vitest vigente |
| `unit/twitch-adapter.test.js` | Integração Twitch | 23 | 46 | `api/src/twitch/helix-adapter.mjs` | **A** |  |
| `unit/twitch-auth-runtime.test.js` | Integração Twitch | 11 | 97 | `api/src/twitch/auth-runtime.mjs` | **A** |  |
| `unit/twitch-event-processor.test.js` | Integração Twitch | 4 | 27 | `api/src/twitch/redemption-processor.mjs` | **A** |  |
| `unit/twitch-integration.test.js` | Integração Twitch | 23 | 203 | `api/src/twitch/integration.mjs`, `api/src/twitch/credential-fingerprint.mjs` | **A** |  |
| `unit/twitch-oauth.test.js` | Integração Twitch | 8 | 21 | `api/src/twitch/oauth.mjs` | **A** |  |
| `unit/twitch-reconciliation.test.js` | Integração Twitch | 26 | 145 | `api/src/twitch/reconciliation.mjs` | **A** |  |
| `unit/twitch-route-integration-proxy.test.js` | Integração Twitch | 1 | 11 | `api/src/twitch/route-integration-proxy.mjs` | **A** |  |
| `unit/uid.test.js` | Domínio | 11 | 13 | `api/src/domain/uid.mjs` | **A** |  |
| `unit/vanilla-fulfillment-feedback.test.js` | Painel vanilla | 2 | 6 | — | **C** | Coberto por `next-queue-entry-actions` |
| `unit/version-policy.test.js` | Infra / instalador / release | 11 | 12 | — | **A** |  |
| `unit/web-application-setup.test.js` | Painel vanilla | 2 | 15 | `web/application-setup.mjs`, `web/panel-error-presentation.mjs` | **B** | Era classe 2 com ressalva. Nenhum teste Next de que a mensagem bruta Twitch/backend nunca aparece na validação de credenciais |
| `unit/web-route-vanilla-modules.test.js` | Painel vanilla (servido pelo Fastify) | 2 | 236 | `api/src/web-route.mjs` | **C** | Serve o grafo de módulos do vanilla (S-03); fora da auditoria preliminar |
| `unit/web-route.test.js` | Painel vanilla (servido pelo Fastify) | 10 | 405 | `api/src/web-route.mjs` | **B** | Misto: 2 casos API-only/ESM compartilhado ficam; 8 casos de `/`, `/app.js`, páginas vanilla caem com o vanilla |
| `unit/windows-installer-first-run.test.js` | Infra / instalador / release | 11 | 25 | — | **A** |  |
| `unit/windows-native-contract.test.js` | Ferramentas de dev | 8 | 30 | `frontend/scripts/dev-database.mjs`, `frontend/scripts/dev-preflight.mjs` | **A** |  |
| `unit/with-timeout.test.js` | Helpers de teste / governança | 2 | 16 | — | **A** | Helper de `tests/e2e/overlay-browser.mjs` |
| `integration/codespaces-contract.test.js` | Helpers de teste / governança | ≥3 | pendente | — | **F** | `.devcontainer/` existe; vigente. Sem Docker |
| `integration/command-policy-persistence.test.js` | PostgreSQL / persistência | ≥4 | pendente | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `integration/command-policy-v3-migration.test.js` | PostgreSQL / persistência | ≥2 | pendente | `api/src/persistence/queue-repository.mjs` | **A** |  |
| `integration/compose-contract.test.js` | Infra / instalador / release | ≥12 | pendente | — | **A** |  |
| `integration/compose-runtime.test.js` | Infra / instalador / release | ≥6 | pendente | — | **A** | Caso em :372 afirma `/` vanilla (temporário); inverter no cutover. Stack Compose completo |
| `integration/container-publish-contract.test.js` | Infra / instalador / release | ≥5 | pendente | — | **F** | Contrato vigente do `main-cd.yml`. Sem Docker |
| `integration/localization-catalog-bundle.test.js` | Localização | ≥4 | pendente | `shared/localization/discover-catalog-bundle.mjs` | **A** |  |
| `integration/localization-catalog-discovery.test.js` | Localização | ≥5 | pendente | `shared/localization/discover-catalog-module.mjs` | **A** |  |
| `integration/localization-catalog-route.test.js` | Localização | ≥6 | pendente | `api/src/http/local-session.mjs`, `api/src/http/localization-routes.mjs` | **A** |  |
| `integration/localization-validator-cli.test.js` | Localização | ≥2 | pendente | — | **A** |  |
| `integration/next-static-export.test.js` | Painel Next | ≥1 | pendente | — | **E** | Roda `next build` completo; o job `container-build` da CI compila o mesmo frontend dentro da imagem. Asserções únicas; custo de build duplicado. Nome obsoleto (não há static export) |
| `integration/overlay-widget-repository.test.js` | PostgreSQL / persistência | ≥13 | pendente | `api/src/persistence/overlay-widget-repository.mjs`, `api/src/persistence/queue-repository.mjs` | **A** |  |
| `integration/panel-localization-contract.test.js` | Localização | ≥22 | pendente | `shared/localization/discover-catalog-module.mjs` | **B** | Misto 1/2 (auditoria preliminar). Anel de foco e empilhamento mobile ainda exigem validação em navegador |
| `integration/postgres-foundation.test.js` | PostgreSQL / persistência | ≥3 | pendente | — | **A** |  |
| `integration/product-locale-projection.test.js` | Infra / instalador / release | ≥3 | pendente | `infra/src/product-locale-projection.mjs` | **A** |  |
| `integration/qra-postgres-fixtures.test.js` | PostgreSQL / persistência | ≥6 | pendente | `api/src/domain/queue-service.mjs`, `api/src/domain/clear-confirmation.mjs` +3 | **A** |  |
| `integration/queue-repository-chat.test.js` | PostgreSQL / persistência | ≥3 | pendente | `api/src/persistence/queue-repository.mjs`, `api/src/domain/queue-service.mjs` | **E** | Prisma mockado (`vi.fn`) na pasta de integração; é teste de unidade. Prova em PG real está em `queue-repository.test.js` (:1005-1064) |
| `integration/queue-repository.test.js` | PostgreSQL / persistência | ≥144 | pendente | `api/src/domain/queue-service.mjs`, `api/src/domain/queue-keys.mjs` +5 | **A** |  |
| `integration/tombstone-index-plan.test.js` | PostgreSQL / persistência | ≥1 | pendente | — | **A** |  |
| `integration/unified-installer.test.js` | Infra / instalador / release | ≥4 | pendente | — | **A** |  |
| `integration/version-cli.test.js` | Infra / instalador / release | ≥5 | pendente | — | **A** |  |
