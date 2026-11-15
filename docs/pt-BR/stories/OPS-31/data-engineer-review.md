# OPS-31 — Revisão de banco de dados (`@data-engineer`): respostas, modelo, concorrência

[English](../../../stories/OPS-31/data-engineer-review.md)

**Autor:** `@data-engineer` (Dara) — **Data:** 2026-11-11 — **Modo:** YOLO (dono ausente; decisões marcadas `[AUTO-DECISION]`).
**Entrada:** [architect-design.md](architect-design.md) (D-31-1..D-31-11, perguntas da seção 10) — **Story:** [story.md](story.md).
**Classe de evidência:** leitura estática de `apps/api/prisma/schema.prisma`, dos nomes das migrations e da última migration, e de `apps/api/src/persistence/queue-repository.mjs` (helpers de trava, `claimNext`, `applyEntryTransition`, `moveWaitingEntry`, uso da chave financeira). O Compose usa `postgres:18.6-bookworm`. **Nada foi executado**: nenhum DDL aplicado, nenhuma migration escrita, sem Docker, sem consulta. Todo SQL abaixo é **referência, NÃO APLICADO**.

## 0. Achados que mudam o esboço do `@architect`

| # | Achado | Efeito |
|---|---|---|
| F1 | Os interruptores de aviso e o novo status `expired` do outbox são necessários à FT-71 (primeira fatia), mas o architect põe todas as colunas na migration da FT-74. | **Duas migrations**: M1 com a FT-71 (interruptores de aviso, status `expired`), M2 com a FT-74 (liquidação, grupos, lista própria, colunas do resgate, índices, guardas). |
| F2 | A chave do aviso agregado `chat.notice:{kind}:{queueId}` é `UNIQUE` para sempre (`outbox.idempotency_key`): enviado o primeiro aviso, uma rajada posterior do mesmo tipo na mesma fila nunca insere. | A chave precisa de janela de fusão: `chat.notice:{kind}:{queueId}:{windowStart}` (início = `floor(now / 15 s)`, valor de configuração). Dois resumos na virada da janela são aceitos; o `@dev` confirma contra o AC 4. |
| F3 | A chave financeira é sempre `financial:{redemptionId}` em todos os escritores encontrados (linhas 387, 843, 1882, 1902, 2372, 2560 do repositório). | O índice único parcial por `redemption_id` é seguro nas linhas existentes (duplicata é impossível) e protege se um escritor futuro montar outra chave. |
| F4 | O caminho do worker financeiro `lockProcessingFinancialTask` trava a **linha do outbox primeiro, sem a trava da fila**; `lockProcessingRewardTask` trava fila e depois outbox. É a inversão aceita da TS-20. | O caminho de liquidação não pode criar uma terceira aresta: ver seção 4.3. |
| F5 | Avisos com padrão "ligado" fariam toda fila existente começar a enviar mensagens novas no chat após o upgrade. | O padrão no banco é `false` para linhas existentes; o caminho de criação de fila grava `true` explicitamente. Filas existentes continuam exatamente como hoje. |
| F6 | `expected_status` em `redemptions` já é gravado na mesma transação da linha financeira. | É a testemunha, em uma só tabela, de que "a intenção existe": a restrição 3 do D-31-7 vira um `CHECK` só em `redemptions` (P2). |

## 1. Respostas às sete perguntas

**P1. Quatro booleanos ou array de texto?** `[AUTO-DECISION]` **Quatro booleanos** em `queues` (`refund_group_subscriber`, `_moderator`, `_vip`, `_own_list`), padrão `false`. Motivo: o conjunto é fixo e pequeno; nenhuma consulta usa operador de array; o snapshot são quatro colunas; mesmo estilo dos três interruptores de devolução existentes; um grupo novo é `ADD COLUMN` mais mudança de código de qualquer forma (escopo e consulta novos). O grupo transmissor é implícito (sempre membro quando um grupo está ligado; sem coluna). A API expõe o conjunto como lista.

**P2. `settlement_state` armazenado ou derivado? Como garantir a restrição 3?** **Armazenado**, com `CHECK` em uma só tabela usando `expected_status` como testemunha da intenção (F6):
- `settlement_state IN ('held_for_service','awaiting_choice','check_group')` exige `expected_status IS NULL` e `remote_status = 'UNFULFILLED'`;
- `settlement_state = 'intent_recorded'` exige `expected_status IS NOT NULL`;
- `none` não tem restrição (todas as linhas legadas).

