# OPS-20 — Nota de arquitetura e fronteiras (elegibilidade para devolução)

[English](../../../stories/OPS-20/architecture.md)

**Autora:** `@architect` (Aria), 2026-10-21. **Story:** [story.md](story.md), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76). **Entradas:** [research.md](research.md) (inclui a Rodada de verificação 2), [data-model.md](data-model.md) (GO do data-engineer).
**Natureza:** apenas gate de planejamento. Nenhum código, migration, Docker ou chamada à Twitch foi executado. As afirmações sobre o código vêm de leitura somente-leitura na branch `feat/ops-15-next-panel` de `apps/api/src/domain/entry-transitions.mjs`, `persistence/queue-repository.mjs`, `outbox/financial-worker.mjs`, `twitch/helix-adapter.mjs`, `twitch/oauth.mjs`, `twitch/integration.mjs`, `runtime.mjs` e `node_modules/@twurple/api` 8.2.0.

Rótulos: **VERIFICADO** (texto oficial da Twitch ou código lido aqui), **PARCIAL** (texto oficial mais inferência, ou só comunidade), **NÃO VERIFICADO** (sem fonte; premissa de design).

## Resultado do gate

**GO** para o planejamento de UX e QA, com três ajustes de modelo de dados (D1–D3, seção 8) para o `@data-engineer` e uma decisão do proprietário (OD-1, seção 1.2). Complexidade: **COMPLEX** (16/25). Entrega recomendada em três fatias (seção 6).

## 0. Fatos usados neste design

