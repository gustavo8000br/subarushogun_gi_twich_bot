# OPS-22 — Parecer do arquiteto sobre a FT-36, os itens abertos e o pacote de ciclo único (`@architect`)

[English](../../../stories/OPS-22/architect-review-ft36.md)

**Autora:** `@architect` (Aria), 2026-10-30. **Status:** CONCLUÍDO para a parte do `@architect` na revalidação do `@po` de 2026-10-30 ([po-validation.md](po-validation.md), adendo de 2026-10-30, correções 2 e 6).
**Classe de evidência:** só li código na branch `feat/ops-15-next-panel` e os documentos listados abaixo. Não rodei nenhum teste, servidor, container, banco, chamada ao GitHub ou à Twitch. O que se afirma sobre a Twitch ao vivo continua NÃO VERIFICADO até o AC 19 (OW-16).
**Entradas:** [story.md](story.md), [po-validation.md](po-validation.md), [architecture-decisions.md](architecture-decisions.md) (citado como "ARCH §n", achados F1-F14), [data-review.md](data-review.md) ("DATA §n", C1-C8), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) (fatia S-D, FT-23), as linhas FT-23, FT-28 e FT-36 do [inventário do backlog](../../process/backlog-inventory.md), e estes arquivos de código: `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/domain/queue-service.mjs`, `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/outbox/financial-worker.mjs`, `apps/api/src/twitch/reconciliation.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/twitch/redemption-processor.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/shared/panel/queue-action-state.mjs`, `apps/frontend/features/queues/*`, `apps/frontend/features/panel-shell/*`, `apps/frontend/app/(panel)/*`, e a migration `apps/api/prisma/migrations/20261014230000_outbox_deletion_cancel_verification`.
**Pesquisa:** nenhuma nova. A regra de ouro foi seguida: a nota de pesquisa nº 20 (sincronização de resgates) está SUFICIENTE e cobre o comportamento da Twitch usado aqui. A seção 4 evita a única questão de API do Next.js que não tem nota (ver "Lacuna de pesquisa").
**Fora desta decisão:** DDL e catálogo de auditoria (`@data-engineer`), texto visível (plano de UX FT-23 + FT-36, `@ux-design-expert`), redação dos ACs (`@po`).

## 0. Achados que mudam o quadro da FT-36 (VERIFICADOS pela leitura)

O "cancelar exclusão" **já existe de ponta a ponta**. O ARCH §2 o listou como "intocado". A FT-36, portanto, **endurece e completa um mecanismo existente**. Ela não constrói uma transição reversa nova.

| # | Achado | Onde | Efeito na FT-36 |
|---|---|---|---|
| F15 | Já existe um cancelamento em três passos. (1) `beginQueueDeletionCancellation` pega o lock consultivo da fila e `FOR UPDATE` nas linhas `reward.*` da outbox dessa fila, recusa qualquer tarefa de recompensa em `processing` e move `reward.delete` de `pending/retry/unknown/failed/conflict` para `cancel_verification`. (2) O serviço de domínio lê a recompensa na Twitch (`getReward`). (3) `confirmQueueDeletionCancellation` reconfere com os mesmos locks mais a versão da fila, exige `matchesManagedRewardState(reward) && reward.isPaused === true`, põe `reward.delete` em `cancelled` (`queue_deletion_cancelled_by_operator`) e a fila em `active`, `isArchived: true`, `isOpen: false`, `remoteSyncStatus: 'synced'`. Se não, `failQueueDeletionCancellation` põe `reward.delete` em `unknown` com um código. | `queue-repository.mjs:843-919`; `queue-service.mjs:62-98`; rota `POST /api/queues/:queueId/delete/cancel` `queue-routes.mjs:774-790` | Mecanismo, locks e CAS já existem. |
| F16 | `cancel_verification` já é um status permitido da outbox (restrição CHECK, com script de rollback). Nenhum worker o reivindica: o claim de recompensa pega só `pending/retry` ou `processing` com lease vencido, e o claim financeiro pega só os tipos financeiros. | migration `20261014230000_outbox_deletion_cancel_verification`; `queue-repository.mjs:1574-1578, 2136-2145` | O "lease" contra um delete em voo já existe: `cancel_verification` é um status que não pode ser reivindicado. **Sem DDL.** |
| F17 | O painel Next já oferece "cancelar exclusão" (diálogo, códigos mapeados para chaves de catálogo). A visibilidade do botão vem de uma **heurística no cliente** sobre `remoteSyncStatus` (`delete_pending/delete_unknown/delete_failed/diverged`), não da regra do servidor. | `queue-action-state.mjs:33-36`; `queue-lifecycle.mjs:4-26, 64-85`; `queue-lifecycle-actions.jsx:50-60, 92` | O botão pode discordar do servidor. O texto visível precisa entrar no plano de UX FT-23 + FT-36. |
| F18 | **Defeito latente (excluir de novo depois de um cancelamento):** quando a exclusão começa numa fila *aberta*, `confirmRewardOpen` chama `tx.outbox.create` para `reward.delete` com a chave fixa `queue:<id>:reward.delete`. Depois de um cancelamento essa linha existe como `cancelled`, então o create viola a chave UNIQUE e a confirmação da pausa é desfeita. Só `enqueueRewardDeleteIntent` (caminho da fila fechada) reaproveita a linha cancelada. | `queue-repository.mjs:1683-1687` vs `:110-137` | Precisa ser corrigido na FT-36 (teste Red primeiro). |
| F19 | Etapa da pausa: enquanto a fila está em `deleting/pending_close` (tarefa de pausa `reward.set_open` com `deleteAfterConfirm`) ainda não existe `reward.delete`. O cancelamento responde `QUEUE_DELETION_NOT_PENDING`, e isso inclui uma pausa **bloqueada** (`close_unknown`/`close_failed`). | `queue-repository.mjs:829-834, 855-856`; `:1833-1838, 1854-1859` | Lacuna frente ao AC 21 ("pendente ou bloqueada"). |
| F20 | Uma verificação que falha sempre põe `reward.delete` em `unknown`, mesmo quando a falha de leitura foi transitória (5xx, rede, 401). Uma exclusão `pending` saudável vira `unknown` porque uma leitura falhou. | `queue-service.mjs:73-79`; `queue-repository.mjs:880` | Restaurar o status anterior numa leitura não conclusiva (seção 1.4). |
| F21 | O cancelamento é aceito mesmo quando um DELETE **pode já ter chegado à Twitch** (`payload.requestMayHaveReachedTwitch === true`, gravado por `prepareRewardDelete` logo antes de `deleteReward`). | `queue-repository.mjs:861, 1767`; `reward-worker.mjs:304-319` | Precisa ser recusado (seção 1.3). |
| F22 | As linhas de auditoria de confirmação e de falha não têm `actorId`; só a de início tem. | `queue-repository.mjs:866, 886, 914` | O AC 21 pede o ator em cada passo auditado. |
| F23 | `queueMode !== 'channel_points'` é recusado. Exclusões de filas convertidas para manual e de filas locais terminam localmente quando os reembolsos se resolvem (`requestQueueDeletion`, `:698-755`). | `queue-repository.mjs:848` | Decisão de escopo na seção 1.6. |
| F24 | O `PanelProvider` é montado por página (`page.jsx → PanelRoot → PanelShell → PanelProvider`). A navegação usa `<a>`, e o app não usa `next/navigation` nem `next/link` em lugar nenhum. O aviso de exclusão é estado local do cartão e se perde quando o cartão é desmontado. | `app/(panel)/queues/page.jsx`; `panel-root.jsx`; `panel-shell.jsx:60-69`; `panel-provider.jsx:20-67`; `queue-lifecycle-actions.jsx:13, 50` | Base da decisão FT-23/FT-28 (seção 4). |

