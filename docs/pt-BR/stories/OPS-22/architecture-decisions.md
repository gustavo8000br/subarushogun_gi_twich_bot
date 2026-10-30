# OPS-22 — Decisões de arquitetura (`@architect`)

[English](../../../stories/OPS-22/architecture-decisions.md)

**Autora:** `@architect` (Aria), 2026-10-27. **Status:** CONCLUÍDO (fecha o gate de planejamento do `@architect` na story: valores de espera, nomes de estados, regra de cancelar na exclusão, interação com OPS-21/OPS-20).
**Classe de evidência:** leitura de código somente leitura da branch `feat/ops-15-next-panel` e do `node_modules` instalado (`@twurple/*` 8.2.0). Nenhum teste, servidor, container, banco, GitHub ou chamada à Twitch foi executado. Tudo o que se refere à Twitch ao vivo está identificado como tal e permanece NÃO VERIFICADO até o AC 19 (OW-16).
**Entradas:** [story.md](story.md), [redemption-sync-research.md](../OPS-15/redemption-sync-research.md) (SUFICIENTE; regra de ouro respeitada, sem pesquisa nova), [panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md) seção 5, [typescript-migration-research.md](../OPS-15/typescript-migration-research.md).
**Não decidido aqui:** DDL/persistência (do `@data-engineer`, ver `data-review.md`), texto visível (decisão de UX do proprietário/`@po`), elegibilidade de reembolso (OPS-20).

## 0. Achados no código que moldam as decisões (VERIFICADOS por leitura)

| # | Achado | Onde | Efeito |
|---|---|---|---|
| F1 | `redemptionStatus()` lê `isFulfilled`, `isCanceled` e depois `value.status`; a classe do Twurple não tem getter `status`, então `UNFULFILLED` → `UNKNOWN` | `apps/api/src/twitch/helix-adapter.mjs:15-19, 138-142, 147, 163` | causa do D-5 (TL;DR da pesquisa) |
| F2 | O worker financeiro só verifica `error.status`; o `HttpStatusCodeError` do Twurple expõe `statusCode` | `financial-worker.mjs:12, 24, 55-62, 100-113, 139-145`; `node_modules/@twurple/api-call/lib/errors/HttpStatusCodeError.js:21` | 401/403/404 reais tratados como transitórios |
| F3 | Existem três leitores de status: worker (só `status`), reward worker (`status ?? statusCode`, `reward-worker.mjs:5-8`, e só `.status` em `:316`), elegibilidade (`statusCode ?? status`, `helix-adapter.mjs:123`) | como listado | precisa virar uma função só |
| F4 | `claimNext` só reivindica `pending`/`retry` ou lease expirado; `unknown` é terminal | `queue-repository.mjs:2123-2144` | hoje não há retentativa |
| F5 | Backoff atual: `1000·2^min(attempts,12)`, jitter ×(0,5..1,5), teto 1 h; `attempts` é incrementado no claim | `financial-worker.mjs:3, 11-17`; `queue-repository.mjs:2136` | 6 tentativas acabariam em ~1 min; curto demais |
| F6 | Em 429 lê-se `retryAfterSeconds`, mas o `HttpStatusCodeError` do Twurple não tem esse campo; o Twurple já espera internamente por `Ratelimit-Reset` (não `Retry-After`) e só expõe um 429 quando desiste | `financial-worker.mjs:12`; `node_modules/@twurple/api/lib/utils/HelixRateLimiter.js:8-13` | a política de 429 não pode depender de um campo que nunca existe |
| F7 | O ramo 404 da reconciliação chama `markRedemptionUnknown`, que move tarefas `pending`/`retry`/`processing` para `unknown` sem guarda de lease | `reconciliation.mjs:137, 172`; `queue-repository.mjs:1407-1408` | corrida com o worker; mataria o orçamento de tentativas |
| F8 | `getQueueDeletionBlockers` conta como `blocked` tudo o que não é `pending/retry/processing`, e o reward worker transforma isso em `unknown('queue_deletion_financial_conflict')` (terminal) | `queue-repository.mjs:1728-1739`; `reward-worker.mjs:288-301` | congelamento: a exclusão nunca retoma |
| F9 | `prepareRewardDelete`/`completeQueueDeletion` exigem toda tarefa financeira `confirmed` e nenhum `UNFULFILLED` local; `resolve-unknown` grava `resolved_manual`/`operator_resolved` e mantém `remoteStatus` | `queue-repository.mjs:1741-1780, 2247-2276` | hoje uma resolução manual nunca desbloqueia a exclusão (AC 14 impossível como está) |
| F10 | `retryOutboxManually` grava `pending` mas mantém `attempts` | `queue-repository.mjs:2224-2231` | com teto, a retentativa manual esgotaria após uma tentativa |
| F11 | A observação externa positiva (update do EventSub ou leitura da reconciliação FULFILLED/CANCELED) já confirma ou põe em conflito a tarefa a partir de `pending/retry/processing/unknown/resolved_manual` | `queue-repository.mjs:2319-2347` | já existe um caminho passivo de leitura positiva, que é reaproveitado |
| F12 | `degraded` é publicado com `issues` só no objeto de status; nenhuma linha de log | `integration.mjs:93-110` (`:102`, `:106`) | D-6 não diagnosticável |
| F13 | A ordem pausar → listar → cancelar por resgate → aguardar → listar de novo → preparar → excluir já existe | `queue-repository.mjs:824-834`; `reward-worker.mjs:254-320`; `:1679-1726` | a fatia 3 é reparo da semântica de bloqueio/retomada, não reescrita |
| F14 | `getRawData` (`@twurple/common`) e `HttpStatusCodeError` (`@twurple/api-call`) não são reexportados por `@twurple/api`; os dois pacotes são só transitivos (8.2.0) | `node_modules/@twurple/api/lib/index.d.ts:149-150`; `package.json:59-61` | é necessária dependência direta fixada |

