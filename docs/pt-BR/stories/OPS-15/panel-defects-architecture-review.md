# OPS-15 — Revisão de arquitetura dos defeitos D-1..D-7 do painel (bateria real de 2026-10-26)

[English](../../../stories/OPS-15/panel-defects-architecture-review.md)

- **Autoria:** @architect (Aria), 2026-10-26. Análise de código somente leitura: nenhum código, teste ou configuração foi alterado, e nenhuma operação de servidor, Docker, teste, GitHub ou Twitch foi executada.
- **Entradas:** `live-battery-2026-10-26-results.md`, `story.md`, o código citado abaixo e a documentação do Next.js 16 (Linking and Navigating).
- **Índice de pesquisa:** nenhuma nota existente cobre atualização de dados e navegação do painel (LACUNA). Consultei um documento oficial (abaixo). As causas remotas de D-5/D-6 continuam com o @analyst.
- **Rótulos:** VERIFIED = lido no código ou na documentação; PARTIAL = código lido, mas sem reproduzir em execução; UNVERIFIED = inferência que ainda precisa de teste.

## 1. D-7 — "as páginas não se atualizam dinamicamente"

### Achados

| # | Achado | Evidência | Rótulo |
|---|---|---|---|
| F1 | Não há export estático, Server Actions nem cache de `fetch`/`revalidate`. A configuração do Next só define rewrites e `trailingSlash`. Todo dado do painel é buscado **no cliente** via `apiClient.request`. | `apps/frontend/next.config.mjs:1-3`, `apps/frontend/scripts/next-runtime-config.mjs:3-20`, `features/panel-shell/panel-provider.jsx:45-67` | VERIFIED |
| F2 | O snapshot completo (`/api/state`, `/api/setup`, `/api/queues`, `/health`) é carregado **uma única vez**, na montagem. | `panel-provider.jsx:45-67`, `load-panel-snapshot.mjs:2-24` | VERIFIED |
| F3 | Só há polling na Visão geral (5 s, com a aba visível) e em Operações (laço próprio de 5 s). Filas, Nova fila, Widgets, Comandos, Configurações e Conexão nunca se atualizam sozinhas. | `panel-shell.jsx:44-57` (`if (activePage !== 'overview' …) return`), `operations/operations-page-content.jsx:111-124` | VERIFIED |
| F4 | O painel vanilla atualizava **tudo a cada 5 s**, em todas as páginas, e os catálogos a cada 30 s. | `apps/web/app.js:1169`, `refresh()` em `apps/web/app.js:759` | VERIFIED |
| F5 | A story OPS-15 exige paridade de "cadência/semântica de polling existente" e diz que "o polling limitado permanece; esta story não introduz WebSocket no painel". | `docs/stories/OPS-15/story.md:44`, `:105` (AC 7) | VERIFIED |
| F6 | A navegação usa `<a href>` comum (barra lateral, "Abrir filas", "Cancelar"), e o `PanelProvider` é montado **dentro de cada página** (`page.jsx → PanelRoot → PanelShell → PanelProvider`), não em `(panel)/layout.jsx`. Toda navegação recarrega o documento inteiro, descarta o estado e busca o snapshot de novo. Segundo a documentação do Next, `<Link>` faz transição no cliente e mantém os layouts compartilhados, e `<a>` faz carregamento completo. | `panel-shell.jsx:62-76`, `new-queue-form.jsx:114,120`, `app/(panel)/queues/page.jsx:1-13`, `app/(panel)/layout.jsx:1-12` | VERIFIED |
| F7 | A API não tem SSE nem WebSocket. O próprio overlay faz polling a cada 1 s. | nenhum `text/event-stream`/`WebSocket` em `apps/api/src`; `apps/shared/panel/overlay-renderer.mjs:122,176` | VERIFIED |
| F8 | As mutações já recarregam a projeção de filas depois (`loadQueueProjection` após cada ação), então a ação da própria pessoa operadora aparece. O que falta são as mudanças **externas** (resgates, chat, workers). | `panel-provider.jsx:144,263,308,341,367,451` | VERIFIED |

### Causa raiz

O que é real: o painel Next perdeu o **polling global de 5 s** do vanilla (F3/F4), uma regressão de paridade contra o AC 7. O que não é real: nada "desligou o Next.js", porque não há export estático nem cache de dados (F1). A sensação de "Next" também falta porque a navegação usa `<a>` e o provider fica em cada página (F6): cada clique recarrega tudo e não existe estado compartilhado no cliente para manter atualizado. Não há canal de push para reaproveitar (F7), e a story exclui explicitamente WebSocket no painel.