## 1. FT-36 — desenho da transição reversa

### 1.1 O que "reaberta" significa (e a recompensa pausada)

**Decisão D-36-1: a recompensa continua pausada depois do cancelamento.** Um cancelamento bem-sucedido devolve a fila para `lifecycleStatus='active'`, `isArchived=true`, `isOpen=false`, `remoteSyncStatus='synced'`, com a recompensa **comprovadamente pausada por uma leitura positiva**. É o estado que o código atual já grava. O público só volta a ter acesso pelas ações existentes "mostrar ao público" (desarquivar, `queue-repository.mjs:674-690`) e "abrir". "Abrir" enfileira `reward.set_open(isOpen=true)`, que o worker só confirma pela resposta da Twitch e pela releitura (`reward-worker.mjs:218-227`). Essa abertura é a **escrita verificada que desfaz a pausa**, e é a pessoa operadora que a dispara, de forma explícita.

| Opção | Trade-off | Veredito |
|---|---|---|
| A. O cancelamento devolve a fila arquivada e fechada, com a recompensa ainda pausada (verificada); a reabertura usa as ações verificadas existentes | Um passo atômico. Nenhuma cadeia nova na outbox. Nenhum estado com a fila aberta e a recompensa não verificada. A pessoa operadora decide quando o público pode gastar pontos de novo, já que as entradas foram removidas e a fila recomeça vazia. | **Escolhida** |
| B. O cancelamento também enfileira `reward.set_open(true)` e desarquiva | Um clique só para a pessoa operadora. Mas soma uma segunda escrita remota ao cancelamento. Exige um estado intermediário novo ("cancelado, reabrindo"). Começa a cobrar o público numa fila que a pessoa operadora acabou de esvaziar, antes de qualquer decisão de reabrir. | Rejeitada |
| C. O cancelamento restaura o retrato de antes da exclusão (aberta ou fechada) | Exige guardar um retrato e também escreve na Twitch. Mesmas objeções de B. | Rejeitada |

**Redação do AC 21 (`@po`):** "sua recompensa é reaberta com segurança (a pausa é revertida por uma escrita verificada)" deve passar a dizer: "a fila volta a ficar ativa, arquivada e fechada com a recompensa verificada como pausada; a pausa só é revertida pela ação de abrir já existente, cuja escrita é verificada". Isso refina o mecanismo dentro da margem que o AC 21 dá ao `@architect`. A regra "nenhuma suposição sem leitura remota positiva" se mantém.

### 1.2 Máquina de estados reversa

Os estados são `queue.lifecycleStatus/remoteSyncStatus` mais a tarefa de exclusão que decide o resultado. Só valores de status existentes são usados.

```text
PEDIDO DE CANCELAMENTO (operador, chave de idempotência, confirm:true)
│
├─ fila deleted ──────────────────────────────────────────► 409 QUEUE_DELETION_ALREADY_COMPLETED (nada muda)
├─ fila não está deleting / não é channel_points / sem recompensa ► 409 QUEUE_DELETION_NOT_PENDING (nada muda)
├─ alguma tarefa reward.* em `processing` (qualquer lease) ► 409 QUEUE_REWARD_OPERATION_PROCESSING (nada muda)
├─ payload.requestMayHaveReachedTwitch em reward.delete ──► 409 QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED (nada muda)
├─ etapa da pausa, tarefa de pausa pending|retry ──────────► 409 QUEUE_DELETION_PAUSE_IN_PROGRESS (nada muda)
│
├─ alvo = reward.delete ∈ {pending, retry, unknown, failed, conflict}           ┐  "exclusão pendente" ou
├─ alvo = tarefa de pausa ∈ {unknown, failed} (pausa bloqueada, sem reward.delete) ┘  "exclusão bloqueada"
│        │  INÍCIO (uma transação: lock da fila + FOR UPDATE nas linhas reward.*)
│        ▼
│   alvo → cancel_verification ; payload.cancelVerification = { previousStatus, previousLastError, requestedAt }
│   auditoria queue.deletion_cancel_verification_requested (actorId, previousState)
│        │  LEITURA getReward(rewardId) fora da transação (nenhuma escrita na Twitch)
│        ├─ existe, bate com a configuração gerida, isPaused === true ─► CONFIRMAÇÃO (uma transação, mesmos locks,
│        │        CAS de versão, nenhuma reward.* em processing): alvo → cancelled ; demais tarefas de exclusão
│        │        reward.* não finais → cancelled ; fila deleting → active/archived/closed/synced ;
│        │        auditoria queue.deletion_cancelled ─► 200 {status:'cancelled'}
│        ├─ 404 / null (recompensa ausente) ────────────► alvo → unknown('queue_delete_reward_absent')       ─► 200 not_cancelled
│        ├─ existe mas divergente ou NÃO pausada ───────► alvo → unknown('queue_delete_reward_diverged')
│        │                                                 (tarefa de pausa: volta ao previousStatus com
│        │                                                  'queue_delete_cancel_reward_not_paused')          ─► 200 not_cancelled
│        └─ não conclusiva (5xx, rede, timeout, 401) ───► alvo → previousStatus (restaurado, F20)
│                                                         lastError 'queue_deletion_cancel_verification_unavailable'
│                                                         (401: 'authorization_required')                     ─► 200 not_cancelled
│
└─ alvo já em cancel_verification (queda do processo ou clique concorrente) ─► retoma na LEITURA (idempotente)
```