Por que não uma view: a lista pendente, o bloqueio de exclusão e a contagem do cartão leem o estado por fila; um valor derivado exige junção com `outbox` em toda leitura e não pode ser indexado. Por que não um trigger de restrição adiado entre `redemptions` e `outbox`: cria regra oculta entre tabelas que o Prisma não modela e que os testes unitários não veem. A lacuna residual (`expected_status` preenchido sem linha de outbox) é a mesma que já existe hoje; o teste em PostgreSQL isolado da seção 6 prova que os dois são gravados juntos. **Dois triggers de guarda pequenos** em `redemptions` são recomendados (uma função), porque protegem duas invariantes irreversíveis contra qualquer caminho futuro: (a) `settlement_state = 'intent_recorded'` é absorvente; (b) um `group_decision` conclusivo (`eligible`, `not_eligible`) nunca muda. A aplicação continua usando `UPDATE ... WHERE` guardado (compare-and-set) como mecanismo principal; o trigger é a rede.

**P3. Índice único parcial por `redemption_id`: seguro com as linhas existentes?** **Sim** (F3). `CREATE UNIQUE INDEX outbox_financial_redemption_uidx ON outbox (redemption_id) WHERE operation_type IN ('redemption.cancel','redemption.fulfill')`. Todo escritor monta `financial:{id}`, cujo `UNIQUE` já proíbe duas linhas por resgate; portanto não existe duplicata. O `@dev` roda uma sonda de duplicatas antes do índice (`SELECT redemption_id FROM outbox WHERE operation_type IN (...) GROUP BY 1 HAVING count(*) > 1`) dentro da migration, como guarda que falha em voz alta. Linhas de outros tipos com `redemption_id` ficam fora pelo predicado. A construção na tabela atual é praticamente instantânea; `CREATE INDEX` simples dentro da migration do Prisma é aceitável (o outbox é pequeno; confirmar a contagem no dry-run, e usar a forma sem `CONCURRENTLY` porque o Prisma roda migrations em transação).

**P4. `no_show→waiting` e `called→waiting` podem reutilizar a renumeração de posição sem índice novo?** **Sim.** `moveWaitingEntry` já lê todas as linhas em espera ordenadas por `(priority_class, position, created_at, id)` sob a trava da fila e reescreve cada `position`, sem índice único em `position`; o mesmo auxiliar pode inserir a entrada que volta logo após a primeira em espera. Sem índice novo. Dois pontos para o `@dev`: (a) a transição deve limpar `called_at`, `call_notified_at`, `call_deadline_at`, `call_acknowledged_at`; (b) em `no_show→waiting`, o índice único parcial `entries_active_user_per_queue` (`queue_id, twitch_user_id` onde status em waiting/called/in_progress) **já recusa** a restauração quando a pessoa tem outra entrada ativa (`P2002`); logo o critério "a pessoa não tem outra entrada ativa" é garantido pelo banco; mapear `P2002` para um código estável. A regra "sem intenção terminal" lê `redemptions.settlement_state <> 'intent_recorded'` e `expected_status IS NULL` na mesma transação.

**P5. Lista própria única por id de usuário ou por canal mais usuário?** `[AUTO-DECISION]` **Só o id de usuário.** Uma instalação tem um transmissor (architect D-31-7); uma coluna `broadcaster_id` seria dado `NOT NULL` que pode não existir antes da autorização. Multicanal futuro é `ADD COLUMN broadcaster_id` mais troca do índice único em uma migration, com backfill trivial de `oauth_credentials.broadcaster_id`. Reabrir só com um segundo canal real.

**P6. Retenção quando a OPS-32 expurga ids de usuário no dia 7.**
- As novas colunas de decisão **não** guardam id de usuário (`matched_group` diz `own_list`, nunca quem). Nada nelas precisa ser expurgado.
- Os ids estão em `entries.twitch_user_id/user_login/display_name/uid`, `redemptions.user_id` (`NOT NULL`) e na lista própria. A auditoria carrega só ids internos e códigos.
- **Regra para a OPS-32:** expurgar os ids de um resgate **somente** quando `settlement_state IN ('none','intent_recorded')` e a tarefa financeira (se houver) estiver terminal. Um resgate em `check_group` precisa de `user_id` para a nova consulta; `awaiting_choice` precisa dele para o aviso do resultado. Como `redemptions.user_id` é `NOT NULL`, expurgar significa pseudonimizar (sobrescrever com valor fixo), decidido na OPS-32.
- A política "manter" do dia 7 da OPS-32 portanto mantém os ids dos itens mantidos; a OPS-32 deve mostrar isso ao streamer ou limitar. Não bloqueia a OPS-31.
- A lista própria **não** é expurgada por arquivar ou excluir fila; só a pessoa transmissora a remove (remover, limpar tudo) ou com os dados do canal.
- Avisos: linhas `chat.notice` em `confirmed`/`expired` com mais de 7 dias são apagadas pela limpeza existente do outbox (a acrescentar pelo `@dev`; sem id de usuário, o payload tem códigos, contagens e ids internos da entrada).