| # | Fato | Rótulo |
|---|---|---|
| F1 | Get Broadcaster Subscriptions: token de usuário do broadcaster com `channel:read:subscriptions`; no máximo 100 `user_id`; não assinantes ficam fora de `data`; `tier` 1000/2000/3000; `is_gift`. | VERIFICADO (pesquisa, rodada 2 §1) |
| F2 | Prime não é distinguível; aparece como tier 1000. | PARCIAL (ausência no texto oficial + comunidade) |
| F3 | Update Redemption Status: até 50 ids, um `reward_id`, só enquanto UNFULFILLED; 404 = não encontrado ou não UNFULFILLED; CANCELED devolve os pontos. | VERIFICADO (rodada 2 §2) |
| F4 | Excluir uma recompensa marca como FULFILLED os resgates UNFULFILLED pendentes. | VERIFICADO (rodada 2 §2) |
| F5 | Get Moderators (`moderation:read`) e Get VIPs (`channel:read:vips`), até 100 `user_id`, token do broadcaster. | VERIFICADO (rodada 2 §4) |
| F6 | 429 quando o bucket esvazia; `Ratelimit-Reset` indica quando ele se recompõe; limites de token de usuário valem por client ID por usuário; não depender do texto da mensagem. | VERIFICADO (rodada 2 §5, guia) |
| F7 | O número de 800 pontos/minuto. | NÃO VERIFICADO (não está nas citações verificadas) |
| F8 | Expiração ou limite de resgates UNFULFILLED pendentes. | NÃO VERIFICADO (rodada 2 §3) |
| F9 | O refresh mantém os escopos concedidos originalmente; um escopo novo exige nova autorização (a resposta do refresh devolve `scope`). | PARCIAL ([refresh tokens](https://dev.twitch.tv/docs/authentication/refresh-tokens/), acesso em 2026-10-21; não achei frase dizendo "mesmos escopos", mas o refresh não pede novo consentimento, então não pode acrescentar escopos) |
| F10 | Twurple 8.2.0 `getSubscriptionsForUsers(broadcaster, users)` faz **uma** requisição com todos os ids e **não** divide em lotes; declara `scopes: ['channel:read:subscriptions']`. `updateRedemptionStatusByIds` também envia uma requisição só. | VERIFICADO (leitura do código em `node_modules/@twurple/api/lib/...`) |
| F11 | O rate limiter interno da Twurple pode enfileirar ou repetir o 429 antes de o erro chegar ao adapter. | NÃO VERIFICADO (conferir no código de `@twurple/api-call`/rate limiter durante o dev; os testes usam fakes de qualquer forma) |
| F12 | `decideEntryTransition()` força `request_cancel` na remoção de quem está aguardando e em `queue_cleared`/`queue_deleted`; o repositório a chama dentro de uma transação Prisma e depois `createCancellationIntent()` (chave `financial:{redemption_id}`). | VERIFICADO (código) |
| F13 | `checkFollower()` devolve `'unknown'` quando falta o escopo opcional ou a chamada falha; o OAuth tem uma allow-list `optionalScopes` (`moderator:read:followers`) e um caminho de reconsentimento só de escopo (`integration.mjs` linha 282). | VERIFICADO (código) |
| F14 | O worker financeiro lê o status remoto e depois atualiza um resgate por tarefa; 429 usa `retryAfterSeconds`; 401 → `unknown`/`authorization_required`. | VERIFICADO (código) |

## 1. Divisão de domínio

```
            Rotas HTTP / comandos de chat / timeout loop
                           │ (pontos de entrada inalterados)
                           ▼
                 queue-service (domínio) ──► decideEntryTransition()  [QUANDO: chaves por gatilho]
                           │                         │ financialDecision = request_cancel | request_fulfill | no_operation
                           ▼                         ▼
              RefundEligibilityPolicy.evaluate()  [SE: pura]
                           │  → resolvida agora (everyone / nobody / próprio broadcaster)
                           │  → needs_lookup (regra subscribers)
                           ▼
              EligibilityDecisionRecorder (repositório, mesma transação)
                ├─ elegível resolvido       → createCancellationIntent()   (redemption.cancel, financial:{id})
                ├─ não elegível resolvido   → keep_unfulfilled: sem intenção / auto_fulfill: redemption.fulfill
                └─ needs_lookup             → linha de decisão pending_check + tarefa de verificação
                                                          │
                                                          ▼
              EligibilityCheckWorker (novo, loop do outbox) ── porta SubscriberStatusProvider
                                                          │      ├─ TwitchSubscriberStatusAdapter (Helix)
                                                          │      └─ fakes (testes)
                                                          ▼
                       RefundEligibilityPolicy.evaluate(regra, status) → recorder.complete()
                                                          │ (mesmas regras acima, no máximo uma intenção financeira)
              RefundOverrideService (painel: devolver / marcar atendido, individual) ─┐
              BulkMarkServedService (painel: em lote, idempotente)                   ─┴─► escrita protegida → intenção financeira
```

### 1.1 Componentes

| Componente | Tipo | Responsabilidade | Não pode |
|---|---|---|---|
| `RefundEligibilityPolicy` (`apps/api/src/domain/refund-eligibility.mjs`) | Função **pura**, sem I/O | `evaluate({rule, viewer:{userId, isBroadcaster}, statuses?}) → {decision, statusSource, audienceMatch, subscriberStatus, tier, isGift, unknownReason, lookups[]}`. Sem `statuses`, devolve uma decisão final ou `needs_lookup` com a lista de consultas necessárias (`subscription`, `moderator`, `vip`). | chamar a Twitch, ler o relógio, conhecer o outbox |
| Porta `SubscriberStatusProvider` | Interface | `lookupSubscriptions(userIds[]) / lookupModerators(userIds[]) / lookupVips(userIds[])`, cada uma devolvendo `{status:'ok', byUserId}` ou `{status:'unknown', reason}` para o **lote inteiro**. Impõe `≤ batchMax` ids por chamada. | lançar exceção em falhas esperadas; devolver "ok" parcial com corpo malformado |
| `TwitchSubscriberStatusAdapter` (em `helix-adapter.mjs`) | Adapter | Confere antes os escopos concedidos via `authProvider.getCurrentScopesForUser(broadcasterId)` (mesmo padrão de `checkFollower`, F13); valida ids (`^\d{1,32}$`) e o formato da resposta; mapeia 401/403/429/5xx/timeout/formato para códigos de motivo; expõe `Ratelimit-Reset` como `retryAt`. | registrar UIDs, dados de quem presenteou, tokens; fazer cache entre decisões |
| Fakes (`tests/fakes/subscriber-status-provider.mjs`) | Dublê de teste | Respostas programáveis por usuário e por chamada (ok, 429 com reset, 5xx, malformado, escopo ausente). | — |
| `EligibilityDecisionRecorder` (funções do repositório) | Persistência | Inserir a linha de decisão `ON CONFLICT (redemption_id) DO NOTHING`, concluir linha pendente, criar no máximo uma intenção financeira, gravar `audit_logs` só com códigos. | abrir chamada de rede dentro da transação |
| `EligibilityCheckWorker` (`apps/api/src/outbox/eligibility-worker.mjs`) | Worker | Reivindica verificações pendentes agrupadas por fila (≤ tamanho do lote), chama o provider **fora** de qualquer transação e conclui as linhas numa transação curta. | criar intenções financeiras para `unknown` |
| `RefundOverrideService` | Domínio + repositório | Devolver / marcar atendido um resgate, com escrita protegida (data-model 2.4) e auditoria de quem, quando e motivo. | reverter uma intenção financeira existente (Q2) |
| `BulkMarkServedService` | Domínio + repositório | "Marcar atendido" em lote com `resolution_batch_id` e idempotência via `processed_operations`. | reescrever em parte linhas já resolvidas |

**Decisão de fronteira principal — nenhuma chamada à Twitch dentro de transação de banco.** Hoje a decisão de devolução acontece dentro de uma transação Prisma (F12). Colocar ali uma consulta Helix seguraria locks de linha durante o tempo de rede, e esperas de 429 travariam a API. Por isso a consulta de assinante é **assíncrona**: a transação grava `pending_check` e uma tarefa de verificação; o worker resolve segundos depois.

- Opção A, consulta síncrona antes da transação: o chat poderia dizer "devolução solicitada", mas há mais latência, um segundo caminho de código para a limpeza e uma corrida entre consulta e commit. Rejeitada para o MVP.
- Opção B, tarefa de verificação assíncrona (**escolhida**): um caminho só para todos os gatilhos, lotes naturais na limpeza e 429 tratado pelo modelo de lease/retry que já existe. Custo: com "só assinantes", o chat não pode dizer "devolução solicitada" no momento da remoção (seção 7).
- Opção C, cache de assinaturas via EventSub: rejeitada pela story (fora de escopo, pesquisa §4).

"Decidido no momento em que a decisão de devolução é tomada" (CA 5) fica atendido como "status que a Twitch informa quando a verificação roda, normalmente segundos após o gatilho"; `status_checked_at` guarda o instante exato. Aderência **PARCIAL** ao texto do CA 5, sinalizada para `@po`/UX; nenhum CA precisa mudar.

### 1.2 Regras de avaliação (avaliador puro)

1. `everyone` → `eligible`, `not_required`. `nobody` → `not_eligible`, `not_required`. Sem consulta, sem escopo.
2. `subscribers`:
   1. a pessoa é o broadcaster → `includeBroadcaster ? eligible : not_eligible`, fonte `broadcaster_self`, sem chamada à API (se o broadcaster aparece na própria lista de assinaturas não está verificado, pesquisa rodada 2 §1, então nunca se pergunta).
   2. caso contrário, é elegível se **qualquer** um valer: a assinatura atende à definição (ativa; presenteada só se `countGiftedSubs`); `includeModerators` e é moderador; `includeVips` e é VIP.
   3. Curto-circuito: quando uma fonte conhecida já torna a pessoa elegível, as outras consultas desconhecidas não importam. `not_eligible` exige que **todas** as consultas necessárias sejam conhecidas; qualquer consulta necessária desconhecida → `unknown` com aquele motivo.
3. As opções de público são **aditivas** (acrescentam elegibilidade, não tiram). Um moderador que é assinante é elegível no padrão (moderadores desligados).

**OD-1 (decisão do proprietário necessária):** a decisão 1 do proprietário diz que moderadores/VIPs são "não elegíveis" por padrão. Leitura aditiva (recomendada): moderador/VIP que também assina continua recebendo a devolução como assinante; nenhum escopo extra é necessário no padrão. Leitura exclusiva: moderadores/VIPs são recusados mesmo assinando; isso torna `moderation:read`/`channel:read:vips` **obrigatórios** na configuração padrão e acrescenta uma consulta a toda decisão. Recomendação: aditiva. Até o proprietário responder, o desenvolvimento da fatia 2 não deve começar.

## 2. Diagramas de sequência (texto)

Notação: `TX{…}` = uma transação de banco; `→W` = processado depois pelo worker de elegibilidade.

### 2.1 Gatilhos por política (removido enquanto chamado, saiu enquanto chamado, não compareceu)

```
Painel/chat/timeout ─► queue-service.transition(entry, to)
  decideEntryTransition()  ── chave desligada ─► no_operation (regra não consultada, sem linha de decisão)
                           ── chave ligada    ─► request_cancel
  TX{ atualiza entrada; audit entry.transitioned;
      evaluate(regra, pessoa):
        elegível resolvido      → linha de decisão (system, refund_requested) + redemption.cancel
        não elegível resolvido  → keep_unfulfilled: linha awaiting_streamer
                                  auto_fulfill:     linha fulfill_requested + redemption.fulfill
        needs_lookup            → linha pending_check (motivo check_pending, D1) + tarefa de verificação }
  →W o worker (2.5) conclui a linha
```

### 2.2 Remover entrada aguardando (remoção no painel, `!sair` de quem aguarda) — hoje sempre devolve

Igual a 2.1, mas sem chave por gatilho: `shouldRequestCancellation()` continua devolvendo verdadeiro para `waiting → removed` ("quando" = sempre), e a regra passa a decidir "se". Código do gatilho `removed_waiting`.

### 2.3 Limpar fila — hoje sempre devolve (`queue_cleared`)

```
Chat !fila limpar / limpar no painel ─► clear-confirmation.prepare()
  contagem prévia: total de entradas, entradas de resgate;
     regra everyone → "N devoluções serão solicitadas"; nobody → "sem devoluções";
     subscribers → "as devoluções seguem a regra; N serão verificadas"   (sem prometer número, CA 12)
  confirmar ─► TX{ para cada entrada ativa: transição removed(queue_cleared); evaluate();
                   everyone/nobody/broadcaster resolvidas agora; demais pending_check;
                   todas com o mesmo check_batch_id; audit queue.cleared {contagens por resultado} }
  →W o worker pega as linhas pendentes do check_batch_id em blocos de ≤ 100 user ids distintos
     ─► provider.lookupSubscriptions(bloco)  [+ blocos de moderadores/VIPs se as opções estiverem ligadas]
     ok      → TX{ conclui linhas; cria intenções para cada elegível / linha auto_fulfill }
     429     → o bloco inteiro volta em Ratelimit-Reset (+ jitter); linhas ficam pending_check
     outro   → linhas unknown com motivo; repetível ou aguardando o streamer (seção 3)
  O painel mostra contagens do lote: elegíveis (solicitadas), não elegíveis, verificação pendente.
```

### 2.4 Excluir fila — hoje sempre devolve (`queue_deleted`)

```
Excluir no painel ─► requestQueueDeletion()
  TX{ entradas removed(queue_deleted); evaluate(); linhas de decisão como em 2.3 (check_batch_id comum) }
  O bloqueio de exclusão (já existente) passa a esperar também enquanto a fila tiver linhas
     pending_check ou awaiting_streamer, ou qualquer intenção financeira não resolvida.
  Só então reward.delete (channel_points) — porque excluir a recompensa torna FULFILLED todo
     resgate UNFULFILLED (F4) e destruiria em silêncio uma devolução ainda possível.
  Caminho de manual_only convertida (exclusão local, recompensa preservada): mesmo bloqueio, mesma regra.
```

O painel precisa oferecer ao streamer uma saída para a exclusão bloqueada: resolver com "marcar atendido" em lote ou "devolver pontos" por item (seção 2.6).

### 2.5 Worker de verificação de elegibilidade

```
loop: reivindica ≤ batchMax verificações pendentes de UMA fila (lease)   (um token do broadcaster, um snapshot de regra por linha)
  ignora linhas já resolvidas (checagem de version)
  provider.lookup*(ids)          ← fora de qualquer transação, timeout configurável
  evaluate(rule_snapshot de cada linha, status)   ← snapshot da linha, nunca a regra atual da fila
  TX{ UPDATE protegido … WHERE resolution='pending_check' AND version=$v;
      check_attempts+1; status_checked_at=horário da resposta;
      elegível → createCancellationIntent (financial:{id}, ON CONFLICT sem efeito)
      não elegível → awaiting_streamer | intenção de fulfill
      unknown → pending_check com motivo; next_attempt_at ou parar }
```

### 2.6 Ajuste manual e "marcar atendido" em lote

```
Painel (streamer ou moderador) ─► POST override {redemptionId, action: refund|mark_served, reason, version}
  TX{ SELECT redemption FOR UPDATE; UPDATE protegido (data-model 2.4: resolution em
      (pending_check, awaiting_streamer), remote_status UNFULFILLED, expected_status NULL,
      sem linha financial:{id}, version igual);
      1 linha → intenção (cancel ou fulfill) + audit refund.override_applied
      0 linhas → audit refund.override_rejected {código} ; devolve motivo localizado }
Lote ─► POST mark-served {resolutionBatchId, redemptionIds[≤ bulkMax] | filtro queueId, reason}
  chave processed_operations refund.mark_served:{batchId} → repetição devolve o resultado guardado
  por linha: mesmo UPDATE protegido; linhas resolvidas são ignoradas e contadas
```

Um ajuste numa linha `pending_check` também cancela a tarefa de verificação pendente (o UPDATE protegido do worker encontra 0 linhas e descarta a resposta).

## 3. Status desconhecido, novas tentativas, token/escopo e canal não afiliado

| Código de motivo | Origem | Nova tentativa | Significado no painel |
|---|---|---|---|
| `check_pending` (D1) | na fila, ainda não rodou | o worker executa | "Verificando assinatura…" (sem pedir ação) |
| `rate_limited` | 429 | automática em `Ratelimit-Reset` + jitter, contando no máximo uma vez por reset em `maxAttempts` | continua "verificando" |
| `server_error`, `timeout`, `lookup_error` | 5xx, rede, timeout | backoff exponencial com jitter, até `maxAttempts` (padrão 5) e `maxAgeMinutes` (padrão 60) | depois de esgotar: "Não foi possível verificar — decida" |
| `scope_missing` | checagem prévia dos escopos no adapter | **sem** repetição automática; rearmada sozinha quando um reconsentimento concede o escopo | "Reconecte a Twitch para permitir a verificação de assinantes" + decidir agora |
| `unauthorized` | 401 depois do refresh da Twurple | sem repetição; sinal de saúde `authorization_required` já existente | "Reconecte a Twitch" |
| `forbidden` | 403 | sem repetição | "A Twitch recusou a verificação — decida" |
| `channel_ineligible` | elegibilidade diz que não é afiliado/parceiro | sem repetição | decidir (deve ser raro, veja abaixo) |
| `malformed_response` | validação de formato falhou | uma repetição, depois para | "Não foi possível verificar — decida" |

- Desconhecido nunca vira `request_cancel` nem `no_operation` (CA 7/14): simplesmente não existe linha financeira até haver resultado conhecido ou ação humana.
- **Fluxo de reconsentimento.** Acrescentar `channel:read:subscriptions`, `moderation:read` e `channel:read:vips` a `optionalScopes` em `oauth.mjs` (a allow-list existe, VERIFICADO, F13) e generalizar o reconsentimento só de escopo em `integration.mjs`, que hoje trata um único escopo de seguidores, para um conjunto pedido. O painel pede só os escopos que as regras configuradas exigem (assinaturas para qualquer fila `subscribers`; moderadores/VIPs só se alguma fila ligar essas opções), mantendo o consentimento mínimo. Depois do callback, `missingScopes` é recalculado; se o escopo foi concedido, o recorder rearma as linhas `scope_missing` (nova rodada). O refresh do token nunca acrescenta escopos (F9, PARCIAL); o único caminho é autorizar de novo.
- Salvar uma fila com `subscribers` sem o escopo é **permitido** (a story mantém a opção utilizável), mas o formulário mostra o aviso e a ação de reconectar (gate de UX).
- **Canal não afiliado/não parceiro:** não existem resgates de recompensas personalizadas, então a opção fica oculta no mesmo lugar em que filas manual-only a ocultam, usando o resultado atual de `getChannelEligibility()`. Se o canal perder a afiliação depois, as atualizações falham com 403 (F3) e vale o tratamento de falha atual do outbox; a consulta vira `channel_ineligible`.
- Logs: só códigos de motivo, contagens e ids de lote. Nada de ids ou logins de usuário, dados de quem presenteou, tiers por pessoa, texto de ajuste ou tokens.

## 4. Constantes de lote e 429

Configuração (runtime config com limites validados; nunca aceitar valor acima do máximo verificado):

| Constante | Padrão | Permitido | Base |
|---|---|---|---|
| `refundEligibility.subscriptionLookupBatchMax` | 100 | 1–100 | F1 VERIFICADO |
| `refundEligibility.moderatorLookupBatchMax` | 100 | 1–100 | F5 VERIFICADO |
| `refundEligibility.vipLookupBatchMax` | 100 | 1–100 | F5 VERIFICADO |
| `refundEligibility.lookupTimeoutMs` | 5000 | 1000–15000 | design |
| `refundEligibility.maxAttempts` / `maxAgeMinutes` | 5 / 60 | 1–20 / 5–1440 | design |
| `financial.redemptionUpdateBatchMax` | **1** no MVP | 1–50 | F3 VERIFICADO máx. 50 |
| `refundOverride.bulkMax` | 100 | 1–500 | carga de UX/BD, design |

- A Twurple não divide em lotes (F10), então a divisão é responsabilidade nossa e precisa de teste unitário com 99/100/101/230 ids.
- **429:** classificar só pelo status HTTP (F6), calcular `retryAt` a partir de `Ratelimit-Reset` (segundos epoch), definir `next_attempt_at` do bloco inteiro e pausar o worker de elegibilidade até lá (o bucket é um só por client+usuário, então os outros workers também vão bater nele). O texto da mensagem só entra como código de diagnóstico limitado. Conferir F11 no dev e garantir que a repetição interna da Twurple não dobre a espera.
- **Update Redemption Status agrupado (≤ 50 ids, uma recompensa):** fica como opção configurável com padrão 1 no MVP. Motivo: a semântica do worker FND-3 (ler o status, depois atualizar, por tarefa) está testada e estável; agrupar muda a atribuição de falhas (um 404 do grupo diz "não encontrado ou não UNFULFILLED" sem dizer qual id, F3) e por isso exige reler cada id. Trade-off: limpar 230 entradas custa ≈ 460 requisições (leitura + atualização) em vez de ≈ 240; com orçamento NÃO VERIFICADO (F7) isso pode se espalhar por minutos, o que o modelo de retry já tolera. Agrupar é um incremento posterior se canais reais mostrarem que importa.

## 5. Tier mínimo e padrão para não elegíveis

- **Tier mínimo: FORA do MVP (confirmado, Q6).** O tier fica gravado em toda decisão, então um futuro `refund_min_subscriber_tier` não precisa de backfill. Prime não se distingue do tier 1 (F2), então uma opção "Tier 2+" surpreenderia quem usa Prime de qualquer forma. "Excluir presenteadas" continua no MVP (`refund_count_gifted_subs`).
- **Padrão de `refund_non_eligible_handling`: `keep_unfulfilled` (confirmado).** É a única escolha reversível: F3 torna FULFILLED definitivo, e a decisão 4 do proprietário exige que a devolução manual continue possível "a qualquer momento". Com a regra padrão `everyone` o valor não tem efeito, então filas existentes não mudam. Custos aceitos: itens pendentes ficam na lista de pedidos da Twitch do streamer (limite/expiração NÃO VERIFICADOS, F8) e bloqueiam a exclusão da fila até serem resolvidos (seção 2.4); atenuado pelo "marcar atendido" em lote. `auto_fulfill` continua opt-in explícito, com aviso de que a devolução fica impossível.
- Filas `manual_only` convertidas usam a mesma regra e o mesmo valor de tratamento gravados (Q3 confirmada); o painel as mostra só para leitura.

## 6. Complexidade (spec pipeline, 1–5 cada)

| Dimensão | Nota | Motivo |
|---|---|---|
| Escopo | 4 | domínio, repositório (6 caminhos de devolução), worker novo, adapter, OAuth, rotas, formulário e listas do painel, texto do chat, migration |
| Integração | 3 | três endpoints Helix novos, escopos opcionais e reconsentimento, comportamento de rate limit |
| Infraestrutura | 2 | uma migration, um worker novo no loop atual, chaves de configuração |
| Conhecimento | 3 | a equipe conhece FND-3/FND-9; estado novo de decisão assíncrona e semântica de status da Twitch |
| Risco | 4 | efeito parecido com dinheiro (pontos do canal), FULFILLED irreversível, mudança de comportamento nos caminhos forçados |
| **Total** | **16** | **COMPLEX** (≥ 16): seis fases mais um ciclo de revisão |

Fatias recomendadas (mesma story, commits/checkpoints de PR separados; ou stories filhas se o `@po` preferir):
1. **Fatia 1:** migration, avaliador puro, recorder, `everyone`/`nobody`, caminhos forçados passando pela regra, testes golden provando que a saída com `everyone` não muda.
2. **Fatia 2:** porta do provider, adapter da Twitch, worker de elegibilidade, lotes, 429, escopos opcionais e reconsentimento, regra `subscribers` com públicos.
3. **Fatia 3:** ajuste manual e "marcar atendido" em lote, listas/contagens do painel, bloqueio de limpar/excluir, textos do chat e do painel (depois de UX ≥ 9,0).

## 7. Interações

- **Texto do chat da OPS-14 (#65):** `chat.queue.clear_confirm` e `clear_done` (VERIFICADO que imprimem `{refunds}`) e `exit_pending`/`remove_pending` (VERIFICADO que dizem "A refund was requested") passam a respeitar a regra: `everyone` mantém o texto atual; `nobody` diz que não há devolução; `subscribers` diz que a devolução segue a regra do canal e está em verificação. **Privacidade:** o chat nunca deve anunciar que uma pessoa nomeada é ou não assinante; os resultados por pessoa ficam só no painel. Os textos finais pertencem à revisão OPS-14/UX, em en, es e pt-BR, mantendo as chaves do catálogo consistentes.
- **Formulário de configurações da OPS-15:** `queue-settings-form.jsx`/`queue-settings.mjs` ganham a regra, as opções de público, a opção de presenteadas e o tratamento de não elegíveis, ocultos para manual-only e não afiliados e só leitura para filas convertidas; aviso de escopo mais a ação de reconectar. A implementação espera o fim da migração da OPS-15 (dependência da story).
- **Chaves por gatilho:** inalteradas e continuam sendo o "quando". Precedência: chave desligada → nenhuma linha de decisão; chave ligada (ou gatilho forçado) → a regra decide. Observações `external` continuam sem pedir nada. `request_fulfill` (atendido) nunca consulta a regra.

## 8. Respostas às perguntas do data-engineer e ajustes no modelo

- **Q1 — confirmada:** o marcador de pendência fica em `refund_eligibility_decisions`, não num status do outbox financeiro. Nuance: o *trabalho de consulta* usa uma tarefa de verificação separada e não financeira (Q4), então não existe linha financeira enquanto o status é desconhecido.
- **Q2 — nunca no MVP.** Um ajuste não pode reverter um `refund_requested`/`fulfill_requested` existente; cancelar uma tarefa do outbox disputa com o lease e pode já estar em andamento na Twitch. Rejeitar com `already_has_financial_intent` e auditar.
- **Q3 — confirmada:** padrão `keep_unfulfilled`; filas `manual_only` convertidas usam a mesma configuração.
- **Q4 — worker, não só painel:** uma operação de outbox `refund.eligibility_check`, chave `eligibility:{redemption_id}:{round}` (a rodada só aumenta ao rearmar depois de reconsentimento ou de um "verificar de novo" manual), processada pelo worker de elegibilidade com lease/retry; o painel só rearma. Ela fica fora das contagens financeiras e do `claimNext` do worker financeiro.
- **Q5 — aplicação mais testes**, coerente com o estilo do projeto sem triggers; acrescentar o teste de imutabilidade de `decision`/`rule_snapshot` (exceto `unknown` → conhecido).
- **Q6 — confirmada:** tier mínimo fora do MVP.

Ajustes para o `@data-engineer` (pequenos, sem tabela nova):
- **D1:** acrescentar `check_pending` a `unknown_reason` (estado inicial na fila, mantém `decision_unknown_reason_check` verdadeiro); `check_attempts` aumenta a cada tentativa executada.
- **D2:** acrescentar `next_check_at TIMESTAMPTZ(3) NULL` (ou usar o `next_attempt_at` da tarefa; o data-engineer escolhe) para o painel mostrar "verificando até".
- **D3:** registrar o tipo de operação `refund.eligibility_check` na checagem de domínio do outbox (se existir) e mantê-lo fora dos contadores `unresolvedFinancialStatuses`; o bloqueio de exclusão conta linhas de decisão.

## 9. Riscos e premissas

| # | Risco / premissa | Rótulo | Mitigação |
|---|---|---|---|
| R1 | Verificação assíncrona impede o chat de confirmar a devolução com `subscribers`. | design | textos conforme a regra; contagens no painel |
| R2 | Itens UNFULFILLED pendentes se acumulam; possível limite/expiração na Twitch. | NÃO VERIFICADO (F8) | índice por idade, lista no painel, marcar atendido em lote; checagem em canal de teste pelo `@qa` |
| R3 | Exclusão de fila bloqueada por pendências surpreende o streamer. | design | mensagem clara no painel e ações de resolução |
| R4 | O 429 interno da Twurple interfere no nosso backoff. | NÃO VERIFICADO (F11) | ler o código no dev; fakes na porta |
| R5 | OD-1 mal interpretada (aditiva vs exclusiva). | decisão do proprietário | bloquear a fatia 2 até a resposta |
| R6 | Lacuna de reconsentimento para streamers já conectados. | comportamento VERIFICADO (F9 parcial) | `scope_missing` + rearme automático |
| R7 | Regra alterada entre o gatilho e a verificação. | design | o avaliador usa o `rule_snapshot` da linha, nunca a regra atual |
| R8 | A consulta expõe o status de assinatura nos logs. | segurança | só códigos; testes de log (teste 16 do data-model) |
| A1 | Uma recompensa por fila, um token do broadcaster. | VERIFICADO (schema) | — |
| A2 | O painel distingue streamer de moderador. | NÃO VERIFICADO | se não, `resolved_by` usa só `streamer` até existirem papéis |

Segurança: nenhuma superfície de entrada nova além de dois endpoints do painel (ajuste, lote) atrás da sessão do painel e das proteções CSRF/same-origin existentes; texto de motivo limitado; trava otimista contra clique duplo; nenhuma identidade de quem presenteou guardada.

## 10. Arquivos que provavelmente serão alterados (estimativa)

- `apps/api/src/domain/entry-transitions.mjs` (remover o forçamento `queueRemovalOverridesRefundPolicy`; expor o código do gatilho)
- `apps/api/src/domain/refund-eligibility.mjs` (novo, puro)
- `apps/api/src/domain/queue-service.mjs`, `apps/api/src/domain/clear-confirmation.mjs`
- `apps/api/src/persistence/queue-repository.mjs` (todos os caminhos de devolução, recorder, escritas protegidas, bloqueio de exclusão)
- `apps/api/src/outbox/eligibility-worker.mjs` (novo), `apps/api/src/outbox/loop.mjs`, `apps/api/src/runtime.mjs`, `apps/api/src/runtime-config.mjs`
- `apps/api/src/twitch/helix-adapter.mjs`, `oauth.mjs`, `integration.mjs`, `auth-runtime.mjs`
- `apps/api/src/http/queue-routes.mjs` (DTO de configurações, ajuste, lote, contagens)
- `apps/api/prisma/schema.prisma` + migration nova (responsabilidade do `@data-engineer`)
- `apps/frontend/features/queues/queue-settings-form.jsx`, `queue-settings.mjs`, `queue-clear.mjs`, `queue-entry-actions.mjs`, `queue-list.jsx`, nova visão de devoluções pendentes
- `apps/web/localization/catalogs/{chat,panel}/{en,es,pt-BR}.tsv`
- testes: unitários (matriz do avaliador, divisão em lotes, mapeamento do adapter), integração PostgreSQL (data-model §7 mais o worker), fakes

## Fontes (acesso em 2026-10-21)

- Referência da API da Twitch (Get Broadcaster Subscriptions, Update Redemption Status, Delete Custom Reward, Get Moderators, Get VIPs): https://dev.twitch.tv/docs/api/reference/ — citações na rodada 2 da pesquisa.
- Rate limits: https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits
- Refresh tokens: https://dev.twitch.tv/docs/authentication/refresh-tokens/
- Twurple `HelixSubscriptionApi`: https://twurple.js.org/reference/api/classes/HelixSubscriptionApi.html (a página não informa limites nem divisão em lotes; confirmado no código instalado 8.2.0).
- Comunidade (complementar, não verificado): https://discuss.dev.twitch.com/t/pub-sub-with-fully-server-side-authentification/24808 (refresh tokens sem expiração publicada).

Limitações: nenhum teste com a Twitch real; Prime, broadcaster na própria lista, expiração de pendentes e o 429 interno da Twurple ainda precisam ser confirmados por `@qa`/`@dev` em canal de teste e no código-fonte.