## 2. D-3 / D-4 — navegação e mensagens depois de excluir ou criar

### D-4 (criação)

- `createQueue` guarda o retorno em `queueCreation` e devolve um booleano. Nunca navega. `panel-provider.jsx:446-471`. VERIFIED.
- O mapeamento de retorno já distingue `created_local` / `created_remote` / `pending` (`pending_create`) / `review` / `recovered` / `refresh_failed` / `uncertain`. `features/queues/queue-creation.mjs:120-131`. VERIFIED.
- O formulário mostra o retorno e um `<a href="/queues/">` comum, "Abrir filas". `new-queue-form.jsx:117-120`. VERIFIED.
- **Não existe rota por fila**: `/queues` lista todas as filas, e cada cartão tem o id `queue-title-<id>` (`queue-list.jsx:342`). Para "ir para a fila criada" é preciso decidir o destino: âncora ou `?queue=<id>` em `/queues` (sem rota nova) ou uma nova rota `/queues/[id]`. VERIFIED (ausência).

### D-3 (exclusão)

- O aviso de exclusão é um `useState` **dentro de `QueueLifecycleActions`**, renderizado em cada cartão de fila (`queue-lifecycle-actions.jsx:53`, `queue-list.jsx:356`). Depois do resultado `deleted`, o provider recarrega a projeção (`panel-provider.jsx:307-311`), a fila some, o cartão é **desmontado** e o aviso "excluída" se perde junto. Não há navegação. VERIFIED no código; a observação em execução bate com a bateria. A ordem exata de renderização é PARTIAL.
- `delete` devolve `pending` ou `deleted` (`queue-lifecycle.mjs:70-71`). No caso `pending`, o cartão continua (`lifecycleStatus: 'deleting'`) e mostra o alerta, mas nunca é atualizado depois, por causa do D-7. VERIFIED.

### O que falta

1. Uma **mensagem de resultado no nível da página (ou do provider)** que sobreviva à desmontagem e à navegação, numa região viva persistente com `role="status"` (não dentro de cada cartão).
2. **Roteamento depois da ação** com `router.replace`/`router.push` de `next/navigation`, decidido pelo resultado:
   - criação `confirmed`/`pending`/`review` → ir para `/queues` com foco na fila criada. Quando a fila não estiver `synced`, a mensagem deve dizer "aguardando confirmação da Twitch" (nunca prometer sucesso remoto).
   - criação `uncertain`/`refresh_failed` → permanecer na página com o texto de recuperação atual.
   - exclusão `deleted` → mensagem "excluída" e ida para `/queues`, ou para `/new-queue` quando não restar fila não arquivada.
   - exclusão `pending` → permanecer na fila com "exclusão pendente" (não "excluída") e deixar o polling transformar isso em "excluída" (ou no estado bloqueado do D-6) quando o worker terminar.

## 3. Desenho único proposto (D-3 + D-4 + D-7)

**Uma camada de dados compartilhada no cliente + um canal de resultado + navegação do Next.** Sem dependência nova e sem WebSocket (respeita `story.md:44`).

1. **Levar `PanelProvider` (e `PanelShell`) para `app/(panel)/layout.jsx`** por meio de um componente cliente. As páginas passam a renderizar só o conteúdo, e os `<a>` da barra lateral e dos textos viram `<Link>` de `next/link`. Assim o estado e o polling sobrevivem à navegação (transições no cliente do Next, VERIFIED na documentação). Risco: `activePage` precisa vir de `usePathname()`, e o carregamento do catálogo de fallback, hoje em cada `page.jsx`, passa para o layout.
2. **Um único agendador de polling no provider** (`usePanelLiveRefresh`): roda `loadPanelRuntimeSnapshot` em todas as páginas do painel. Detalhes:
   - 5 s com a aba visível (paridade com o vanilla, F4) e atualização imediata em `visibilitychange`/`focus`;
   - uma requisição por vez (o `refreshInFlight` já existe);
   - backoff após falhas seguidas (5 → 10 → 30 s, voltando a 5 s no primeiro sucesso);
   - pausa enquanto uma mutação está em `saving` ou um diálogo de confirmação está aberto;
   - **nunca sobrescreve campos de formulário com foco**: os formulários guardam rascunho local, e as projeções alimentam só as partes de leitura.

   Os timers próprios da Visão geral e de Operações saem. Operações passa a seguir o mesmo ciclo (ou mantém o próprio endpoint, mas usa o agendador compartilhado).
