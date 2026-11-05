# OPS-20 — Modelo de dados e plano de migration (elegibilidade de devolução)

[English](../../../stories/OPS-20/data-model.md)

**Autoria:** `@data-engineer` (Dara), 2026-10-21. **Story:** [story.md](story.md), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76). **Pesquisa:** [research.md](research.md).
**Natureza:** apenas portão de planejamento. Nenhum arquivo de migration, código, comando de banco ou Docker foi criado ou executado. Toda afirmação sobre o comportamento atual vem de leitura somente leitura de `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/domain/entry-transitions.mjs` e `apps/api/src/outbox/financial-worker.mjs` na branch `feat/ops-15-next-panel`. Motor-alvo: `postgres:18.6-bookworm` (`compose.yaml`), Prisma 6.19.

## 0. Fatos de base usados neste desenho

| Fato | Fonte |
|---|---|
| Configurações da fila são colunas tipadas `TEXT` + `CHECK` nomeado (sem enums do PG): `queue_mode`, `reward_origin`, `mode_transition_status`, mais checks de consistência entre colunas. | `20261007190000_queue_admission_modes` |
| Política de devolução: três Booleans `refund_if_removed_while_called` (padrão `true`), `refund_on_no_show` (`false`), `refund_if_viewer_leaves_while_called` (`false`). | `schema.prisma` |
| Uma intenção financeira por resgate é garantida por `outbox.idempotency_key` UNIQUE = `financial:{redemption_id}`, compartilhada por `redemption.cancel` e `redemption.fulfill`. | `createCancellationIntent()`; `queue-repository.mjs` linhas 236–252 |
| `createCancellationIntent()` define `redemptions.expected_status = 'CANCELED'`, `sync_status = 'pending'` e insere a linha do outbox na mesma transação. | idem |
| Limpeza (`queue_cleared`), exclusão (`queue_deleted`) e remoção em espera sempre geram `request_cancel` (`queueRemovalOverridesRefundPolicy`). | `entry-transitions.mjs` linha 48 |
| `audit_logs` é somente-inserção, com `actor_id`, `origin`, `reason`, `safe_detail` JSONB; cada transição já grava `policySnapshot` e `financialDecision`. | migration foundation; repositório |
| Status do outbox incluem `unknown`, `resolved_manual`, `cancel_verification`. | `20261014230000_outbox_deletion_cancel_verification` |

## 1. Colunas de política na fila

Todas as colunas novas seguem a convenção existente: `TEXT`/`BOOLEAN`, `NOT NULL`, padrão constante, `CHECK` nomeado. Sem tipo `ENUM` do PostgreSQL (mudar valores exigiria `ALTER TYPE`, e o projeto nunca os usa).

| Coluna (BD) | Campo Prisma | Tipo | Padrão | Significado |
|---|---|---|---|---|
| `refund_eligibility` | `refundEligibility` | `TEXT NOT NULL` | `'everyone'` | `everyone` \| `subscribers` \| `nobody` (AC 1, AC 16) |
| `refund_include_broadcaster` | `refundIncludeBroadcaster` | `BOOLEAN NOT NULL` | `false` | conta do próprio streamer elegível em `subscribers` (AC 2, decisão 1 do proprietário) |
| `refund_include_moderators` | `refundIncludeModerators` | `BOOLEAN NOT NULL` | `false` | moderadores elegíveis em `subscribers` |
| `refund_include_vips` | `refundIncludeVips` | `BOOLEAN NOT NULL` | `false` | VIPs elegíveis em `subscribers` |
| `refund_count_gifted_subs` | `refundCountGiftedSubs` | `BOOLEAN NOT NULL` | `true` | subs presenteadas contam como assinante (AC 3) |
| `refund_non_eligible_handling` | `refundNonEligibleHandling` | `TEXT NOT NULL` | `'keep_unfulfilled'` | `keep_unfulfilled` (fica UNFULFILLED até o streamer decidir) \| `auto_fulfill` (marca FULFILLED automaticamente) — decisão do proprietário sobre a Q3, revisão 2 |

Restrições:

```sql
CONSTRAINT "queues_refund_eligibility_check"
  CHECK ("refund_eligibility" IN ('everyone', 'subscribers', 'nobody')),
CONSTRAINT "queues_refund_non_eligible_handling_check"
  CHECK ("refund_non_eligible_handling" IN ('keep_unfulfilled', 'auto_fulfill'))
```