**P7. Reversão com filas já em `refund_on_end`.** As migrations são aditivas (colunas novas com padrão constante, uma tabela nova, índices, triggers); o código antigo as ignora, então uma reversão da **aplicação** nunca exige reversão do banco. A reversão do **banco** só é permitida enquanto o recurso não foi usado:
1. `M2-down` começa com uma guarda que levanta exceção se alguma fila tiver `settlement = 'refund_on_end'`, ou algum resgate tiver `settlement_state <> 'none'`, ou a lista própria não estiver vazia. Sob a guarda, remove triggers, índices, restrições, colunas e a tabela em ordem inversa.
2. Depois do primeiro uso, só se avança (**roll-forward**): resgates retidos estão `UNFULFILLED` na Twitch e invisíveis ao código antigo; a saída é resolvê-los com as escolhas do painel (devolver ou cumprir), depois voltar as filas a `fulfill_on_start`, e então a guarda passa.
3. A API recusa `refund_on_end` até a FT-76 existir (architect seção 6), então nenhuma fila de produção chega a esse estado antes da fatia do dinheiro.
4. Antes da M2 em qualquer ambiente real: `pg_dump` (nunca tabela de backup no banco). `M1-down` é a remoção simples de quatro colunas e a restauração do check antigo de status do outbox.

## 2. Modelo proposto (DDL de referência, NÃO APLICADO)

### 2.1 Migration M1 — com a FT-71 (avisos)

```sql
-- REFERÊNCIA, NÃO APLICADO
ALTER TABLE "queues"
  ADD COLUMN "notice_joined"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_refusal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_state"   BOOLEAN NOT NULL DEFAULT false,   -- pausa/fecho/reabertura/reordenação/limpeza (agregados)
  ADD COLUMN "notice_outcome" BOOLEAN NOT NULL DEFAULT false;   -- fim do atendimento, ausência, pular, restaurar, pontos

ALTER TABLE "outbox" DROP CONSTRAINT "outbox_status_check";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status_check" CHECK ("status" IN
  ('pending','processing','retry','confirmed','conflict','unknown','failed','cancelled','resolved_manual','cancel_verification','expired'))
  NOT VALID;
ALTER TABLE "outbox" VALIDATE CONSTRAINT "outbox_status_check";
```

Os quatro grupos de interruptores são proposta; o `@ux-design-expert` fixa o agrupamento e as colunas o seguem. `chat.notice` não precisa de coluna nova: `expires_at` viaja no payload e o worker o confere ao reivindicar (a reivindicação já filtra por `status` e `next_attempt_at` via `outbox_status_next_attempt_at_idx`). `expired` não é status financeiro: o `claimNext` do worker financeiro seleciona só os dois tipos financeiros, então nunca o vê.

### 2.2 Migration M2 — com a FT-74 (liquidação)