3. **Cadência mais rápida enquanto há algo pendente**: se a projeção tiver status `pending_create`, `deleting`, `pending_*` ou operações não resolvidas, o polling vai para 2 s por uma janela limitada (por exemplo, 60 s) e depois volta para 5 s. É assim que "pendente → sincronizada" e "exclusão pendente → excluída" aparecem sem recarregar a página.
4. **Canal de resultado das mutações**: um `panelOutcome` no provider, `{ kind, status, key, values, referenceId, target }`, renderizado uma única vez pelo shell numa região viva persistente (`role="status"`, `aria-live="polite"`; erros com `role="alert"`). Ele é limpo na próxima ação ou após um tempo. Os avisos locais dos cartões continuam como contexto, mas a mensagem oficial passa a ser esta.
5. **Roteador pós-ação**: uma função pura `resolvePostActionRoute(outcome, projection)` (fácil de testar) que devolve `{ href, focusId } | null`. O provider ou a página chama `router.replace` e leva o foco ao título de destino (`queue-title-<id>` ou o `h1` da página).
6. **Reconciliação dos resultados pendentes**: quando o polling percebe que uma fila `pending` virou `synced`, ou que uma fila em `deleting` saiu da projeção, o `panelOutcome` é atualizado ("confirmada pela Twitch" / "excluída"). É o mesmo padrão de reconciliação que já existe em `refreshQueueProjection` (`panel-provider.jsx:221-234`).

Trade-offs:
- **(A) este desenho:** baixo risco, paridade com o vanilla, sem mudança no backend, cerca de 12 requisições por minuto por aba aberta (igual ao vanilla).
- **(B) SSE no Fastify:** tempo real, mas exige endpoint novo e revisão de sessão, CSRF e rewrite do proxy, e está explicitamente fora do escopo da OPS-15.
- **(C) SWR/TanStack Query:** deduplicação e revalidação no foco já maduras, mas trazem dependência nova e exigem refatorar todos os hooks.

Recomendação: **A agora**. B fica como story futura se o proprietário quiser atualização em menos de um segundo.

Arquivos a tocar (A):
- `app/(panel)/layout.jsx`, `app/(panel)/*/page.jsx`, `app/(panel)/panel-root.jsx`;
- `features/panel-shell/panel-shell.jsx`, `features/panel-shell/panel-provider.jsx`, mais os novos `live-refresh.mjs` e `post-action-route.mjs`;
- `features/operations/operations-page-content.jsx`;
- `features/queues/new-queue-form.jsx`, `new-queue-page-content.jsx`, `queue-lifecycle-actions.jsx`, `queue-list.jsx`;
- catálogos de localização (en/pt-BR/es) para as chaves novas.

Riscos:
- perda de foco ou de rascunho durante o polling (mitigado pelo item 2);
- requisições duplicadas se Operações mantiver o próprio timer;
- o grupo de rotas do overlay não pode herdar o provider do painel (o layout separado `(overlay)` já existe; deve ser mantido);
- testes E2E que contavam com recarga completa.

Testes:
- **Unitários (Vitest):**
  - `resolvePostActionRoute` cobrindo todos os resultados de criação e exclusão, inclusive "última fila → `/new-queue`";
  - agendador (visibilidade, backoff, pausa durante `saving`, janela de cadência rápida) com timers falsos.
- **E2E somente em navegador (fixtures Chromium):**
  - criar fila manual → chega em `/queues` com foco e mensagem de status;
  - criar fila de Pontos do Canal pendente → mensagem "pendente" e depois "confirmada" quando a fixture muda o status, sem recarregar;
  - excluir → "excluída" e redirecionamento;
  - excluir a última fila → `/new-queue`;
  - exclusão pendente → permanece e depois se atualiza;
  - entrada externa nova aparece em até 6 s;
  - navegar pela barra lateral não recarrega o documento (verificar que um marcador em `window` sobrevive);
  - digitar nas configurações não é sobrescrito por um polling.

UX (@ux-design-expert, nota ≥ 9,0 antes de implementar):
- texto de cada resultado;
- posição da região viva;
- alvo do foco depois do redirecionamento;
- redirecionar automaticamente ou oferecer a ação;
- redação de "pendente" vs "excluída";
- indicador de atualização ("atualizado há n s") em todas as páginas.

## 4. D-1 e D-2

### D-1 — `!<fila> limpar CONFIRMAR`

