# OPS-22 — Revisão de dados (`@data-engineer`, Dara)

[English](../../../stories/OPS-22/data-review.md)

**Data:** 2026-10-27. **Escopo:** revisão somente de leitura de `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `apps/api/src/outbox/financial-worker.mjs` e dos métodos de outbox/exclusão em `apps/api/src/persistence/queue-repository.mjs`. Nada foi executado (nenhuma migration, servidor, teste ou Docker). Responde ao gate do AC 12.

**Veredito: GO com condições. Nenhuma migration é necessária.** Condições C1-C8 na seção 6.

## 1. O schema comporta a política sem migration?

**Sim.** Cada valor de que a política precisa já tem coluna ou pode ficar em `outbox.payload` (JSONB, padrão `{}`, hoje sem uso pelas tarefas financeiras):

| Necessidade | Onde | Observações |
|-------------|------|-------------|
| Contador de tentativas | `outbox.attempts` (INT, `CHECK >= 0`) | Já é incrementado de forma atômica pelo `claimNext` no momento da reivindicação (`attempts = attempts + 1`), então uma queda depois da reivindicação também conta. Monotônico; nunca é zerado. |
| Próxima verificação / espera crescente | `outbox.next_attempt_at` | Já usado por `retry()` e pelo predicado de reivindicação. |
| Classe do motivo / último código | `outbox.last_error` (código, <= 64) + `payload.reasonClass` | `reasonClass` enumerado: `remote_read_unrecognized`, `remote_read_transient`, `remote_not_found`, `authorization_required`. |
| `unknownSince` | `payload.firstNonConclusiveAt` (ISO-8601 UTC) | Gravado uma vez, no primeiro resultado não conclusivo, nunca sobrescrito. Alternativa para linhas antigas: `updated_at`. |
| Máximo de tentativas | Constante no código `FINANCIAL_MAX_ATTEMPTS = 6` | Não por linha; uma coluna abriria espaço para divergência. |
| Orçamento da retentativa manual | `payload.cycleStartAttempts` (INT) | Ver C3: `attempts - cycleStartAttempts` são as tentativas do ciclo atual; o total `attempts` continua monotônico para a trilha de auditoria. |
| Terminal "precisa de revisão" | status existente `unknown` + `last_error = 'attempts_exhausted'` | **Não adicione novo status ao outbox** (`needs_review`): a `outbox_status_check` (migration `202610050001_manual_outbox_resolution`) exigiria uma migration de DROP/ADD da constraint. A projeção de saúde deriva `needs_review` = `status='unknown'` e `degraded` = `status IN ('retry','processing')` com `reasonClass` não conclusivo. |
| Sincronização do resgate | `redemptions.sync_status` (TEXT, **sem CHECK**) | Valores já em uso: `observed`, `pending`, `confirmed`, `conflict`, `unknown`, `operator_resolved`. Nenhum valor novo é necessário. |
| Estados de exclusão (excluída / pendente / bloqueada) | `queues.lifecycle_status` (CHECK `active/deleting/deleted`) + bloqueios derivados | Derive "bloqueada" de `getQueueDeletionBlockers` (contagem de tarefas financeiras em `unknown/conflict/failed/resolved_manual` da recompensa); não grave novo `remote_sync_status`. `remote_sync_status` não tem CHECK, então gravar também não exigiria migration, mas um valor derivado não cria transição extra para manter consistente. |

**Índice:** a consulta de reivindicação filtra `operation_type IN (...)`, `status IN ('pending','retry')`, `next_attempt_at <= now` e ordena por `next_attempt_at`. O `outbox_status_next_attempt_at_idx (status, next_attempt_at)` existente a cobre. O reverificador **é o próprio worker** (uma reverificação é uma reivindicação normal de uma linha `retry` cujo primeiro passo é o `getRedemptionStatus` somente de leitura), então não há segundo varredor nem índice novo. Reavaliar só se um `EXPLAIN` em volume realista mostrar seq scan dominado por linhas não financeiras; aí a candidata é um índice parcial `ON outbox (next_attempt_at) WHERE operation_type IN ('redemption.cancel','redemption.fulfill') AND status IN ('pending','retry')` (aditivo, `CREATE INDEX CONCURRENTLY`, rollback `DROP INDEX`).

**Se o `@architect` ainda preferir colunas tipadas** (não recomendado): uma migration aditiva `ALTER TABLE outbox ADD COLUMN unknown_since timestamptz NULL, ADD COLUMN reason_class text NULL CHECK (reason_class IS NULL OR reason_class IN (...))`; sem default, sem backfill (NULL = legado), rollback `DROP COLUMN` após snapshot com `pg_dump`. Não é necessária para nenhum AC.

**Backfill das linhas `unknown` existentes:** nenhum. Linhas `unknown` antigas continuam terminais até a pessoa operadora usar "tentar agora" (auditado). Rearmar automaticamente linhas antigas seria uma migração de dados que nada confirma por si só, mas dispararia escritas em resgates antigos; fora de escopo e não recomendado.

## 2. Tabela de estados do outbox, atomicidade, corridas, idempotência

### 2.1 Tarefas financeiras (`redemption.cancel` / `redemption.fulfill`)

| De | Para | Quem | Proteção | Mudança nesta story |
|----|------|------|----------|---------------------|
| `pending`/`retry` (vencida) | `processing` | worker `claimNext` | `FOR UPDATE SKIP LOCKED`, novo `lease_token`, `attempts+1` | nenhuma |
| `processing` (lease expirado) | `processing` | worker `claimNext` | idem | nenhuma (conta como tentativa) |
| `processing` | `confirmed` | worker, só após leitura positiva ou resposta da escrita com o status esperado | `status='processing' AND lease_token` | nenhuma |
| `processing` | `conflict` | worker (leitura mostra o estado final oposto) | lease | nenhuma |
| `processing` | `retry` | worker, falha transitória ou **leitura não conclusiva** e tentativas do ciclo < 6 | lease | **nova:** leitura não conclusiva (mapeamento `UNKNOWN`, 404 na leitura) vai para `retry` em vez de `unknown` enquanto abaixo do limite |
| `processing` | `unknown` | worker, tentativas do ciclo >= 6 com resultado não conclusivo | lease | **nova:** `last_error='attempts_exhausted'`, terminal |
| `processing` | `unknown` | worker, 401 | lease | permanece (`authorization_required`, `blocked_auth`); rearmado pela reautorização (AC 16), não pelo contador |
| `processing` | `failed` | worker, 4xx permanente / não suportado | lease | nenhuma |
| `pending`/`retry`/`processing` | `unknown` | reconciliação `markRedemptionUnknown` | **nenhuma (sem verificar lease)** | **precisa mudar, C4** |
| `pending`/`retry`/`processing`/`unknown`/`resolved_manual` | `confirmed`/`conflict` | `recordExternalRedemptionState` (observação terminal positiva via EventSub/reconciliação) | nenhuma | aceitável: só uma observação remota positiva pode sobrepor; a escrita posterior do worker com lease recebe `count=0` |
| `unknown`/`conflict`/`failed` | `pending` | operação "tentar agora" `retryOutboxManually` | `status` igual | **nova:** grava `payload.cycleStartAttempts`, auditoria (C3) |
| `unknown` | `resolved_manual` | operação "Verifiquei na Twitch" | `status='unknown'` | mantém; nunca altera `remote_status` (C5) |

Terminais hoje: `unknown`, `conflict`, `failed`, `resolved_manual`, `confirmed`, `cancelled`. Depois desta story, uma leitura não conclusiva deixa de ir direto para `unknown`: vira `retry` até 6 tentativas; `unknown` passa a ser alcançado só por esgotamento, 401 ou (após C4) não mais pela reconciliação durante a janela automática.

### 2.2 Atomicidade

Hoje `retry()`, `unknown()`, `conflict()` e `failed()` são `updateMany` únicos em `outbox`, sem tocar `redemptions` nem `audit_logs`; só `confirm()` atualiza o resgate na mesma transação. Requisito (C2): toda transição nova (`retry` por motivo não conclusivo, esgotamento para `unknown`, retentativa manual, confirmação por reverificação) roda em **um único `prisma.$transaction`** que (1) atualiza `outbox` com `WHERE id AND status='processing' AND lease_token=$token` e confere `count === 1`, (2) atualiza `redemptions.sync_status` (`pending` durante as retentativas, `unknown` no esgotamento, `confirmed` na leitura positiva), (3) grava a linha de auditoria. Se (1) retornar 0, nada mais é gravado. A mesclagem do payload (`firstNonConclusiveAt`, `reasonClass`) é leitura-modificação-escrita dentro da mesma transação após `SELECT ... FOR UPDATE` na linha do outbox (mesmo padrão de `lockProcessingRewardTask`), ou um único `jsonb_set`/`||` em SQL bruto; nunca fora da transação.

### 2.3 Corridas (worker x reconciliação x reverificador x exclusão)

- **Worker x worker:** seguro — `SKIP LOCKED` + `lease_token` por reivindicação; toda gravação de resultado é protegida pelo lease.
- **Reverificador:** não é processo separado (ver seção 1), então não há corrida nova.
- **Reconciliação x worker (risco real, C4):** `markRedemptionUnknown` grava `unknown` em `pending/retry/processing` sem verificar lease e limpa o lease. Na janela das 6 tentativas isso (a) rouba um lease vivo no meio da escrita (o `confirm` do worker passa a retornar `false` embora a Twitch possa ter aplicado a escrita) e (b) torna a tarefa terminal fora do contador. Correção: a reconciliação não pode tocar linhas `processing` com `lease_until > now()` nem gravar `unknown` em tarefas financeiras enquanto as tentativas do ciclo forem < 6; pode registrar só `redemptions.sync_status` e uma linha de auditoria.
- **Exclusão x worker:** `recordQueueDeletionRedemptions` usa `withQueueTransaction` e só cria `redemption.cancel` quando não existe tarefa `financial:<id>`; nunca reescreve o status de tarefa existente. Seguro. `prepareRewardDelete`/`completeQueueDeletion` travam a tarefa da recompensa e reconferem os bloqueios dentro da transação. Seguro.
- **Resolução manual x worker:** `resolveUnknownFinancialOperation` só casa `status='unknown'` (nunca `processing`), então não disputa um lease vivo. Seguro.

### 2.4 Idempotência de "cancelar resgate aberto" na exclusão

`outbox.idempotency_key` é UNIQUE e a chave é `financial:<redemptionId>` tanto para cancel quanto para fulfill, então existe no máximo uma intenção financeira por resgate. Um `redemption.fulfill` existente prevalece (serviço concluído), um `redemption.cancel` existente não é duplicado, e repetir a exclusão é idempotente. Lacuna (C6): `recordQueueDeletionRedemptions` só reaponta `redemptions` para um cancel existente; não rearma um cancel em `unknown`. Isso está correto nesta política (rearmar cabe ao worker/à operação), mas a projeção da exclusão precisa informá-lo como bloqueio.

### 2.5 Exclusão após resolução manual (lacuna bloqueante, C5)

`prepareRewardDelete` e `completeQueueDeletion` tratam como pendente qualquer resgate com `remote_status='UNFULFILLED'` **ou** qualquer tarefa financeira com `status <> 'confirmed'`. `resolveUnknownFinancialOperation` grava `resolved_manual` e `sync_status='operator_resolved'`, mas mantém `remote_status='UNFULFILLED'`. Resultado: depois de "Verifiquei na Twitch" a exclusão **nunca é retomada**, contrariando o AC 14. A correção não pode enfraquecer a invariante financeira: a resolução manual rearma o fluxo de exclusão, que então executa o passo (c) do AC 13 — uma leitura remota positiva (`getRedemptionStatus` por resgate ou a nova listagem) — e registra o status terminal observado pelo caminho existente de observação positiva. O `reward.delete` só é emitido quando nenhum resgate daquela recompensa está `UNFULFILLED` **segundo uma leitura remota feita depois da resolução**. A resolução manual sozinha nunca libera o `reward.delete` (o Delete Custom Reward transformaria silenciosamente um resgate ainda `UNFULFILLED` em `FULFILLED`).

## 3. Eventos de `audit_logs` (sem dados sensíveis)

Colunas usadas: `queue_id`, `redemption_id` (FK interna, prática existente), `event`, `actor_id` (só da pessoa operadora), `origin`, `previous_state`, `next_state`, `reason` (código enumerado), `safe_detail`. Nunca: user id/login/nome de exibição do espectador, corpo/entrada do resgate, tokens, headers, mensagens brutas de erro da Twitch, connection strings.

| Evento | Origem | anterior → próximo | `reason` | `safe_detail` |
|--------|--------|--------------------|----------|---------------|
| `financial.operation_retry_scheduled` | `system` | `processing → retry` | código de `last_error` | `{ operationType, attempt, cycleAttempt, maxAttempts: 6, nextAttemptAt, httpStatus, reasonClass }` |
| `financial.operation_attempts_exhausted` | `system` | `processing → unknown` | `attempts_exhausted` | `{ operationType, attempts, firstNonConclusiveAt, reasonClass }` |
| `financial.operation_confirmed_by_reverification` | `system` | `processing → confirmed` | `remote_read_positive` | `{ operationType, attempts, remoteConfirmed: true, remoteStatus }` |
| `financial.operation_retry_requested` | `panel` | `unknown/conflict/failed → pending` | `operator_retry_now` | `{ operationType, previousAttempts, cycleStartAttempts }` |
| `financial.operation_resolved_manually` (existente) | `panel` | `unknown → resolved_manual` | `operator_verified_on_twitch` | `{ remoteConfirmed: false, expectedStatus, attempts }` |
| `queue.deletion_blocked` | `system` | `deleting → deleting` | `financial_operations_need_review` | `{ blockedCount, pendingCount }` — só quando a contagem muda, para evitar ruído |
| `queue.deletion_resumed` | `system`/`panel` | `deleting → deleting` | `blockers_cleared` | `{ resolvedBy: 'remote_read' \| 'operator' }` |
| `queue.deletion_confirmed` (existente) | `system` | `deleting → deleted` | `reward_deleted_after_refunds_confirmed` / `reward_already_absent` | `{ rewardId }` (existente; manter distinta a variante 404) |

Volume: no máximo 6 linhas de retentativa por tarefa; aceitável. O `twitchErrorCode` nos logs (AC 10) é limitado a 64 caracteres; mesmo limite para `reason`.

## 4. Testes de banco obrigatórios (PostgreSQL descartável, migrations reais, sem mocks de Prisma)

Use o harness existente: estilo de `tests/integration/queue-repository.test.js` com `tests/helpers/isolated-postgres-image.mjs` (`postgres:18.6-bookworm`, label `queuebot.test=disposable`) e `tests/helpers/isolated-postgres-cleanup.mjs` (limpeza com prazo, remove só contêineres rotulados). Aplicar `prisma migrate deploy` com o conjunto completo de migrations; nenhum volume ativo é tocado. Relógio falso injetado pelo `clock` do repositório.

1. **Corrida de reivindicação:** dois `PrismaClient` chamam `claimNext` ao mesmo tempo sobre uma tarefa vencida → exatamente uma linha retornada; o perdedor recebe `null`; `attempts` incrementado uma vez.
2. **Lease vencido:** o lease do worker A expira, B reivindica; `retry/confirm/unknown` de A com o token antigo retorna `count=0`; a linha reflete só B.
3. **Seis tentativas:** leitura não conclusiva 5 vezes → `retry` a cada vez com `next_attempt_at` estritamente crescente (limitado pelo teto de 1 h) e `firstNonConclusiveAt` inalterado; a 6ª → `unknown`, `last_error='attempts_exhausted'`, `redemptions.sync_status='unknown'`, uma linha de auditoria de esgotamento; `claimNext` em `now + 1 dia` retorna `null`.
4. **Nenhuma confirmação sem leitura positiva (AC 9):** após qualquer sequência acima, um `SELECT` comprova que não há outbox `confirmed` e que `remote_status` não mudou.
5. **Reverificação positiva:** a tentativa 3 lê o status esperado → `confirmed` + `sync_status='confirmed'` + auditoria, em uma transação (comprovar tudo ou nada forçando falha no passo 3 da transação).
6. **Reconciliação x lease vivo (C4):** uma tarefa `processing` com lease válido não é tocada por `markRedemptionUnknown`; abaixo do limite não vira `unknown`.
7. **Retentativa manual:** `unknown` → `pending` com `cycleStartAttempts` = `attempts` anterior, linha de auditoria com ator; `attempts` não é zerado.
8. **Resolução manual:** `resolved_manual`, `sync_status='operator_resolved'`, `remote_status` inalterado, auditoria `remoteConfirmed:false`; uma observação positiva posterior via EventSub a move para `confirmed`/`conflict`.
9. **Retomada da exclusão (AC 14/17):** fila `deleting` com um resgate em cada estado — aberto, `unknown`, já `CANCELED`, já `FULFILLED`: nenhum `reward.delete` reivindicável enquanto houver bloqueio; depois que o bloqueio é confirmado por leitura, a exclusão conclui; depois da resolução manual, a exclusão é retomada, mas `completeQueueDeletion` recusa enquanto a leitura posterior à resolução ainda mostrar `UNFULFILLED`.
10. **Cancelamento idempotente:** rodar `recordQueueDeletionRedemptions` duas vezes cria um `redemption.cancel` por resgate; um `redemption.fulfill` existente é mantido.
11. **Linhas antigas:** uma linha `unknown` preexistente com `payload='{}'` e `attempts=1` é lida corretamente (alternativas) e continua terminal até a retentativa manual.
12. **Conteúdo da auditoria:** para todo evento acima, as chaves de `safe_detail` estão na lista permitida (sem `userId`, `login`, `input` ou campos com cara de token).

## 5. Impacto em bancos existentes e ordem segura

- **Sem DDL**, logo sem ordem de migration, lock ou indisponibilidade. A implantação é só de código.
- Antes de atualizar qualquer banco não descartável, tirar snapshot com `pg_dump` (política do projeto; nada de tabelas de backup). O banco de dev é descartável e não é migrado (regra do proprietário).
- **Mudanças de comportamento em linhas existentes:** (a) linhas `unknown` antigas continuam terminais (sem backfill); (b) linhas `retry` com `attempts >= 6` vindas do antigo caminho transitório sem limite viram `unknown` no próximo resultado não conclusivo — visíveis em Operações, nunca confirmadas; (c) linhas `resolved_manual` em fila `deleting` iniciam a reverificação da exclusão (C5) — nenhuma escrita antes de uma leitura remota.
- **Rollback:** reverter o código é seguro. O código antigo ignora as novas chaves do payload, trata `retry` como antes (sem limite) e aceita os novos nomes de evento de auditoria. Nenhum reparo de dados é necessário.
- **Ordem de entrega na story:** fatia 1 (mapeamento de leitura) primeiro — sem ela toda leitura `UNFULFILLED` continua não conclusiva e as 6 tentativas são consumidas pelo bug de mapeamento; depois a fatia 2; depois a fatia 3.

## 6. Veredito

**GO com condições. Sem migration.**

- **C1** Nenhum status novo no outbox; terminal "precisa de revisão" = `unknown` + `attempts_exhausted`; `needs_review` x `degraded` derivados na projeção.
- **C2** Toda transição nova é uma transação, protegida pelo lease (`count === 1`), atualizando juntos `outbox` + `redemptions.sync_status` + `audit_logs`; mesclagem do payload dentro dela.
- **C3** O limite do ciclo usa `attempts - payload.cycleStartAttempts`; `attempts` nunca é zerado. [AUTO-DECISION] orçamento concedido por "tentar agora" → 1 tentativa (motivo: a política de 6 tentativas do proprietário termina em tratamento manual; um novo ciclo de 6 a cada clique tornaria a ação manual um laço sem fim). O `@architect` pode trocar por um novo ciclo de 6; o desenho de persistência suporta os dois.
- **C4** `markRedemptionUnknown` não pode tocar linhas `processing` com lease vivo nem gravar `unknown` em tarefas financeiras abaixo do limite.
- **C5** A resolução manual nunca altera `remote_status` e nunca libera `reward.delete` sozinha; a exclusão é retomada passando por uma leitura remota positiva antes do delete.
- **C6** A projeção da exclusão conta tarefas financeiras `unknown/conflict/failed/resolved_manual` como bloqueio (já é assim em `getQueueDeletionBlockers`) e expõe a contagem em Operações.
- **C7** Testes 1-12 da seção 4 em PostgreSQL isolado com migrations reais, Red-first.
- **C8** Se alguma decisão posterior exigir DDL (colunas tipadas ou o índice parcial), ela volta ao `@data-engineer` como migration aditiva com snapshot, dry-run e script de rollback.

**Dependências:** `@architect` (valores de espera das 6 tentativas, orçamento da retentativa manual C3, regra de retomada da exclusão C5); fatia 1 antes da fatia 2; contrato de idempotência da OPS-21 para as novas mutações; `@qa` para a execução independente em PostgreSQL.