```sql
-- REFERÊNCIA, NÃO APLICADO
-- queues
ALTER TABLE "queues"
  ADD COLUMN "settlement" TEXT NOT NULL DEFAULT 'fulfill_on_start',
  ADD COLUMN "refund_group_subscriber" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_moderator"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_vip"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_own_list"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_check"
  CHECK ("settlement" IN ('fulfill_on_start','refund_on_end'));

-- redemptions (a tabela que cresce: restrições NOT VALID, depois VALIDATE)
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_state" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "group_decision" TEXT,
  ADD COLUMN "matched_group" TEXT,
  ADD COLUMN "settlement_mode" TEXT,
  ADD COLUMN "group_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN "group_unknown_reason" TEXT;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_values_check" CHECK (
  "settlement_state" IN ('none','held_for_service','awaiting_choice','check_group','intent_recorded')
  AND ("group_decision" IS NULL OR "group_decision" IN ('eligible','not_eligible','unknown'))
  AND ("matched_group" IS NULL OR "matched_group" IN ('broadcaster','own_list','moderator','vip','subscriber'))
  AND ("settlement_mode" IS NULL OR "settlement_mode" IN ('fulfill_on_start','refund_on_end'))
  AND ("group_unknown_reason" IS NULL OR "group_unknown_reason" IN
    ('scope_missing','unauthorized','forbidden','rate_limited','twitch_unavailable','timeout','malformed_response','channel_not_eligible','lookup_error'))
) NOT VALID;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_decision_shape_check" CHECK (
  ("group_decision" IS NULL AND "matched_group" IS NULL AND "group_unknown_reason" IS NULL
     AND "group_checked_at" IS NULL AND "settlement_mode" IS NULL)
  OR ("group_decision" IS NOT NULL AND "group_checked_at" IS NOT NULL AND "settlement_mode" IS NOT NULL
     AND ("matched_group" IS NOT NULL) = ("group_decision" = 'eligible')
     AND ("group_unknown_reason" IS NOT NULL) = ("group_decision" = 'unknown'))
) NOT VALID;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_state_check" CHECK (
  ("settlement_state" NOT IN ('held_for_service','awaiting_choice') OR "group_decision" = 'eligible')
  AND ("settlement_state" <> 'check_group' OR "group_decision" = 'unknown')
  AND ("settlement_state" NOT IN ('held_for_service','awaiting_choice','check_group')
        OR ("expected_status" IS NULL AND "remote_status" = 'UNFULFILLED'))
  AND ("settlement_state" <> 'intent_recorded' OR "expected_status" IS NOT NULL)
) NOT VALID;
-- depois: VALIDATE CONSTRAINT nas três (trava SHARE UPDATE EXCLUSIVE, não bloqueia escrita)

-- uma tarefa financeira por resgate (P3)
CREATE UNIQUE INDEX "outbox_financial_redemption_uidx" ON "outbox"("redemption_id")
  WHERE "operation_type" IN ('redemption.cancel','redemption.fulfill');

-- lista pendente, bloqueio de exclusão, contagem do cartão (seção 3)
CREATE INDEX "redemptions_pending_settlement_idx" ON "redemptions"("queue_id","redeemed_at","redemption_id")
  WHERE "settlement_state" IN ('held_for_service','awaiting_choice','check_group');

-- lista própria, uma por canal (P5)
CREATE TABLE "refund_list_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "twitch_user_id" TEXT NOT NULL UNIQUE CHECK ("twitch_user_id" ~ '^[0-9]{1,20}$'),
  "label" TEXT CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 60),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" TEXT
);

-- triggers de guarda (P2): intenção absorvente, decisão conclusiva imutável
CREATE FUNCTION redemptions_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settlement_state = 'intent_recorded' AND NEW.settlement_state <> 'intent_recorded' THEN
    RAISE EXCEPTION 'settlement_state intent_recorded is absorbing' USING ERRCODE = '23514';
  END IF;
  IF OLD.group_decision IN ('eligible','not_eligible') AND NEW.group_decision IS DISTINCT FROM OLD.group_decision THEN
    RAISE EXCEPTION 'conclusive group_decision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER redemptions_settlement_guard BEFORE UPDATE OF settlement_state, group_decision ON "redemptions"
  FOR EACH ROW EXECUTE FUNCTION redemptions_settlement_guard();
```

Notas:
- **Compatibilidade.** No PostgreSQL 18 (imagem do Compose), `ADD COLUMN` com padrão constante é só metadado: sem reescrita da tabela. `CHECK` inline em `ADD COLUMN` é evitado em `redemptions`; as restrições são `NOT VALID` e depois `VALIDATE`, para a varredura não bloquear escritas. As linhas existentes já satisfazem todas as restrições (estado `none`, colunas novas `NULL`), então a validação não pode falhar. `queues` é minúscula e recebe restrições inline.
- **Sem backfill.** Resgates existentes ficam `none` com decisão `NULL`; é exatamente o comportamento de hoje. Resgates cuja entrada fechou com o interruptor desligado e que ficaram `UNFULFILLED` (resíduo R2) **não** são tocados; a OPS-31 não muda entradas normais.
- **Padrões seguros:** `fulfill_on_start`, todos os grupos desligados, estado `none`, avisos desligados nas filas antigas (F5).
- **Prisma.** Acrescentar colunas e a tabela ao `schema.prisma`; índices parciais, triggers e restrições ficam no SQL da migration (o arquivo já documenta que o Prisma 6.19 não expressa índices parciais). `prisma migrate diff` não deve mostrar deriva depois do SQL manual; o `@dev` confirma.
- **Chaves estrangeiras.** Nenhuma nova: a lista própria é independente; `redemptions` mantém a FK `queue_id` (`Restrict`).
- **Auditoria.** Sem mudança de schema. Eventos novos são strings; `safe_detail` leva só códigos e contagens. Eventos `refund_list.*` levam contagem, nunca id de usuário ou rótulo. `actor_id` mantém o tipo de hoje.