- **Padrão `keep_unfulfilled` (revisão 2).** Fato oficial (pesquisa, Verification round 2 §2): um resgate só pode ser atualizado enquanto está UNFULFILLED, então um FULFILLED nunca mais pode ser devolvido pela API. Com a regra padrão `everyone` nenhum resgate é não elegível, então nenhum dos dois valores muda o comportamento atual; escolho `keep_unfulfilled` por ser a única opção reversível (o streamer ainda pode devolver ou atender depois), enquanto `auto_fulfill` é irreversível e precisa ser escolha explícita. Sem acoplamento por CHECK a `refund_eligibility` (inerte em `everyone`, mesmo raciocínio das flags de público).

- **Sem coluna de tier mínimo.** O tier mínimo está fora do MVP (recomendação do PO, pendente do `@architect`). O tier continua gravado em toda decisão (seção 2), então um futuro `refund_min_subscriber_tier TEXT NULL CHECK (IN ('1000','2000','3000'))` não exige backfill.
- **Flags de público não são acopladas à regra por CHECK.** [AUTO-DECISION] As flags devem voltar ao padrão quando a regra não for `subscribers`? → Não (motivo: alternar `subscribers` → `everyone` → `subscribers` deve preservar as escolhas do streamer; fora de `subscribers` as flags são inertes e o domínio as ignora; um CHECK forçaria escritas destrutivas).
- **Sem acoplamento a `queue_mode` por CHECK.** [AUTO-DECISION] `manual_only` deve forçar `everyone`? → Não (motivo: filas `manual_only` convertidas de `channel_points` mantêm `reward_id` e resgates históricos que ainda podem ser devolvidos na limpeza/exclusão, conforme `queues_mode_reward_origin_consistency_check`; o painel oculta a opção, mas a regra gravada continua valendo para esses resgates). Isso é coerente com os checks existentes, que só restringem `reward_origin`/`reward_id`/`cost`.
- Os padrões reproduzem exatamente a elegibilidade atual: `everyone` significa "elegível sempre que um gatilho pedir", que é o comportamento de hoje. Os Booleans por gatilho continuam iguais e seguem decidindo **quando** (AC 4).

## 2. Decisão de elegibilidade por resgate (tabela nova)

### 2.1 Tabela `refund_eligibility_decisions` (Prisma `RefundEligibilityDecision`)

Uma linha por resgate que chegou a um ponto de decisão de devolução. É o registro durável gravado **antes** de qualquer linha financeira do outbox (AC 5) e que guarda o estado pendente quando o status é desconhecido (AC 7).

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| `redemption_id` | `TEXT` PK, FK → `redemptions(redemption_id)` `ON DELETE RESTRICT` | não | a PK garante "decidido uma vez por resgate" |
| `queue_id` | `UUID` FK → `queues(id)` `ON DELETE RESTRICT` | não | desnormalizada para listas por fila no painel e contagens da limpeza |
| `entry_id` | `UUID` FK → `entries(id)` `ON DELETE RESTRICT` | sim | entrada que disparou a decisão |
| `trigger` | `TEXT` | não | `removed_waiting` \| `removed_while_called` \| `viewer_left_called` \| `no_show` \| `queue_cleared` \| `queue_deleted` |
| `check_batch_id` | `UUID` | sim | agrupa um lote de limpeza/exclusão; contagens por resultado (AC 11–12) |
| `rule_snapshot` | `JSONB` | não | `{refundEligibility, includeBroadcaster, includeModerators, includeVips, countGiftedSubs, nonEligibleHandling, version}`; CHECK `jsonb_typeof = 'object'` (AC 6) |
| `decision` | `TEXT` | não | `eligible` \| `not_eligible` \| `unknown` (nomes do AC 5) |
| `subscriber_status` | `TEXT` | não | `subscriber` \| `not_subscriber` \| `unknown` \| `not_checked` |
| `subscriber_tier` | `TEXT` | sim | `1000` \| `2000` \| `3000` (gravado por decisão mesmo com tier mínimo fora do MVP) |
| `subscriber_is_gift` | `BOOLEAN` | sim | só a flag de presente; **sem id/login/nome de quem presenteou** |
| `audience_match` | `TEXT` | sim | `broadcaster` \| `moderator` \| `vip` quando a elegibilidade veio de uma flag de público |
| `status_source` | `TEXT` | não | `not_required` (everyone/nobody) \| `broadcaster_self` \| `helix_subscriptions` \| `helix_moderators` \| `helix_vips` |
| `status_checked_at` | `TIMESTAMPTZ(3)` | sim | momento da resposta da Twitch (ou da decisão, se `not_required`) |
| `unknown_reason` | `TEXT` | sim | só código: `scope_missing` \| `unauthorized` \| `forbidden` \| `rate_limited` \| `server_error` \| `timeout` \| `malformed_response` \| `lookup_error` \| `channel_ineligible` \| `check_pending` (D1: estado inicial enfileirado da verificação assíncrona) |
| `check_attempts` | `INTEGER` | não | padrão `0`, `>= 0`; incrementado uma vez por tentativa **executada** (D1), não ao enfileirar |
| `next_check_at` | `TIMESTAMPTZ(3)` | sim | D2: "verificando até" no painel; definido só enquanto `resolution = 'pending_check'`, gravado na mesma transação que (re)agenda a tarefa de verificação |
| `resolution` | `TEXT` | não | `pending_check` (unknown) \| `awaiting_streamer` (não elegível, mantido UNFULFILLED) \| `refund_requested` \| `fulfill_requested` (atendido) — ver 2.4 |
| `resolution_batch_id` | `UUID` | sim | agrupa uma ação manual em lote ("marcar como atendidos"); ver 2.4 |
| `resolved_by` | `TEXT` | sim | `system` \| `streamer` \| `moderator` |
| `resolved_actor_id` | `TEXT` | sim | id do ator do painel (mesma semântica de `audit_logs.actor_id`); nunca vai para log |
| `override_reason` | `TEXT` | sim | texto livre, `char_length BETWEEN 1 AND 280`, sem caracteres de controle; só no banco, nunca em logs ou `safe_detail` |
| `resolved_at` | `TIMESTAMPTZ(3)` | sim | |
| `version` | `INTEGER` | não | padrão `1`, `> 0`, lock otimista como `queues.version` |
| `created_at` / `updated_at` | `TIMESTAMPTZ(3)` | não | |

