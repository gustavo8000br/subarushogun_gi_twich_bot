# OPS-22 — Confirmação escrita da FT-36 (`@data-engineer`, Dara)

[English](../../../stories/OPS-22/ft-36-data-engineer-confirmation.md)

**Data:** 2026-10-30. **Responde:** seção 6 do [architect-review-ft36.md](architect-review-ft36.md) (sete pontos) e a linha do `@data-engineer` nos gates de planejamento do [po-validation.md](po-validation.md).
**Classe de evidência:** somente leitura. Li `apps/api/prisma/schema.prisma`, a migration `20261014230000_outbox_deletion_cancel_verification` (com `rollback.sql`), `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/domain/queue-service.mjs`, `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/outbox/financial-worker.mjs` e `tests/integration/qra-postgres-fixtures.test.js`. Não rodei migration, servidor, teste, container nem chamada à Twitch. Tudo abaixo que dependa do comportamento do PostgreSQL é uma **afirmação a ser provada pelo `@qa` em PostgreSQL isolado com as migrations reais**, não um resultado.

## Veredito

**A FT-36 não precisa de DDL. O mecanismo `payload.cycleStartAttempts` não precisa de DDL.** O gate do `@data-engineer` para FT-24..FT-26 e FT-36 está **FECHADO, com as condições abaixo** (nenhuma é migration). Se alguma condição passar a exigir DDL, volta para mim pela C8 do [data-review.md](data-review.md).

| # | Ponto da seção 6 | Decisão |
|---|---|---|
| 1 | Nenhum DDL para a FT-36 | **CONFIRMADO COM CONDIÇÃO** |
| 2 | Catálogo de auditoria (`actorId`, chaves de `safeDetail`, novos códigos de `reason`) | **CONFIRMADO COM CONDIÇÃO** |
| 3 | Transições da 1.2 em transação única, incluindo o F18 | **CONFIRMADO COM CONDIÇÃO** |
| 4 | DATA C3 atualizada (ciclo novo de 6, devolução no 401, `payload` no `claimNext`) | **CONFIRMADO COM CONDIÇÃO** |
| 5 | DATA C6 atualizada (`resolved_manual` não contado) | **CONFIRMADO** |
| 6 | Nomes do catálogo (`attempts_exhausted`, `financial.operation_retry_requested`) e texto do teste 3 da DATA | **CONFIRMADO** |
| 7 | Testes T36-1..T36-13 no plano de PostgreSQL | **CONFIRMADO COM CONDIÇÃO** (dois testes existentes precisam mudar; três testes novos) |

Nada da seção 6 foi **REFUTADO**. Duas afirmações do parecer pedem uma precisão (sem mudar a decisão): a observação "as consultas são por `entity_id`" (ver 1.3) e o cancelamento de um DELETE possivelmente enviado (ver ponto 7, item A).

## (a) Nenhum DDL na FT-36 nem em `payload.cycleStartAttempts`

### 1.1 O que já existe (evidência)

- `cancel_verification` já é um status permitido: `outbox_status_check` em `20261014230000_outbox_deletion_cancel_verification/migration.sql:1-3`, com `rollback.sql` que converte as linhas em `unknown` (`queue_deletion_cancel_verification_rolled_back`) antes de restaurar a constraint antiga. O CHECK vale para a tabela inteira, então admite o status em **qualquer** `operation_type` (a tarefa de pausa de uma pausa bloqueada não precisa de nada novo).
- `outbox.payload` é `Json @default("{}")` (`schema.prisma:117`). As chaves `cancelVerification` (FT-36) e `cycleStartAttempts` (FT-25) são chaves JSON: sem coluna, sem CHECK em `payload`, sem backfill.
- `audit_logs.safe_detail` é `Json`; `reason`, `previous_state` e `next_state` são `TEXT` livres (`schema.prisma:134-151`): novos nomes de evento, motivos e chaves não exigem DDL.
- `outbox.attempts` é `INT` com `CHECK >= 0`, incrementado no claim (`queue-repository.mjs:2149` para tarefas financeiras, `:1617` para tarefas de recompensa) e nunca diminuído por nenhum caminho de código. Monotônico por construção.

### 1.2 `payload.cycleStartAttempts`: regras que o mantêm correto sem constraint