### 2.3 Ids numéricos da Twitch e mascaramento

Ids são `TEXT` com `CHECK` numérico na tabela nova; as tabelas existentes não são alteradas (varredura sem ganho). Logs e auditoria nunca levam `twitch_user_id`, login, nome de exibição ou rótulo; o rótulo só é devolvido pelo endpoint autenticado do painel. O código de consulta de grupo passa ids à Helix e os descarta; o lote devolve contagens. Um teste de captura de logs na seção 6 verifica isso.

## 3. Consultas reais e os índices que as atendem

| # | Consulta | Frequência | Atendida por | Índice novo? |
|---|---|---|---|---|
| Q-a | Decisões pendentes de uma fila (`settlement_state IN (3 estados) AND queue_id = ?` por `redeemed_at`) | A cada atualização do painel da fila | `redemptions_pending_settlement_idx` (parcial) | Sim |
| Q-b | Bloqueio de exclusão: `EXISTS` pendente na fila | Cada passo/espera da exclusão | o mesmo | Não (compartilhado) |
| Q-c | Contagem de pendentes no cartão da fila | Lista do painel | o mesmo | Não (compartilhado) |
| Q-d | Pertinência à lista própria por id | Cada consulta (no máximo uma por decisão; lote: `= ANY(ids)`) | `UNIQUE (twitch_user_id)` | Sim (o único) |
| Q-e | Tarefa financeira por resgate | Cada transição | `outbox_financial_redemption_uidx` e o único da chave | Sim (garantia, não velocidade) |
| Q-f | Preparar lote: entradas de resgate ativas da fila sem decisão gravada | Limpar/excluir | `entries(queue_id, status, priority_class, position)` existente; junção a `redemptions` pela chave primária | Não |
| Q-g | Renumeração das em espera para pular/restaurar | Por ação | índice de entradas existente | Não |
| Q-h | Reivindicação e expiração de avisos | Worker de chat | `outbox(status, next_attempt_at)` existente | Não |
| Q-i | Retenção: expurgo por fila arquivada (OPS-32) | Diária | nenhum antes de medir | Não |

O índice de pendentes é parcial: o conjunto pendente é pequeno (pessoas esperando o streamer) enquanto `redemptions` cresce sem limite, então um índice completo carregaria quase só linhas mortas. Sem índice em `group_decision` ou `matched_group`: nenhuma consulta filtra por eles. Nenhum outro índice é proposto antes de uma medição.

## 4. Concorrência

### 4.1 Nível de isolamento

`[AUTO-DECISION]` **Manter READ COMMITTED** (padrão do Prisma; nada no repositório define outro nível). A correção vem de três coisas, não do nível de isolamento:
1. a trava consultiva por fila (`lockQueue`), tomada primeiro em toda transação deste recurso;
2. **reler depois da trava** e escrever de forma guardada (compare-and-set): `UPDATE redemptions SET ... WHERE redemption_id = $1 AND settlement_state = $esperado` com conferência da contagem de linhas afetadas;
3. as restrições: chave financeira única, índice único financeiro por resgate, `CHECK`s de estado, trigger de guarda.

`SERIALIZABLE` é rejeitado: acrescentaria retentativas `40001` a todo caminho, não protegeria nada que a trava já não proteja, e a trava já serializa por fila. `REPEATABLE READ` é rejeitado por motivo pior: o snapshot tirado antes da espera da trava estaria velho depois dela.

### 4.2 Trava consultiva vs `FOR UPDATE SKIP LOCKED`

- **Trava consultiva por fila** é a ferramenta para a seção crítica "decidir e gravar a única intenção terminal": bloqueia e espera, então a segunda requisição vê o resultado da primeira e segue o ramo "já feito / contraditório". Cobre também linhas que ainda não existem (a linha financeira é inserida dentro da seção).
- **`SKIP LOCKED` está errado aqui**: pular descartaria em silêncio uma ação da pessoa transmissora ou um item do lote. Ele fica onde pertence, no `claimNext` (reivindicação de trabalho, onde pular é o objetivo).
- **Acrescentar `SELECT ... FROM redemptions WHERE redemption_id = $1 FOR UPDATE`** depois da trava da fila quando um caminho decide por um resgate: defesa barata contra um caminho que esqueça a trava da fila (a reconciliação a toma, mas um caminho futuro pode não tomar). A trava de linha é a segunda camada; os índices únicos são a terceira.