### 2.2 Restrições CHECK (nomeadas, no estilo de `queues_*_check`)

1. Checks de domínio para `trigger`, `decision`, `subscriber_status`, `status_source`, `unknown_reason`, `resolution`, `resolved_by`, `audience_match`, `subscriber_tier`.
2. `decision_unknown_reason_check`: `(decision = 'unknown') = (unknown_reason IS NOT NULL)` — o código de motivo existe só para unknown (AC 6).
3. `subscriber_detail_check`: `subscriber_status = 'subscriber'` ⇔ `subscriber_tier IS NOT NULL AND subscriber_is_gift IS NOT NULL`; caso contrário, ambos NULL.
4. `known_status_source_check`: `subscriber_status IN ('subscriber','not_subscriber')` ⇒ `status_source = 'helix_subscriptions' AND status_checked_at IS NOT NULL` (AC 5: status conhecido só a partir de resposta válida).
5. `not_required_check`: `status_source = 'not_required'` ⇒ `subscriber_status = 'not_checked' AND decision <> 'unknown'`.
6. `resolution_consistency_check` (revisão 2):
   - `resolution IN ('pending_check','awaiting_streamer')` ⇔ `resolved_by IS NULL AND resolved_at IS NULL`;
   - `resolution = 'pending_check'` ⇒ `decision = 'unknown'`; `resolution = 'awaiting_streamer'` ⇒ `decision = 'not_eligible' AND rule_snapshot->>'nonEligibleHandling' = 'keep_unfulfilled'`;
   - `resolved_by = 'system'` ⇒ `decision <> 'unknown' AND override_reason IS NULL AND resolved_actor_id IS NULL` (unknown nunca é resolvido automaticamente, AC 7/14);
   - `resolved_by IN ('streamer','moderator')` ⇒ `resolved_actor_id IS NOT NULL AND override_reason IS NOT NULL` (AC 8).
7. `system_resolution_matches_decision_check`: `resolved_by = 'system'` ⇒ `(decision = 'eligible' AND resolution = 'refund_requested') OR (decision = 'not_eligible' AND resolution = 'fulfill_requested' AND rule_snapshot->>'nonEligibleHandling' = 'auto_fulfill')`.
8. `override_resolution_check`: `resolved_by IN ('streamer','moderator')` ⇒ `resolution IN ('refund_requested','fulfill_requested')`; `resolution_batch_id IS NOT NULL` ⇒ `resolved_by IN ('streamer','moderator')`.