## 1. Política de retentativa (FT-25)

**Decisão.** Um módulo de política único e puro (constantes exportadas para os testes; sem variável de ambiente, pois são valores decididos pelo proprietário):

| Parâmetro | Valor |
|---|---|
| `MAX_ATTEMPTS` | **6 no total**, contando a primeira (pergunta aberta 2 da story: sim) |
| Espera após a tentativa *n* (n = 1..5) | `min(teto, base · fator^(n-1))` |
| `base` / `fator` / `teto` | **60 s / 4 / 60 min** (teto igual ao 1 h atual, `financial-worker.mjs:3`) |
| Jitter | multiplicativo **×(0,8..1,2)** (±20 %), a partir do `random` injetado |
| Contador | o `outbox.attempts` existente, incrementado atomicamente no claim (`queue-repository.mjs:2136`); um novo claim por lease expirado também conta (uma queda consome uma tentativa; aceito e documentado) |

Agenda nominal: tentativa 1 em t=0; esperas de 1, 4, 16, 60 e 60 min; tentativa 6 por volta de **2 h 21 min** (faixa ~1 h 53 min – 2 h 49 min com jitter). Cobre uma live típica e um incidente de vários minutos no Helix, terminando com decisão humana no mesmo dia.

**Classificação (uma função, `classifyTwitchFailure(error)`, ver seção 4):**

| Resultado da tentativa | Classe | Consome orçamento | Próximo estado |
|---|---|---|---|
| Leitura retorna o `expected` | conclusiva | — | `confirmed` |
| Leitura retorna o estado terminal oposto | conclusiva | — | `conflict` (caminho atual) |
| Leitura retorna `UNFULFILLED` | conclusiva | — | escrita (`setRedemptionStatus`) e depois a leitura pós-escrita abaixo |
| Leitura retorna `UNKNOWN` (status não reconhecido) | não conclusiva | sim | `retry` (`remote_status_unrecognized`) |
| 5xx, erro de rede, timeout | transitória | sim | `retry` (`remote_lookup_failed` / `remote_operation_failed`) |
| 429 que escapa do Twurple | transitória | sim | `retry`, espera = `max(agenda, retryAfterMs)` só se o adaptador fornecer `retryAfterMs`; nunca supor que o campo existe (F6) |
| 404 na **leitura** | não conclusiva | sim | `retry` (`remote_redemption_not_found`): a causa é ambígua (atraso de consistência NÃO VERIFICADO, histórico expirado, `reward_id` errado); ler é inofensivo, então recebe o mesmo orçamento limitado em vez do `unknown` terminal imediato de hoje (`financial-worker.mjs:59-61`) |
| 404 na **escrita** | esperado | — | nova leitura (Update Redemption Status responde 404 quando não está `UNFULFILLED`; pesquisa Q1) |
| 401 | autenticação | **não** | `unknown` + `authorization_required` (código atual), rearmada para `retry` automaticamente após reautorização bem-sucedida (AC 16); nunca contada |
| 403 | permanente | — | `failed` (`remote_lookup_forbidden`): Client ID divergente ou canal inelegível não se resolve esperando |
| 400 / outros 4xx | permanente | — | `failed` (semântica atual de `isPermanentHttpFailure`, lida via `statusCode ?? status`) |

**Na 6ª tentativa não conclusiva** o worker não chama `retry`; chama `unknown(task, 'retry_exhausted')`. **Não há valor novo de status no outbox**: `unknown` já é terminal, já é revisável (`queue-repository.mjs:12`), já é aceito por `resolve-unknown` e já é exibido em Operações. A diferença entre "ainda tentando" e "precisa de revisão" fica no par de estados:

- `retry` + classe de motivo `remote_unconfirmed` → saúde **`degraded`**;
- `unknown` (qualquer motivo) / `conflict` / `failed` → saúde **`needs_review`** (revisão de arquitetura 5.5; AC 8).

Toda chamada de `retry` e `unknown` mantém a guarda de lease (`status='processing' AND leaseToken`), para que um worker atrasado nunca sobrescreva uma decisão mais nova.

**"Tentar novamente" manual concede um orçamento novo de 6.** Como `attempts` é cumulativo (F10), o orçamento precisa ser relativo: a escolha de persistência (zerar `attempts` com o valor anterior no `safeDetail` da auditoria, ou guardar uma base de orçamento em `payload`) é do `@data-engineer` (AC 12). Preferência da arquitetura: zerar e gravar o evento de auditoria `financial.operation_retried_manually { previousAttempts }`, porque não exige migration e não altera a query de claim.

**Alternativas descartadas.**
- Reusar a fórmula atual sem mudança (2, 4, 8, 16, 32 s): seis tentativas acabam em cerca de um minuto; um incidente no Helix esgotaria o orçamento. Rejeitada.
- 8 tentativas / 24 h (proposta anterior da arquitetura): substituída pela decisão do proprietário (6 e depois manual).
- Reverificação periódica sem fim (a cada 15 min): fora do escopo por decisão do proprietário.
- Status novo `needs_review` no outbox: mexe em todas as listas de status (`queue-repository.mjs:10, 12, 322, 433, 1293, 2226, 2250, 2341`), na projeção de Operações e talvez numa constraint, sem ganho de segurança. Rejeitado; mantido só como valor de saúde/projeção.
- Contar 401 no orçamento: um token revogado queimaria as seis tentativas sem aprender nada sobre o resgate. Rejeitado.

## 2. Nomes de estados e transições (FT-25, FT-26)

### 2.1 Operação financeira (`outbox`, `operationType ∈ {redemption.cancel, redemption.fulfill}`)

Só valores existentes; valores novos aparecem apenas em `lastError` (enumerado, ≤ 64 caracteres) e em projeções.

```text
            claim (attempts+1)
pending ───────────────► processing ──leitura=expected─────────────────► confirmed
   ▲                      │  │  │  └─leitura=UNFULFILLED → escrita → leitura ─┘ (ou conflict)
   │                      │  │  └─leitura=oposta────────────────────► conflict      (needs_review)
   │                      │  └─403/400─────────────────────────────► failed        (needs_review)
   │                      ├─não conclusiva, attempts<6─► retry ──(nextAttemptAt)──► processing
   │                      ├─não conclusiva, attempts=6─► unknown[retry_exhausted]  (needs_review)
   │                      └─401──────────────────────► unknown[authorization_required]
   │                                                        │ reautorização ok → retry (sem gastar orçamento)
   │  operador "tentar novamente" (orçamento novo)          │
   └──────────────── unknown | conflict | failed ◄──────────┘
unknown ─operador "verifiquei na Twitch" (auditado, remoteConfirmed:false)─► resolved_manual
unknown | resolved_manual ─leitura externa positiva (EventSub/reconciliação, F11)─► confirmed | conflict
```

`unknownSince`: o instante da primeira transição para `unknown` dentro deste orçamento. Campo de projeção; onde é guardado é decisão do `@data-engineer` (AC 12). O evento de auditoria `financial.operation_needs_review` (safeDetail: `operationType`, `attempts`, `reasonClass`) é gravado nessa transição e é uma fonte válida.

O significado de `syncStatus` do resgate não muda: `pending` → `confirmed` | `conflict` | `unknown` | `operator_resolved`. **Regra:** `remoteStatus` só é escrito a partir de uma leitura remota (evento ou Helix); a resolução manual nunca o escreve.

### 2.2 Exclusão da fila (`queue.lifecycleStatus` + `remoteSyncStatus`, colunas existentes)

```text
active ─exclusão pedida─► deleting/pending_close ─pausa confirmada─► deleting/delete_pending
deleting/delete_pending ─reward.delete liquida financeiro, nova listagem = 0, DELETE ok ou 404─► deleted/deleted
deleting/* ─permanece─ enquanto houver bloqueios (a fila em si não tem estado terminal de erro)
```

Nenhuma coluna ou valor novo na fila. A API deriva uma **projeção de exclusão** para o painel e para a FT-23:

| `deletionState` | Regra (tudo derivado) | Campos extras |
|---|---|---|
| `deleted` | `lifecycleStatus='deleted'` | — |
| `pending` | `deleting` e nenhum bloqueio em revisão; o trabalho avança (pausa, cancelamentos em `pending/retry/processing`, `reward.delete` em `pending/retry/processing`) | `openOperations` (contagem) |
| `blocked` | `deleting` e pelo menos um de: tarefa financeira da fila em `unknown/conflict/failed`; `reward.delete` ou a tarefa de pausa em `unknown/failed`; autorização necessária | `blockingOperations` (contagem), `blockReason ∈ {financial_review_required, authorization_required, reward_state_unverified, remote_delete_rejected}` |