### 4.3 Ordem das travas e deadlocks

Ordem obrigatória de toda transação da OPS-31: **trava consultiva da fila → linha(s) de `redemptions` → inserção da nova linha de `outbox`**, nunca `FOR UPDATE` em linha **existente** do outbox financeiro (ela é apenas lida, sem trava, para detectar a intenção gravada; o código da linha 2304 já a lê assim). Motivos:
- Coincide com `lockProcessingRewardTask` (fila, depois outbox) e `requestQueueDeletion`.
- O caminho do worker financeiro (`lockProcessingFinancialTask`, linha do outbox primeiro, sem trava da fila) e `retryOutboxManually` são a inversão conhecida da TS-20. O código de liquidação só faz `INSERT` no `outbox`, que só espera uma inserção concorrente da **mesma** chave, e essa inserção concorrente está atrás da trava da fila. Logo a liquidação não acrescenta aresta ao ciclo da TS-20.
- Lotes ordenam suas travas de linha por `redemption_id` (`... WHERE redemption_id = ANY($ids) ORDER BY redemption_id FOR UPDATE`), para que dois caminhos sobre conjuntos que se sobrepõem travem na mesma ordem. Dois lotes na mesma fila já são serializados pela trava consultiva; a ordenação protege contra um caminho futuro que trave linhas sem a trava da fila.
- `SET LOCAL lock_timeout = '5s'` nas transações de liquidação: espera nunca vira travamento; `55P03` e `40P01` viram erro genérico repetível com `referenceId`. A sonda da TS-20 é estendida (seção 6) para incluir uma transação de liquidação.
- A consulta à Twitch roda **fora** de toda transação (architect D-31-2); nenhuma trava é mantida durante E/S de rede.

### 4.4 Corrida cumprir x cancelar (e suas irmãs)

Cada transação do par faz: trava a fila; trava a linha do resgate; relê a entrada (`version`) e `settlement_state`; se `intent_recorded` (ou `expected_status` preenchido), segue o ramo "já feito / contraditório" (auditoria `settlement.contradictory_request`, sem escrita); senão `UPDATE ... SET settlement_state='intent_recorded', expected_status=...` guardado mais `INSERT INTO outbox ... ON CONFLICT ("idempotency_key") DO NOTHING RETURNING id`. Se a inserção não devolve linha, a transação trata como "já feito" e não toca o estado. Resultado para qualquer par: exatamente uma linha financeira, a perdedora recebe resposta estável, nunca um 500.

Idempotência: a chave de operação do painel (`ProcessedOperation`) repete a resposta gravada; a chave financeira é idempotente por `ON CONFLICT DO NOTHING`; a gravação da decisão é `UPDATE ... WHERE group_decision IS NULL OR (group_decision = 'unknown' AND settlement_state = 'check_group')` guardado.

### 4.5 Lote (AC 26)

- **Passo 1 (preparar):** consultas em blocos de 100 fora de qualquer transação; depois uma transação curta **por bloco** (trava da fila, releitura, gravações de decisão guardadas, em conjunto com `UNNEST`), de modo que uma Twitch lenta nunca segure a trava e um bloco que falha não perde os outros. As decisões gravadas são imutáveis e continuam válidas mesmo que a pessoa abandone o passo 2.
- **Passo 2 (confirmar):** **uma transação**: trava da fila; compara o snapshot de confirmação (mecanismo existente); `UPDATE redemptions ... FROM unnest(...)` em conjunto para os membros conforme a ação escolhida; `INSERT INTO outbox ... ON CONFLICT DO NOTHING RETURNING redemption_id` em conjunto (a contagem devolvida é o número de tarefas pedidas; conflitos contam como "já decidido"); fecha as entradas; linhas de auditoria por resultado com contagens. Itens `check_group` ficam fora pelo `WHERE` do update (o lote nunca os decide). `statement_timeout` e `lock_timeout` limitam o passo; se uma fila puder passar de alguns milhares de resgates ativos, o `@dev` mede uma transação antes de dividir (não se presume).
- **Corrida lote x ação individual:** serializada pela trava da fila; a perdedora relê, vê o novo estado ou um snapshot velho, e recusa com o código existente de snapshot velho.
- **Corrida lote x worker:** o worker nunca toma a trava da fila nos caminhos de confirmar/repetir e só toca linhas existentes do outbox; a liquidação só insere linhas novas. Sem aresta de trava compartilhada.

## 5. Compatibilidade