A confirmação também passa por estas duas situações:
- **Versão mudou durante a confirmação** (por exemplo, a reconciliação marcou a fila): o alvo volta ao `previousStatus` com `queue_deletion_cancel_verification_stale`, e a resposta é 409 `QUEUE_DELETION_CANCELLATION_STALE`. Isso substitui a ida para `unknown` de hoje.
- **Excluir de novo depois de um cancelamento:** os dois caminhos reaproveitam a linha `reward.delete` `cancelled` por `enqueueRewardDeleteIntent` (corrige F18). A tentativa anterior fica em `payload.previousCancelledAttempt` (já existe).

### 1.3 Corrida com um `reward.delete` em voo (CAS, lock e lease que já existem)

Não é preciso nenhuma primitiva nova. A garantia é a composição abaixo. Cada parte já existe, salvo as marcadas como "nova".

1. **Exclusão mútua com o worker:** o início, a confirmação e `claimNextRewardOperation` rodam todos em `withQueueTransaction` (lock consultivo por fila) e pegam `FOR UPDATE` nas linhas de recompensa (`:845, :896, :1588`). Início e claim ficam, portanto, serializados por fila.
2. **Nenhum claim depois do CAS:** `cancel_verification` não está no predicado de claim (F16). Depois que o início é confirmado no banco, o worker não consegue começar um DELETE.
3. **Nenhum cancelamento durante um claim:** o início recusa **qualquer** tarefa de recompensa em `processing`, **com ou sem lease válido** (`:852`). Um worker que caiu deixa `processing` com lease vencido. O worker o reivindica de novo e termina ou reagenda, e só então um cancelamento pode rodar. Aceito: cerca de 30 s de lease.
4. **Nenhum cancelamento depois do passo irreversível (nova, F21):** `prepareRewardDelete` grava `requestMayHaveReachedTwitch: true` na transação protegida pelo lease, logo antes de `deleteReward`. Um DELETE que deu erro ainda pode ser aplicado pela Twitch. Um `getReward` posterior pode chegar atrasado (consistência NÃO VERIFICADA). Reabrir permitiria então que resgates novos fossem cumpridos automaticamente quando o DELETE atrasado chegasse (pesquisa Q3). Por isso o início recusa com `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` e deixa a exclusão terminar. O custo é baixo: nesse ponto todos os resgates já foram resolvidos (`prepareRewardDelete` exige isso), então cancelar não poupa nada à pessoa operadora.
5. **CAS de status no resultado:** confirmação e falha usam `updateMany ... WHERE status='cancel_verification'` com `count === 1`, mais o CAS de `version` da fila (`:904-911`).
6. **"Tentar agora" manual e retomada automática da FT-26:** `retryOutboxManually` só casa `unknown/conflict/failed` e atualiza com `WHERE status = <status lido>`, então perde para `cancel_verification` (0 linhas). **Regra da FT-26 (nova, invariante I7):** a retomada automática depois de uma confirmação financeira põe `nextAttemptAt = now` **só** num `reward.delete` em `retry` de uma fila que ainda está em `deleting`. Ela nunca toca `cancelled` nem `cancel_verification`.
7. **Arquivamento local** recusa enquanto existir `cancel_verification` (`:640-642`). Sem mudança.

### 1.4 Invariantes financeiros

| # | Invariante | Como se mantém |
|---|---|---|
| I1 | Nenhum resgate nem tarefa financeira vira `confirmed` sem leitura remota positiva | A FT-36 **nunca escreve** em `redemptions` nem nas linhas `redemption.*` da outbox. Só o worker da FT-25 e o caminho de observação positiva F11 confirmam. |
| I2 | As tarefas de cancelamento da exclusão **não** são canceladas pelo cancelamento | Um `redemption.cancel` em `pending/retry/processing` **continua rodando** e reembolsa o espectador. A entrada dele já foi removida quando a exclusão começou, então parar o reembolso cobraria alguém que não vai ser atendido. `confirmed` continua final (o reembolso do AC 21 é final). `unknown/conflict/failed/resolved_manual` ficam em Operações para a revisão normal da FT-25. Um `redemption.fulfill` continua rodando (espectador atendido). A reconciliação da fila reaberta os vê como `already_recorded` (`importRedemption`, `queue-repository.mjs:2388-2389`). |
| I3 | Nenhuma perda de entradas ou de histórico | Nenhuma linha é apagada. As entradas removidas continuam `removed`, com `terminalReason='queue_deleted'` e suas linhas de auditoria. A fila reaberta começa sem entradas ativas (AC 21). `[AUTO-DECISION]` Entradas removidas **não** são restauradas → não existe transição `removed → waiting` (motivo: ela não existe no domínio, reordenaria posições e, para quem foi reembolsado, atenderia alguém que já recebeu o reembolso). O plano de UX precisa dizer isso nas confirmações de excluir e de cancelar. |
| I4 | A fila só é reaberta depois de provar que a recompensa existe e está pausada | Leitura `getReward` positiva: a recompensa bate com a configuração gerida e `isPaused === true`, com os locks, o CAS de versão, nenhuma tarefa de recompensa em `processing` e nenhum DELETE possivelmente enviado. |
| I5 | Um resgate tardio não se perde | A recompensa fica pausada durante toda a janela. Um resgate que chegue mesmo assim (a Twitch teria de violar a pausa, NÃO VERIFICADO) é importado como rejeitado `queue_unavailable` e cancelado (reembolsado), porque a fila está arquivada (`importRedemption`, `:2394`). |
| I6 | Toda mudança de estado é auditada com o ator | Ver a seção 1.5. |
| I7 | Retomada automática e retry nunca ressuscitam uma exclusão cancelada | Seção 1.3, item 6. |