O próprio `reward.delete` **deixa de ir para `unknown` por causa de bloqueios financeiros** (F8): nada foi enviado à Twitch, então seu resultado não é desconhecido. Ele vai para `retry` com `lastError='queue_deletion_blocked_by_review'` (ver 5.2). O `unknown` dele fica reservado para um resultado remoto realmente incerto (`queue_delete_result_unknown`, `queue_delete_reward_diverged*`).

**O que a UI pode expor sem texto novo não revisado:** os códigos enumerados acima, as contagens e a lista existente de Operações, com seus rótulos de estado atuais e as duas ações existentes (`retry`, `resolve-unknown`). Qualquer frase nova (por exemplo "exclusão bloqueada: N operações precisam de revisão") ou rótulo novo de estado é texto visível e aguarda a decisão de UX do proprietário/`@po` registrada na story (nota de UX). O contrato da API foi pensado para que o painel não precise de texto livre do servidor.

**Descartados:** valor `delete_blocked` em `remoteSyncStatus` (exigiria que todo escritor de `remoteSyncStatus` o mantivesse coerente; derivar é mais barato e não diverge); "cancelar exclusão" como terceira ação do operador (fora, por decisão do `@po`, pergunta aberta 1 da story; o `beginQueueDeletionCancellation` existente em `queue-repository.mjs:838-865` não é tocado).

## 3. Reverificação só leitura (FT-25)

**Decisão: a reverificação mora no próprio ciclo de retentativa do worker financeiro, não num loop novo nem na reconciliação.** Toda tentativa já começa com uma leitura (`financial-worker.mjs:52-53`); com a seção 1, uma leitura não conclusiva agenda a próxima tentativa em vez de encerrar a tarefa. Isso *é* a reverificação limitada e só leitura que o proprietário pediu (6 leituras com espera crescente).

- **Escrita só após leitura positiva `UNFULFILLED` na mesma tentativa** (ler antes de escrever, já existente, `financial-worker.mjs:76-92`). A reverificação nunca escreve diante de `UNKNOWN`/erro.
- **Dentro do orçamento a tarefa fica em `retry`, nunca em `unknown`**, então não há o que "reenfileirar": o `claimNext` a pega em `nextAttemptAt`. Quando a leitura mostra `UNFULFILLED`, o fluxo normal escreve (AC 6).
- **`unknown` terminal não é reenfileirado automaticamente.** Só o movem: (a) o "tentar novamente" do operador (orçamento novo), (b) uma reautorização bem-sucedida, para `authorization_required`, ou (c) uma leitura externa positiva (F11). O caso (c) é passivo: a reconciliação (a cada 5 min, `integration.mjs:168`, execução única em `:93-95`) e o EventSub podem *confirmar* ou pôr em *conflito*, nunca rearmar. Isso respeita "sem loop sem fim" e ainda deixa uma leitura positiva real encerrar o caso.
- **Como evitar corrida.**
  1. O worker é o dono do status das tarefas financeiras; todas as suas escritas têm guarda de lease (`queue-repository.mjs:2165-2191`).
  2. **`markRedemptionUnknown` deixa de tocar linhas do outbox** (F7): pode marcar `redemption.syncStatus='unknown'` (diagnóstico), mas não move tarefas `pending/retry/processing`; com o classificador único, um 404 real na reconciliação vira só a issue de diagnóstico `redemption_history_unavailable`.
  3. O caminho de confirmação externa (F11) atualiza uma linha `processing` sem o lease token; é seguro porque só grava um resultado *positivo*, e o `confirm/retry/unknown` posterior do worker falha na guarda (0 linhas). O worker deve tratar atualização com 0 linhas como `lease_lost`, não como erro. O `@qa` prova isso em PostgreSQL.
- **Saúde:** a projeção conta `retry` com classe `remote_unconfirmed` → `degraded`; terminais → `needs_review` (seção 1).

**Descartados:** rearmar tarefas `unknown` pela reconciliação a cada 5 min (é o loop sem fim que o proprietário removeu, e cria dois escritores da mesma linha); um loop dedicado de reverificação (segundo agendador com o mesmo problema de lease, sem ganho sobre `nextAttemptAt`).

## 4. Mapeamento do resgate pelo adaptador (correção do D-5, FT-24)

### 4.1 Contrato

```text
getRedemptionStatus(redemptionId, rewardId): Promise<'UNFULFILLED'|'FULFILLED'|'CANCELED'|'UNKNOWN'>
  lança HttpStatusCodeError do Twurple (statusCode) ou erro do adaptador { status, code }
```