1. **Orçamento do ciclo** = `attempts - (payload.cycleStartAttempts ?? 0)`; o teto de 6 é a constante de código `FINANCIAL_MAX_ATTEMPTS`. Chave ausente vale 0, então toda linha legada funciona sem mudança (teste 11 da DATA).
2. **Invariante** `0 <= cycleStartAttempts <= attempts`. Não existe CHECK possível sobre chave JSON sem coluna gerada, e coluna gerada é DDL que o desenho não precisa. A invariante é imposta em código e provada por teste: "tentar agora" grava `cycleStartAttempts = attempts` (nunca mais); a devolução do 401 grava `min(cycleStartAttempts + 1, attempts)`.
3. **Tentar agora** (`retryOutboxManually`, hoje `queue-repository.mjs:2237-2258`) deve ler a linha, mesclar o payload e atualizar na **mesma transação**, sob `SELECT ... FOR UPDATE` na linha do outbox, com a guarda existente `WHERE id AND status = <status lido>` e `count === 1`. Hoje faz um `updateMany` simples sem tocar em `payload`; essa é a linha a mudar. A linha de auditoria `financial.operation_retry_requested` é gravada na mesma transação.
4. **Devolução no 401**: `unknown(...)` é hoje um `updateMany` simples protegido por lease (`queue-repository.mjs:2192-2197`). A devolução exige que a passagem para `unknown('authorization_required')` e o incremento de `cycleStartAttempts` sejam **um único comando ou uma única transação** (`FOR UPDATE` + mesclagem). Nunca dois passos: uma queda entre eles queimaria ou devolveria em dobro a tentativa. Um 404 em uma **leitura** (`remote_state_unavailable`) **não** é devolvido: é um resultado não conclusivo real daquele ciclo.
5. **A mesclagem do payload nunca substitui o objeto.** Sempre espalhar o payload atual (`{ ...current.payload, cycleStartAttempts }`) dentro da transação travada, ou usar `payload || jsonb_build_object(...)`. Motivo: os payloads financeiros passarão a guardar também `firstNonConclusiveAt` e `reasonClass`, e os de recompensa guardam `requestMayHaveReachedTwitch`, `safeToDelete`, `deleteAfterConfirm`, `queueVersion`, `isOpen`. Perder uma chave reabilitaria em silêncio um DELETE recusado.
6. **O `claimNext` não devolve `payload`** (o `RETURNING` em `queue-repository.mjs:2153-2154` lista `id, redemptionId, operationType, attempts, status, leaseToken, rewardId`). Confirmado: o `@dev` acrescenta `task.payload` ao `RETURNING` (coluna da mesma linha, sem impacto em índice). O predicado do claim e o `FOR UPDATE SKIP LOCKED` não mudam.
7. **Sem "zerar para 0"** e sem o evento `financial.operation_retried_manually`: ambos retirados pelo parecer e confirmados aqui.

### 1.3 Índice e `entity_id` (precisão sobre o ponto 1)

O parecer diz "nenhum índice é necessário: as consultas são por `entity_id` e `idempotency_key`". A conclusão vale, mas a premissa é imprecisa: **o `outbox` não tem índice em `entity_id`**. Os únicos índices são a chave primária, a unique `idempotency_key` e `outbox_status_next_attempt_at_idx (status, next_attempt_at)` (`schema.prisma:116,130`; `202610020001_foundation/migration.sql:102`).

- `beginQueueDeletionCancellation`, `failQueueDeletionCancellation` e `confirmQueueDeletionCancellation` executam `SELECT id FROM outbox WHERE entity_id = $1 AND operation_type LIKE 'reward.%' ORDER BY id FOR UPDATE` (`queue-repository.mjs:845, 876, 896`). Sem índice em `entity_id`, isso é uma varredura de `outbox` **com o advisory lock da fila seguro**.
- O custo é limitado: o comando roda uma vez por clique do operador, a tabela é dominada por linhas `redemption.*` (uma ou duas por resgate) e o lock é por fila, então não bloqueia outras filas. Para um produto de um único streamer são de microssegundos a poucos milissegundos com dezenas de milhares de linhas.
- **Decisão: sem DDL agora.** O `@qa` registra um `EXPLAIN (ANALYZE, BUFFERS)` desse comando no banco isolado com 50 000 linhas `redemption.*` (sem limite de aprovação além de "registrado"). **Se** o plano mostrar varredura sequencial acima de 50 ms, a resposta é uma migration aditiva `CREATE INDEX CONCURRENTLY outbox_entity_id_idx ON outbox (entity_id) WHERE entity_id IS NOT NULL`, rollback `DROP INDEX CONCURRENTLY outbox_entity_id_idx`, com snapshot `pg_dump` antes. É candidata, não requisito. O índice parcial da DATA §1 para o claim financeiro também continua candidato.

## (b) F18: reexcluir depois de cancelar

**Confirmado com evidência.**

- `confirmRewardOpen` (`queue-repository.mjs:1683-1687`) faz `tx.outbox.create` de `reward.delete` com a chave fixa `queue:<id>:reward.delete`.
- `idempotency_key` é `@unique` (`schema.prisma:116`). Depois de um cancelamento a linha existe como `cancelled` (`confirmQueueDeletionCancellation`, `:904-906`). O `create` levanta `P2002` **dentro** da transação que também confirma a pausa (`:1675-1682`): a transação inteira é desfeita, a tarefa de pausa não é confirmada, a fila fica em `pending_close` e o worker continua falhando a cada claim. Nada chega ao banco parcialmente (atômico), mas a exclusão não avança.
- Só `enqueueRewardDeleteIntent` (`:110-137`) trata a linha cancelada (reaproveita: `pending`, `nextAttemptAt = now`, lease limpo, flags zeradas, tentativa anterior guardada em `payload.previousCancelledAttempt`). Ele é usado pelo caminho de fila fechada (`:836`).