### 1.5 Idempotência, valores de `code` e auditoria

**Idempotência:**
- **HTTP:** o hook global `Idempotency-Key` existente reproduz qualquer 2xx ou 4xx guardado (`queue-routes.mjs:115-153`). Na OPS-21 a rota começa como `terminal_unknown`.
- **Domínio:** o início é reentrante. Um segundo clique em `cancel_verification` retoma a leitura. Depois de `cancelled`, um pedido novo responde 409 `QUEUE_DELETION_NOT_PENDING`, porque a fila não está mais em `deleting`.
- **Promoção a `reexecutable`:** só com o teste PostgreSQL T36-7 (seção 5, AC 29 da OPS-21).

**Contrato de resposta.** Respostas não 2xx sempre levam `code`. O resultado 2xx `not_cancelled` leva um `reason` enumerado, porque houve mudança de estado e ela precisa poder ser reproduzida.

| HTTP | `code` / `reason` | Significado | Novo? |
|---|---|---|---|
| 400 | `QUEUE_DELETE_CANCEL_CONFIRMATION_REQUIRED` | `confirm !== true` | existente |
| 404 | `QUEUE_NOT_FOUND` | — | existente |
| 409 | `QUEUE_DELETION_ALREADY_COMPLETED` | fila `deleted`; substitui o ramo morto `200 already_deleted` (`:857`) | **novo** |
| 409 | `QUEUE_DELETION_NOT_PENDING` | não está excluindo, não é Channel Points, sem recompensa ou sem tarefa de exclusão | existente |
| 409 | `QUEUE_REWARD_OPERATION_PROCESSING` | uma tarefa de recompensa está reivindicada ou em voo | existente |
| 409 | `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` | o DELETE pode ter chegado à Twitch | **novo** |
| 409 | `QUEUE_DELETION_PAUSE_IN_PROGRESS` | a pausa ainda está sendo aplicada; tente de novo em segundos | **novo** |
| 409 | `QUEUE_DELETION_CANCELLATION_STALE` | a fila mudou durante a verificação | existente |
| 409 | `QUEUE_DELETION_CANCELLATION_UNVERIFIED` | a recompensa não bate na confirmação | existente |
| 200 | `status: cancelled` | concluído | existente |
| 200 | `status: not_cancelled`, `reason ∈ {queue_delete_reward_absent, queue_delete_reward_diverged, queue_delete_cancel_reward_not_paused, queue_deletion_cancel_verification_unavailable, authorization_required}` | a verificação não provou uma recompensa pausada | `queue_delete_cancel_reward_not_paused` e `..._unavailable` são **novos** |
| 503 | mensagem genérica + `referenceId` (diagnosticado) | inesperado | existente |

As frases `error` da rota são texto livre em português. O painel deve mapear **só por `code`/`reason`** (já faz isso, `queue-lifecycle.mjs:13-16`). As chaves novas vão para o plano de UX.

**Auditoria.** Os nomes estendem o catálogo existente. O catálogo final é do `@data-engineer`.

| Evento | `actorId` | anterior → próximo | `reason` | `safeDetail` |
|---|---|---|---|---|
| `queue.deletion_cancel_verification_requested` (existente) | operador | `<status do alvo> → cancel_verification` | `operator_requested_queue_deletion_cancellation` | `{ rewardId, operationId, operationType, deletionState: 'pending'\|'blocked', blockReason }` (acrescentar `operationType`, `deletionState`, `blockReason`) |
| `queue.deletion_cancelled` (existente) | **operador (novo, F22)** | `deleting → active_closed_archived` | `operator_cancelled_queue_deletion_after_reward_verification` | `{ rewardId, operationId, isPaused: true, cancelledTasks: n, financialTasksLeftRunning: n }` |
| `queue.deletion_cancellation_not_confirmed` (existente) | **operador (novo)** | `cancel_verification → <restaurado ou unknown>` | o código `reason` | `{ rewardId, operationId, restored: boolean }` |

Recusas (409) **não** gravam auditoria: nada mudou. Elas aparecem no log estruturado da requisição. Todas as chaves de `safeDetail` são enumeradas ou numéricas. Nada de dados de espectador, mensagem da Helix ou texto livre.

### 1.6 Limites de escopo

- `[AUTO-DECISION]` A FT-36 também deve cancelar a exclusão de uma fila **convertida para manual ou local**? → **Não.** Essas continuam com `QUEUE_DELETION_NOT_PENDING` (motivo: não há exclusão remota pendente. Elas terminam localmente assim que os reembolsos se resolvem, e a saída da pessoa operadora é esperar ou usar Operações. Incluí-las ampliaria o escopo sem pedido do proprietário). O `@po` escreve isso no AC 21 ("exclusão **Channel Points** pendente ou bloqueada").
- **Fonte única da verdade para o botão (F17):** a API expõe um `canCancelDeletion` calculado no servidor (mesmo predicado do início, sem a leitura remota) junto da projeção da FT-26 `deletionState`/`blockReason`/`blockingOperations`. Enquanto um alvo está em `cancel_verification`, também expõe `cancellationInProgress: true`. O cliente deixa de deduzir o botão a partir de `remoteSyncStatus`. Nenhum quarto valor de `deletionState` é criado (o AC 15 continua com três).
- **Recuperação de um `cancel_verification` parado** (queda do processo entre o início e a confirmação): repetir "cancelar exclusão" retoma a leitura, e uma leitura não conclusiva restaura o status anterior (F20). Nenhuma ação nova de operador é necessária, e Operações já lista a linha (`unresolvedDeletionStatuses`).

## 2. Itens abertos 1, 2, 4 e 5 da validação do `@po`