Ordem de `redemptionStatus(value)`:
1. Se `value` for objeto de dados do Twurple (`value instanceof HelixCustomRewardRedemption`): `normalizeRedemptionStatus(getRawData(value).status)` — o `status` bruto do Helix é a fonte de verdade.
2. Guarda de consistência: se o status bruto contradiz os booleanos (`FULFILLED` com `isFulfilled===false`, ou `CANCELED` com `isCanceled===false`), retorna `UNKNOWN` (nunca confirmação sobre dado contraditório, AC 3).
3. Caso contrário (objetos literais de fakes antigos ou formato do EventSub): mantém o fallback atual booleanos → `status`, para os testes existentes continuarem verdes.

A mesma função vale para o resultado de `setRedemptionStatus` (`helix-adapter.mjs:147`) e para `listUnfulfilledRedemptions` (`:163`), o que corrige a importação da reconciliação (AC 2).

**Dependência:** `getRawData` vem de `@twurple/common`, hoje só transitivo (F14). Adicionar `@twurple/common` como dependência direta de runtime e `@twurple/api-call` como devDependency (os testes constroem `HttpStatusCodeError` real), ambos fixados em **8.2.0**, junto com `@twurple/api`. A mudança de lockfile segue o caminho normal `@dev` → `@qa` → `@devops`.

**Descartados:** inferir `UNFULFILLED` de "ambos os booleanos falsos" (qualquer valor bruto futuro/desconhecido também viraria `UNFULFILLED` e dispararia uma escrita — mais fraco que o AC 3); ler `value[rawDataSymbol]` diretamente (mesma dependência, menos explícito); chamar o Helix por `fetch` cru para obter o JSON (perde autenticação e rate limit do Twurple).

### 4.2 Normalização de erros (AC 4)

Um módulo (proposto `apps/api/src/twitch/twitch-errors.mjs`), usado pelo worker financeiro, pelo reward worker, pela reconciliação e por `getChannelEligibility`:

```text
httpStatusOf(error)    = inteiro error.statusCode ?? inteiro error.status ?? undefined
classifyTwitchFailure(error) → { kind: 'auth'|'forbidden'|'not_found'|'rate_limited'|'transient'|'rejected',
                                 httpStatus, retryAfterMs? }
  401→auth, 403→forbidden, 404→not_found, 429→rate_limited, 5xx/sem status→transient, outros 4xx→rejected
```

O erro sintético do próprio adaptador (`{ status: 404, code: 'REDEMPTION_NOT_FOUND' }`, `helix-adapter.mjs:140`) continua funcionando porque `status` é o fallback. Os testes atuais com `{ status }` continuam passando. O `reward-worker.mjs:316` (`lookupError?.status === 404`) passa a usar a função única (hoje um 404 real do Twurple ali vira `unknown('queue_delete_result_unknown')` em vez de "já não existe").

### 4.3 Logs (AC 5, AC 10)

- Por tentativa financeira, pelo logger JSON / `reportDiagnostic` existente: `{ event: 'financial.attempt', operationType, outboxId, attempt, httpStatus, twitchErrorCode, nextAttemptAt, outcome }`. `twitchErrorCode` é o **nosso** código enumerado (`error.code`, ≤ 64), nunca o corpo nem a mensagem da resposta do Helix (o Twurple põe URL e corpo em `error.message`, `HttpStatusCodeError.js:12`) — portanto `error.message` nunca é logado.
- Por reconciliação, em `integration.mjs`, onde `degraded` é publicado (`:102`, `:106`): `{ event: 'twitch.reconciliation', trigger, status, reason, queues, imported, issueCounts: { <code>: n } }`. Só códigos e contagens: sem `queueId`, `redemptionId`, id/login de usuário, entrada, token, header ou URL.
- O `@dev` cria teste unitário que afirma o conjunto exato de chaves das duas linhas (chave extra falha), além da regra de log de credenciais do OpenGrep via `npm run review:static`.

### 4.4 Teste de contrato com instâncias reais do Twurple (AC 1-2, risco "cegueira dos testes")

- **Um helper** (proposto `tests/helpers/twurple-real.js`) é o único lugar que chama construtores do Twurple:
  - `realRedemption(raw)` → `new HelixCustomRewardRedemption(raw, stubClient)`; raw = JSON do Helix (`id`, `broadcaster_id`, `reward: {id,…}`, `status`, `redeemed_at`, `user_*`, `user_input`).
  - `realHttpError(statusCode)` → `new HttpStatusCodeError(statusCode, text, url, method, body, true)`.
  - Os dois construtores são `@private` no Twurple (runtime `(data, client)`; o `.d.ts` só herda `DataObject(data)`), então, na OPS-24, o helper é o único ponto de cast. Uma atualização de `@twurple/*` que o quebre falha um arquivo, não a suíte (também é o gatilho REVISAR SE da pesquisa).