- O parser aceita o rótulo de confirmação localizado sem diferenciar caixa nem acento (`apps/api/src/commands/parser.mjs:22-24,35,86`). O handler compara `args[0] === 'confirmar'` literalmente (`apps/api/src/commands/chat-handler.mjs:266`). Qualquer outra caixa, e **qualquer** idioma diferente de pt-BR (o rótulo em `en` não é `confirmar`), cai em `request()` e repete a prévia. VERIFIED.
- Correção mínima: como o parser já garante que `limpar` tem 0 argumentos ou exatamente o rótulo de confirmação, o handler deve decidir por `args.length === 1`. Mais limpo ainda: o parser devolve `confirm: true` e o handler usa esse campo. Nada de comparação literal no handler.
- Testes primeiro (precisam falhar hoje): parser + handler com `CONFIRMAR`, `Confirmar`, `confirmár` e com o idioma `en` (`!q clear confirm`) → `clearConfirmation.confirm` chamado uma vez. Minúsculas continuam funcionando, e qualquer outra palavra continua sendo `INVALID_SYNTAX`.

### D-2 — `(posição ?)`

- `claimNextChatNotification` devolve `callPosition` **no nível da tarefa** (`apps/api/src/persistence/queue-repository.mjs:1017`), mas o worker lê `entry.callPosition` (`apps/api/src/outbox/chat-worker.mjs:29`). O valor fica sempre `undefined` e vira `'?'`. VERIFIED.
- Segunda causa: mesmo `task.callPosition` seria `null`, porque a chamada grava `position: null` (`queue-repository.mjs:1108`). A posição original só fica no `safeDetail.previousPosition` da auditoria (`:1110`) e no resultado da transição (`previousPosition`, `:1112,1143`). VERIFIED.
- Também: o caminho do chat monta `messageText` antes e passa `message` para `enqueueCallNotification`, que ignora esse campo (`chat-handler.mjs:207-208`, `queue-repository.mjs:942-949`); o worker monta a mensagem de novo. É código morto, não é bug. VERIFIED.
- Correção mínima (sem DDL): gravar `{ previousPosition }` no `payload` que já existe na outbox no momento do enfileiramento (os chamadores em `http/queue-routes.mjs:613,619` e `chat-handler.mjs:208` têm esse valor), devolvê-lo no claim e fazer o worker ler o valor da tarefa. Para linhas antigas, usar como fallback a consulta à auditoria que já existe em `queue-repository.mjs:387-391`. Confirmar com o @data-engineer que o JSON `outbox.payload` é o lugar certo (não se espera migration).
- Testes primeiro:
  - unitário do worker com uma tarefa reivindicada que traz a posição → a mensagem contém `1`;
  - integração em PostgreSQL: chamar uma entrada na posição 1 pelo painel e pelo chat → a tarefa reivindicada tem posição 1;
  - linha antiga com `payload: {}` → usa o fallback da auditoria.

## 5. Máquina de estados financeira (só o desenho de D-5/D-6)

### Desenho atual

- `financial-worker.mjs` verifica o estado remoto antes e depois de `setRedemptionStatus`. Vira `unknown` em 404, em status não reconhecido e quando a leitura após a escrita não é conclusiva (`:59-61,85-88,111-113,134-141`). VERIFIED. **A regra "unknown nunca vira confirmação" se mantém.** VERIFIED.
- `claimNext` só reivindica `pending`/`retry` (e leases expirados) (`queue-repository.mjs:2123-2129`). `unknown` é **terminal**: sem retentativa, sem backoff e sem nova verificação periódica. VERIFIED.
- A exclusão de fila (`outbox/reward-worker.mjs:288-300`) transforma qualquer bloqueio ou conflito em `unknown('queue_deletion_financial_conflict')`. Basta um resgate `unknown` para travar a exclusão para sempre. VERIFIED.
- A reconciliação relê os resgates não resolvidos, mas só importa e marca; em 404 também marca `unknown` (`twitch/reconciliation.mjs:122-140,155-176`). Ela não reativa as tarefas da outbox. VERIFIED.
- Existe um caminho manual: `POST /api/operations/:operationId/resolve-unknown` → `resolveUnknownFinancialOperation` (`http/queue-routes.mjs:274-276`, `queue-repository.mjs:2246+`). PARTIAL (não li toda a semântica do resultado).
- O motivo de a Twitch devolver 404 ou estado não conclusivo para `redemption.fulfill` é UNVERIFIED e está com o @analyst.

### Política de recuperação proposta

1. **Separar `unknown` em motivos com retentativa e motivos terminais.**
   - `remote_state_unavailable` vindo de leitura transitória (5xx, timeout, status não conclusivo) → `retry` com o backoff exponencial + jitter que já existe, com teto (por exemplo, 8 tentativas ou 24 h). Só depois do teto vira `unknown` (precisa de revisão).
   - 404 num resgate que a reconciliação também não enxerga → `unknown` imediato.
   - 401 continua `blocked_auth` e é reativado automaticamente depois de uma reautorização bem-sucedida.