| Item | Decisão | Motivo |
|---|---|---|
| **1. Código do motivo terminal** | **`attempts_exhausted`** (DATA §1). O `retry_exhausted` do ARCH §1 é retirado. O AC 8 troca seu valor provisório (`@po`/`@sm`). | Bate com o evento de auditoria `financial.operation_attempts_exhausted` e com a coluna que conta (`attempts`). O catálogo de auditoria é do `@data-engineer`. Um nome único em `lastError`, auditoria e projeção evita tabela de tradução. |
| **2. Retry manual: mecanismo** | **`payload.cycleStartAttempts` com `attempts` monotônico (DATA C3)**. Orçamento do ciclo atual = `attempts - (payload.cycleStartAttempts ?? 0)`, teto 6. "Tentar agora" grava `cycleStartAttempts = attempts` na mesma transação (um **ciclo novo de 6**, AC 20; o padrão de 1 tentativa da DATA C3 fica **superado**). Evento de auditoria **`financial.operation_retry_requested`** com `{ operationType, previousAttempts, cycleStartAttempts }`. O "zerar + `financial.operation_retried_manually`" do ARCH §1 é retirado. Um **401 não consome orçamento**: a transição protegida pelo lease para `unknown('authorization_required')` também faz `cycleStartAttempts += 1`, devolvendo a tentativa que o claim contou. | Contraria de propósito a minha preferência anterior. Um `attempts` monotônico mantém o histórico completo na própria linha, para investigação. O orçamento relativo expressa tanto o retry manual quanto a devolução do 401 sem reescrever histórico. Linhas legadas usam 0 como padrão (DATA teste 11). A consulta de claim não muda. O `@dev` precisa incluir `payload` no `RETURNING` de `claimNext` (`queue-repository.mjs:2153-2154`) ou lê-lo sob o lease. |
| **4. `resolved_manual` em `blockingOperations`** | **Concordo com o `@po`: não conta.** `resolved_manual` + `operator_resolved` contam como **resolvidos localmente**, e a projeção de exclusão fica `pending` enquanto a guarda pós-resolução roda. Se a nova listagem feita **depois** da resolução ainda mostrar o resgate `UNFULFILLED`, a tarefa de cancelamento é rearmada para `pending` com ciclo novo (`financial.manual_resolution_contradicted`). Aí ela passa a contar em `openOperations`, e em `blockingOperations` só se esgotar de novo. A DATA C6 é ajustada nesse sentido. | Contar mostraria "N operações precisam de revisão" para algo que a pessoa operadora acabou de revisar, e esse número nunca baixaria. A guarda real é a nova listagem remota (ARCH §5.2, DATA C5), que mantém o invariante. A guarda compara o horário da listagem com o horário da auditoria da resolução. A ausência na lista de `UNFULFILLED` **não** é gravada como `remoteStatus` (nenhum status inferido). |
| **5. Linha de log da reconciliação** | **Manter a linha entregue `twitch_reconciliation_degraded`** (`integration.mjs:96-113`: `trigger`, `reason`, `issueCount`, `issueCounts`, `httpStatusCounts` e `statusCode` opcionais). O formato `twitch.reconciliation` do ARCH §4.3 é retirado. | O AC 5 pede "códigos e contagens das ocorrências e o `reason`". A linha tem isso, não tem identificadores nem dados de pessoas, e seu conjunto exato de chaves foi verificado pelo QA (FT-24). Emitir só quando degrada evita ruído. `queues`/`imported` não acrescentam valor de diagnóstico para o D-6. Renomear mexeria num contrato verificado sem lacuna nenhuma. |

## 3. Complexidade e ordem dentro do ciclo único

**Nova pontuação (4 fatias + FT-23):** escopo **5** (API, dois workers, repositório, rotas, projeção compartilhada, painel Next), integração **4** (semântica de leitura e escrita da Twitch, Twurple), infraestrutura **3** (sem DDL, sem mudança de Compose ou proxy), conhecimento **3**, risco **5** (financeiro) = **20 → COMPLEX (GG)**, acima dos 19. O aumento vem do escopo (UI da FT-23 e da FT-36), **não** da transição reversa. Dificuldade por fatia: FT-25 **G**, FT-26 **G**, **FT-36 M** (cai de G: mecanismo, migration, rota, UI e testes já existem, ver F15-F17; o trabalho é F18-F23 mais testes), FT-23 **M**.

**Ordem e pontos de controle** (um `@dev` por vez; mesmos arquivos, então nunca em paralelo):

| Passo | Fatia | Começa quando | Ponto de controle do `@dev` (evidência registrada na story; não é commit) |
|---|---|---|---|
| CP-0 | — | itens abertos 1, 2, 4, 5 resolvidos (esta nota) + confirmação por escrito do `@data-engineer` (seção 6) + plano de testes do `@qa` | — |
| CP-1 | **FT-25** | CP-0 | Red e depois Green: módulo de política, worker `retry`/`unknown(attempts_exhausted)`, `markRedemptionUnknown` deixa de tocar linhas da outbox, ciclo novo e devolução no 401; testes DATA 1-8 e 11-12 em PostgreSQL isolado |
| CP-2 | **FT-26** | CP-1 verde | bloqueio → `retry`, retomada automática (I7), resolução de `resolved_manual` + guarda de contradição, AC 22 (`reward-worker.mjs:316`), projeção de exclusão + `canCancelDeletion`; testes DATA 9-10; matriz do AC 17 |
| CP-3 | **FT-36** | CP-2 verde (precisa da projeção da FT-26 e do estado bloqueado em `retry`) | F18-F23 e seção 1; testes T36-1..T36-13 |
| CP-4 | **FT-23** | CP-3 verde **e** o plano de UX compartilhado ≥ 9,0 registrado **e** a issue da FT-23 criada | seção 4; E2E de navegador com fixtures, incluindo os textos de FT-25/26/36 |
| Gate | — | CP-4 | **um** gate do `@qa` para o pacote (proprietário, 2026-10-30). O `@qa` lista os grupos prontos nesta ordem: G1 FT-25, G2 FT-26, G3 FT-36, G4 FT-23 + catálogos. O `@devops` faz **quatro commits atômicos nessa ordem**, para que cada um possa ser revertido sozinho. |

**Alternativa:** se o plano de UX atrasar, CP-1..CP-3 (API e worker, sem texto visível novo) podem passar pelo mesmo gate sem o G4. A FT-23 segue então na próxima janela do `@qa`. Isso é uma divisão do gate, não mudança de escopo, e depende de decisão do orquestrador. Qualquer texto de UI da FT-25/26/36 espera junto com o G4.