**OPS-22 (outbox e recuperação financeira) — sem mudança.**
- `redemption.cancel`/`redemption.fulfill`, chave `financial:{redemptionId}`, `claimNext`, arrendamentos, `unknown`/`conflict`/`failed`, resolução manual, `cancel_verification`: intocados. Um resgate retido não tem linha de outbox, então o worker não pode reivindicá-lo por construção.
- A única edição em objeto compartilhado é o `CHECK` de status do outbox (a M1 acrescenta `expired`, só para `chat.notice`). `claimNext` filtra pelos dois tipos financeiros; a lista de status da OPS-22 no painel não muda.
- A reconciliação que observa um status terminal remoto num resgate retido deve gravar `expected_status` e `settlement_state = 'intent_recorded'` juntos (o `CHECK` falha em voz alta caso contrário). O `@dev` confirma a escrita da reconciliação na linha 2630.
- Um resgate sai de `check_group` exatamente quando a linha financeira é criada (o `CHECK` sobre `expected_status` torna os dois mutuamente exclusivos).

**OPS-32 ("Filas antigas", 7 dias).**
- Arquivar é um sinalizador na fila; a lista pendente lê por `redemptions.queue_id` pelo índice parcial, então decisões pendentes continuam visíveis e acionáveis numa fila arquivada. A exclusão continua bloqueada enquanto existir qualquer um dos três estados (D-31-6 regra 4).
- A política padrão do dia 7 (devolver, manter, cumprir) é um **chamador** da mesma transição com ator e origem de sistema; mesmos updates guardados, mesmo `ON CONFLICT DO NOTHING`, portanto idempotente e segura se a pessoa agir no mesmo instante (trava da fila).
- O expurgo de ids segue a regra da P6. Sem conflito com o modelo; a política "manter" retém ids por desenho.
- Reiniciar uma fila em outra nova copia a configuração (incluindo os quatro sinalizadores de grupo e `settlement`) e nunca as colunas do resgate; a lista própria é por canal, logo não é copiada.

## 6. Plano de testes de integração (PostgreSQL isolado, migrations reais, instância descartável)

**Técnica de barreira (determinística, sem `sleep`):** duas conexões independentes; cada uma roda a função real do repositório até um ponto de teste (seam) colocado depois da trava da fila e antes da gravação da intenção; o teste libera as duas com uma promessa compartilhada e, antes de liberar, consulta `pg_locks`/`pg_stat_activity` (`wait_event_type = 'Lock'`, `wait_event = 'advisory'`) até observar um backend esperando a trava consultiva. Isso prova a serialização em vez de supô-la.

| Arquivo novo | Casos |
|---|---|
| `tests/integration/settlement-migration-postgres.test.js` | M1 e M2 aplicam em banco com filas/resgates/outbox existentes; linhas antigas mantêm `fulfill_on_start`, `none`, `NULL`; avisos desligados por padrão; cada `CHECK` recusa sua linha inválida (forma da decisão, estado x decisão, estado x `expected_status`, `remote_status`, formato do id da lista, tamanho do rótulo); o trigger recusa sair de `intent_recorded` e mudar decisão conclusiva; `VALIDATE` passa; a guarda do `M2-down` recusa quando o recurso foi usado e passa quando não; `prisma migrate diff` sem deriva |
| `tests/integration/settlement-race-postgres.test.js` | Pares com barreira: concluir x remover(sem devolver); duas escolhas opostas; iniciar x remover; dois "tentar agora"; limpar x concluir; duas escolhas idênticas (idempotente, uma tarefa); ausência por timer x escolha no painel. Cada um: exatamente uma linha financeira, `expected_status` igual ao do vencedor, a perdedora recebe o código estável, um único `settlement.contradictory_request` só quando as escolhas diferem, nenhum `40P01`/`40001` |
| mesmo arquivo | **Trava contornada** (transações SQL cruas, sem trava consultiva): segunda inserção com a mesma chave recusada pelo único da chave; segunda inserção com chave **diferente** (`financial:R:x`) recusada por `outbox_financial_redemption_uidx`; prova que o índice acrescenta o que a chave não cobre |
| `tests/integration/settlement-batch-postgres.test.js` | AC 26: contagens por resultado; `check_group` nunca decidido pelo lote; snapshot velho recusado; lote x ação individual; lote x lote na mesma fila; `ON CONFLICT` contado como "já decidido"; número de comandos independente de N (afirmar a contagem para 10 e 500 itens) |
| `tests/integration/settlement-deadlock-postgres.test.js` | Sonda da TS-20 estendida: `retryOutboxManually` x `requestQueueDeletion` x uma transação de liquidação em todas as ordens: cada uma termina em commit ou `40P01`/`55P03` mapeado a erro genérico, nunca travamento (limitado por `lock_timeout`) |
| `tests/integration/settlement-ops22-compat-postgres.test.js` | Resgate retido nunca é reivindicado por `claimNext`; confirmação concorrente do worker em outra tarefa durante a liquidação; reconciliação observando terminal remoto numa linha retida grava `expected_status` e `intent_recorded` juntos; `check_group` e `unknown` financeiro são mutuamente exclusivos |
| `tests/integration/settlement-deletion-postgres.test.js` | Exclusão fica em `deleting` enquanto houver qualquer um dos três estados; fila arquivada ainda lista pendentes; reinício copia configuração mas não as colunas do resgate |
| `tests/integration/settlement-skip-restore-postgres.test.js` | `called→waiting` e `no_show→waiting`: posição após a primeira em espera, carimbos de chamada limpos, `P2002` mapeado quando há outra entrada ativa, recusado com `intent_recorded` |
| `tests/integration/chat-notice-outbox-postgres.test.js` | Chave com janela de fusão (F2): rajada na mesma janela grava uma linha; a janela seguinte insere nova; `expired` aceito pelo `CHECK` de status; worker financeiro ignora `chat.notice` |
| asserção de captura de logs nos arquivos acima | Logs capturados e `audit_logs.safe_detail` não contêm id de usuário, login, nome de exibição nem rótulo |