As colunas `decision` e de snapshot nunca são atualizadas após o insert, exceto `unknown` → resultado da nova consulta (regra da aplicação mais teste; não proponho trigger, para manter o estilo do projeto "restrições, sem triggers" — questão aberta Q5).

### 2.3 Relação com o outbox FND-3 e a regra de uma intenção financeira

- Ordem de escrita numa única transação: transição da entrada → INSERT em `refund_eligibility_decisions` (`ON CONFLICT (redemption_id) DO NOTHING`, depois leitura) → se `resolution = 'refund_requested'`, `createCancellationIntent()` com a chave **inalterada** `financial:{redemption_id}` → evento em `audit_logs`.
- `unknown` **não** cria linha no outbox e deixa `redemptions.expected_status` NULL. O estado pendente vive só na linha de decisão (`resolution = 'pending_check'`, ou `awaiting_streamer` para não elegíveis mantidos), então nunca vira `request_cancel` ou `no_operation` em silêncio (AC 14). [AUTO-DECISION] Novo status de outbox `awaiting_eligibility` x linha de decisão → linha de decisão (motivo: o outbox continua sendo só E/S com a Twitch, com leases; sem mudança em `outbox_status_check`; o worker não consegue pegá-la por engano). O `@architect` confirma (Q1).
- Override manual (AC 8): ver 2.4 para a guarda de UNFULFILLED. A chave única `financial:` garante que não haja devolução duplicada: se já existir intenção (cancel **ou** fulfill), o override é rejeitado como `already_has_financial_intent` e apenas auditado. Reverter `refund_requested` ou `fulfill_requested` depois que a tarefa existe não é possível na camada de dados (Q2).
- O tratamento de não elegíveis (AC 13) agora é configuração por fila (decisão do proprietário, revisão 2); ver 2.4.
- Chamadas agrupadas de Update Redemption Status (≤ 50 ids, uma recompensa) continuam sendo otimização do worker: as linhas seguem uma por resgate, cada uma com seu resultado; nenhuma mudança de schema é necessária. Um 404 segue o tratamento atual do outbox, nunca vira `CANCELED`.
- `audit_logs` guarda o histórico: `refund.eligibility_decided`, `refund.eligibility_rechecked`, `refund.override_applied`, `refund.override_rejected`, com `safe_detail` limitado a códigos (decisão, status, tier, is_gift, fonte, código de motivo). Nenhum texto livre de motivo, UID, dado de quem presenteou ou token em `safe_detail`.

### 2.4 Tratamento de não elegíveis, override de atendimento/devolução e "marcar como atendidos" em lote (revisão 2)

| Situação | `resolution` | Efeito no outbox (uma intenção por resgate, chave `financial:{redemption_id}`) |
|---|---|---|
| elegível | `refund_requested` (system) | `redemption.cancel` → CANCELED |
| não elegível + `auto_fulfill` | `fulfill_requested` (system) | `redemption.fulfill` → FULFILLED; devolução impossível para sempre (oficial) |
| não elegível + `keep_unfulfilled` | `awaiting_streamer` | nenhum; `expected_status` NULL |
| unknown | `pending_check` | nenhum; `expected_status` NULL |
| override "devolver" a partir de `awaiting_streamer`/`pending_check` | `refund_requested` (streamer/moderator) | `redemption.cancel` |
| override "marcar como atendido" a partir de `awaiting_streamer`/`pending_check` | `fulfill_requested` (streamer/moderator) | `redemption.fulfill` |