## 4. FT-23 vs FT-28: desacopladas

**Decisão D-23-1: a FT-23 fica DESACOPLADA da FT-28.** Ela entra neste ciclo **sem** provider compartilhado no layout. A dependência "FT-23 → FT-28" do inventário passa a ser **fraca**: a FT-28 depois troca um único ponto de navegação. Motivos tirados do código (F24):

1. **Resultados na mesma página não precisam da FT-28.** Excluir (`deleted` / `pending` / `blocked`) e cancelar a exclusão acontecem em `/queues`, dentro de um único `PanelProvider` montado. O defeito D-3 é que o aviso vive no `useState` do cartão e morre quando o cartão é desmontado (`queue-lifecycle-actions.jsx:13, 50`). Levar o aviso para um **`panelOutcome` no nível da página**, no provider que já existe, renderizado uma vez pelo `PanelShell` numa região persistente `role="status"` (`role="alert"` para erros), corrige o D-3 sem mover o provider.
2. **Resultados entre páginas viajam na URL, não em memória compartilhada.** Criar (`/new-queue` → `/queues`) e "excluí a última fila" (`/queues` → `/new-queue`) navegam com `?outcome=<código>&queue=<uuid>`. Ao montar, o provider de destino lê `window.location.search` num efeito, valida `outcome` contra uma **lista permitida** de códigos enumerados e `queue` contra o padrão de UUID, define o `panelOutcome`, move o foco (`queue-title-<id>` ou o `h1` da página) e remove os parâmetros com `history.replaceState`, para que recarregar a página não repita a mensagem. Funciona com o provider por página de hoje **e** depois da FT-28.
3. **Um único ponto de navegação:** `navigateTo(href)` = `window.location.assign(href)` hoje, a mesma carga completa de documento que o painel já faz com `<a>`. A FT-28 troca o corpo por `router.push`/`router.replace`. `resolvePostActionRoute(outcome, projection) → { href, focusId, outcome } | null` continua uma função pura com teste unitário (S-D, item 5).
4. **Sem depender de uma API do Next não pesquisada:** ler `window.location` num efeito evita `useSearchParams` e suas regras de Suspense/pré-renderização no Next 16.4.1 (ver "Lacuna de pesquisa").

**O que continua condicionado à FT-28/FT-29 (OPS-23):** uma mensagem de "exclusão pendente" que vira "excluída" ou "bloqueada" **sem** atualizar à mão ou recarregar (atualização ao vivo), e navegação sem recarregar o documento. Os ACs da FT-23 precisam dizer que o estado pendente se atualiza na próxima carga da projeção (carga da página ou o botão de atualizar que já existe), não ao vivo.

**Segurança:** a URL leva só um código enumerado e um UUID, nunca texto livre, nome ou login. Um valor desconhecido é ignorado, não refletido, então não há injeção nem XSS pela mensagem. Nem a API nem os logs veem o parâmetro.

**Conjunto de escrita e ordem:** a FT-23 mexe em `panel-provider.jsx`, `panel-shell.jsx`, `new-queue-form.jsx`, `queue-lifecycle-actions.jsx`, `queue-list.jsx`, num novo `post-action-route.mjs` e nos catálogos en/pt-BR/es. A FT-28 depois move o provider para `app/(panel)/layout.jsx`. **Serializar: FT-23 (neste ciclo) antes da FT-28.** A FT-28 faz rebase e troca o ponto de navegação. O contrato do `panelOutcome` e o da URL seguem iguais. O `@sm` acrescenta os ACs da FT-23 na OPS-15 com este texto, e o `@devops` cria a issue da FT-23.

## 5. Plano de testes arquitetural mínimo

Todos os testes são Red primeiro. As classes de evidência ficam separadas.

| Classe | O que prova |
|---|---|
| **Unitário (Vitest)** | FT-25: política de retry, limites do jitter, não decrescente até o teto, `attempts_exhausted`, devolução no 401, conjuntos de chaves dos logs. FT-36: a matriz de recusas do início (cada linha de 1.2), o serviço de domínio contra uma Twitch falsa montada com o helper de instâncias reais (`tests/helpers/twurple-real-instances.mjs`: pausada, não pausada, `null`, `HttpStatusCodeError` real 404/401/500, timeout), restauração em leituras não conclusivas. FT-23: `resolvePostActionRoute` (todos os resultados de criar, excluir e cancelar; última fila → `/new-queue`), o parser do resultado na URL (lista permitida, UUID, valor desconhecido ignorado). |
| **Integração em PostgreSQL isolado com migrations reais** (`isolated-postgres-image.mjs`; nunca SQLite, mocks de Prisma nem o volume ativo) | Testes 1-12 da DATA §4 (FT-25/26) e **T36-1** cancelar uma exclusão `pending`; **T36-2** cancelar uma exclusão bloqueada por revisão (`retry`/`queue_deletion_blocked_by_review`), com a tarefa financeira `unknown` intocada e ainda listada; **T36-3** `processing` → 409, nada muda; **T36-4** corrida, dois clientes, barreira, N rodadas: `claimNextRewardOperation` vs `beginQueueDeletionCancellation`, exatamente um vence (reivindicado e recusado, ou `cancel_verification` e claim `null`), nunca os dois; **T36-5** `requestMayHaveReachedTwitch` → 409; **T36-6** `deleted` → 409 `ALREADY_COMPLETED`; **T36-7** queda depois do início (a linha fica em `cancel_verification`) e um pedido repetido com a mesma chave → retoma, executa uma vez, sem auditoria duplicada; **T36-8** um `redemption.cancel` `pending` no momento do cancelamento ainda chega a `confirmed`/`CANCELED` depois da reabertura (worker com leitura falsa positiva), a entrada continua `removed` e nenhuma linha é apagada; **T36-9** excluir uma fila aberta → cancelar → desarquivar e abrir → excluir de novo: a confirmação da pausa reaproveita o `reward.delete` (F18, Red hoje); **T36-10** pausa bloqueada (`close_unknown`): leitura pausada → as duas tarefas `cancelled`; não pausada → tarefa de pausa restaurada com `queue_delete_cancel_reward_not_paused`; **T36-11** a retomada automática da FT-26 ignora um delete `cancelled`/`cancel_verification`; **T36-12** mudança de versão durante a verificação → `STALE`, status anterior restaurado; **T36-13** lista permitida de `safeDetail` e `actorId` nos três eventos de auditoria. |
| **Compose** | Nenhum caso novo: não há mudança de infraestrutura, proxy ou prefixo de rota. O `@qa` roda a suíte `compose-runtime` existente no gate do pacote, como classe de regressão. |
| **E2E só de navegador (Chromium, fixtures, sem Twitch)** | Só com texto aprovado: criar → `/queues` com foco e um status que não promete sucesso na Twitch; excluir → status persistente; excluir a última fila → `/new-queue` com a mensagem; exclusão pendente/bloqueada com o link para Operações; cancelar a exclusão com sua confirmação, cada mensagem de recusa e o resultado arquivado e fechado; recarregar depois de chegar não repete a mensagem. |
| **Twitch ao vivo** | Só o AC 19 (OW-16), como classe separada. A FT-36 acrescenta um item a essa rodada: cancelar uma exclusão bloqueada e ler a recompensa (pausada, presente). |