**Correção segura, sem DDL: reaproveitar a linha única.** Em `confirmRewardOpen`, trocar o `tx.outbox.create` por `enqueueRewardDeleteIntent(tx, queue.id, clock())`, dentro da transação existente.

Por que reaproveitar e não usar chave com geração (`queue:<id>:reward.delete:<n>`): o código pressupõe **uma** linha `reward.delete` por fila. Evidência: `beginQueueDeletionCancellation` a escolhe com `rewardTasks.find(operationType === 'reward.delete')` (`:855`); a guarda do arquivamento local (`:640`); a lista e o resumo de Operações selecionam por `operationType` e `entityId` (`:322, :348`). Duas linhas fariam o `find` escolher uma arbitrária, e a cancelada poderia mascarar a viva. A chave única é a proteção que mantém a invariante; a correção a preserva.

Condições para `@dev` e `@qa`:

1. `enqueueRewardDeleteIntent` lança `QUEUE_DELETION_NOT_READY` quando existe uma linha que **não** é a cancelada pelo operador. Em `confirmRewardOpen`, esse lançamento também desfaria a confirmação da pausa. Esse caso não é alcançável pelo fluxo novo (um `reward.delete` vivo de fila `deleting` só existe depois que a pausa é confirmada, e repetições de `confirmRewardOpen` retornam `false` antes, porque a tarefa de pausa deixou de estar `processing`, `:1669`). O `@dev` mantém o lançamento (falha fechada) e o `@qa` prova com um teste (T36-9b abaixo).
2. A chave da tarefa de pausa `queue:<id>:reward.delete.pause:<nextVersion>` (`:832`) não colide entre ciclos: a versão da fila é incrementada pela confirmação do cancelamento (`:909`) e pelo novo pedido, então a chave de uma segunda pausa é diferente. Provar no T36-9.
3. A tarefa de pausa cancelada do ciclo anterior permanece como histórico (`cancelled`). A lista de Operações a retorna (`:322`) com status `cancelled`; o resumo não a conta (`unresolvedDeletionStatuses`, `:11`). O painel não deve exibir uma tarefa de exclusão `cancelled` como pendente (texto da FT-23, não é assunto de banco).
4. Teste vermelho primeiro: o T36-9 falha hoje com `P2002`/desfazimento e passa depois da mudança de uma linha.

## (c) Linhas de auditoria que não registram quem agiu

**Confirmado (F22)**: `queue.deletion_cancelled` (`:913-916`) e `queue.deletion_cancellation_not_confirmed` (`:885-889`) são gravados sem `actorId`; só `queue.deletion_cancel_verification_requested` o tem (`:865-869`). A linha de falha também fixa `origin: 'panel'`. `confirmQueueDeletionCancellation` e `failQueueDeletionCancellation` não recebem `actorId` do serviço (`queue-service.mjs:75-96`): o serviço deve repassá-lo e os dois métodos do repositório devem aceitar `actorId` (e `origin`).

`audit_logs.actor_id` é `TEXT` anulável (o id do operador; sem dado de espectador). **Catálogo (dono: `@data-engineer`; final):**

| Evento | `origin` | `actorId` | `previousState → nextState` | `reason` | `safeDetail` (todas as chaves enumeradas, numéricas ou booleanas) |
|---|---|---|---|---|---|
| `queue.deletion_cancel_verification_requested` (existente) | `panel` | operador | `<status> → cancel_verification` | `operator_requested_queue_deletion_cancellation` | `rewardId`, `operationId`, `operationType`, `deletionState` (`pending`\|`blocked`), `blockReason` (código enumerado ou `null`), `requestMayHaveReachedTwitch` (bool), `safeToDelete` (bool) |
| `queue.deletion_cancelled` (existente) | `panel` | operador (**novo**) | `deleting → active_closed_archived` | `operator_cancelled_queue_deletion_after_reward_verification` | `rewardId`, `operationId`, `remoteSyncStatus: 'synced'`, `isPaused: true`, `cancelledTasks` (int), `financialTasksLeftRunning` (int) |
| `queue.deletion_cancellation_not_confirmed` (existente) | `panel` | operador (**novo**) | `cancel_verification → <status restaurado ou unknown>` | o código de `reason` abaixo | `rewardId`, `operationId`, `restored` (bool), `previousStatus` (status enumerado do outbox) |

Notas:

- **Manter** `requestMayHaveReachedTwitch` e `safeToDelete` na primeira linha (existem hoje, `:868`); a lista do parecer acrescentou chaves mas não disse para retirar essas duas. São booleanos e são a evidência de por que o cancelamento foi ou não permitido.
- `rewardId` é o **id da recompensa na Twitch** da recompensa gerenciada, já presente nessas linhas hoje; não é dado de espectador. `operationId` é o UUID interno do outbox. Nenhum UID, login, nome de exibição, corpo de resgate, token, header, mensagem bruta da Twitch ou connection string entra em `safe_detail`.
- `blockReason` e `reason` usam só códigos enumerados; o padrão `^[a-z][a-z0-9_]{1,47}$` (estilo `isSafeReason`, `:139-141`) é a regra para qualquer código novo. Os três códigos novos passam (tamanhos 37, 40, 46): `queue_delete_cancel_reward_not_paused`, `queue_deletion_cancel_verification_stale`, `queue_deletion_cancel_verification_unavailable`.
- `queue_deletion_cancel_verification_failed` (código atual, `queue-service.mjs:77`, verificado em `qra-postgres-fixtures.test.js:518,524,528`) é **substituído** por `..._unavailable` nas leituras não conclusivas. Linhas legadas mantêm o valor antigo em `last_error` e em linhas de auditoria antigas: quem lê (mapeamento de motivos da API e o painel) deve aceitar os dois como o mesmo caso.
- **Recusas (409) não gravam auditoria**, como o parecer decidiu (nada mudou). De acordo: o log estruturado da requisição as registra.
- Recomendado, não obrigatório: a linha `queue.deletion_cancelled` registra o id da tarefa de **pausa** cancelada como `operationId` quando o alvo foi a pausa; `operationType` na primeira linha distingue os dois casos.
- Volume: no máximo três linhas por tentativa de cancelamento; uma retomada (segundo clique em `cancel_verification`) **não** grava nova primeira linha (`:858-860` retorna antes da auditoria), o que o T36-7 deve provar.

## (d) Catálogo de `financial.operation_retry_requested`

Forma final (`audit_logs`): `event = 'financial.operation_retry_requested'`, `origin = 'panel'`, `actorId` = operador (obrigatório, não nulo), `queueId` e `redemptionId` preenchidos a partir do resgate (como `financial.operation_resolved_manually` faz hoje, `queue-repository.mjs:2279-2290`), `previousState` = status lido (`unknown`, `conflict` ou `failed`), `nextState = 'pending'`, `reason = 'operator_retry_now'`, `safeDetail = { operationType, previousAttempts, cycleStartAttempts }` (somente strings e inteiros). Isso concorda com a DATA §3 e com o parecer (item aberto 2). Regras:

- Gravado na **mesma transação** da atualização de status e da mesclagem do payload (ponto 3 da 1.2). Se o `updateMany` retornar 0, nada é gravado.
- `previousAttempts` = `attempts` no momento do clique; `cycleStartAttempts` = o valor gravado. Iguais em ciclo novo, por construção; mantidas como duas chaves porque a devolução do 401 pode depois fazer `cycleStartAttempts` diferir.
- Vale para tarefas `redemption.*`. Para tarefas `reward.*` o `retryOutboxManually` também existe (`:2237`); o `@dev` decide se o mesmo evento é usado (recomendado: sim, com `operationType` distinguindo e **sem** alterar `cycleStartAttempts`, porque tarefas de recompensa não têm teto por ciclo). O `@qa` verifica o conjunto de chaves por tipo.

Catálogo financeiro completo após FT-25/26 (nomes da DATA §3 inalterados, mais estes): `financial.operation_retry_scheduled`, `financial.operation_attempts_exhausted` (`reason = attempts_exhausted`), `financial.operation_confirmed_by_reverification`, `financial.operation_retry_requested`, `financial.operation_resolved_manually` (existente), `financial.manual_resolution_contradicted` (novo, FT-26; `previousState resolved_manual → nextState pending`, `reason = remote_still_unfulfilled`, `safeDetail { operationType, attempts, cycleStartAttempts }`), `queue.deletion_blocked`, `queue.deletion_resumed`.

## (e) Índices, locks, `FOR UPDATE` e a corrida com um delete em voo

**Ordem dos locks (verificada): primeiro o advisory lock por fila, depois os locks de linha, nunca o contrário.**

| Caminho | Ordem | Evidência |
|---|---|---|
| begin / fail / confirm do cancelamento | `pg_advisory_xact_lock(hashtextextended(queueId, 0))`, depois `FOR UPDATE` em todas as linhas `reward.%` da fila `ORDER BY id` | `withQueueTransaction` `:91-96`; `:845, :876, :896` |
| `claimNextRewardOperation` | advisory lock, depois `FOR UPDATE` na linha candidata única | `:1587-1589` |
| `lockProcessingRewardTask` (toda escrita do worker: prepare/complete/retry/failed/unknown/confirm) | advisory lock (da fila da linha), depois `FOR UPDATE` na linha | `:37-47` |
| `claimNext` financeiro | `FOR UPDATE SKIP LOCKED` em uma linha `redemption.*`, **sem lock de fila** | `:2136-2155` |