- **Guarda de UNFULFILLED em todo override.** Uma transação: `SELECT … FROM redemptions WHERE redemption_id = $1 FOR UPDATE`; depois `UPDATE refund_eligibility_decisions … WHERE redemption_id = $1 AND version = $2 AND resolution IN ('pending_check','awaiting_streamer') AND EXISTS (SELECT 1 FROM redemptions r WHERE r.redemption_id = $1 AND r.remote_status = 'UNFULFILLED' AND r.expected_status IS NULL) AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.idempotency_key = 'financial:' || $1)`; 0 linhas → rejeitado (`not_unfulfilled`, `already_has_financial_intent` ou `stale_version`) e auditado; 1 linha → cria a intenção com a mesma chave. CHECK entre tabelas não é possível, então a guarda é uma escrita condicional mais testes. Se a Twitch responder 404 (não UNFULFILLED no remoto), vale o tratamento atual do outbox; nunca é reportado como devolução.
- **"Marcar como atendidos" em lote é idempotente e auditado.** A requisição traz um `resolution_batch_id` (UUID) do cliente. A operação é registrada em `processed_operations` com a chave `refund.mark_served:{resolution_batch_id}`; uma repetição devolve o resultado gravado. Cada linha é atualizada com o mesmo `UPDATE` com guarda (linhas já resolvidas são puladas e contadas, nunca reescritas); um `redemption.fulfill` por resgate via chave `financial:` (o worker pode agrupar ≤ 50 ids de um único `reward_id` por chamada, verificado, sempre gravando o resultado por resgate). Auditoria: um evento `refund.batch_mark_served` (só contagens) mais um `refund.override_applied`/`refund.override_rejected` por resgate.
- **Excluir a recompensa transforma UNFULFILLED em FULFILLED (oficial).** A exclusão da fila precisa continuar bloqueada (bloqueio de exclusão existente, agora contando também as linhas `pending_check`/`awaiting_streamer` da fila) até essas linhas serem resolvidas; senão uma devolução pendente se perde em silêncio.
- O padrão `everyone` nunca produz `awaiting_streamer`, então as filas existentes mantêm a saída atual do outbox.

### 2.5 Ajustes do portão do architect (D1–D3) e OD-1

- **D1:** `unknown_reason = 'check_pending'` é o estado gravado pela transação de decisão (sem chamada à Twitch dentro dela, ver [architecture.md](architecture.md)); `decision_unknown_reason_check` continua verdadeiro. O worker o substitui por um resultado conhecido ou por um código de motivo real. `check_attempts` conta tentativas executadas.
- **D2:** [AUTO-DECISION] coluna x `next_attempt_at` da tarefa de verificação → coluna `next_check_at` (motivo: as listas do painel leem uma tabela pelo índice de pendentes sem join com `outbox`, que não tem índice em `redemption_id`; a divergência é evitada gravando os dois na mesma transação e pelo teste 29). Novo CHECK `next_check_pending_check`: `next_check_at IS NULL OR resolution = 'pending_check'`.
- **D3:** `outbox.operation_type` **não** tem CHECK hoje (migration foundation), então não há nada a registrar no banco; `refund.eligibility_check` (chave `eligibility:{redemption_id}:{round}`, `entity_type = 'redemption'`, `redemption_id` preenchido) é aceito como está. Os contadores financeiros atuais já filtram `operation_type IN ('redemption.cancel','redemption.fulfill')`, então a tarefa de verificação fica fora deles; o `claimNext` do worker financeiro precisa filtrar do mesmo jeito (aplicação, teste 30). O bloqueio de exclusão conta linhas de decisão (`pending_check`/`awaiting_streamer`), não tarefas de verificação. Sem mudança de schema no outbox; sem índice novo no outbox (o índice `(status, next_attempt_at)` existente atende o claim do worker de verificação).
- **Escrita com guarda do worker:** o worker aplica a resposta com `UPDATE … WHERE redemption_id = $1 AND resolution = 'pending_check' AND version = $v`; se um override resolveu a linha antes, 0 linhas mudam e a resposta é descartada (nota do architect).
- **OD-1 (proprietário): opções de público são aditivas.** Assinante é elegível mesmo sendo moderador/VIP; as flags só acrescentam elegibilidade para não assinantes. Consequências: `audience_match` só é preenchido quando a elegibilidade veio de uma flag (`subscriber_status = 'not_subscriber'`); consultas de moderador/VIP só rodam com a flag correspondente ligada e o viewer não assinante; a configuração padrão só precisa de `channel:read:subscriptions`. Sem mudança de schema.

## 3. Índices

| Índice | Finalidade |
|---|---|
| PK `refund_eligibility_decisions(redemption_id)` | insert idempotente, join com `redemptions`/`outbox` |
| `refund_eligibility_decisions_queue_pending_idx` ON `(queue_id, resolution, created_at)` WHERE `resolution IN ('pending_check','awaiting_streamer')` | listas "verificação pendente" e "aguardando decisão" por fila no painel, varredura de nova tentativa, contagem do bloqueio de exclusão |
| `refund_eligibility_decisions_resolution_batch_idx` ON `(resolution_batch_id)` WHERE `resolution_batch_id IS NOT NULL` | consulta do resultado de "marcar como atendidos" em lote |
| `refund_eligibility_decisions_check_batch_idx` ON `(check_batch_id, decision)` WHERE `check_batch_id IS NOT NULL` | contagens por resultado de limpeza/exclusão (elegível / não elegível / pendente) |
| `refund_eligibility_decisions_entry_id_idx` ON `(entry_id)` | busca de FK (checagens RESTRICT) |