- Testes: o adaptador mapeia corretamente instâncias `UNFULFILLED`/`FULFILLED`/`CANCELED` (falha hoje para `UNFULFILLED`); instância com bruto/booleano contraditórios vira `UNKNOWN`; `listUnfulfilledRedemptions` sobre um paginador falso que entrega instâncias reais; o classificador sobre `HttpStatusCodeError` real 401/403/404/429/500.
- Classe de evidência: unitário com classes reais da biblioteca, sem rede. **Não** prova o Helix ao vivo (AC 19).

## 5. Ordem de exclusão e idempotência (FT-26)

### 5.1 Ordem e o que cada passo escreve (mantém F13, corrige F8/F9)

| Passo | Ação | Escreve | Idempotência |
|---|---|---|---|
| 0 | Operador exclui | fila `deleting`, `isOpen=false`; entradas `removed`; intenções de cancelamento das entradas ativas; tarefa de pausa ou `reward.delete`; auditoria `queue.deletion_requested` (`queue-repository.mjs:756-834`) | versão da fila + `withQueueTransaction`; chave de idempotência OPS-21 na rota (AC 18) |
| a | Pausar a recompensa (`reward.set_open`, `deleteAfterConfirm`) e **verificar por leitura** (`helix-adapter.mjs:75-95`) | `remoteSyncStatus: pending_close → delete_pending`; enfileira `reward.delete` (`:1662-1669`) | chave `queue:{id}:reward.delete.pause:{version}` |
| b | `reward.delete` lista `UNFULFILLED` (paginado, agora mapeado certo) e grava **um `redemption.cancel` por resgate aberto** (`:1679-1726`) | resgate `expectedStatus=CANCELED`, tarefa de cancelamento | chave `financial:{redemptionId}` (única); um `redemption.fulfill` existente é respeitado (espectador atendido continua atendido) |
| b' | Cada cancelamento passa pelo worker financeiro (seções 1 e 3) e é **confirmado por leitura remota** | outbox `confirmed`, resgate `CANCELED/confirmed` | lease + ler antes de escrever |
| — | Enquanto houver tarefa financeira da fila em `pending/retry/processing` | `reward.delete` → `retry` (`queue_deletion_waiting_for_refunds`, 30 s, atual) | — |
| — | Enquanto houver alguma em `unknown/conflict/failed` | `reward.delete` → **`retry`** (`queue_deletion_blocked_by_review`, reverifica a cada 5 min) em vez de `unknown` | `reward.delete` sem orçamento |
| c | Nova listagem: zero `UNFULFILLED` na Twitch para a recompensa | nada, ou novas intenções de cancelamento e volta a aguardar | — |
| d | `prepareRewardDelete` (`safeToDelete`, `requestMayHaveReachedTwitch`) e depois `deleteReward` | flags no payload; depois fila `deleted`, slug tombstone, chaves removidas, auditoria `queue.deletion_confirmed` | as flags tornam seguro reexecutar após uma queda |
| e | 404 no DELETE ou na leitura após erro (`statusCode`) | igual a d ("já não existe") | — |

**Retomada automática (AC 14):** na mesma transação em que uma tarefa financeira de uma fila `deleting` vira `confirmed`, conflito resolvido ou `resolved_manual`, a tarefa `reward.delete` dessa fila (se em `retry`) recebe `nextAttemptAt = agora`. A reverificação de 5 min é só a rede de segurança. Uma reautorização rearma as tarefas financeiras `authorization_required` e as tarefas de exclusão da fila (AC 16).

### 5.2 Resolução manual e a guarda final (corrige F9)

- `resolve-unknown` continua sendo o único caminho manual (`queue-routes.mjs:274-279` → `queue-repository.mjs:2247-2276`): só a partir de `unknown`; auditoria `financial.operation_resolved_manually` com `actorId`, instante, `remoteConfirmed:false` e `reason` enumerado (sem texto livre, para não gravar dados pessoais na auditoria). Nunca escreve `remoteStatus` nem `confirmed`.
- Para fins de exclusão, `resolved_manual` (tarefa) + `operator_resolved` (resgate) contam como **liquidados localmente** em `getQueueDeletionBlockers`, `prepareRewardDelete` e `completeQueueDeletion` (hoje bloqueiam para sempre).
- **A nova listagem na Twitch (passo c) continua sendo a guarda final e prevalece sobre a decisão manual:** se um resgate resolvido manualmente ainda aparece `UNFULFILLED`, a recompensa não é excluída (o Delete Custom Reward o transformaria em `FULFILLED` e manteria os pontos, pesquisa Q3); a tarefa de cancelamento é rearmada para `pending` com orçamento novo e auditoria `financial.manual_resolution_contradicted`. É seguro: uma leitura positiva `UNFULFILLED` é exatamente a condição que autoriza escrever.
- O `@data-engineer` decide se "liquidado localmente" se expressa só por listas de status (esperado, sem DDL).