**Provas por mutação que o `@qa` precisa registrar** (aplicar a mutação, mostrar o teste indicado falhando, reverter):

| Mutação | Precisa falhar |
|---|---|
| Tirar a recusa de `processing` no início | T36-3, T36-4 |
| Remover `reward.isPaused !== true` na confirmação ou no serviço de domínio | unitário 1.2 "não pausada", T36-10 |
| Fazer o cancelamento pôr tarefas `redemption.*` em `cancelled` | T36-8 |
| Remover a recusa de `requestMayHaveReachedTwitch` | T36-5 |
| Remover o CAS de `version` da fila na confirmação | T36-12 |
| Deixar a retomada automática tocar um delete que não está em `retry` | T36-11 |
| FT-25: confirmar com `UNKNOWN`/erro sem leitura positiva | teste PostgreSQL do AC 9 (DATA teste 4) |
| FT-26: pular a guarda da nova listagem pós-resolução | DATA teste 9 (resolução contradita) |
| FT-26: voltar `lookupError?.status === 404` em `reward-worker.mjs:316` | teste do AC 22 com `HttpStatusCodeError` real |
| FT-23: renderizar o parâmetro `outcome` cru | teste unitário do parser da URL |

**Riscos residuais:**
- **Consistência eventual da Helix depois de um DELETE que deu erro** (NÃO VERIFICADO). Mitigado por recusar o cancelamento quando o DELETE pode ter sido enviado (1.3, item 4). Só resta se a Twitch aplicar um DELETE que o nosso código nunca enviou.
- **Resgate numa recompensa pausada** (comportamento documentado da Twitch, NÃO VERIFICADO ao vivo): seria reembolsado como `queue_unavailable` (I5). Conferido no AC 19.
- **`getReward` sem timeout limitado no servidor.** Uma leitura travada mantém a operação do painel em andamento (409 `in_progress` se repetir) e a linha em `cancel_verification` até a requisição terminar. A recuperação é "repetir o cancelamento". O comportamento de timeout do Twurple no servidor está NÃO VERIFICADO e foi anotado para a FT-44/OPS-21.
- **Entradas não são restauradas depois de um cancelamento** (I3): é uma consequência de produto que o texto de UX precisa dizer.
- **A FT-23 recarrega o documento até a FT-28.** A passagem de pendente para excluída não é ao vivo até a OPS-23.
- **A OPS-21 ainda não foi entregue:** a tabela de classes de rota (`terminal_unknown`) não é aplicada no código. Hoje um 5xx não é guardado, então repetir reexecuta, o que é seguro aqui porque o início é reentrante e a confirmação usa CAS (T36-7).

## 6. Dependências — o que o `@data-engineer` precisa confirmar por escrito

1. **Sem DDL para a FT-36:** `cancel_verification` já passa em `outbox_status_check` (migration `20261014230000`, com rollback). As chaves novas ficam em `outbox.payload`: `cancelVerification: { previousStatus, previousLastError, requestedAt }` (ISO-8601 UTC). Nenhum índice é necessário: as buscas são por `entity_id` e `idempotency_key`.
2. **Catálogo de auditoria:** `actorId` em `queue.deletion_cancelled` e `queue.deletion_cancellation_not_confirmed`; as chaves novas de `safeDetail` da seção 1.5 dentro da lista permitida (DATA teste 12); os códigos `reason` novos `queue_delete_cancel_reward_not_paused`, `queue_deletion_cancel_verification_unavailable`, `queue_deletion_cancel_verification_stale`.
3. **Transições da seção 1.2** como transações únicas, protegidas por lease ou CAS: restauração do `previousStatus`; cancelamento da tarefa de pausa bloqueada junto com o `reward.delete`; reaproveitamento do `reward.delete` cancelado por `confirmRewardOpen` (F18) via `enqueueRewardDeleteIntent`; nenhuma escrita em `redemptions` nem em linhas `redemption.*` (I2).
4. **Atualizar a DATA C3:** ciclo novo de 6 no "tentar agora" (o `[AUTO-DECISION]` de 1 tentativa fica superado); `cycleStartAttempts` usado também na devolução do 401; `claimNext` devolve ou lê `payload` sob o lease.
5. **Atualizar a DATA C6:** `resolved_manual` é resolvido localmente e não conta em `blockingOperations` (item 4); o caminho de contradição o rearma.
6. **Fixar nomes:** `attempts_exhausted` (item 1) e `financial.operation_retry_requested` (item 2) como nomes do catálogo; a redação do DATA teste 3 ("não decrescente até o teto", já resolvida na story).
7. **Incluir os testes T36-1..T36-13** (seção 5) no plano PostgreSQL, sem DDL esperado. Se algum precisar de DDL, volta para o `@data-engineer` pela C8.

## Lacuna de pesquisa

**LACUNA (estreita, não bloqueia):** não há nota de pesquisa sobre `useSearchParams`/`useRouter` no App Router do Next.js 16 (exigência de Suspense em páginas pré-renderizadas, comportamento entre grupos de rotas). Este desenho a **evita** (seção 4, itens 2-4), então nenhuma pesquisa é pedida agora. Ela só vira lacuna real quando a FT-28 trocar o ponto de navegação para `next/navigation`. Aí o `@analyst` consulta a documentação oficial do Next 16 sobre `useRouter`, `useSearchParams` e `<Link>` com provider cliente no layout, antes do gate de planejamento da FT-28.