2. **Nova verificação periódica dos `unknown`** na reconciliação (por exemplo, a cada 15 min, em lote limitado), com `getRedemptionStatus` só de leitura:
   - remoto igual ao esperado → confirmar;
   - `UNFULFILLED` → voltar para `pending` (escrever de novo);
   - estado oposto → `conflict`.

   Nunca confirmar sem leitura remota positiva.
3. **Ordem na exclusão da fila:** (a) pausar a recompensa; (b) cancelar ou cumprir cada resgate aberto e esperar a confirmação; (c) só então excluir a recompensa. Itens `unknown` bloqueiam o passo (b), mas são reverificados pelo item 2 em vez de congelar a fila. A fila mostra "exclusão bloqueada: N operações precisam de revisão", com link para Operações.
4. **Caminho manual claro:** Operações lista os itens que bloqueiam, com três decisões explícitas da pessoa operadora:
   - "tentar de novo agora";
   - "verifiquei na Twitch: reembolsado/cumprido" (auditado, com autor e horário, nunca automático);
   - "cancelar exclusão".

   O painel deve explicar que a exclusão continua depois da resolução.
5. **Observabilidade:** registrar em log, por tentativa, `{ operationType, outboxId, attempt, httpStatus, twitchErrorCode(≤64), nextAttemptAt }`, sem corpo do resgate, id/login de usuário, tokens ou headers. A saúde fica `twitch_rewards: degraded` só enquanto houver itens com retentativa, e `needs_review` enquanto houver itens terminais.

### Data engineer

O @data-engineer precisa avaliar se guardar `unknownSince`, um contador de teto de retentativas e uma classe/motivo distinta exige migration ou cabe nos campos `attempts`/`lastError`/`nextAttemptAt`/`payload` que a `outbox` já tem. O arquiteto não desenha DDL aqui.

## 6. Fatias (prioridade / dificuldade)

| Fatia | Conteúdo | Prioridade | Dificuldade | Depende de | Responsáveis |
|---|---|---|---|---|---|
| S-A | D-1: normalização da confirmação | P1 | XS | — | @dev, @qa |
| S-B | D-2: posição da chamada via payload da outbox + fallback | P1 | S | OK do @data-engineer (não se espera DDL) | @dev, @data-engineer, @qa (PostgreSQL) |
| S-C | Provider no layout compartilhado + `<Link>` + agendador global de polling (D-7) | P1 | M | Plano de UX ≥ 9,0 | @ux-design-expert, @dev, @qa (navegador) |
| S-D | Canal de resultado + roteamento pós-ação (D-3/D-4) | P1 | M | S-C | @ux-design-expert, @dev, @qa |
| S-E | Cadência rápida durante pendências e reconciliação dos resultados | P2 | S | S-C, S-D | @dev, @qa |
| S-F | Política de recuperação financeira (unknown com retentativa, reverificação, ordem da exclusão, caminho manual, logs) | P1 (bloqueia a exclusão) | L | Nota do @analyst sobre D-5/D-6, @data-engineer, UX do caminho manual | @architect, @data-engineer, @dev, @qa |
| S-G (opcional) | Canal de push via SSE | P3 | L | Decisão do proprietário; fora do escopo da OPS-15 | — |

Cada fatia precisa de uma issue no GitHub criada pelo @devops antes da implementação. O @qa roda os gates finais (`lint`, `typecheck`, `test`, localização, versão, denylist de portas, `review:static`) e o E2E em navegador. O @devops só comita o que o @qa liberar.

## 7. Decisões do proprietário

1. Aceitar polling (paridade com o vanilla: 5 s, ou 2 s enquanto houver pendência) em vez de SSE/WebSocket na OPS-15? (Recomendado: sim.)
2. "Ir para a fila criada": âncora ou `?queue=<id>` em `/queues` (recomendado) ou uma nova rota `/queues/[id]`?
3. Depois da exclusão: redirecionamento automático (recomendado, com mensagem de status persistente) ou um botão "ir para a lista"?
4. Recuperação financeira: qual o teto/janela de retentativa para `unknown`, e a pessoa operadora pode declarar uma resolução manual ("verificado na Twitch")?
5. A S-F fica dentro da OPS-15 ou vira story separada (ela muda a semântica do worker)?

## Fontes

- Documentação do Next.js, Linking and Navigating (transições no cliente vs `<a>`): https://nextjs.org/docs/app/getting-started/linking-and-navigating (VERIFIED, lastUpdated 2026-09-09).
- Código do repositório e story conforme citados (VERIFIED). O comportamento em execução além do relatório da bateria não foi reproduzido (PARTIAL/UNVERIFIED conforme marcado).