As classes permanecem separadas (regra do projeto): estes são testes de integração em PostgreSQL; os testes unitários das regras e os fakes do Twurple são outras classes do `@qa` (architect seção 7).

## 7. Riscos e o que o `@dev` deve confirmar

| # | Risco | Mitigação | Responsável |
|---|---|---|---|
| R1 | Duas migrations em vez de uma (F1) mudam o plano de fatias | Documentado aqui; FT-71 leva a M1, FT-74 leva a M2 | `@po`/`@dev` aceitam |
| R2 | A janela de fusão dos avisos (F2) pode gerar dois resumos na virada | A janela é configuração; o teste fixa o comportamento; redação do AC 4 "por rajada" | `@dev` confirma |
| R3 | O trigger de guarda é lógica oculta | Uma função, duas regras, coberta pelo teste de migration; a aplicação ainda usa `UPDATE` guardado primeiro | `@dev` confirma que é aceitável; senão remove e mantém os testes |
| R4 | Deriva do `prisma migrate diff` com índices parciais/triggers manuais | Já é prática do projeto (índice do tombstone convertido) | `@dev` roda no dry-run |
| R5 | A reconciliação (linha 2630) e os demais escritores de `expected_status` devem gravar os dois campos | O `CHECK` falha em voz alta; teste no arquivo de compatibilidade | `@dev` |
| R6 | Lote muito grande numa transação | SQL em conjunto, `lock_timeout`/`statement_timeout`; medir antes de dividir | `@dev`/`@qa` |
| R7 | Limite da lista própria (500) é só da aplicação | Contar sob trava consultiva dedicada dentro da transação de inclusão | `@dev` |
| R8 | Reversão depois do primeiro uso é só roll-forward | Script down com guarda; API recusa `refund_on_end` antes da FT-76 | `@dev` |
| R9 | Retenção de ids de itens mantidos (`check_group`/`awaiting_choice`) | Regra da P6; a OPS-32 deve exibir | OPS-32 |
| R10 | Comportamento de `NOT VALID`/`VALIDATE` no PG18 dentro da transação da migration do Prisma | Rodar na instância isolada; recuar para checks inline (tabelas ainda pequenas) | `@dev` |

Depende do `@dev` antes da FT-74: itens R2, R3, R4, R5, R10 mais a contagem de linhas de `outbox` e `redemptions` num banco representativo. Depende do dono: nada novo.

## 8. Nota

**8,8 / 10** para o modelo contra a meta 9,0. Pontos fortes: `CHECK`s em uma só tabela que tornam as invariantes testáveis, índice único parcial, sem backfill, migrations aditivas e reversíveis, ordem de travas consistente que não acrescenta aresta de deadlock, plano de barreira determinístico. Retenho 0,2 porque nada foi executado: R3, R4, R10 e o comportamento dos comandos no PG18 não estão provados, e a F2 altera uma regra do architect. Chega a 9,0 quando o `@dev` confirmar esses pontos na instância isolada e o `@qa` rodar o plano da seção 6.