Não existe inversão de ordem entre esses caminhos, então não há deadlock possível entre eles. O cancelamento trava só linhas `reward.%` (`'redemption.cancel' LIKE 'reward.%'` é falso), não grava `redemptions` nem linhas `redemption.*`, e portanto nunca disputa com o worker financeiro (a I2 vale também no nível de lock).

**A corrida do delete em voo, passo a passo:**

1. O claim do worker e o begin do cancelamento seguram o advisory lock da fila durante toda a transação, então são **serializados**. Quem commitar primeiro decide.
2. Worker primeiro: a linha está `processing`; o begin recusa com `QUEUE_REWARD_OPERATION_PROCESSING` (`:852`) para qualquer tarefa de recompensa `processing`, com lease vivo **ou expirado**. Nada muda.
3. Cancelamento primeiro: a linha está `cancel_verification`. O predicado do claim pega só `pending/retry` ou `processing` com lease expirado (`:1575-1578`), e a releitura dentro da transação do claim repete `...due` (`:1589`), então um candidato listado antes do cancelamento é descartado. Segunda guarda independente: um `reward.delete` só é reivindicável se `queue.remoteSyncStatus = 'delete_pending'` (`:1607-1614`), e a confirmação do cancelamento grava `synced` (`:909`).
4. Um worker que já tem uma tarefa em memória mas perdeu a corrida só consegue escrever por `lockProcessingRewardTask`, que exige `status = 'processing'` e o token do lease (`:37-43`). Uma linha em `cancel_verification` ou `cancelled` retorna `null`, e a escrita vira `lease_lost`. O worker não consegue sobrescrever o cancelamento.
5. **A leitura de `getReward` roda fora da transação** (serviço `:73`), com a linha em `cancel_verification` e nenhum lock seguro. É o desenho pretendido: nenhum lock de banco é mantido durante uma chamada remota. A confirmação retoma os locks e reverifica status, ciclo de vida da fila, CAS de `version` e "nenhuma outra tarefa de recompensa `processing`" (`:896-903`), e termina com `updateMany ... WHERE status = 'cancel_verification'` e `count === 1` (`:904-907`) e um `updateMany` da fila com `version` (`:908-911`).
6. Dois cancelamentos concorrentes: serializados pelo advisory lock. O segundo begin vê `cancel_verification` e retorna `verification_required` sem gravar auditoria (`:858-860`). Duas confirmações: a perdedora não acha linha `cancel_verification` e recebe `QUEUE_DELETION_CANCELLATION_STALE` (o serviço então chama fail, que não acha linha e retorna `not_cancelled` sem gravar: `queue-service.mjs:92-95` mais `:877-879`). Idempotente.
7. **Premissa de isolamento:** transações interativas do Prisma rodam no `READ COMMITTED` padrão do PostgreSQL. Cada comando vê o que foi commitado antes de começar, e o advisory lock é tomado primeiro, então as releituras depois do lock enxergam o commit do outro lado. Esta é **a** propriedade que o T36-4 deve provar com duas conexões e uma barreira; não se apoiar só nesta leitura.
8. **Janela residual (aceita pelo parecer, confirmada aqui):** uma queda do worker deixa `processing` com lease expirado. O begin recusa até o worker reassumir (cerca de 30 s de lease, `leaseMs = 30_000`). Uma queda **entre** begin e confirm deixa `cancel_verification` sem lease e sem expiração: a linha fica fora do alcance do worker (seguro, nada é excluído) e aparece em Operações (`unresolvedDeletionStatuses`, `:11`). A saída é "repetir o cancelamento" (retomada). Nada mais é necessário.

**F21 / DELETE possivelmente enviado (ponto 7, item A).** `prepareRewardDelete` grava `requestMayHaveReachedTwitch: true` e `safeToDelete: true` na transação protegida por lease logo antes de `deleteReward` (`:1767` e `reward-worker.mjs:304-306`). Do lado dos dados, a recusa é trivial de implementar dentro do begin (`deletion.payload?.requestMayHaveReachedTwitch === true`, lido sob o mesmo `FOR UPDATE`) e não exige DDL. **Mas contradiz o teste de integração existente**: `tests/integration/qra-postgres-fixtures.test.js:457-488` semeia `reward.delete` `unknown` com `{ requestMayHaveReachedTwitch: true, safeToDelete: true }` e espera `status: 'cancelled'`; `:497-528` semeia `{ requestMayHaveReachedTwitch: true }` e espera o caminho de verificação. Depois da FT-36 as duas sementes seriam recusadas com `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`. O `@dev` deve reescrever essas duas fixtures começando pelo vermelho (mover os casos canceláveis para `requestMayHaveReachedTwitch: false` e acrescentar a recusa como caso novo), e `@po`/`@architect` devem ter ciência da **consequência de produto**: toda exclusão que ficou `unknown` depois de um DELETE com timeout (o caso bloqueado mais comum) deixa de poder ser cancelada; a saída do operador é "tentar agora", em que o worker lê a recompensa (ausente → conclui; presente e pausada → `retry` de novo). Eu não decido o trade-off de produto; confirmo apenas que o modelo de dados o suporta e que ele muda o comportamento para linhas **existentes** (ver (f)).