O lote da limpeza (≤ 100 `user_id` por Get Broadcaster Subscriptions, ≤ 50 ids por Update Redemption Status, ambos não verificados segundo a pesquisa §5) não precisa de índice novo em `entries`: a limpeza já lê as entradas ativas por `entries_queue_id_status_position_idx`; os `twitch_user_id` distintos são fatiados em memória. `redemptions` é lida pela PK. Sem índice nas colunas de política de `queues` (nunca filtradas).

## 4. Plano de migration (expand → migrate → contract)

| Fase | Migration | Conteúdo | Comportamento |
|---|---|---|---|
| **Expand** | `2026MMDDhhmmss_refund_eligibility_policy` | `ALTER TABLE queues ADD COLUMN …` × 6 com padrões constantes + `queues_refund_eligibility_check` + `queues_refund_non_eligible_handling_check`; `CREATE TABLE refund_eligibility_decisions` + CHECKs + FKs + 4 índices | inalterado: nenhum código as lê ainda |
| **Migrate** | nenhuma (sem etapa de dados) | linhas existentes recebem `everyone`/`false`/`false`/`false`/`true`/`keep_unfulfilled` pelos padrões; sem backfill de resgates históricos (decisões só existem a partir da primeira decisão pós-deploy) | o código passa a ler a regra; `everyone` mantém os resultados de hoje |
| **Contract** | nenhuma prevista | os três Booleans por gatilho permanecem (continuam significando "quando"); `queueRemovalOverridesRefundPolicy` sai do código, não do schema | — |

Lock e duração (PG 18): `ADD COLUMN … NOT NULL DEFAULT <constante>` só altera metadados (sem reescrita), mas exige um `ACCESS EXCLUSIVE` breve em `queues`; o `CHECK` novo valida por varredura numa tabela com poucas linhas (milissegundos). `CREATE TABLE` com FKs toma `SHARE ROW EXCLUSIVE` em `redemptions`, `queues`, `entries` por pouco tempo; a tabela nova está vazia, então os índices são instantâneos (sem necessidade de `CONCURRENTLY`, e as migrations do Prisma rodam em transação de qualquer forma). A migration deve começar com `SET LOCAL lock_timeout = '5s'`, para que uma transação longa do worker a faça falhar rápido em vez de enfileirar todas as escritas da API atrás dela. Risco: **baixo**.

## 5. Snapshot e rollback

- **Antes de aplicar:** `pg_dump --format=custom` do banco-alvo (sem tabelas de backup no banco), mais o registro de `prisma migrate status`. Desenvolvimento e testes usam só bancos descartáveis; volumes ativos nunca são tocados.
- **Rollback (só para frente, já que o Prisma não tem down migrations):** uma migration nova que executa `DROP TABLE refund_eligibility_decisions;` e `ALTER TABLE queues DROP CONSTRAINT queues_refund_eligibility_check, DROP CONSTRAINT queues_refund_non_eligible_handling_check, DROP COLUMN …` × 6, publicada junto com o código anterior. **Perda de dados no rollback:** escolhas do streamer e linhas de auditoria de decisão; decisões `unknown` pendentes perderiam o marcador, então antes do rollback liste as linhas `resolution IN ('pending_check','awaiting_streamer')` e resolva-as manualmente. Linhas de outbox já criadas não são tocadas e mantêm a semântica FND-3. Remover exige aprovação explícita do proprietário naquele momento (não concedida aqui).
- Rollback só de código (manter schema, código antigo) é seguro: o código antigo ignora as colunas e a tabela novas.

## 6. RLS

Não se aplica. O projeto usa PostgreSQL próprio, acessado só pela API via Prisma com um único papel de aplicação; não há Supabase, PostgREST nem acesso ao banco pelo cliente, então não existe identidade de pessoa usuária por linha no banco. A autorização (streamer x moderador nos overrides) é aplicada na API e registrada em `resolved_by`/`resolved_actor_id`. Se algum dia houver acesso direto ao banco por papéis não confiáveis, a RLS precisa ser revista.

## 7. Testes de integração em nível SQL (PostgreSQL 18 descartável, migrations reais do Prisma)

Todos os testes rodam num banco isolado criado para a execução, após `prisma migrate deploy` de todas as migrations; sem SQLite, sem mocks de Prisma; Twitch só por fakes na fronteira do adaptador.

