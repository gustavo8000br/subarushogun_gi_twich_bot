# OPS-22 — plano de testes do `@qa` para o pacote único (FT-25, FT-26, FT-36, FT-23)

[English](../../../stories/OPS-22/qa-test-plan.md)

**Autor:** `@qa` (Quinn), 2026-11-04. **Natureza:** SOMENTE PLANO. Nenhum teste foi escrito nem executado, nenhum código, catálogo ou estilo mudou, nenhum Docker ou navegador foi iniciado. Todos os nomes de arquivo abaixo são **prováveis** (a criar ou estender pelo `@dev`); os nomes dos testes são o contrato, os arquivos podem mudar.
**Entradas:** [story](story.md) (CA 1-22), [po-validation](po-validation.md), [architect-review-ft36](architect-review-ft36.md) (F15-F24, D-36-1..8, seção 5 e o adendo do Orion), [data-review](data-review.md) (DATA §4, C3, C6), [ft-36-data-engineer-confirmation](ft-36-data-engineer-confirmation.md) (condições A-I, T36-9b, T36-14, T36-15, T-C3), [ux-plan-ft23-ft36](ux-plan-ft23-ft36.md) (UX-1..UX-15, R1-R8), [story da FT-23](../OPS-15/ft-23-navigation-and-messages.md) (#103, 12 critérios).
**Leitura do repositório usada (somente leitura):** layout de `tests/`, `tests/helpers/{isolated-postgres-image,isolated-postgres-cleanup,twurple-real-instances}.mjs`, `tests/helpers/ops15/qra-postgres-fixtures.mjs`, as suítes existentes citadas abaixo e os scripts do `package.json`.

## 1. Base e regras

1. **Classes são evidências separadas** e nenhuma substitui outra: unitário (Vitest, fakes/instâncias reais do Twurple), contrato (estático ou de formato), componente (Vitest + DOM), integração em **PostgreSQL isolado com migrations reais** (`isolated-postgres-image.mjs`, rótulo `queuebot.test=disposable`; nunca SQLite, nunca mocks do Prisma, nunca volume ativo), localização, Compose (só regressão), E2E só de navegador (Chromium, fixtures, sem Twitch), Twitch ao vivo (CA 19 / OW-16, reservado ao proprietário, fora deste plano).
2. **Corridas são testadas com duas conexões reais** (dois `PrismaClient`) e uma **barreira** antes de cada chamada, N = 50 rodadas, invariante lida do banco após cada rodada. **Sem `sleep` como sincronização.** O tempo é injetado (`clock`, timers falsos, `random` injetado).
3. **Test-first:** cada teste abaixo é escrito Red pelo `@dev` antes do código; o Red esperado hoje está na seção 2. O ponto de controle do `@dev` registra a saída Red e Green na story (não é commit).
4. **Decisão do Orion (2026-10-30)** muda o T36-5: o cancelamento é **permitido** quando a leitura somente de leitura de `cancel_verification` prova que a recompensa exata existe e está pausada, mesmo com `requestMayHaveReachedTwitch` verdadeiro; `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` vale **só** quando a leitura é inconclusiva ou negativa após uma tentativa de DELETE. As duas fixtures existentes (`tests/integration/qra-postgres-fixtures.test.js` ~457-488 e ~497-528) ficam inalteradas e devem continuar verdes. O novo T36-16 cobre o DELETE tardio.
5. **Legenda:** `U` unitário, `C` contrato, `K` componente, `PG` integração PostgreSQL, `L` localização, `E` E2E Chromium. Um ID = um teste nomeado (teste orientado a tabela com vários casos conta uma vez e diz isso).

## 2. Red esperado hoje (por que cada grupo falha antes do código)

| Grupo | Red hoje |
|---|---|
| FT-25 | Não há módulo de política, então `U25-01..06` falham no import; `PG25-03` falha (sem teto: a 6ª leitura inconclusiva não vira `unknown/attempts_exhausted`); `PG25-07`/`PG25-11` falham (`retryOutboxManually` mantém `attempts` e não grava `cycleStartAttempts`, `queue-repository.mjs:2237-2258`); `PG25-06`/`U25-13` falham (`markRedemptionUnknown` move tarefas `pending/retry/processing` para `unknown` sem guarda de lease); `U25-11` falha (não há linha `financial.attempt`). |
| FT-26 | `U26-01` falha (`reward-worker.mjs:316` ainda lê `lookupError?.status === 404`, então um `HttpStatusCodeError` real vira `unknown('queue_delete_result_unknown')`); `U26-03`/`PG26-01` falham (bloqueios transformam `reward.delete` em `unknown('queue_deletion_financial_conflict')` terminal); `PG26-04`/`PG26-05` falham (`resolved_manual` conta como bloqueio, `queue-repository.mjs:1741-1751`); `U26-06` falha (não há projeção `deletionState`/`blockingOperations`/`canCancelDeletion`). |
| FT-36 | `PG36-09` falha com `P2002` e rollback (F18, confirmado pelo `@data-engineer`); a variante 5xx do `PG36-01`, `PG36-12` e `U36-02` falham (verificação falha sempre grava `unknown`, `queue-repository.mjs:880`); `U36-01` falha para `QUEUE_DELETION_ALREADY_COMPLETED` (hoje há um ramo morto `200 already_deleted`) e `PAUSE_IN_PROGRESS`; `PG36-10` falha (pausa bloqueada não tem caminho de cancelamento, F19); `PG36-13` falha (sem `actorId` nas linhas de confirmação/falha, F22). |
| FT-23 | Componentes e módulos não existem (`post-action-route.mjs`, região de resultado, parser de URL): `U23-*`, `K23-*`, `C23-*` falham no import ou pela região `role` ausente; `L23-*` falham por chaves ausentes; `E23-*` falham porque o aviso é estado local do cartão. |

## 3. FT-25 (#98) — retry limitado, reverificação somente de leitura, resolução manual auditada (G1)

Arquivos: `tests/unit/financial-retry-policy.test.js` (novo), `tests/unit/financial-outbox-worker.test.js` (estender), `tests/unit/twitch-reconciliation.test.js` (estender), `tests/unit/queue-routes.test.js` (estender), `tests/integration/financial-retry-postgres.test.js` (novo), `tests/integration/queue-repository.test.js` (estender, blocos de corrida de claim existentes em ~:500, ~:673, ~:696).

| ID | Classe | Teste | CA |
|---|---|---|---|
| U25-01 | U | Esperas nominais após a tentativa n = `min(60 min, 60 s x 4^(n-1))` = 1, 4, 16, 60, 60 min | 6 |
| U25-02 | U | Jitter x0,8..x1,2 com `random` injetado em 0, 0,5 e 1: cada espera dentro dos limites | 6 |
| U25-03 | U | `next_attempt_at` não decrescente até o teto de 60 min numa varredura de valores aleatórios (não "estritamente crescente") | 6 |
| U25-04 | U | 6 tentativas contando a primeira; a 6ª leitura inconclusiva termina em `unknown` com `lastError = attempts_exhausted`; nenhuma claim adicional | 6, 8 |
| U25-05 | U | Orçamento = `attempts - (payload.cycleStartAttempts ?? 0)`, teto 6; chave ausente lê 0 (linha legada) | 6, 20 |
| U25-06 | U | "Tentar agora" calcula um ciclo novo de 6 (mais 6 leituras, não 1) e nunca reduz `attempts` | 20 |
| U25-07 | U | 401: vai a `unknown('authorization_required')` e `cycleStartAttempts = min(cycleStartAttempts + 1, attempts)` numa só decisão; invariante `0 <= cycleStartAttempts <= attempts` | 6, 20 |
| U25-08 | U | Um 404 numa **leitura** (`remote_state_unavailable`) NÃO é devolvido (resultado inconclusivo real) | 6 |
| U25-09 | U | A reverificação é somente de leitura: o Twitch falso registra zero chamadas de escrita (sem cancelar, sem cumprir) | 7 |
| U25-10 | U | Leitura positiva do estado esperado: `confirmed`; estado oposto: `conflict` existente; escrita guardada com 0 linhas: `lease_lost`, não erro | 7 |
| U25-11 | U | A linha `financial.attempt` tem exatamente `{event, operationType, outboxId, attempt, httpStatus, twitchErrorCode<=64, nextAttemptAt, outcome}`; textos canário em `error.message` (parecido com token, login) nunca aparecem em argumento de log | 10 |
| U25-12 | U | Projeção de saúde: itens com nova tentativa = `degraded`, terminais = `needs_review` | 8 |
| U25-13 | U | `markRedemptionUnknown` / reconciliação não toca mais linhas do outbox (repositório falso registra zero escritas no outbox) | lacuna 1 |
| C25-01 | C | Nomes do catálogo: `attempts_exhausted` e `financial.operation_retry_requested` existem; `retry_exhausted` e `financial.operation_retried_manually` não aparecem em lugar nenhum de `apps/` (varredura estática) | itens 1, 2 |
| C25-02 | C | Formato da rota/projeção de Operações: código do motivo, campo do efeito bloqueante, resolver devolve `remoteConfirmed:false`; todo não-2xx traz `code` enumerado; nenhum texto livre renderizado por contrato | 11, 18 |
| PG25-01 | PG | DATA 1 corrida de claim: dois clientes, barreira, 50 rodadas, exatamente uma linha devolvida, o perdedor recebe `null`, `attempts` +1 uma vez | 6 |
| PG25-02 | PG | DATA 2 lease vencido: o token antigo de A devolve `count=0` em retry/confirm/unknown; a linha reflete só B | 7 |
| PG25-03 | PG | DATA 3 seis tentativas: cada espera nos limites, `next_attempt_at` não decrescente até o teto, `firstNonConclusiveAt` inalterado, 6ª = `unknown/attempts_exhausted`, `redemptions.sync_status='unknown'`, uma linha de auditoria de esgotamento, `claimNext` em `now + 1 dia` = `null` | 6, 8 |
| PG25-04 | PG | DATA 4 sem confirmação sem leitura positiva: após qualquer sequência falha/esgotada, nenhuma linha `confirmed` no outbox e `remote_status` inalterado | 9 |
| PG25-05 | PG | DATA 5 reverificação positiva na tentativa 3: `confirmed` + `sync_status='confirmed'` + auditoria numa ÚNICA transação (forçar falha no passo 3: os três ou nenhum) | 7 |
| PG25-06 | PG | DATA 6 reconciliação vs lease vivo: tarefa `processing` com lease válido não é tocada por `markRedemptionUnknown` | lacuna 1 |
| PG25-07 | PG | DATA 7 retry manual: `unknown` para `pending`, `cycleStartAttempts` = `attempts` anterior, `attempts` não zerado, auditoria `financial.operation_retry_requested` com `{operationType, previousAttempts, cycleStartAttempts}` e o ator | 20 |
| PG25-08 | PG | DATA 8 resolução manual: `resolved_manual`, `sync_status='operator_resolved'`, `remote_status` inalterado, auditoria `remoteConfirmed:false`; uma observação positiva posterior do EventSub leva a `confirmed`/`conflict` | 11 |
| PG25-09 | PG | DATA 11 linha legada `payload='{}'`, `attempts=1`: lida com fallbacks, continua terminal até o retry manual | 12 |
| PG25-10 | PG | DATA 12 allowlist de auditoria: chaves de `safe_detail` de todo evento da FT-25 dentro da allowlist, e nenhuma casando `/user\|login\|name\|token\|header\|input\|body\|uid/i` | 10 |
| PG25-11 | PG | T-C3: após 6 tentativas esgotadas, "tentar agora" dá exatamente mais 6; um 401 no meio não consome nenhuma; `attempts` nunca diminui (comparar antes/depois) | 20 |
| PG25-12 | PG | O merge do payload nunca substitui o objeto: as outras chaves (`firstNonConclusiveAt`, `reasonClass`, chaves de recompensa) sobrevivem ao retry-now e à devolução do 401; o `RETURNING` do `claimNext` inclui `payload` | 6, 20 |
| PG25-13 | PG | Retry-now é uma transação sob `FOR UPDATE` com a guarda `WHERE status = <status lido>`, `count === 1`, auditoria na mesma transação (forçar falha após o update: nenhuma mudança persiste) | 20 |
| PG25-14 | PG | A devolução do 401 é atômica: a ida a `unknown('authorization_required')` e `cycleStartAttempts += 1` são um comando/transação (forçar falha no meio: nenhum ou ambos) | 20 |

Total da FT-25: 13 U + 2 C + 14 PG = **29**.

## 4. FT-26 (#99) — ordem e estados da exclusão (G2)

Arquivos: `tests/unit/reward-outbox-worker.test.js` (estender), `tests/unit/queue-action-state.test.js` (estender, projeção compartilhada), `tests/unit/queue-routes.test.js` (estender), `tests/unit/twitch-http-error.test.js` (estender), `tests/integration/queue-deletion-order-postgres.test.js` (novo).

| ID | Classe | Teste | CA |
|---|---|---|---|
| U26-01 | U | `reward-worker.mjs:316`: um `HttpStatusCodeError` 404 real do Twurple na consulta pós-DELETE significa "já removida" (CA 13 passo e), nunca `unknown('queue_delete_result_unknown')`; orientado a tabela sobre `statusCode` e `status` (um teste, 3 casos) | 22 |
| U26-02 | U | A leitura de status do próprio worker (`reward-worker.mjs:5-8`) usa a função compartilhada `twitchHttpError` (`statusCode ?? status`) | 22 |
| U26-03 | U | Bloqueios financeiros movem `reward.delete` para `retry('queue_deletion_blocked_by_review')`, reverificação a cada 5 min, sem consumir orçamento de tentativas, nunca `unknown` por causa de bloqueios | 14 |
| U26-04 | U | 401 durante a exclusão: continua bloqueada com o estado de autorização visível; rearma após reautorização | 16 |
| U26-05 | U | A função de retomada automática grava `nextAttemptAt = now` só para um `reward.delete` em `retry` de uma fila ainda `deleting` (I7); `cancelled` e `cancel_verification` nunca são tocados | 14 |
| U26-06 | U | Projeção: `deletionState` em {deleted, pending, blocked}; `blockReason` enumerado; contagem `blockingOperations`; `resolved_manual` não contado; `canCancelDeletion` e `cancellationInProgress` seguem o predicado do begin (fonte única do botão, F17) | 15 |
| U26-07 | U | Ordem da exclusão com Twitch falso: pausar, um cancelamento idempotente por resgate aberto, nova listagem sem `UNFULFILLED`, só então excluir; 404 no DELETE = já removida | 13 |
| U26-08 | U | Linhas de log/auditoria da exclusão do worker de recompensa levam só códigos enumerados e contagens (teste de conjunto de chaves, textos canário) | 10 |
| C26-01 | C | Esquema da API da fila: os novos campos de projeção são enumerados, sem texto livre; todo não-2xx traz `code` | 18 |
| C26-02 | C | Estático: não resta `lookupError?.status === 404` (nem `.status ===` para erros do Twurple) em `apps/api/src/outbox/reward-worker.mjs` | 22 |
| PG26-01 | PG | DATA 9 retomada da exclusão: um resgate em cada estado (aberto, `unknown`, já `CANCELED`, já `FULFILLED`): nenhum `reward.delete` reivindicável enquanto houver bloqueio; conclui após leitura confirmatória; após resolução manual retoma, mas `completeQueueDeletion` recusa enquanto a leitura pós-resolução ainda mostrar `UNFULFILLED` | 14, 17 |
| PG26-02 | PG | DATA 10 cancelamento idempotente: `recordQueueDeletionRedemptions` duas vezes cria um `redemption.cancel` por resgate; um `redemption.fulfill` existente é mantido | 13 |
| PG26-03 | PG | Matriz do CA 17 (um teste orientado a tabela, 4 casos: aberto, unknown, cancelado, cumprido): estados finais de fila e outbox batem com os CAs 13-15; nenhum `reward.delete` emitido enquanto restar um `UNFULFILLED` não contabilizado | 17 |
| PG26-04 | PG | Resolução contradita: a nova listagem após a resolução ainda mostra `UNFULFILLED` e a tarefa de cancelamento é rearmada para `pending` com ciclo novo, auditoria `financial.manual_resolution_contradicted` | 14 |
| PG26-05 | PG | `resolved_manual` não está em `blockingOperations`; a projeção de exclusão é `pending` enquanto a guarda pós-resolução roda | 15 |
| PG26-06 | PG | 401 durante a exclusão persistido como bloqueado com o motivo de autorização; a reautorização rearma para `retry` | 16 |
| PG26-07 | PG | A retomada automática após confirmação financeira toca só um `reward.delete` em `retry` de fila `deleting` (linha `cancelled` continua `cancelled`) | 14 |
| PG26-08 | PG | Ausência da lista `UNFULFILLED` nunca é gravada como `remoteStatus` (sem status inferido) | 9 |

Total da FT-26: 8 U + 2 C + 8 PG = **18**.

## 5. FT-36 (#100) — cancelar exclusão pendente ou bloqueada (G3)

Arquivos: `tests/unit/queue-domain-service.test.js` (estender), `tests/unit/queue-routes.test.js` (estender), `tests/unit/queue-deletion-cancel-matrix.test.js` (novo), `tests/integration/queue-deletion-cancel-postgres.test.js` (novo), `tests/integration/qra-postgres-fixtures.test.js` (manter inalterado; deve continuar verde).

| ID | Classe | Teste | Origem |
|---|---|---|---|
| U36-01 | U | Matriz de recusas do begin, um teste orientado a tabela, uma linha por linha do 1.2 do arquiteto: excluída dá 409 `QUEUE_DELETION_ALREADY_COMPLETED`; não está em exclusão / não é Channel Points / sem recompensa dá `NOT_PENDING`; qualquer tarefa de recompensa `processing` (com ou sem lease válido) dá `QUEUE_REWARD_OPERATION_PROCESSING`; etapa de pausa `pending|retry` dá `QUEUE_DELETION_PAUSE_IN_PROGRESS`; nada muda em nenhuma recusa e nenhuma linha de auditoria é gravada | 1.2 |
| U36-02 | U | Serviço de domínio com Twitch falso de `twurple-real-instances.mjs`: pausada dá `cancelled`; não pausada dá `queue_delete_cancel_reward_not_paused`; divergente dá `queue_delete_reward_diverged`; `null`/`HttpStatusCodeError` 404 real dá `queue_delete_reward_absent`; 401 real dá `authorization_required`; 500 real, rede e timeout dão `queue_deletion_cancel_verification_unavailable` com o status anterior restaurado | 1.2, F20 |
| U36-03 | U | Rotas: `confirm !== true` dá 400 `QUEUE_DELETE_CANCEL_CONFIRMATION_REQUIRED`; 2xx `not_cancelled` traz `reason` enumerado; todo não-2xx traz `code`; o texto `error` em português não é necessário a nenhum consumidor | 1.5 |
| U36-04 | U | Construtor dos eventos de auditoria: `actorId` não nulo em `queue.deletion_cancel_verification_requested`, `queue.deletion_cancelled`, `queue.deletion_cancellation_not_confirmed`; conjuntos exatos de chaves do `safeDetail`; o motivo legado `queue_deletion_cancel_verification_failed` é lido como alias | F22 |
| U36-05 | U | Decisão do Orion: `requestMayHaveReachedTwitch:true` + leitura positiva (existe, pausada) dá `cancelled`; a mesma marca + leitura inconclusiva ou negativa dá 409 `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` e o status anterior restaurado | adendo Orion |
| U36-06 | U | DELETE tardio após cancelamento verificado (nível de serviço): a ação de abrir relê a recompensa; se a leitura agora disser ausente/inconclusiva, a abertura falha com segurança e a fila não é reaberta sem a recompensa | adendo Orion |
| U36-07 | U | `canCancelDeletion` / `cancellationInProgress` vêm do mesmo predicado do begin (sem leitura remota); a heurística do cliente sobre `remoteSyncStatus` não é usada | F17 |
| U36-08 | U | A classe da rota começa como `terminal_unknown` (tabela da OPS-21); repetir o pedido com chave nova retoma (reentrância do domínio) | CA 18 |
| PG36-01 | PG | T36-1 cancelar uma exclusão `pending`: `cancel_verification` depois `cancelled`; fila `active`, arquivada, fechada, `synced`, recompensa verificada como pausada; **variante 5xx:** leitura inconclusiva restaura `previousStatus` (não `unknown`) com `lastError queue_deletion_cancel_verification_unavailable` | 1.2, F20 |
| PG36-02 | PG | T36-2 cancelar exclusão bloqueada por revisão (`retry` / `queue_deletion_blocked_by_review`): a tarefa financeira `unknown` fica intocada e ainda listada em Operações | 1.2 |
| PG36-03 | PG | T36-3 tarefa de recompensa `processing`: 409, nada muda | 1.3 |
| PG36-04 | PG | T36-4 corrida, dois clientes, barreira, 50 rodadas: `claimNextRewardOperation` vs `beginQueueDeletionCancellation`; exatamente um vence; invariante lida do banco após cada rodada: `NOT (status='processing' AND existe linha de auditoria cancel_verification para essa tentativa)` | 1.3 |
| PG36-05 | PG | T36-5 (reescrito pela decisão do Orion) `requestMayHaveReachedTwitch:true`: leitura positiva dá `cancelled`; inconclusiva ou negativa dá 409 `REMOTE_DELETE_ATTEMPTED`; as duas fixtures existentes continuam verdes | adendo Orion |
| PG36-06 | PG | T36-6 fila `deleted`: 409 `QUEUE_DELETION_ALREADY_COMPLETED`, nada muda | 1.2 |
| PG36-07 | PG | T36-7 queda após o begin (chamar só o begin) e depois o mesmo pedido com `Idempotency-Key` nova: retoma, executa uma vez, exatamente uma linha de auditoria `..._requested` | cond. C |
| PG36-08 | PG | T36-8 um `redemption.cancel` `pending` no momento do cancelamento ainda chega a `confirmed`/`CANCELED` após a reabertura (worker com leitura positiva falsa); as entradas continuam `removed`; contagens e status das linhas `redemptions` e `redemption.*` idênticos antes e depois; nenhuma linha apagada | I2, I3 |
| PG36-09 | PG | T36-9 fila aberta, cancelar, reexibir e abrir, excluir de novo: a confirmação da pausa reaproveita a linha única `reward.delete` (F18, Red hoje); a chave da segunda pausa difere da primeira (`queue:<id>:reward.delete.pause:<nextVersion>`); a tarefa de pausa cancelada antiga fica como histórico | F18, cond. 2 |
| PG36-09b | PG | T36-9b linha `reward.delete` inesperada em status diferente de cancelada-pelo-operador em `confirmRewardOpen`: falha fechada (throw/rollback, a tarefa de pausa continua `processing`), nunca sobrescreve em silêncio | cond. D |
| PG36-10 | PG | T36-10 pausa bloqueada (`close_unknown`): leitura pausada cancela as duas tarefas; não pausada restaura a tarefa de pausa com `queue_delete_cancel_reward_not_paused` | F19 |
| PG36-11 | PG | T36-11 a retomada automática da FT-26 ignora um delete `cancelled`/`cancel_verification` | I7 |
| PG36-12 | PG | T36-12 mudança de versão da fila durante a verificação: 409 `QUEUE_DELETION_CANCELLATION_STALE`, status anterior restaurado (também com leitura 5xx) | 1.2 |
| PG36-13 | PG | T36-13 allowlist do `safeDetail`, `actorId` nos três eventos, nenhuma chave casando `/user\|login\|name\|token\|header\|input\|body\|uid/i` | F22, cond. H |
| PG36-14 | PG | T36-14 uma linha legada `cancel_verification` sem `payload.cancelVerification` retoma e, numa leitura inconclusiva, restaura para `unknown` | cond. E |
| PG36-15 | PG | T36-15 (opcional, rodar uma vez) `rollback.sql` e a migration reaplicados com uma linha `cancel_verification` presente | cond. F |
| PG36-16 | PG | T36-16 (novo) DELETE tardio após cancelamento verificado: o cancelamento vence numa leitura positiva, depois o Twitch falso informa a recompensa removida; a ação de abrir relê, falha com segurança e a fila não é reaberta sem a recompensa | adendo Orion |
| PG36-EX | PG | Registro de `EXPLAIN` das buscas de begin/claim (por `entity_id` e `idempotency_key`): **registrado, não afirmado** (conta 0 testes) | cond. I |

Total da FT-36: 8 U + 17 PG (PG36-01..16 mais 09b) = **25** (`PG36-EX` é registro de evidência, não teste).

## 6. FT-23 (#103) — navegação e mensagens (G4)

Arquivos: `tests/unit/post-action-route.test.js` (novo), `tests/unit/next-outcome-url.test.js` (novo), `tests/unit/next-queue-lifecycle.test.js` (estender, o mapeador), `tests/unit/next-outcome-region.test.jsx` (novo), `tests/unit/next-queue-lifecycle-actions.test.jsx` (estender), `tests/unit/next-queue-creation-form.test.js` (estender), `tests/unit/next-panel-catalogs.test.js` e `tests/unit/panel-catalog-placeholders.test.js` (estender), `tests/e2e/queue-outcome-browser-only.mjs` (novo, novo script `test:e2e:queue-outcome:browser-only`) e `tests/e2e/queue-lifecycle-browser-only.mjs` (estender).

| ID | Classe | Teste | UX / CA |
|---|---|---|---|
| U23-01 | U | `resolvePostActionRoute` é pura e cobre criar (5 códigos), excluída, pendente, bloqueada, todo resultado de cancelamento, exclusão da última fila e resultado desconhecido devolvendo `null` (orientado a tabela, um teste) | UX-5, CA 8 |
| U23-02 | U | Regra da última fila: `/new-queue/` só quando não resta fila não-`deleted`; última fila `pending` ou `blocked` fica em `/queues/` | UX-5 |
| U23-03 | U | Parser da URL: lista fechada (5 códigos de criação, 3 `queue_deleted_last_*`), padrão UUID, desconhecido ou malformado ignorado, nada refletido, os dois parâmetros removidos com `history.replaceState` | UX-6, CA 6 |
| U23-04 | U | `navigateTo` é o único chamador de `window.location` na navegação pós-ação (varredura estática de `apps/frontend`) | UX-13, CA 7 |
| U23-05 | U | Tabela do mapeador de cancelamento (3.4): cada `code`/`reason` devolve a chave listada; `code` desconhecido dá `panel.error.generic`; `reason` desconhecido dá `unverified`; texto livre `error` da API nunca renderizado | UX-4 |
| U23-06 | U | `pending` nunca mapeia para chave `deleted.*` ou `done` | UX-8 |
| U23-07 | U | Mapeamento de elemento: recusas e `not_cancelled` vão a `alert`; criada, excluída, pendente, cancelada, atualizada vão a `status` | UX-3 |
| U23-08 | U | R6: `already_deleted` é mapeado do código 409 `QUEUE_DELETION_ALREADY_COMPLETED`, não de um status 200 | R6 |
| K23-01 | K | `PanelShell` renderiza um contêiner com um `role="status"` e um `role="alert"`, ambos vazios na primeira renderização e em todo valor de `status` (loading, ready, unavailable) | UX-1, CA 1 |
| K23-02 | K | Após um resultado de exclusão e após o cartão desmontar, a mensagem continua na região | UX-2 |
| K23-03 | K | Resultado `uncertain` na criação: sem navegação, envio continua desabilitado, `creation_result.uncertain` em `alert` com o link "Abrir filas"; segundo clique não cria duplicata | UX-7 |
| K23-04 | K | "Cancelar exclusão" aparece só pela marca do servidor `canCancelDeletion`; com `cancellationInProgress` o cartão mostra `panel.queue.deletion.cancelling` e o botão permanece | UX-9, R2 |
| K23-05 | K | Diálogo: título específico (não "Confirmar ação"), "Voltar" primeiro na ordem do DOM e foco padrão, `aria-labelledby`/`aria-describedby` apontam para ids existentes, botão de aceitar desabilitado ao salvar, três parágrafos de descrição no cancelamento (inclusive "não voltam") | UX-10, R5 |
| K23-06 | K | `tabindex="-1"` no `h2` do título da fila e nos dois `h1` de página; o auxiliar de foco volta ao `h1` quando o UUID está ausente | UX-11, R3 |
| K23-07 | K | Controles de dispensar e de ação ficam fora dos elementos vivos; sem dispensa automática (timers falsos avançam 10 minutos, mensagem fica); um novo resultado a substitui; troca de página a limpa | plano 3.1 |
| K23-08 | K | R1: fila Channel Points nunca renderiza `panel.queue.delete.done` / `.pending` (dizem "a recompensa continua pausada/intacta"); filas locais e convertidas mantêm as chaves reutilizadas | R1 |
| K23-09 | K | R7: `{count}` igual a 1 renderiza o singular, outras contagens o plural; contagem de bloqueio `.one/.many/.other` | R7 |
| K23-10 | K | Foco após a ação: o acionador se ainda existir, senão o título da fila, senão o `h1`; o foco só se move depois que a mensagem é escrita | plano 3.7 |
| K23-11 | K | Exclusão bloqueada mostra linha persistente no cartão vinda da projeção com a contagem e link para Operações; `blockReason` desconhecido cai no texto genérico, o código bruto nunca é mostrado | plano 3.3 |
| L23-01 | L | As 25 chaves novas (plano 4.2) existem em en, es e pt-BR com os mesmos placeholders; plurais `.one/.many/.other` onde listados; o plano também lista `panel.queue.confirm.delete.one` como "ajustada", mas essa chave não existe hoje: o teste a afirma como a 26ª chave | UX-12, CA 10 |
| L23-02 | L | Nenhuma chave nova colide com chave existente; as 28 chaves reutilizadas existem nos três catálogos | UX-12 |
| L23-03 | L | Os textos ajustados (`confirm.delete`, `confirm.cancel_delete`, `delete.cancelled`) levam a frase "as entradas removidas não voltam" nos três idiomas | I3 |
| L23-04 | L | `npm run validate:localization` e `tests/unit/localization-parity.test.js` passam com as chaves novas | CA 10 |
| L23-05 | L | Regra de termos: o texto novo em pt-BR usa "fila", "recompensa", "exclusão" (não o inglês "reward"); es usa "cola", "recompensa", "eliminación" | plano 2.7 |
| C23-01 | C | Animações novas de CSS só dentro de `prefers-reduced-motion: no-preference` | UX-15 |
| C23-02 | C | R8 estático: a classe da região declara `font-size` >= 14px; as cores declaradas de status, aviso e erro contra o fundo declarado da região calculam >= 4,5:1 (aritmética sobre valores declarados, NÃO medição de pixels) | R8 |
| C23-03 | C | Nenhum componente renderiza o parâmetro `outcome` bruto (varredura estática do módulo de resultado atrás de interpolação direta) | UX-6 |
| E23-01 | E | Criar uma fila, depois `/queues/` com foco no título da nova fila (`document.activeElement` calculado), mensagem neutra em `status` que não promete sucesso na Twitch, parâmetros removidos | UX-14, CA 2 |
| E23-02 | E | Excluir (fixture Channel Points): mensagem persistente depois que o cartão desmonta | CA 1, 3 |
| E23-03 | E | Excluir a última fila: `/new-queue/` com a mensagem e foco no `h1` | CA 4 |
| E23-04 | E | Exclusão `pending` e `blocked`: mensagem mais o link para Operações; "Atualizar filas" troca a mensagem por `panel.outcome.refreshed` | CA 3, 9 |
| E23-05 | E | Cada recusa de cancelamento (parametrizado, 12 linhas da tabela 3.4, um teste): elemento certo (`alert`) e texto, nunca "segura/reaberta" | CA 5 |
| E23-06 | E | Cancelamento com sucesso: cartão arquivado/fechado, a mensagem nomeia a ordem exibir-depois-abrir | CA 5 |
| E23-07 | E | Recarregar depois de chegar não repete a mensagem | CA 6 |
| E23-08 | E | Textos da página de Operações da FT-25/FT-26: `attempts_exhausted`, etiqueta `blocks_deletion`, `manual_contradicted` | plano 3.6 |
| E23-09 | E | Cancelar e depois abrir quando a fixture informa a recompensa removida: a abertura falha com segurança, a fila continua fechada, mensagem em `alert` (ponta a ponta do PG36-16) | adendo Orion |

Total da FT-23: 8 U + 11 K + 5 L + 3 C + 9 E = **36**.

## 7. Provas por mutação (aplicar, mostrar o teste nomeado falhando, reverter)

### 7.1 As dez do parecer do arquiteto (seção 5)

| # | Mutação | Teste que a pega |
|---|---|---|
| M1 | Remover a recusa de `processing` no begin | PG36-03, PG36-04 (e U36-01) |
| M2 | Remover `reward.isPaused !== true` no confirm ou no serviço de domínio | U36-02 "não pausada", PG36-10 |
| M3 | Fazer o cancelamento marcar tarefas `redemption.*` como `cancelled` | PG36-08 |
| M4 | Remover a recusa de `requestMayHaveReachedTwitch`. **Reescrita pela decisão do Orion:** fazer o begin recusar um DELETE possivelmente enviado mesmo com leitura positiva (reverte a decisão) e, separadamente, remover a recusa para leitura inconclusiva/negativa | U36-05, PG36-05 (nos dois sentidos) |
| M5 | Remover o CAS de `version` da fila no confirm | PG36-12 |
| M6 | Deixar a retomada automática tocar qualquer delete que não esteja em `retry` | PG36-11, PG26-07, U26-05 |
| M7 | FT-25: confirmar em `UNKNOWN`/erro sem leitura positiva | PG25-04 (DATA 4), U25-10 |
| M8 | FT-26: pular a guarda de nova listagem pós-resolução | PG26-01 (DATA 9), PG26-04 |
| M9 | FT-26: devolver `lookupError?.status === 404` em `reward-worker.mjs:316` | U26-01 (`HttpStatusCodeError` real), C26-02 |
| M10 | FT-23: renderizar o parâmetro `outcome` bruto | U23-03, C23-03 |

### 7.2 Doze acrescentadas por este plano

| # | Mutação | Teste que a pega |
|---|---|---|
| M11 | Restaurar sempre para `unknown` em vez de `previousStatus` numa leitura inconclusiva (inclusive 5xx) | variante 5xx do PG36-01, PG36-12, U36-02 |
| M12 | Reabrir sem reler na ação de abrir (DELETE tardio após cancelamento verificado); é a prova pedida pelo adendo do Orion | PG36-16, E23-09, U36-06 |
| M13 | "Tentar agora" zera `attempts` ou dá 1 tentativa em vez de ciclo novo de 6 | PG25-07, PG25-11, U25-06 |
| M14 | O 401 não devolve a tentativa (`cycleStartAttempts` não incrementa) | PG25-11, PG25-14, U25-07 |
| M15 | O merge do payload substitui o objeto em vez de espalhá-lo | PG25-12 (chaves sobrevivem) |
| M16 | `markRedemptionUnknown` volta a mover tarefas `processing` sem guarda de lease | PG25-06, U25-13 |
| M17 | Contar `resolved_manual` em `blockingOperations` | PG26-05, U26-06 |
| M18 | `confirmRewardOpen` volta a `tx.outbox.create` para `reward.delete` (F18) | PG36-09 (`P2002`) |
| M19 | Sobrescrever uma linha `reward.delete` inesperada em vez de falhar fechado | PG36-09b |
| M20 | Exclusão Channel Points usa o texto `panel.queue.delete.done` / `.pending` | K23-08 (R1) |
| M21 | "Cancelar exclusão" visível pela heurística de `remoteSyncStatus` em vez da marca do servidor | K23-04, U36-07, U26-06 (R2) |
| M22 | Mapear `already_deleted` do status 200 em vez do código 409 | U23-08 (R6) |

Total: **22 mutações** (10 + 12). Cada uma é registrada no gate do `@qa` com o nome do teste que falhou e a reversão (`git diff` vazio após reverter). Mutações são aplicadas só numa cópia descartável em `.local/qa-mutations/` ou por edição no lugar revertida antes do passo seguinte; nenhuma mutação é commitada.

## 8. Requisitos R1-R8, cobertura de i18n e repetição

### 8.1 R1-R8: como cada um é verificado (automático vs humano)

| R | Evidência automática (o `@qa` pode afirmar) | Exige humano ou outra validação (NÃO afirmar a partir da evidência automática) |
|---|---|---|
| R1 | K23-08 mais M20; chaves de `L23-02` existem | Se a redação específica por tipo é compreendida (teste de leitura com streamers) |
| R2 | K23-04, U36-07, U26-06, M21 | nada além da prova automática |
| R3 | K23-06 (atributo e fallback); E23-01 e E23-03 (`document.activeElement` calculado no Chromium após carga completa do documento) | Ordem do anúncio do foco e do anúncio de status em NVDA, JAWS, VoiceOver, TalkBack (tecnologia assistiva) |
| R4 | Checagem documental do `@qa`: redação dos CA 1 e 11 reconhecida pelo `@po` (dois elementos vivos estáveis); K23-01 | O reconhecimento do `@po` é ato documental, não teste |
| R5 | K23-05, E23-05/E23-06 (título, botões, ordem, ids) | Aparência do diálogo, visibilidade do anel de foco, percepção da dupla negação |
| R6 | U23-08, M22 | nada além da prova automática |
| R7 | K23-09, L23-01 (chaves de plural, inclusive `many` do pt-BR) | Naturalidade do plural em es/pt-BR (leitura humana) |
| R8 | C23-02 (tamanho declarado e contraste aritmético); o `@qa` também pode calcular o contraste dos estilos calculados do Chromium em E23-02 e chamá-lo de "contraste de estilo calculado" | Contraste em pixels reais renderizados, reflow a 320 px / zoom de 400 por cento, visibilidade do `position: sticky` com o foco longe no fim da lista, aparência na superfície escura: **validação visual, não feita** |

**Não afirmável sem validação humana:** comportamento de tecnologia assistiva (se uma mensagem escrita numa região vazia no carregamento do documento é anunciada, e a interação com o título focado); contraste em pixels reais e reflow; a região fixa; a legibilidade de "não voltam" e de "a recompensa continua pausada até você exibir e abrir"; a redação em es. O gate registra isso como "NÃO FEITO" e a nota de UX 9,1 continua "apenas revisão estática" (seção 0 do plano).

### 8.2 Cobertura de i18n

L23-01..L23-05 mais os testes existentes `validate:localization`, `localization-parity` e `panel-catalog-placeholders`. Todo texto visível da FT-25, FT-26, FT-36 e FT-23 existe em en, es e pt-BR com os mesmos placeholders (`{title}`, `{count}`, `{id}`); formas de plural `.one/.many/.other` (o pt-BR precisa de `.many`, como `panel.reconciliation.complete.*` já faz); nenhum texto livre da API é renderizado; as listas fechadas de códigos têm uma chave por código. O `@qa` não julga a qualidade da redação em es/pt-BR (item de leitura humana).

### 8.3 Repetição para testes com histórico de instabilidade

Testes de Chromium e de Docker já falharam de forma intermitente (TS-15, M-2 do gate 30). Regra do gate: **cada script E2E em Chromium roda 3 vezes** (`queue-lifecycle`, `queue-outcome`, mais qualquer script que o `@dev` tocar) e deve passar 3/3; o `compose-runtime` roda uma vez como regressão e seu teste de exclusão de fila 3 vezes; os dois testes de corrida (PG25-01, PG36-04) rodam 50 rodadas com barreira cada e o arquivo PostgreSQL inteiro roda 3 vezes. Uma falha isolada nas repetições é achado, não motivo de nova tentativa.

## 9. Riscos e o que continua sem prova

| # | Risco | Mitigação / responsável |
|---|---|---|
| R-1 | **Arquivos compartilhados entre fatias:** `apps/api/src/persistence/queue-repository.mjs` é editado pela FT-25, FT-26 e FT-36, e `tests/unit/queue-routes.test.js`, `tests/integration/queue-repository.test.js` por várias. Quatro commits atômicos **só por pathspec são impossíveis** nesses arquivos. | O `@dev` salva um patch acumulado em cada ponto de controle (`git diff > .local/ops22/cp-N.patch`, não versionado); o `@devops` monta os quatro commits aplicando com `git apply --cached` as diferenças entre patches consecutivos. `@po`/`@devops` confirmam. |
| R-2 | O plano diz 25 chaves novas; `panel.queue.confirm.delete.one` está listada como "ajustada" mas não existe: 26 chaves. | Afirmado pelo L23-01; o `@ux-design-expert` pode corrigir o plano. |
| R-3 | `getReward` não tem timeout limitado no servidor (risco residual do arquiteto, FT-44/OPS-21): uma leitura pendurada mantém `cancel_verification`. | Recuperação = repetir o cancelamento (PG36-07, PG36-14). Não é provável por teste unitário; registrado como sem prova. |
| R-4 | A classe de rota `terminal_unknown` da OPS-21 ainda não é imposta no código; um 5xx não é armazenado, então a nova tentativa reexecuta. | Seguro porque o begin é reentrante e o confirm usa CAS (PG36-07, U36-08). |
| R-5 | Volume e tempo de testes (108 testes, 2 arquivos PostgreSQL com corridas de 50 rodadas, 3 execuções do Chromium). | Um contêiner PostgreSQL por arquivo pelo helper existente; TS-07/TS-11 (medir primeiro) fica fora do escopo. |
| R-6 | Uma lista planejada pode divergir quando o `@dev` encontra um caso: os IDs são contrato, as contagens são a linha de base do plano. | O gate do `@qa` concilia planejado vs entregue e lista qualquer diferença como achado. |
| R-7 | Docker e Chromium nesta máquina são disputados (tempos variam). | Tempos nunca são asserção; barreiras, não sleeps. |

**Continua SEM prova após este pacote, qualquer que seja o resultado:** Twitch ao vivo (CA 19 / OW-16: `status` bruto do Helix, Delete Custom Reward com resgate pendente, resgate numa recompensa pausada, o resultado HTTP da leitura de um resgate); OBS/CEF nativo; Windows e macOS (nenhum resultado afirmado); tecnologia assistiva e validação visual (seção 8.1); consistência eventual do Helix após um DELETE que errou (risco residual do arquiteto); timeout de leitura do Twurple no servidor; o teste de leitura com streamers.

## 10. Esquema do gate único

**Ordem (um `@dev` por vez, nunca em paralelo: mesmos arquivos):** G1 FT-25, G2 FT-26, G3 FT-36, G4 FT-23 + catálogos. A FT-26 precisa do comportamento `retry`/bloqueado da FT-25, a FT-36 precisa da projeção da FT-26, a FT-23 precisa do contrato da FT-36 e do plano de UX (>= 9,0, entregue).

| Passo | Fatia | Ponto de controle do `@dev` (evidência registrada na story, não é commit) | Testes que devem estar Green no ponto |
|---|---|---|---|
| CP-0 | nenhuma | itens abertos decididos, confirmação do `@data-engineer`, plano de UX, este plano | nenhum |
| CP-1 | FT-25 | saída Red e depois Green; patch `cp-1.patch` | U25-*, C25-*, PG25-* em PostgreSQL isolado |
| CP-2 | FT-26 | Red e depois Green; `cp-2.patch` | U26-*, C26-*, PG26-* mais os testes do CP-1 |
| CP-3 | FT-36 | Red e depois Green; `cp-3.patch` | U36-*, PG36-* mais as duas fixtures existentes mais CP-1/2 |
| CP-4 | FT-23 | Red e depois Green; `cp-4.patch` | U23-*, K23-*, L23-*, C23-*, E23-* (3 execuções do Chromium) mais todos os anteriores |
| Gate | todas | **um** gate do `@qa` (reexecução independente) | tudo abaixo |

**O gate único do `@qa` roda, nesta ordem:** `git diff --check`; `npm run lint`; `npm run typecheck` e `typecheck:api/infra/web`; `npm run validate:localization`, `validate:version`, `validate:port-denylist`; `npm run review:static` (OpenGrep); `npx vitest run tests/unit`; `npx vitest run tests/integration` (Docker; 3 execuções dos arquivos PostgreSQL); `npm test` completo; regressão `compose-runtime`; os scripts E2E em Chromium 3x cada; as 22 mutações (seção 7); a tabela R1-R8 (seção 8.1) com a lista NÃO FEITO; a varredura de segredo (`git log origin/main..HEAD --format=%B | grep -c 'claude.ai/'` = 0). Veredito PASS/CONCERNS/FAIL/WAIVED com nota e a lista de grupos prontos.

**Grupos de commit para o `@devops` (quatro commits atômicos, nesta ordem, cada um reversível sozinho).** Os pathspecs são por fatia; arquivos marcados (compartilhado) exigem o método de patch por ponto de controle do R-1:

- **G1 FT-25:** `apps/api/src/outbox/financial-worker.mjs`, `apps/api/src/twitch/reconciliation.mjs`, `apps/api/src/persistence/queue-repository.mjs` (compartilhado), `apps/api/src/http/queue-routes.mjs` (compartilhado), `tests/unit/financial-retry-policy.test.js`, `tests/unit/financial-outbox-worker.test.js`, `tests/unit/twitch-reconciliation.test.js`, `tests/integration/financial-retry-postgres.test.js`, mais a File List e o checklist da story.
- **G2 FT-26:** `apps/api/src/outbox/reward-worker.mjs`, `apps/shared/panel/queue-action-state.mjs`, `apps/api/src/persistence/queue-repository.mjs` (compartilhado), `apps/api/src/http/queue-routes.mjs` (compartilhado), `tests/unit/reward-outbox-worker.test.js`, `tests/unit/queue-action-state.test.js`, `tests/unit/twitch-http-error.test.js`, `tests/integration/queue-deletion-order-postgres.test.js`.
- **G3 FT-36:** `apps/api/src/domain/queue-service.mjs`, `apps/api/src/persistence/queue-repository.mjs` (compartilhado), `apps/api/src/http/queue-routes.mjs` (compartilhado), `tests/unit/queue-domain-service.test.js`, `tests/unit/queue-deletion-cancel-matrix.test.js`, `tests/integration/queue-deletion-cancel-postgres.test.js`, `tests/integration/qra-postgres-fixtures.test.js` (inalterado), e os trechos compartilhados de `tests/unit/queue-routes.test.js` e `tests/integration/queue-repository.test.js`.
- **G4 FT-23 + catálogos:** `apps/frontend/`, `apps/shared/localization/catalogs/panel/`, `apps/shared/panel/`, `tests/unit/post-action-route.test.js`, `tests/unit/next-outcome-url.test.js`, `tests/unit/next-outcome-region.test.jsx`, `tests/unit/next-queue-lifecycle.test.js`, `tests/unit/next-queue-lifecycle-actions.test.jsx`, `tests/unit/next-queue-creation-form.test.js`, `tests/unit/next-panel-catalogs.test.js`, `tests/unit/panel-catalog-placeholders.test.js`, `tests/e2e/queue-outcome-browser-only.mjs`, `tests/e2e/queue-lifecycle-browser-only.mjs`, `package.json` (só o script) e as atualizações bilíngues de documentação/story do pacote.

**Alternativa (arquiteto, exige decisão do orquestrador):** se o texto visível atrasar, G1..G3 podem passar pelo mesmo gate sem o G4; os textos de UI da FT-25/26/36 esperam com o G4.

## 11. Totais

| Fatia | Unitário | Contrato | Componente | Localização | PostgreSQL | E2E | Total |
|---|---|---|---|---|---|---|---|
| FT-25 | 13 | 2 | 0 | 0 | 14 | 0 | 29 |
| FT-26 | 8 | 2 | 0 | 0 | 8 | 0 | 18 |
| FT-36 | 8 | 0 | 0 | 0 | 17 | 0 | 25 |
| FT-23 | 8 | 3 | 11 | 5 | 0 | 9 | 36 |
| **Pacote** | **37** | **7** | **11** | **5** | **39** | **9** | **108** |

Mais: 22 provas por mutação, 1 registro de evidência (`EXPLAIN`), as suítes de regressão existentes (`compose-runtime`, as duas fixtures existentes, `localization-parity`, `documentation-contract`) e zero testes de Twitch ao vivo.

## Histórico de alterações

- 2026-11-04 — `@qa` (Quinn): criado o plano de testes do pacote único da OPS-22. Somente plano; nada foi executado. Fecha a linha do gate "plano de testes do `@qa`" do [po-validation](po-validation.md).