## (f) Retrocompatibilidade das linhas existentes

| Dado existente | Depois da mudança | Necessário |
|---|---|---|
| `outbox.status = 'cancel_verification'` deixado pelo código atual (sem `payload.cancelVerification`) | O caminho de retomada lê a chave; **chave ausente → `previousStatus = 'unknown'`**, exatamente o que o caminho de falha atual grava (`:880`). Nenhuma linha fica ilegível. | Teste T36-14 (linha legada sem a chave retoma e restaura para `unknown`). |
| `reward.delete` `unknown` com `last_error = 'queue_deletion_cancel_verification_failed'` | Permanece como está; lido como o mesmo caso de `..._unavailable`. | O mapeamento de motivos aceita os dois (ver (c)). |
| `reward.delete` com `requestMayHaveReachedTwitch: true` em `pending/retry/unknown/failed/conflict` | O cancelamento passa a ser **recusado** (mudança de comportamento). As linhas não são modificadas. | As duas fixtures acima; nota de versão na story. |
| Linhas de auditoria `queue.deletion_cancelled` / `..._not_confirmed` com `actor_id NULL` | Continuam `NULL`; **sem backfill** (o ator não é recuperável e inventá-lo quebraria a auditoria). | Leitores devem tolerar `NULL`; linhas novas sempre trazem o ator. Uma linha `queue.deletion_cancel_verification_requested` da mesma tentativa traz o ator e é o meio de correlacionar tentativas antigas. |
| Linhas `redemption.*` com `payload = '{}'` | `cycleStartAttempts ?? 0`: orçamento = `attempts`. Uma linha `unknown` legada continua terminal até "tentar agora" (então ciclo novo de 6). Uma linha `retry` legada com `attempts >= 6` vira `unknown` no próximo resultado não conclusivo (DATA §5) e nunca é confirmada. | Teste 11 da DATA (já no plano). |
| Linhas `reward.delete` `cancelled` de um cancelamento passado | Reaproveitadas pelos dois caminhos de exclusão (correção do F18); tentativa anterior registrada em `payload.previousCancelledAttempt`. | T36-9. |
| Versão antiga da aplicação após rollback do código | O código antigo ignora `cancelVerification` e `cycleStartAttempts`, já conhece `cancel_verification` (migration `20261014230000`) e aceita qualquer texto de `audit_logs.event`. Uma linha deixada em `cancel_verification` pelo código novo é tratada pelo caminho de falha antigo (vira `unknown`). | Nenhum. |
| Rollback da própria migration `20261014230000` | Inalterado (`rollback.sql` converte as linhas `cancel_verification` em `unknown` com `queue_deletion_cancel_verification_rolled_back` antes de remover o status). Continua válido com a nova semântica de restauração. | T36-15 roda `rollback.sql` e a migration de novo no banco isolado com uma linha `cancel_verification` presente (opcional, uma vez). |

O deploy é **somente de código**: sem lock, sem indisponibilidade, sem ordem de operações. Antes de atualizar qualquer banco não descartável, tirar um snapshot `pg_dump` (política do projeto: nenhuma tabela de backup no banco). O banco de desenvolvimento é descartável e nunca é migrado (regra do proprietário).

## Seção 6, ponto a ponto

### 1. Nenhum DDL para a FT-36: CONFIRMADO COM CONDIÇÃO

Evidência: 1.1 acima. Condições: (i) as chaves `cancelVerification: { previousStatus, previousLastError, requestedAt }` são gravadas pelo begin **dentro da transação travada** e mescladas ao payload existente (nunca o substituem); `previousStatus` é um entre `pending/retry/unknown/failed/conflict`, `requestedAt` é ISO-8601 UTC; (ii) confirm e fail **removem** a chave (ou a movem para o `safeDetail` da auditoria), para que uma retomada futura nunca leia um `previousStatus` velho; (iii) a premissa sobre `entity_id` está corrigida na 1.3 (não existe índice; nenhum é necessário agora; o `@qa` registra o `EXPLAIN`).

### 2. Catálogo de auditoria: CONFIRMADO COM CONDIÇÃO

Evidência: (c). Condições: (i) o serviço repassa `actorId` para confirm e fail, e os dois métodos aceitam `actorId`/`origin`; (ii) o T36-13 verifica o conjunto exato de chaves dos três eventos (allowlist, sem chaves extras) e `actorId` não nulo nos três; (iii) os três códigos de motivo novos são usados literalmente; (iv) o código legado `queue_deletion_cancel_verification_failed` é lido como alias.

### 3. Transições da 1.2 como transações únicas protegidas: CONFIRMADO COM CONDIÇÃO