1. **Migration sobre dados existentes:** aplicar as migrations até a anterior, inserir filas em todos os modos (`channel_points`, `manual_only` com `none`, `manual_only` convertida), aplicar a nova e verificar que toda linha tem `everyone`/`false`/`false`/`false`/`true`/`keep_unfulfilled` e as demais colunas intactas.
2. `queues_refund_eligibility_check` rejeita qualquer valor fora dos três; NULL rejeitado nas cinco colunas.
3. Preservação do padrão: com `everyone`, remoção em espera, limpeza, exclusão, removido enquanto chamado (`true`), no-show (`false`/`true`) e saída do viewer produzem exatamente as mesmas linhas de outbox de antes (comparação com os testes atuais).
4. `nobody`: todo gatilho grava `decision = not_eligible`, `status_source = not_required`, sem linha `redemption.cancel`.
5. `subscribers` + assinante fake (tier 1000/2000/3000, presente true/false): `eligible`, tier e presente gravados; linha de outbox criada na mesma transação.
6. `refund_count_gifted_subs = false` + sub presenteada → `not_eligible`, `is_gift = true` gravado.
7. Próprio streamer, moderador e VIP com cada flag ligada/desligada → decisão e `audience_match`/`status_source` esperados.
8. Unknown para cada código (escopo ausente, 401, 403, 429, 5xx, timeout, malformado, canal inelegível): linha de decisão `pending_check`, **nenhuma** linha de outbox, `expected_status` NULL.
9. Matriz de CHECK da seção 2.2 (cada combinação proibida rejeitada pelo PostgreSQL, por exemplo `subscriber` sem tier, `unknown` sem motivo, `system` resolvendo `unknown`, override sem ator/motivo, motivo > 280 caracteres).
10. Idempotência: decisão dupla concorrente para o mesmo resgate (duas transações) gera uma linha e uma linha `financial:` no outbox.
11. Nova consulta de `unknown` → resultado conhecido atualiza a linha uma vez, incrementa `check_attempts` e cria a linha de outbox uma vez.
12. Override manual de devolução em `awaiting_streamer` e em `pending_check`: uma intenção de cancelamento; segundo override e override com intenção cancel/fulfill já existente rejeitados e auditados; `version` desatualizada rejeitada.
13. "Marcar como atendido" manual em `pending_check`: uma linha `redemption.fulfill`; auditado com papel e motivo limitado.
14. Limpeza com > 100 entradas de resgate (por exemplo 230): um `check_batch_id` compartilhado, contagens por decisão batem com as respostas fake, 429 parcial deixa só as linhas afetadas `pending_check`.
15. Exclusão (`queue_deleted`) pelo caminho de fila convertida passa pela regra e mantém o bloqueio da exclusão (`refundsRequested` > 0 → exclusão pendente).
16. `audit_logs.safe_detail` e logs não contêm texto de override, UID, dado de quem presenteou nem token (verificação no JSON gravado e nos logs capturados).
17. FK `RESTRICT`: resgate/fila/entrada com decisão não pode ser removido fisicamente.
18. Migration de rollback numa cópia descartável: o drop funciona e os testes dos caminhos do código anterior continuam passando.
19. `queues_refund_non_eligible_handling_check` rejeita outros valores e NULL; padrão `keep_unfulfilled` nas linhas existentes.
20. `subscribers` + não assinante + `keep_unfulfilled` → `awaiting_streamer`, sem linha de outbox, `expected_status` NULL; com `auto_fulfill` → `fulfill_requested` por `system` e exatamente uma linha `redemption.fulfill` sob `financial:`.
21. Regras CHECK 6–8 (revisão 2): `awaiting_streamer` com snapshot `auto_fulfill` rejeitado; `system` + `fulfill_requested` com snapshot `keep_unfulfilled` rejeitado; override com `resolution_batch_id` mas `resolved_by = 'system'` rejeitado.
22. Guarda de UNFULFILLED: override de devolução rejeitado quando `remote_status` é `FULFILLED`/`CANCELED`, quando `expected_status` está definido ou quando existe linha `financial:`; nenhuma linha alterada, rejeição auditada.
23. Override de devolução x "marcar como atendido" concorrentes no mesmo resgate (duas transações): exatamente um vence, uma intenção financeira.
24. "Marcar como atendidos" em lote sobre 120 linhas (mistura de `awaiting_streamer`, `pending_check` e já resolvidas): um `fulfill` por linha apta, linhas resolvidas puladas e contadas, um evento de auditoria do lote mais eventos por linha; repetir com o mesmo `resolution_batch_id` não altera nada e devolve o resultado gravado.
25. Exclusão de fila com linhas `awaiting_streamer`/`pending_check` fica pendente (bloqueio de exclusão) até elas serem resolvidas.
26. Preservação do padrão com `everyone` + qualquer valor de tratamento: nunca surgem linhas `awaiting_streamer` ou `fulfill_requested`.
27. D1: a transação de decisão grava `pending_check` + `check_pending` + `check_attempts = 0` + uma linha `refund.eligibility_check` (`eligibility:{id}:0`) e nenhuma linha financeira; cada tentativa executada incrementa `check_attempts` uma vez.
28. Corrida worker x override: o override resolve primeiro → o update com guarda do worker muda 0 linhas, sem segunda intenção financeira.
29. D2: `next_check_at` definido junto com o agendamento da tarefa e limpo na resolução; o CHECK rejeita `next_check_at` em linha resolvida.
30. D3: linhas `refund.eligibility_check` ficam fora dos contadores financeiros e do claim do worker financeiro; o bloqueio de exclusão da fila conta as linhas de decisão.
31. OD-1: moderador/VIP assinante é `eligible` com as flags desligadas e `audience_match` NULL; moderador não assinante com flag ligada → `eligible`, `audience_match = 'moderator'`; nenhuma consulta de moderador/VIP com as flags desligadas.
32. Q5: imutabilidade de `decision`/`rule_snapshot` após resultado conhecido (o caminho da aplicação rejeita; o teste confirma valores inalterados).