## Decisões (lista curta)

1. **D-36-1:** o cancelamento devolve a fila ativa, arquivada e fechada, com a recompensa **verificada como pausada**. A pausa só é revertida pela ação de abrir já existente, que é verificada. O `@po` ajusta o AC 21.
2. **D-36-2:** a garantia contra um delete em voo é o lock da fila + `FOR UPDATE` + o status `cancel_verification`, que não pode ser reivindicado, + o CAS de versão, mais recusas **novas** para DELETE possivelmente enviado e pausa em andamento (a de `processing` continua).
3. **D-36-3:** o cancelamento nunca toca tarefas `redemption.*`; reembolsos pendentes continuam; entradas não são restauradas; nada é apagado.
4. **D-36-4:** uma verificação não conclusiva restaura o status anterior da tarefa; só uma leitura negativa conclusiva põe `unknown`.
5. **D-36-5:** a etapa de pausa bloqueada (`close_unknown`/`close_failed`) passa a poder ser cancelada; uma pausa em andamento é recusada (409).
6. **D-36-6:** códigos novos `QUEUE_DELETION_ALREADY_COMPLETED`, `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`, `QUEUE_DELETION_PAUSE_IN_PROGRESS`; motivos novos `queue_delete_cancel_reward_not_paused`, `queue_deletion_cancel_verification_unavailable`; `actorId` em toda linha de auditoria; `canCancelDeletion` e `cancellationInProgress` calculados no servidor.
7. **D-36-7:** corrigir o F18 (excluir de novo depois de um cancelamento) na FT-36.
8. **D-36-8:** a FT-36 cobre só exclusões Channel Points; exclusões manuais e convertidas ficam como estão.
9. **Itens abertos:** 1 → `attempts_exhausted`; 2 → `cycleStartAttempts` (`attempts` monotônico, ciclo novo de 6, devolução no 401) + `financial.operation_retry_requested`; 4 → `resolved_manual` fora de `blockingOperations`; 5 → manter `twitch_reconciliation_degraded`.
10. **Complexidade 20 → COMPLEX (GG);** FT-36 M. **Ordem:** FT-25 → FT-26 → FT-36 → FT-23, um gate do `@qa`, quatro commits atômicos nessa ordem.
11. **D-23-1:** FT-23 desacoplada da FT-28 (resultado no nível da página + resultado enumerado na URL + um ponto de navegação); a passagem ao vivo de pendente para excluída fica com a OPS-23.

## Pendências por agente

| Agente | Pendência |
|---|---|
| `@po` | Ajustar o AC 21 (D-36-1, D-36-8, o código `ALREADY_COMPLETED` no lugar do 200); AC 8 → `attempts_exhausted`; nome da auditoria do AC 20; registrar o desacoplamento da FT-23; nota final do escopo ampliado quando os itens 1-4 das correções de 2026-10-30 fecharem. |
| `@sm` | Complexidade 20 GG e FT-36 M na story e no inventário; a dependência FT-23 → FT-28 vira "fraca" no inventário; ACs da FT-23 na OPS-15 (texto da seção 4, sem atualização ao vivo); riscos: entradas não restauradas, DELETE possivelmente enviado. |
| `@data-engineer` | Confirmação por escrito da seção 6 (itens 1-7). |
| `@ux-design-expert` | O plano compartilhado FT-23 + FT-36 (≥ 9,0) inclui: os códigos de resultado da seção 4; a confirmação de cancelamento dizendo que as entradas não voltam e que a fila volta arquivada e fechada com a recompensa pausada; uma mensagem por `code`/`reason` novo; "cancelamento em andamento / repita para retomar". |
| `@qa` | Plano de testes com T36-1..T36-13, DATA §4, a tabela de mutações e a ordem dos grupos G1..G4. |
| `@devops` | Issue da FT-23 (sub-issue da #69, só corpo); os corpos de #98/#99/#100 citam esta nota. |
| `@dev` | Só começa depois dos gates acima, na ordem da seção 3. |
| `@analyst` | Nada agora (lacuna adiada para o planejamento da FT-28). |

## Registro de mudanças

- 2026-10-30 — `@architect` (Aria): revisão da FT-36 (achados F15-F24), decisões D-36-1..D-36-8, itens abertos 1, 2, 4 e 5 resolvidos, complexidade repontuada para 20 COMPLEX, ordem FT-25 → FT-26 → FT-36 → FT-23 com pontos de controle, FT-23 desacoplada da FT-28 (D-23-1), plano de testes com provas por mutação, dependências do `@data-engineer`. Análise só de leitura; nenhum código, teste ou issue foi tocado.

## Adendo — decisão do Orion supera F21/D-36-6 (2026-10-30)

Este adendo não reescreve o corpo acima. No cancelamento com `requestMayHaveReachedTwitch` verdadeiro, o corpo propunha recusar (`QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED`). O Orion decidiu (2026-10-30, ver [po-validation.md](po-validation.md) e CA 21): o cancelamento continua permitido quando uma leitura somente-leitura `cancel_verification` prova que a recompensa exata existe e está pausada; a recusa vale só quando a leitura é inconclusiva ou negativa depois de uma tentativa de DELETE. As fixtures atuais permanecem válidas.

Consequências:

- `@dev`: restaurar `previousStatus` em leitura não conclusiva (como no corpo); NÃO recusar quando a leitura é positiva (existe e está pausada); recusar com `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` apenas quando a leitura é inconclusiva/negativa depois de uma tentativa de DELETE; manter `qra-postgres-fixtures.test.js` ~:457-488 e ~:497-528 sem alteração (a condição "reescrever as fixtures" deixa de valer).
- `@qa`: novo T36 "DELETE tardio depois de um cancelamento verificado": a ação de abrir falha com segurança e a fila não é reaberta sem a recompensa; provar por mutação (remover a releitura na ação de abrir, ou reabrir sem leitura positiva, e o teste deve falhar). Manter o teste de recusa para o caso inconclusivo/negativo.