Cada transição é uma única `withQueueTransaction` que já toma o lock da fila e `FOR UPDATE` nas linhas `reward.%` (begin, fail e confirm já o fazem hoje). O que o `@dev` precisa mudar para cumprir a 1.2:

1. **Restauração de `previousStatus`** (substitui o `unknown` incondicional em `:880`): `updateMany({ where: { id, status: 'cancel_verification' }, data: { status: previousStatus, lastError: <código>, leaseToken: null, leaseUntil: null } })` com `count === 1`. O `nextAttemptAt` não é tocado pelo begin, então um `retry` restaurado mantém seu agendamento. Só uma leitura negativa **conclusiva** (recompensa ausente, divergente, não pausada) grava `unknown`; a fila vai para `remoteSyncStatus = 'diverged'` apenas em `queue_delete_reward_diverged`, como hoje (`:881-883`).
2. **Etapa de pausa bloqueada**: o alvo do begin passa a ser o `reward.delete` ou, quando não existe, a tarefa `reward.set_open` com `payload.deleteAfterConfirm = true` em `unknown/failed` (uma pausa `pending/retry` é recusada com `QUEUE_DELETION_PAUSE_IN_PROGRESS`). Hoje os três métodos filtram `operationType: 'reward.delete'` (`:877, :898`); devem receber o alvo por `operationId` e aceitar esses dois tipos. A confirmação cancela o alvo **e** toda outra tarefa de exclusão `reward.*` não final da fila, na mesma transação, com `updateMany ... WHERE status IN (não finais)`; o `updateMany` da fila mantém o CAS de `version` (`:908`). Se a tarefa de pausa for o alvo e a leitura disser que a recompensa **não** está pausada, seu `previousStatus` é restaurado com `queue_delete_cancel_reward_not_paused`.
3. **F18**: (b) acima.
4. **I2**: os `updateMany` do cancelamento filtram por `operationType IN rewardOperationTypes` e `entityId = queueId`, nunca por `redemptionId`. O `@qa` prova por mutação (um cancelamento que também marque `redemption.*` como `cancelled` deve falhar o T36-8) e por contagem de linhas: o número de linhas de `redemptions` e `redemption.*` e seus status antes e depois do cancelamento são idênticos.
5. **Status finais** `confirmed` e `cancelled` nunca são reescritos: todo `WHERE` inclui o status atual esperado.

### 4. DATA C3 atualizada: CONFIRMADO COM CONDIÇÃO

Escrita no [data-review.md](data-review.md) (C3, e o texto do teste 3 da DATA). Ciclo novo de 6; `attempts` monotônico; devolução no 401 por `cycleStartAttempts += 1` limitada a `attempts`; padrão legado 0. Condições: itens 3-6 da 1.2 (transação única, sem substituir o payload, `RETURNING` do `claimNext` inclui `payload`). Teste T-C3 acrescentado ao plano: depois de 6 tentativas esgotadas, "tentar agora" dá exatamente mais 6 tentativas, um 401 no meio não consome uma, e `attempts` nunca diminui (comparar `attempts` antes e depois).

### 5. DATA C6 atualizada: CONFIRMADO

Escrita no [data-review.md](data-review.md) (C6). `resolved_manual` não entra em `blockingOperations`; o caminho contradito a rearma. Evidência da lacuna atual que a FT-26 fecha: `getQueueDeletionBlockers` (`:1741-1751`) põe em `blocked` todo resgate `UNFULFILLED` cuja tarefa não está `pending/retry/processing`, o que inclui `resolved_manual`; `prepareRewardDelete` e `completeQueueDeletion` exigem que não exista `status: { not: 'confirmed' }` (`:1763, :1782`). A nova listagem após a resolução é a guarda (DATA C5); uma resolução manual sozinha nunca libera o `reward.delete`.

### 6. Nomes: CONFIRMADO

Nomes do catálogo: `attempts_exhausted` (`last_error` do outbox, `reason` da auditoria, projeção) e `financial.operation_retry_requested`. `retry_exhausted` e `financial.operation_retried_manually` estão retirados. O texto do teste 3 da DATA passa a "cada espera dentro dos seus limites, `next_attempt_at` não decrescente até o teto".

### 7. Testes T36-1..T36-13 no plano de PostgreSQL: CONFIRMADO COM CONDIÇÃO

Os treze são expressáveis com os helpers existentes de PostgreSQL descartável (`tests/helpers/isolated-postgres-image.mjs`, migrations reais, label `queuebot.test=disposable`, nunca SQLite nem mocks de Prisma, nunca um volume ativo). Nenhum exige DDL. Condições para o `@dev` (escrever vermelho primeiro) e o `@qa` (rodar de forma independente):