## 8. Premissas

- A1. Uma recompensa por fila, e um resgate pertence a uma fila (schema atual).
- A2. Os atores do painel são o streamer ou moderadores, e a API sabe distinguir (`resolved_by`). Se hoje o painel tiver uma única identidade de operador, `moderator` fica sem uso até existirem papéis.
- A3. Os limites da Twitch (100 `user_id`, 50 ids) são os da pesquisa e não foram verificados; o schema não depende deles.
- A4. Resgates históricos não recebem linhas de decisão retroativas.

## 9. Riscos

- R1. Filas `manual_only` convertidas continuam devolvendo pela regra enquanto a opção está oculta (mitigação: o painel mostra a regra só para leitura em filas convertidas — UX).
- R2. `auto_fulfill` consome a única chave financeira e torna impossível qualquer devolução posterior (oficial); o painel precisa avisar antes de o streamer ativar (UX). Excluir a recompensa também transforma UNFULFILLED em FULFILLED (oficial), daí o bloqueio de exclusão em 2.4.
- R3. Linhas `pending_check`/`awaiting_streamer` podem se acumular se o streamer nunca agir; exige lista no painel e talvez alerta por idade (índice previsto).
- R4. O rollback perde linhas de auditoria; o snapshot é obrigatório.

## 10. Questões abertas para o `@architect`

- Q1. Confirmar que o marcador pendente fica na tabela de decisão, e não num novo status do outbox.
- Q2. Um override pode reverter um `refund_requested` cuja tarefa de cancelamento ainda está `pending`/`retry` (cancelando antes a tarefa do outbox) ou nunca?
- Q3. **Resolvida (proprietário, revisão 2):** `refund_non_eligible_handling` por fila, padrão `keep_unfulfilled` (ver 1 e 2.4). Fica para o `@architect`: confirmar o padrão e que filas `manual_only` convertidas usam a mesma configuração.
- Q4. **Respondida (architect):** operação de worker `refund.eligibility_check`, chave `eligibility:{redemption_id}:{round}`; ver 2.5.
- Q5. Garantir a imutabilidade de `decision`/snapshot com trigger, ou manter na aplicação mais testes?
- Q6. Confirmar que o tier mínimo continua fora do MVP (sem coluna na fila agora; o tier é gravado por decisão).

Q1–Q6 foram respondidas em [architecture.md](architecture.md) (Q1, Q3 e Q6 confirmadas; Q2 nunca no MVP; Q4 worker; Q5 aplicação mais testes).

**Re-check do data-engineer após o portão do architect (2026-10-21):** GO. D1–D3 e OD-1 aplicados (uma coluna nova `next_check_at`, um CHECK novo, código de motivo `check_pending`, testes 27–32). Nada na nota do architect é inviável no PostgreSQL; o D3 não exige mudança no banco porque `outbox.operation_type` não tem CHECK. Nenhuma migration criada.