### 5.3 A Twitch recusar excluir a recompensa (PARCIAL)

API documentada: a exclusão é permitida e os resgates pendentes viram `FULFILLED` (doc VERIFICADA; pesquisa Q3). O proprietário viu o **painel** da Twitch recusar (interface, não API; PARCIAL). O desenho cobre os dois:
- Caso normal: o passo c garante zero `UNFULFILLED` antes do DELETE, então o auto-atendimento documentado nunca se aplica. A janela residual entre a nova listagem e o DELETE é fechada pela pausa verificada (`reward-worker.mjs:282`); não se cria resgate numa recompensa pausada (comportamento documentado da Twitch; risco residual aceito, registrado para o AC 19).
- Se o DELETE responder 4xx diferente de 401/404/429: reler a recompensa e listar de novo; se `UNFULFILLED` reapareceu → gravar cancelamentos e voltar a aguardar; se não há nenhum e a recompensa ainda existe → `reward.delete` `failed` com `queue_delete_rejected_by_twitch` → projeção `blocked` / `remote_delete_rejected`; o operador usa "tentar novamente". Sem loop infinito.
- 401 → `blocked` / `authorization_required`, rearmado após reautorização.

### 5.4 Cancelar na exclusão, OPS-21, OPS-20

- **Cancelar (reembolsar), não atender**, confirmado (AC 13, validado pelo `@po`): cumpre a promessa do diálogo do painel e evita cobrar espectadores sem atendê-los. Um `redemption.fulfill` já existente (espectador atendido) é mantido (`queue-repository.mjs:1704-1708`).
- OPS-21: a rota de exclusão e as duas ações de Operações (`retry`, `resolve-unknown`) passam a devolver `code` enumerado em respostas não 2xx (hoje devolvem só uma frase, `queue-routes.mjs:271, 277`), começam como `terminal_unknown` no contrato de idempotência e só são promovidas com prova em PostgreSQL (AC 18).
- OPS-20: quando a elegibilidade de reembolso entrar, o passo b deve consultar a regra de elegibilidade em vez de sempre cancelar; o ponto de extensão é `decideTransition(...).financialDecision` (`queue-repository.mjs:774-779`) e `recordQueueDeletionRedemptions`. Nenhuma mudança agora.

## 6. Fatiamento, dependências, responsáveis

Complexidade confirmada: escopo 4, integração 4, infraestrutura 3, conhecimento 3, risco 5 = **19 → COMPLEXA**.