- **A. Fixtures que mudam:** `qra-postgres-fixtures.test.js:457-488` e `:497-528` (ver (e), F21). Reescrever antes de implementar; manter as asserções originais em linhas com `requestMayHaveReachedTwitch: false` e acrescentar o T36-5 para a recusa.
- **B. T36-4 (corrida):** duas conexões reais (dois clientes Prisma), uma barreira antes de cada chamada, N rodadas (sugestão: 50): `claimNextRewardOperation` contra `beginQueueDeletionCancellation`. Exatamente um vence em toda rodada; a invariante é verificada no banco depois de cada rodada: `NOT (status = 'processing' AND existe linha de auditoria cancel_verification daquela tentativa)`. Sem `sleep` como sincronização.
- **C. T36-7 (queda após o begin):** simular chamando só o begin, depois repetir o pedido com o mesmo operador e uma `Idempotency-Key` nova: retoma, executa uma vez, grava uma linha `..._requested` (não duas).
- **D. T36-9b (acrescentado):** forçar, em `confirmRewardOpen`, o caso "existe uma linha `reward.delete` em status diferente de cancelada pelo operador": deve falhar fechado (lançar/desfazer, a tarefa de pausa permanece `processing`) e nunca sobrescrever em silêncio.
- **E. T36-14 (acrescentado):** uma linha legada `cancel_verification` sem `payload.cancelVerification` retoma e, numa leitura não conclusiva, restaura para `unknown`.
- **F. T36-15 (acrescentado, opcional uma vez):** `rollback.sql` e a migration reaplicados com uma linha `cancel_verification` presente.
- **G. T-C3 (acrescentado):** ver ponto 4.
- **H. Extensão do T36-13:** o teste da allowlist de chaves de auditoria também verifica que nenhuma chave de `safe_detail` casa com `/user|login|name|token|header|input|body|uid/i`.
- **I.** Evidência de lock/plano da 1.3 (`EXPLAIN`), registrada, não verificada por asserção.

As provas de mutação do parecer permanecem como escritas; esta nota acrescenta uma: "restaurar sempre para `unknown` em vez de `previousStatus`" deve falhar uma variante do T36-1 com leitura não conclusiva (o T36-12 do parecer cobre o caso obsoleto; acrescentar o caso 5xx ao mesmo teste).

## Pendências para outros agentes

| Agente | Pendência |
|---|---|
| `@po` | Registrar que o F21 muda comportamento já testado (duas fixtures, um cancelamento mais estrito para linhas existentes) e confirmar o trade-off com `@architect`/proprietário; redação do AC 21 (já pedida pelo parecer). |
| `@architect` | Nada novo. Por favor, reconheça a precisão do índice de `entity_id` (1.3) e a consequência do F21. |
| `@dev` | Só começa depois dos demais gates; esta nota dá as linhas exatas (`:880`, `:1683`, `:2153`, `:2237`, o `unknown` do 401). |
| `@qa` | Acrescentar T36-9b, T36-14, T36-15 (opcional), T-C3 e o registro do `EXPLAIN` ao plano; rodar tudo em PostgreSQL isolado. |

## Histórico de alterações

- 2026-10-30 — `@data-engineer` (Dara): confirmação escrita da seção 6 do parecer do arquiteto (7 de 7 pontos: 2 CONFIRMADO, 5 CONFIRMADO COM CONDIÇÃO, 0 REFUTADO); sem DDL; F18 confirmado com evidência e corrigido reaproveitando a linha única de `reward.delete`; catálogo de auditoria finalizado; DATA C3 e C6 e o texto do teste 3 da DATA atualizados no [data-review.md](data-review.md). Análise somente leitura; nenhum schema, migration, código, teste ou container foi tocado.

## Adendo — decisão do Orion supera F21/D-36-6 (2026-10-30)

Este adendo não reescreve o corpo acima. No cancelamento com `requestMayHaveReachedTwitch` verdadeiro, o corpo propunha recusar (`QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`). O Orion decidiu (2026-10-30, ver [po-validation.md](po-validation.md) e CA 21): o cancelamento continua permitido quando uma leitura somente-leitura `cancel_verification` prova que a recompensa exata existe e está pausada; a recusa vale só quando a leitura é inconclusiva ou negativa depois de uma tentativa de DELETE. As fixtures atuais permanecem válidas.

Consequências:

- `@dev`: restaurar `previousStatus` em leitura não conclusiva (como no corpo); NÃO recusar quando a leitura é positiva (existe e está pausada); recusar com `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` apenas quando a leitura é inconclusiva/negativa depois de uma tentativa de DELETE; manter `qra-postgres-fixtures.test.js` ~:457-488 e ~:497-528 sem alteração (a condição "reescrever as fixtures" deixa de valer).
- `@qa`: novo T36 "DELETE tardio depois de um cancelamento verificado": a ação de abrir falha com segurança e a fila não é reaberta sem a recompensa; provar por mutação (remover a releitura na ação de abrir, ou reabrir sem leitura positiva, e o teste deve falhar). Manter o teste de recusa para o caso inconclusivo/negativo.