| Fatia | Conteúdo | Conjunto de escrita | Depende de | Banco |
|---|---|---|---|---|
| **FT-24** (#82) — primeiro, P0 pequena | 4.1 mapeamento com `getRawData`; 4.2 classificador único no worker, reward worker, reconciliação e elegibilidade; 4.3 linha de log da reconciliação; 4.4 helper e testes de contrato; `@twurple/common`/`@twurple/api-call` 8.2.0 diretos | `helix-adapter.mjs`, novo `twitch-errors.mjs`, `financial-worker.mjs` (só leitura de status), `reward-worker.mjs:5-8, 316`, `reconciliation.mjs`, `integration.mjs`, `package.json`/lockfile, testes | nada | nenhum |
| **FT-25** — P1 | Módulo de política da seção 1; `retry` vs `unknown(retry_exhausted)` no worker; log por tentativa; saúde `degraded`/`needs_review`; correção F7; orçamento novo na retentativa manual; rearme na reautorização | `financial-worker.mjs`, `queue-repository.mjs` (parte financeira), projeção de saúde, `integration.mjs` (gancho de reautorização) | FT-24; `@data-engineer` AC 12 | `@data-engineer` decide; esperado nenhum |
| **FT-26** — P1 | Seção 5: bloqueio→`retry`, retomada automática, liquidação de `resolved_manual` + guarda de contradição, tratamento de recusa 403/4xx, projeção de exclusão, códigos OPS-21 | `reward-worker.mjs` (`processDeleteTask`), `queue-repository.mjs` (parte de exclusão), `queue-routes.mjs`, DTO da API | FT-25 (classificação, `needs_review`, orçamento); contrato OPS-21; serializar com as fatias 4-5 da OPS-21 (mesmo arquivo de repositório) | esperado nenhum |

- Nada de dois `@dev` em paralelo em `queue-repository.mjs` / nos workers (conflito de escrita da story). A FT-24 pode começar já (condição do `@po`).
- A FT-23 (navegação) consome `deletionState` da FT-26; a OPS-23 é independente.
- A OPS-24 (TypeScript) começa depois da OPS-22; não converter esses arquivos para `.ts` dentro da OPS-22 (sem misturar conversão com mudança de comportamento).

**O `@data-engineer` decide (AC 12):** onde guardar a base de orçamento / zerar na retentativa manual; `unknownSince` (payload ou derivado da auditoria); classe de motivo (prefixo de `lastError` ou payload); se existe `CHECK` de status em `outbox.status`; se a projeção derivada de exclusão precisa de índice (`outbox(entity_id, operation_type, status)` é candidato); a mudança em `markRedemptionUnknown`.

**O `@qa` precisa de:**
- Unitário (Vitest, fake timers, `random` injetado): valores da agenda incluindo limites do jitter; 6ª tentativa → `unknown(retry_exhausted)`; 401 não contado; 404 de leitura retentável; conjunto de chaves dos logs.
- Contrato: o helper de instâncias reais (4.4), nunca objetos literais, para adaptador e classificador.
- PostgreSQL descartável com migrations reais (nunca SQLite/mocks de Prisma, nunca o volume ativo): `attempts` persistido após lease expirado; nenhum `confirmed` nem `FULFILLED/CANCELED` local sem leitura positiva após qualquer sequência de falhas (AC 9); `lease_lost` com confirmação externa concorrente (3); auditoria da resolução manual e desbloqueio por `resolved_manual`; resolução manual contradita; matriz de exclusão aberto/unknown/já cancelado/já atendido (AC 17); nenhum `reward.delete` enquanto restar `UNFULFILLED` não contabilizado.
- E2E de navegador só com fixtures (item bloqueante em Operações, projeção de exclusão, retomada após resolução) — só para texto já aprovado.
- Twitch ao vivo: só o AC 19, liberado pelo proprietário, classe de evidência separada.

## 7. Proposta de texto para o AGENTS.md sobre TypeScript (OPS-24) — só a proposta

Substituir o item de stack em `AGENTS.md:111` por:

> - **Ambiente e stack:** Node `24.20.0` (fixado em `package.json`), PostgreSQL com Prisma; stories em `docs/stories/<ID>/story.md` e `docs/pt-BR/stories/<ID>/story.md`. O backend (`apps/api`) está em migração incremental para **TypeScript** (OPS-24): arquivo novo ou convertido do backend é TypeScript ESM executado por *type stripping* do Node (sem `enum`, `namespace` com código, *parameter properties* nem decorators; `import type` para tipos; extensão explícita nos imports), verificado por `npm run typecheck` com `strict`. Use os tipos reais das bibliotecas (Twurple, Prisma) em vez de reproduzir formas à mão; nas bordas (HTTP, Twitch, JSON) receba `unknown` e estreite. Contratos com bibliotecas externas são testados com instâncias reais das classes, nunca com objetos literais. Arquivos `.mjs` com JSDoc ainda não convertidos continuam válidos até a fatia correspondente da OPS-24; não misture conversão de arquivo e mudança de comportamento na mesma story ou commit. Exemplos genéricos do framework (Node 18+, Supabase, `{epic}.{story}.story.md`) não se aplicam.

Pré-condições para o texto ser verdadeiro (OPS-24, não OPS-22): o `tsconfig` inclui `.ts` com `strict`; o include do Vitest, o ESLint (compatibilidade do `typescript-eslint` com o TS 7.0 é item aberto na pesquisa) e as regras do OpenGrep cobrem `.ts`. Até lá, o proprietário deve manter o texto atual.

## Riscos

- **Causa raiz ~90 %** (NÃO VERIFICADA ao vivo): se houver outra causa (`reward_id` errado, atraso de consistência, Client ID), o orçamento limitado mais o 404 retentável ainda convergem para `needs_review` em vez de congelar; o AC 19 confirma.
- **Resolução manual vs verdade remota:** o operador pode resolver enquanto a Twitch ainda mostra `UNFULFILLED`; a guarda do passo c impede a exclusão e rearma o reembolso (5.2).
- **Corrida residual entre nova listagem e DELETE:** mitigada pela pausa verificada; documentada e verificada ao vivo no AC 19.
- **Confirmação externa sem lease token** (F11): segura só se o worker tratar atualização guardada com 0 linhas como `lease_lost`; precisa de prova em PostgreSQL.
- **Dependências diretas novas** (`@twurple/common`, `@twurple/api-call`) devem andar junto com `@twurple/api`; uma atualização do Twurple dispara o REVISAR SE da pesquisa e quebra um helper de propósito.
- **Texto visível:** a projeção de exclusão é só código; qualquer frase depende da decisão de UX pendente.
- **Segurança:** nenhum caminho novo de segredo; os logs excluem `error.message` (contém URL/corpo); motivos de auditoria são enumerados, sem texto livre.

## Registro de alterações

- 2026-10-27 — `@architect` (Aria): decisões 1-7 registradas a partir de análise de código somente leitura; fecha o gate de planejamento da arquitetura na OPS-22.
