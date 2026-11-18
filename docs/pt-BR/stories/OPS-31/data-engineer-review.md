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
  "settlement_state" IN ('none','held_for_service','awaiting_choice','check_group','intent_recorded','settled_external')  -- DB-20: six states
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

## 9. Revisão do desenho v2.2 (M1..M4, política, sessão de live) — 2026-11-15

**Autor:** `@data-engineer` (Dara) — **Modo:** YOLO — **Entrada:** [architect-design-v2.md](architect-design-v2.md) (3.10, 3.11, 3.12, 10, 18), [decisions-for-owner.md](decisions-for-owner.md), seções 0-8 acima.
**Classe de evidência:** leitura estática, na worktree `.local/ops31-wt`, de `apps/api/prisma/schema.prisma:1-207`, das 13 migrations em `apps/api/prisma/migrations/` e de `apps/api/src/persistence/queue-repository.mjs` (helpers de trava, uso de settings, escritores de status externo). **Nada foi executado**: nenhum DDL aplicado, nenhuma migration escrita, sem Docker, sem consulta, sem `EXPLAIN`. Todo SQL aqui é **referência, NÃO APLICADO**. O que não foi lido no código está marcado **HIPÓTESE**.
**Decisões do dono usadas como fato:** Q-3 (devolução sem live conta contra a ÚLTIMA sessão), Q-4 (só `type=live` abre sessão), janela de fusão configurável (padrão 10 min), LIVE-1 (o fim da live não altera filas, entradas nem resgates), política por fila S1..S5 (padrão `wait`).

### 9.1 Veredito e nota

**Nota do plano de dados: 8,5 / 10 como escrito (abaixo do mínimo de 9,0). Projeção de 9,3 quando as correções C1, C2, C3 e C4 de 9.3 forem aceitas e o plano de testes de 9.4 passar numa instância isolada de PostgreSQL 18.** Nada foi executado; a projeção não é resultado.

Por que 8,5. Pontos fortes: as quatro migrations são aditivas, com default constante, sem backfill e cada uma tem reversão definida; `stream_sessions` não toca tabela existente e não tem chave estrangeira (a LIVE-1 é estrutural, item 6); o teto reaproveita `redemptions.user_id` em vez de um novo repositório de dado pessoal; a ordem de travas da 4.3 é mantida e o código de sessão não acrescenta aresta de trava. Retenções: uma contradição que falharia em execução (DB-1: o `CHECK` da seção 2.2 proíbe `awaiting_choice` sem decisão `eligible`, mas a v2.1 precisa dele para não membros); uma afirmação falsa sobre travas de `NOT VALID`/`VALIDATE` dentro de uma só transação de migration (DB-2); uma janela de comportamento entre a M3 e o P7 para filas criadas nesse intervalo (DB-3); três pontos subespecificados (preenchimento de `refunded_at`, devolução `failed`, local da janela de fusão). Nenhum achado Crítico.

### 9.2 Respostas

**Item 1 — M3 (colunas da política, `settlement_policy_rev`, `DEFAULT` em duas etapas, backfill `legacy`).**
- *Ordem dentro da migration* (design v2:477): (1) um só `ALTER TABLE "queues" ADD COLUMN ...` com as sete colunas (um `ACCESS EXCLUSIVE`, só metadado); (2) `ALTER COLUMN settlement_on_close_switch_off SET DEFAULT 'wait'` (mas veja DB-3: recomendo mover para o P7); (3) `ADD CONSTRAINT ... CHECK ... NOT VALID` para os conjuntos fechados e faixas; (4) `VALIDATE`; (5) em `redemptions`: `ADD COLUMN "refunded_at" TIMESTAMPTZ(3)` (anulável, sem default) e o índice parcial. O DDL da M3 **não** deve referenciar colunas da M2 (`settlement_state`); assim a M3 fica independente da M2 em DDL e o acoplamento é só semântico (`wait` precisa de `awaiting_choice`).
- *Travas no PostgreSQL 18:* `ADD COLUMN` com default constante e `SET DEFAULT` só mexem no catálogo (sem reescrever a tabela; desde o PG 11 o default fica guardado como "valor ausente" da coluna). Ainda assim pegam `ACCESS EXCLUSIVE` em `queues` por instantes e esperam qualquer transação aberta que tenha tocado `queues`; defina `lock_timeout` na migration e rode com a aplicação parada (não existe `lock_timeout` nem `statement_timeout` em `queue-repository.mjs`; o plano da 4.3 os introduz). `CREATE INDEX` em `redemptions` (sem `CONCURRENTLY`) pega `SHARE`, bloqueia escritas e varre a tabela inteira uma vez, mesmo com o predicado falso em todas as linhas. `redemptions` é a única tabela que cresce: meça a contagem de linhas no dry-run. `CONCURRENTLY` exige um arquivo de migration com um só comando (**HIPÓTESE**: o Prisma envia o arquivo como uma transação implícita; conferir no dry-run).
- *Segurança com dados reais:* o default constante **é** o backfill. As linhas existentes leem `legacy` sem serem reescritas (**teste**: `pg_class.relfilenode` de `queues` e `redemptions` idêntico antes e depois, `pg_attribute.atthasmissing` verdadeiro nas colunas novas, `count(*) WHERE settlement_on_close_switch_off = 'legacy'` igual à contagem de filas). O segundo `SET DEFAULT` não toca linhas existentes. O `prisma migrate diff` só fica sem deriva depois desse comando, porque o `schema.prisma` declarará o default final (**HIPÓTESE** a confirmar no dry-run).
- *Reversão:* `DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN` (perde só os valores de política e os carimbos de devolução). **Guarda** (nova, DB-6): recusar se alguma redenção tem `refunded_at IS NOT NULL`, ou está em `awaiting_choice`/`held_for_service`/`check_group`, ou se alguma fila tem `settlement = 'refund_on_end'`. Sem a guarda, remover as colunas faz toda fila `wait` voltar em silêncio ao comportamento `legacy` de hoje (a re-listagem da exclusão devolve resíduo, design v2:241) enquanto os estados da M2 continuam. Nome do arquivo de reversão: o projeto já usa `rollback.sql` na pasta da migration (`20261014230000_outbox_deletion_cancel_verification/rollback.sql`); o design v2:480 diz `down.sql`: alinhar a `rollback.sql`.
- *Achado de janela:* veja DB-3.
- Rede opcional: gatilho em `queues` que recusa `settlement_on_close_switch_off` voltar de valor diferente de `legacy` para `legacy` (a "porta de mão única" do design v2:225). O compare-and-set da aplicação em `settlement_policy_rev` (`UPDATE ... WHERE id = $1 AND settlement_policy_rev = $2`) é o mecanismo principal; a rev não precisa de gatilho.

**Item 2 — `refunded_at`, índice parcial, job de anulação, devolução que falha.**
- *Índice:* `CREATE INDEX redemptions_refunded_cap_idx ON redemptions (queue_id, user_id, refunded_at) WHERE refunded_at IS NOT NULL`. A contagem `WHERE queue_id = $1 AND user_id = $2 AND refunded_at >= $3` implica o predicado (operador estrito), então o planejador pode usá-lo. O índice só guarda linhas devolvidas dentro do horizonte (limitado pelo job de 72 h ou pela última sessão), logo é minúsculo e a contagem sob a trava da fila é uma varredura curta de faixa (esperado: microssegundos a poucos milissegundos; **HIPÓTESE até um `EXPLAIN (ANALYZE, BUFFERS)` em `redemptions` sintética de 1M de linhas**). Lote (S4, limpar no painel): um `GROUP BY user_id` em conjunto com `user_id = ANY($ids)`. Capture o início da janela com um só `SELECT` e passe como literal, para que uma escrita concorrente de sessão não dê dois inícios na mesma transação (READ COMMITTED). Nenhuma aresta de trava: a transação de liquidação só lê `stream_sessions`.
- *CHECK opcional (NOT VALID e depois VALIDATE):* `CHECK (refunded_at IS NULL OR expected_status = 'CANCELED')`. As linhas existentes satisfazem (todas NULL). Usa só colunas existentes. Ressalva: `applyEntryTransition` com `origin=external` grava `expectedStatus: null` (`queue-repository.mjs:2355`); esse caminho é protegido para linhas com intenção (`:2303-2307`) e o CHECK falharia alto caso contrário: é um recurso, a cobrir com teste.
- *Job de anulação (72 h):* horizonte `COALESCE(LEAST(now() - interval '72 hours', inicio_ultima_sessao), now() - interval '72 hours')` (`LEAST` ignora `NULL`; o `COALESCE` explicita o caso sem sessão). Um comando em lote `UPDATE redemptions SET refunded_at = NULL WHERE redemption_id IN (SELECT redemption_id FROM redemptions WHERE refunded_at IS NOT NULL AND refunded_at < $horizonte LIMIT 500 FOR UPDATE SKIP LOCKED)`. `SKIP LOCKED` é correto **aqui** (faxina, repetida na próxima execução), ao contrário da liquidação (4.2). O gatilho de guarda da 2.2 é `BEFORE UPDATE OF settlement_state, group_decision`, então um update só de `refunded_at` não o dispara. O job não precisa da trava da fila: linha mais antiga que o horizonte tem `intent_recorded` absorvente. Sessão longa ou velha aberta mantém suas devoluções sem anular (conjunto limitado, inofensivo). A janela contada `>= início_da_sessão` nunca desce abaixo do horizonte porque o horizonte é `LEAST(72 h, início da sessão)`. O job é só por temporizador; **não** pode ser chamado pelo tratador de `stream.offline` (LIVE-1, item 6).
- *Limite honesto do job como controle de privacidade:* `redemptions.user_id` (NOT NULL) e `expected_status = 'CANCELED'` permanecem para sempre; anular `refunded_at` remove só um carimbo de tempo, não o fato de a pessoa ter sido devolvida. O controle real é a pseudonimização da OPS-32 (item 7). Mantenha o job (barato, limita o índice), mas não o descreva como apagamento.
- *Devolução que falha:* **contar no momento da intenção e não devolver orçamento** (recomendado; o `@po` confirma). Motivo (banco): devolver orçamento exige escrever em `redemptions` a partir do caminho do worker financeiro, que trava a linha do outbox primeiro e não toma a trava da fila (`queue-repository.mjs:69-75`, `confirm` em `:2416`, `:2454`), uma aresta nova na inversão TS-20. O lado conservador não custa nada: acima do teto a devolução só espera o streamer (design v2:221), então não se perde dinheiro. `resolved_manual` com `remoteConfirmed: false` conta do mesmo jeito.
- *Ponto semântico aberto:* quais devoluções gravam `refunded_at` não está definido (design v2:274 diz "a intenção de devolução"): só as governadas pelo teto (fim do atendimento, política `refund`) ou também as devoluções do painel pelo streamer e os cancelamentos por recusa? Proposta: gravar em todo `redemption.cancel` com causa de devolução visível à pessoa (`group_refund_on_end`, política `refund`, escolha `refund` do streamer), não nas recusas (nenhuma entrada foi atendida). `@architect`/`@po` decidem (DB-5).

**Item 3 — M4 `stream_sessions`.**
- *Tabela (referência):* `broadcaster_id text NOT NULL`, `twitch_stream_id text NOT NULL`, `stream_session_id uuid NOT NULL`, `started_at timestamptz(3) NOT NULL`, `ended_at timestamptz(3) NULL`, `source text NOT NULL CHECK (source IN ('event','reconciled'))`, `created_at timestamptz(3) NOT NULL DEFAULT now()`. **Chave primária `(broadcaster_id, twitch_stream_id)`** (o design não lista chave; esta é a chave de deduplicação e dispensa id substituto). `CHECK (ended_at IS NULL OR ended_at >= started_at)`, `CHECK (char_length(twitch_stream_id) BETWEEN 1 AND 64)`, idem `broadcaster_id` (não presumir só dígitos: **HIPÓTESE**). Sem chave estrangeira para nenhuma tabela.
- *Índices (3, todos minúsculos: poucas linhas por dia, cerca de 300 em 90 dias):* a PK; `UNIQUE (broadcaster_id) WHERE ended_at IS NULL` (uma linha aberta por canal); `(broadcaster_id, started_at DESC, twitch_stream_id DESC)` para "última sessão" e a ordem determinística do design v2:269. Sem índice para a purga (varredura sequencial numa tabela desse tamanho).
- *`online` duplicado:* `INSERT ... ON CONFLICT (broadcaster_id, twitch_stream_id) DO NOTHING` nomeia um só árbitro. A violação do **outro** índice único (o parcial) não é absorvida e levanta `23505`. Logo a ordem dentro da transação é fixa: fechar primeiro a outra linha aberta, depois inserir; e a trava por canal é obrigatória, não otimização.
- *Trava por canal:* `pg_advisory_xact_lock(<classe>, hashtext(broadcaster_id))` na forma de **dois inteiros**. O PostgreSQL mantém separados os espaços de chave de dois inteiros e de um bigint, então não colide com `lockQueue` (`hashtextextended(queueId, 0)`, `queue-repository.mjs:36-38`); use uma **constante de classe nova, diferente de `1868787013`** (a trava de conta, `:80-82`), porque `hashtext` pode devolver `1`. Colisão entre canais só os serializaria. A transação de sessão nunca toma trava de fila e nenhuma transação de fila toma a trava do canal (lê `stream_sessions` sem trava): nenhuma aresta de trava.
- *Fusão atômica* (uma transação curta, READ COMMITTED, sob a trava do canal): (1) ignorar se `type <> 'live'`; (2) tomar a trava; (3) ler a linha anterior `max(started_at, twitch_stream_id)` com `started_at <= T`; (4) `UPDATE ... SET ended_at = GREATEST(started_at, T), source = 'reconciled' WHERE ended_at IS NULL` para qualquer outra linha aberta; (5) `stream_session_id` := o da linha anterior se ela terminou e `T - ended_at <= janela de fusão` (inclusive) ou acabou de ser fechada em (4), senão `gen_random_uuid()`; (6) `INSERT ... ON CONFLICT DO NOTHING`. A entrega repetida para em (6). Fechar: `UPDATE ... WHERE twitch_stream_id = $1 AND ended_at IS NULL` é idempotente por si. Um `online` tardio de stream **anterior** a uma linha já gravada pode invalidar o `stream_session_id` das linhas posteriores; o design não diz o que acontece (DB-8): recalcular os ids das linhas com `started_at >=` a inserida na mesma transação, ou documentar como aceito.
- *Retenção:* apagar **sessões inteiras** (nunca uma linha de sessão cujas outras linhas ficam, o que moveria o início da sessão): sessões cujo último `ended_at` tem mais de 90 dias, nunca a sessão mais recente e nunca uma com linha aberta. Um comando, no mesmo temporizador do job de anulação. Linhas abertas velhas são fechadas pela reconciliação/fusão, não pela purga.
- *Onde guardar a janela de fusão e `reentry_window_hours`:* o schema **não tem tabela de configuração do canal** (`schema.prisma:1-207`; `OAuthCredential` em `:161` guarda credenciais, uma linha por client; `Setting` em `:154` é um repositório chave/`JSONB`). Recomendo uma **linha em `settings`** `live_session_policy` = `{ schemaVersion: 1, revision, mergeMinutes }`, linha ausente significando 10, seguindo o precedente de `chat_command_policies` (JSON versionado, `lockScopedOperation`, auditoria; `queue-repository.mjs:96-98`, `:315-338`). Assim a M4 tem **uma tabela nova e nenhum `ALTER` de tabela existente**, a configuração não exige migration nem backfill, "a mudança vale só para eventos recebidos depois" é natural, e a reversão da M4 é `DROP TABLE` mais apagar a chave. Defesa em profundidade (opcional): `CHECK` em `settings` com `CASE WHEN key = 'live_session_policy' THEN jsonb_typeof(value->'mergeMinutes') = 'number' AND (value->>'mergeMinutes')::numeric BETWEEN 1 AND 60 ELSE true END` (use `CASE`, pois o SQL não garante curto-circuito no `AND`). `reentry_window_hours` fica em `queues` (M3, por fila: é o fallback de um teto por fila). Atraso de confirmação (30 s), horas de obsolescência (48), retenção (90 d) são constantes de código/configuração, não colunas (não são ajustes do streamer).

**Item 4 — `CHECK`s da revisão antiga versus os estados novos.**
- **Sim, um amarra:** `redemptions_settlement_state_check` na seção 2.2 (`settlement_state NOT IN ('held_for_service','awaiting_choice') OR group_decision = 'eligible'`, linha 113 acima) proíbe `awaiting_choice` sem decisão `eligible`. O design v2:91 e a 3.10 precisam de `awaiting_choice` também para não membros e com `group_decision` NULL ou `not_eligible` (S1 `wait` em qualquer resgate, `legacy_residue`, teto, S2..S4). Falharia com `23514` no P7. O `redemptions_decision_shape_check` (linhas 104-110) é compatível (decisão NULL é permitida). **Correção (DB-1):** manter `held_for_service` só para `eligible`; `awaiting_choice` exige apenas `expected_status IS NULL AND remote_status = 'UNFULFILLED'`.
- *Estado novo `settled_external`:* incluir na lista de valores de `redemptions_settlement_values_check`; acrescentar `CHECK (settlement_state <> 'settled_external' OR (expected_status IS NULL AND remote_status IN ('FULFILLED','CANCELED')))`; estender o gatilho de guarda para que `OLD.settlement_state IN ('intent_recorded','settled_external')` seja absorvente (linhas 139-148 acima). Essas constraints existem só no rascunho **não aplicado** da M2; nenhum objeto aplicado muda: escrever a M2 final direto.
- *Escritores que precisam gravar os dois campos num só comando* (senão o novo `CHECK` falha alto, R5): `recordExternalRedemptionState` grava `remoteStatus` em `queue-repository.mjs:2713`; `applyEntryTransition` externo grava `remoteStatus` e `expectedStatus: null` em `:2355`.
- *Enums:* não existem neste schema (texto mais `CHECK`), logo sem `ALTER TYPE`. *Outbox:* o conjunto de `outbox_status_check` não muda por `settled_external` (nenhuma tarefa é criada). *"financial_state":* não existe coluna nem campo com esse nome no schema nem em `apps/api/src`; o estado financeiro vive em `outbox.status` (inalterado) e `redemptions.sync_status`, que não tem `CHECK` (`foundation/migration.sql:58`) e não precisa mudar.
- Reconciliar a M1: o M1 de referência da seção 2.1 tem quatro colunas de aviso; o design v2:466 tem cinco (`notice_joined`, `notice_service`, `notice_state`, `notice_reordered`, `notice_points`). O design prevalece; o DDL da 2.1 deve ser regenerado. A lista de status já inclui `resolved_manual` e `cancel_verification`, igual à constraint atual (`20261014230000_outbox_deletion_cancel_verification/migration.sql:2-3`).

**Item 5 — Ordem de reversão e aplicabilidade isolada.**
- *Ordem de aplicação:* M1, M2, M3, M4 (P2, P5, P5b, P6b). *Ordem de reversão:* M4, M3, M2, M1, estritamente inversa, para manter linear o histórico de `_prisma_migrations`, embora M1 e M4 sejam independentes das demais e a M3 seja independente da M2 em DDL (se seu `CHECK` usar só colunas existentes). Cada reversão é `prisma db execute --file rollback.sql` e depois `prisma migrate resolve --rolled-back` (**HIPÓTESE** sobre o fluxo exato no Prisma 6.19.3, como no design v2:480). Hoje só uma migration (`20261014230000...`) tem `rollback.sql`: a convenção existe, mas ainda não é geral.
- *Cada migration isolada com dados reais:* M1 sim (cinco booleanos default `false`, constraint do outbox recriada a partir da lista **atual**). M2 sim (colunas novas `NULL`/`none`, todas as constraints satisfeitas pelas linhas existentes; o índice único parcial em `outbox(redemption_id)` é seguro porque `financial:{id}` já é único, Q3 da revisão; rode a sonda de duplicatas mesmo assim). M3 sim (item 1). M4 sim (só tabela nova). Nenhuma migration precisa de backfill nem descarta dados ao ser aplicada; as reversões perdem só dado criado pela funcionalidade, e por isso existem as guardas.
- *Reversão da M1:* mapear `expired` para `cancelled` (não `unknown`, não `retry`: são avisos de chat, nunca dinheiro) com `last_error = 'notice_expired_rolled_back'`, e cancelar linhas `chat.notice` pendentes/retry/processando para que um worker antigo nunca veja um tipo de operação que não conhece. Segue o precedente do `rollback.sql` e substitui o "recusar enquanto houver linha `expired`" do design v2:475.
- *Afirmação de trava a corrigir (DB-2):* a linha 154 acima diz que `NOT VALID` e depois `VALIDATE` evita bloquear escritas. Dentro de **uma** migration o `ACCESS EXCLUSIVE` de `DROP/ADD CONSTRAINT` é mantido até o fim da transação, `VALIDATE` incluído, então a varredura bloqueia tudo em `outbox` e `redemptions`. O benefício só existe se o `VALIDATE` for uma migration separada (segunda transação). No beta (sem usuários ativos, aplicação parada) uma migration única é aceitável se as contagens de linhas forem medidas no dry-run; caso contrário, dividir a M2 em M2a (adicionar `NOT VALID`) e M2b (`VALIDATE`). **HIPÓTESE:** o PostgreSQL executa uma consulta simples com vários comandos como uma transação implícita; confirmar com `log_lock_waits` no dry-run.

**Item 6 — LIVE-1 no banco (garantia estrutural).**
Camadas, da mais forte à mais fraca: (a) `stream_sessions` **não tem chave estrangeira em nenhum sentido, nem gatilho, nem regra, nem view, nem ação `ON DELETE`**; toda chave estrangeira existente é `ON DELETE RESTRICT` (`schema.prisma:54,82,83,104,128,129,147-149,203`), então nenhum cascade alcança uma fila a partir de qualquer tabela. Um teste de catálogo torna isso permanente: `pg_constraint` sem linha `contype = 'f'` com `conrelid` ou `confrelid` = `stream_sessions`; `pg_trigger` sem gatilho não interno nela; `pg_rewrite`/`pg_depend` sem view sobre ela. (b) O módulo de sessão não importa o repositório de filas (teste estático, design v2:309). (c) Teste de mutação com **contadores de escrita**, mais forte que checksum: `pg_stat_force_next_flush()` e depois comparar `n_tup_ins/upd/del` de `queues`, `entries`, `redemptions`, `outbox`, `audit_logs` antes e depois de `offline`, fechamento por reconciliação, novo `online` e fusão (**HIPÓTESE** sobre o momento exato dos contadores no PG 18; confirmar na instância). O checksum não vê um `UPDATE` sem efeito; os contadores veem. (d) Papel de banco separado para o módulo de sessão **não** é recomendado agora: o produto usa uma `DATABASE_URL` e um `PrismaClient`, então um papel exigiria segundo pool e segredo para uma tabela que já não tem relação com filas. Rever só se existir um segundo papel por outro motivo.
Nome da tabela no teste: o design diz `queue_entries` (design v2:311); a tabela é `entries` (`schema.prisma:60`). O job de anulação do item 2 e a purga devem estar desligados ou excluídos nesse teste, pois são jobs de temporizador sem relação com o fim da live.

**Item 7 — Dado pessoal do contador do teto.**
Aceitável com três mudanças. (1) Nenhum identificador novo é guardado: `user_id` já é `NOT NULL` em `redemptions` (`schema.prisma:97`) por tempo ilimitado; `refunded_at` acrescenta um carimbo de um comportamento (devolvido) que `expected_status = 'CANCELED'` já revela sem hora. O índice parcial copia `user_id` só para devoluções recentes. (2) Retenção: a anulação de 72 h/última sessão limita o **carimbo**, não o vínculo; a minimização real é a pseudonimização de `redemptions.user_id` na OPS-32. A OPS-32 deve zerar `refunded_at` no mesmo comando; senão linhas dentro do horizonte compartilhariam um id substituto e pareceriam uma só pessoa para o teto. (3) A declaração de privacidade (`@po`) nomeia `refunded_at` e diz que a tabela de sessão não tem pessoa. Nada a mudar em logs/auditoria (só códigos e contagens, revisão 2.3). Direito ao apagamento: apagar a linha de `redemptions` apaga `refunded_at`.

**Item 8 — Plano de testes:** seção 9.4.

### 9.3 Achados e correções ao `@architect`

| # | Severidade | Achado | Evidência | Correção |
|---|---|---|---|---|
| DB-1 | Alta | `redemptions_settlement_state_check` amarra `awaiting_choice` a `group_decision = 'eligible'`; a v2.1 precisa dele para não membros e decisões NULL. Falha com `23514` no P7 | revisão linha 113; design v2:91, 470 | **C1:** `held_for_service` só `eligible`; `awaiting_choice` exige apenas `expected_status IS NULL` e `remote_status = 'UNFULFILLED'`; escrever a M2 final (ainda não aplicada) |
| DB-2 | Média | `NOT VALID` + `VALIDATE` numa só migration mantém `ACCESS EXCLUSIVE` até o commit; a afirmação "não bloqueia escritas" é falsa | revisão linha 154; design v2:476 | **C2:** corrigir o texto; dividir M2a/M2b ou aceitar janela com aplicação parada e contagens medidas |
| DB-3 | Média | A M3 define `DEFAULT 'wait'` de imediato; filas criadas entre a M3 e o P7 ficam rotuladas `wait` mas se comportam como `legacy`, e mudam de comportamento quando o P7 liga a aplicação da política (conflita com "filas existentes se comportam exatamente como hoje", G6) | design v2:225, 234, 550 | **C3:** manter o default do banco `legacy` até o P5b; o código de criação grava `legacy` até o P7; o P7 entrega uma migration de um comando `SET DEFAULT 'wait'` e grava `wait` nas filas novas. Reiniciar/clonar fila (revisão, seção 5) não pode copiar `legacy` para a fila nova |
| DB-4 | Média | Local da janela de fusão em aberto; o schema não tem tabela de canal | design v2:264, 290; `schema.prisma:154,161` | **C4:** linha em `settings` `live_session_policy` (item 3); M4 = uma tabela, sem `ALTER` de tabela existente |
| DB-5 | Média | Preenchimento de `refunded_at` e comportamento da devolução que falha não definidos | design v2:274, 290 | **C5:** listar as causas que gravam (item 2); contar na intenção, sem devolver orçamento em `failed`/`resolved_manual`; `@po` confirma |
| DB-6 | Média | A reversão da M3 não tem guarda; remover as colunas após o P7 reverte filas a `legacy` em silêncio | design v2:477 | **C6:** guarda (item 1); ordem de reversão estritamente inversa; nome `rollback.sql` |
| DB-7 | Baixa | Espaço de chave da trava por canal não especificado; nome `queue_entries` errado no teste da LIVE-1; `ON CONFLICT` não absorve o índice único parcial | design v2:271, 311 | **C7:** trava de dois inteiros com classe nova; teste em `entries`; ordem fixa fechar-depois-inserir |
| DB-8 | Baixa | `online` tardio de stream anterior pode mudar a sessão das linhas posteriores; sem regra | design v2:269-270 | **C8:** recalcular na mesma transação, ou documentar como aceito |
| DB-9 | Baixa | `stream_sessions` sem chave, sem `CHECK ended_at >= started_at`, sem regra de purga por sessão | design v2:255-262, 283 | **C9:** PK composta, checks, purga por sessão inteira (item 3) |
| DB-10 | Baixa | M1: quatro contra cinco colunas entre documentos; a reversão da M1 "recusar se houver `expired`" é mais rígida que o necessário | revisão 2.1; design v2:466, 475 | **C10:** regenerar a 2.1 a partir do design; reversão da M1 mapeia `expired` para `cancelled` |
| DB-11 | Baixa | Não existe `lock_timeout`/`statement_timeout` em `queue-repository.mjs`; o plano os pressupõe | `queue-repository.mjs` (sem ocorrência) | **C11:** introduzi-los como tarefa do P0/P1 com teste próprio (a sonda TS-20) antes da M2 |

### 9.4 Plano de testes de banco (PostgreSQL 18 isolado, migrations reais, instância descartável; nunca o volume de desenvolvimento)

Arquivos novos (nomes seguem a seção 6):
1. `tests/integration/ops31-migrations-postgres.test.js`. Semear o estado atual (13 migrations): filas em vários modos, entradas, resgates (todos os status remotos), linhas de outbox em todos os status, settings, auditoria; registrar por tabela a contagem de linhas e o `md5` do `row_to_json` ordenado das colunas pré-existentes.
   - *Avanço, uma a uma:* aplicar M1, M2, M3, M4; após cada uma, afirmar que o checksum das colunas pré-existentes não mudou, `pg_constraint.convalidated` é verdadeiro, os defaults são os projetados e `prisma migrate diff` (migrations para datamodel) é vazio.
   - *Sem reescrita:* `pg_class.relfilenode` de `queues`, `redemptions`, `outbox` idêntico antes e depois de M1/M2/M3; `atthasmissing` verdadeiro nas colunas de default constante; após a M3 toda fila existente lê `legacy` e uma fila inserida depois lê o default vigente (`legacy` até o P7, `wait` após a migration do P7).
   - *Matriz de isolamento:* cada migration sozinha sobre o estado atual onde for independente (M1, M4, M3 sem M2, M2 sozinha); M3 depois da M2.
   - *Constraints:* cada uma recusa sua linha inválida (conjuntos fechados, faixas, forma da decisão, `held_for_service` exige `eligible`, **`awaiting_choice` aceita decisão NULL e `not_eligible` (regressão da DB-1)**, `settled_external` exige `expected_status IS NULL` e status remoto terminal, `ended_at >= started_at`, `refunded_at` exige `CANCELED`); gatilho de guarda: `intent_recorded` e `settled_external` absorventes, decisão conclusiva imutável, update só de `refunded_at` não o dispara.
   - *Reversão, estritamente inversa:* M4, M3, M2, M1, cada uma sobre dados semeados; guardas recusam após uso simulado (linhas devolvidas, estados pendentes, lista própria não vazia) e passam antes; após a reversão da M3 o checksum de toda coluna pré-existente é igual ao original; a reversão da M1 não deixa linha `expired` nem `chat.notice` pendente.
   - *Comportamento de travas:* com `log_lock_waits` e um escritor concorrente, registrar os níveis de trava e quanto tempo cada migration os mantém em `queues`, `redemptions`, `outbox`; comparar M2 em um arquivo com M2a/M2b; registrar as contagens de linhas usadas.
2. `tests/integration/ops31-cap-postgres.test.js` (técnica de barreira da seção 6, provada por `pg_locks`). Invariante: "devoluções automáticas de uma pessoa em uma fila dentro da janela nunca excedem o teto, em qualquer intercalação". Só existe uma entrada ativa por pessoa por fila (`entries_active_user_per_queue`), então duas devoluções automáticas simultâneas da mesma pessoa não ocorrem; a corrida real é automática contra manual. Fixture: teto 1, pessoa U com entrada antiga `awaiting_choice` E0 e entrada retida E1; rodar "fim do atendimento de E1" contra "streamer devolve E0" nas duas ordens: ou E1 devolve e a escolha do streamer também passa (nunca bloqueada), ou a escolha do streamer chega primeiro e E1 vira `awaiting_choice` (`reentry_cap`); nunca duas devoluções automáticas. Também: duas pessoas diferentes na fronteira não se bloqueiam; teto `NULL` nunca bloqueia; bordas da janela (igual ao início, 1 ms antes, horas de fallback); lote com `user_id = ANY` igual ao resultado linha a linha; `EXPLAIN (ANALYZE, BUFFERS)` em `redemptions` sintética de 1M de linhas registra o plano como evidência, não como asserção de tempo.
3. `tests/integration/ops31-refunded-at-job-postgres.test.js`: horizonte de anulação sem sessão, com sessão aberta, última sessão fechada, sessão aberta obsoleta, sessão com mais de 72 h (nada dentro da sessão é anulado); lote com `SKIP LOCKED` enquanto outra transação segura uma linha; o job não é chamado pelo caminho do `offline`.
4. `tests/integration/ops31-live-session-postgres.test.js`: (a) duas conexões entregam o **mesmo** `online` (barreira): uma linha, uma sessão, sem erro; (b) dois ids **diferentes** de `online` ao mesmo tempo: exatamente uma linha aberta, a perdedora espera e depois fecha/funde ou recebe `23505` mapeado para nova tentativa; nunca erro não tratado nem duas linhas abertas; (c) `online` e `offline` do mesmo id ao mesmo tempo, nas duas ordens: estado final fechado, `ended_at >= started_at`; (d) `offline` de id desconhecido não grava nada; (e) borda da fusão (igual à janela, +1 ms, -1 ms), `offline` perdido, `online` tardio de stream anterior (DB-8), tipo `rerun` não grava; (f) retenção por sessão inteira mantém a última e qualquer aberta; (g) **LIVE-1:** asserções de catálogo (sem FK/gatilho/regra/view em `stream_sessions`) e variação zero dos contadores de escrita em `queues`, `entries`, `redemptions`, `outbox`, `audit_logs` ao longo de `offline`, fechamento por reconciliação, novo `online`; (h) M4 subir/descer com linhas existentes nas demais tabelas intactas; chave ausente em `settings` significa 10.
5. Captura de logs/auditoria dentro dos arquivos acima: sem id de usuário, login, nome de exibição, título de stream nem rótulo.

As classes de evidência continuam separadas: são testes de integração com PostgreSQL; fakes do Twurple e o redutor pertencem às classes FX/TW do `@qa`. Uma execução real na Twitch é a corrida C do P8.

### 9.5 O que não foi lido

`queue-repository.mjs` fora das linhas 30-100, 315-345, 2296-2312, 2700-2716 e das buscas acima; o código do painel; `reconciliation.mjs` e `integration.mjs`; as metades pt-BR dos outros documentos de especialistas; os arquivos do compose (um único papel de banco é suposto a partir da `DATABASE_URL` única: **HIPÓTESE**); os comportamentos do Prisma 6.19.3 e do PostgreSQL 18 marcados como **HIPÓTESE** acima. O timeout padrão de transação interativa do Prisma (5 s) não foi reconferido e importa para o lote da 3.6.

### 9.6 Situação das correções (2026-11-15)

Aplicadas pelo `@architect` no [architect-design-v2.md](architect-design-v2.md) v2.3 (só documentos; nenhum DDL escrito nem aplicado): DB-1 (diferenças da seção 10, regra 5 da 3.2), DB-2 (M2a/M2b, divisão escolhida), DB-3 (padrão do S1 `legacy` até o P7, migração do P7 `SET DEFAULT 'wait'`), DB-4 (linha de `settings` `live_session_policy`, a M4 é uma tabela só), DB-5 (decidida pelo proprietário: teto contado na intenção, sem devolver orçamento, sem escrita extra do worker, acima do teto a devolução espera), DB-6 (proteção da M3-down, ordem estritamente inversa M4, M3, M2, M1, `rollback.sql`), DB-7 (lock de canal de dois inteiros com classe nova, teste em `entries`, fechar-depois-inserir), DB-8 (`online` tardio de transmissão mais antiga ignorado e registrado), DB-9 (chave primária composta, `ended_at >= started_at`, limpeza por sessão inteira), DB-10 (cinco colunas na M1, a M1-down converte `expired` em `cancelled`), DB-11 (`lock_timeout`/`statement_timeout` por migração e no P0). Q-3 e Q-4 são decisões do proprietário. A nota projetada de 9,3 continua sendo projeção até o plano de 9.4 rodar num PostgreSQL 18 isolado.

### 9.7 Reavaliação do design v2.3 (2026-11-15)

**Autor:** `@data-engineer` (Dara) — **Modo:** YOLO — **Entrada:** [architect-design-v2.md](architect-design-v2.md) v2.3 (3.2, 3.10, 3.11, 3.12, 10, 13, 14, 18) contra DB-1..DB-11 de 9.3. **Classe de evidência:** leitura estática só do design (seções 1-14 e 18 lidas; o par pt-BR foi apenas conferido quanto à paridade dos termos-chave: `M2a`, `SET DEFAULT 'wait'`, `live_session_policy`, `rollback.sql`, `late_online_ignored`, `1868787013` têm as mesmas contagens nos dois arquivos). Nenhum código, migração ou SQL foi relido ou executado; nada rodou contra banco algum. Os números de linha de `queue-repository.mjs` são os já presentes em 9.2.

**Nota: 9,2 / 10 (atinge a meta de 9,0).** Os onze achados estão fechados no texto do design e nenhuma regressão de severidade Alta ou Média foi encontrada. Cinco resíduos Baixos (N-1..N-5 abaixo) não bloqueiam a nota. É uma nota de documento: nada foi executado, então R3, R4, R10, o comportamento de locks do PostgreSQL 18 e o fluxo do Prisma continuam **HIPÓTESE** até o `@dev` e o `@qa` rodarem o plano de 9.4.

**Verificação de cada correção**

| # | Veredito | Onde na v2.3 | Nota |
|---|---|---|---|
| DB-1 | Fechado | 3.2 regra 5; seção 10 linha "v2.1" | `held_for_service` exige `eligible`, `expected_status IS NULL`, `UNFULFILLED`; `awaiting_choice` exige só `expected_status IS NULL` e `UNFULFILLED`. Compatível com S1 `wait`, `legacy_residue`, o teto e S2..S4. `settled_external` e o gatilho absorvente mantidos (seção 10, primeira linha). Teste de regressão em 13 (Migrações v2.3) e em 9.4 |
| DB-2 | Fechado | Seção 10 "M2a e M2b" | Afirmação falsa retirada, divisão escolhida. M2b = só `VALIDATE`, transação própria, `SHARE UPDATE EXCLUSIVE`. A alternativa de um arquivo só é permitida apenas com contagens medidas. O `CREATE UNIQUE INDEX` simples em `outbox` ainda toma `SHARE`; aceitável com o app parado (ver N-1) |
| DB-3 | Fechado | 3.10 "Por que as filas existentes não são tocadas"; texto da M3; P7 | O padrão do banco e o código de criação ficam `legacy` até o P7; o P7 traz o `SET DEFAULT 'wait'` de uma instrução; clonar/reiniciar grava o padrão vigente; o teste em 13 cobre "fila após a M3 lê `legacy`" |
| DB-4 | Fechado | 3.11 A; texto da M4 | Linha de `settings` `live_session_policy`, ausente = 10; M4 = uma tabela, sem `ALTER`; `CHECK` opcional com `CASE` mantido |
| DB-5 | Fechado | 3.11 C2; 4 (gate); 13 | Contagem na intenção, `refunded_at` só para causas visíveis à pessoa, sem devolver orçamento em `failed`/`resolved_manual`, sem escrita do worker (sem nova aresta de lock), acima do teto `awaiting_choice` (`reentry_cap`) e nunca um fulfill, devolução do streamer no painel ainda passa e conta. Testes presentes |
| DB-6 | Fechado | Seção 10 M3 e "Reversibilidade" | O texto da proteção confere com 9.2; `rollback.sql`; ordem estritamente inversa M4, M3, M2, M1 com a M2b-down sem efeito |
| DB-7 | Fechado | 3.11 B regra 5; 13 | Lock de dois inteiros, classe nova diferente de `1868787013`, teste com `pg_locks`, tabela `entries`, fechar-depois-inserir, `23505` mapeado no teste PG |
| DB-8 | Fechado | 3.11 B regra 3; evento de log da 3.12 | `online` tardio de transmissão mais antiga ignorado e registrado; o `stream_session_id` gravado nunca muda. Conservador (teto mais estrito). Aceito |
| DB-9 | Fechado | 3.11 A; texto da M4; E | PK composta, `ended_at >= started_at`, checagens de tamanho dos ids, limpeza por sessão inteira que preserva a última e qualquer aberta; horizonte de anulação `LEAST(now - 72 h, início da última sessão)` |
| DB-10 | Fechado | Seção 10 M1 e linha 2 | Cinco colunas; a M1-down converte `expired` em `cancelled` e cancela `chat.notice` pendente |
| DB-11 | Fechado | Seção 10 "Timeouts por migração"; P0 | `lock_timeout`/`statement_timeout` por migração e nas transações do repositório com a sonda TS-20, antes da M2 |

**Busca de regressões.** Conferido: (a) o `CHECK` do DB-1 contra o diagrama de estados (toda seta para `awaiting_choice` tem `expected_status IS NULL` e `UNFULFILLED`; `awaiting_choice --> none` na restauração mantém a decisão); (b) `settled_external` a partir de `awaiting_choice` para não membro satisfaz o novo `CHECK`; (c) `refunded_at` contra o gatilho de guarda (um `UPDATE` só de `refunded_at` não o dispara) e o `CHECK` opcional `refunded_at => CANCELED` (linhas com intenção são absorventes, então o escritor externo que põe `expected_status` em NULL já é protegido); (d) arestas de lock: o lock de canal tem espaço de chaves próprio, nenhuma transação toma lock de canal e de fila, o worker não acrescenta escrita em `redemptions` para o teto; (e) o horizonte de anulação contra a Q-3 (valores dentro da última sessão são mantidos, conjunto limitado); (f) ordem de aplicação M1, M2a, M2b, M3, M4 contra a ordem dos pacotes P2, P5, P5b, P6b. Nenhuma contradição encontrada.

**Achados abertos (todos Baixos; nenhum bloqueia o 9,0)**

| # | Severidade | Achado | O que falta |
|---|---|---|---|
| N-1 | Baixa | A M3 lista os `CHECK`s de conjunto fechado em `queues` como `NOT VALID` e depois `VALIDATE` num arquivo (ok, poucas linhas), mas a seção 10 linha "v2.1" também lista o `CHECK` opcional `refunded_at => CANCELED` com `NOT VALID` e depois `VALIDATE`, sem dizer onde ele fica. Se estiver na M3 sobre `redemptions` (a única tabela grande), vale a lição do DB-2: seu `VALIDATE` deve ser arquivo separado (M3b) ou a contagem de linhas deve ser medida. O índice único parcial em `outbox` (M2a) e o índice parcial em `redemptions` (M3) tomam `SHARE` uma vez | Uma frase: retirar o `CHECK` opcional, ou pôr seu `VALIDATE` depois da M3 como migração própria; registrar as contagens de `outbox` e `redemptions` no ensaio |
| N-2 | Baixa | A migração do P7 `SET DEFAULT 'wait'` não está na lista de aplicação/reversão de "Reversibilidade" (M1, M2a, M2b, M3, M4) e não tem reversão declarada | Nomeá-la (por exemplo M3b), dar-lhe `rollback.sql` = `SET DEFAULT 'legacy'` e colocá-la primeiro na ordem estritamente inversa (após o P7 ela roda antes da M4-down), para o `_prisma_migrations` ficar linear |
| N-3 | Baixa | A seção 10 diz que toda migração começa com `SET LOCAL lock_timeout`/`statement_timeout`. `SET LOCAL` só vale dentro de transação; se o Prisma embrulha um arquivo em uma é HIPÓTESE declarada. O timeout de transação interativa do Prisma (5 s) para o lote da 3.6 continua sem conferência (9.5) | No ensaio, confirmar o embrulho com `log_lock_waits`; se um arquivo não for transacional, usar `SET` simples e depois `RESET`. O `@dev` confere o timeout de 5 s antes do P7 |
| N-4 | Baixa | As seções 2.1 e 2.2 desta revisão ainda guardam o DDL superado (quatro colunas de aviso, o vínculo de `awaiting_choice` com `eligible` na linha 113, a afirmação falsa de `NOT VALID` na linha 154). A seção 10 do design diz que as diferenças vencem, mas quem lê só a 2.2 copiaria o texto antigo | Ao iniciar P2 e P5, o `@data-engineer` regenera o DDL final da M1 e da M2a a partir do design (não aplicado) e marca 2.1 e 2.2 como superadas. Não feito aqui: é trabalho de pacote de implementação; esta tarefa pediu só a reavaliação |
| N-5 | Baixa | Até o P7 a API recusa só valores de S1 diferentes de `legacy` (3.10 "Editar a política"). S2..S4 podem ser gravados como `refund` ou `fulfill` e S5 como número antes do P7 sem que nada os aplique, então uma configuração pode parecer ativa estando inerte (a preocupação que a 3.10 resolveu para S1) | Ou recusar mudanças de S2..S5 com `SETTLEMENT_MODE_UNAVAILABLE` até o P7, ou documentá-las como aceitas e inertes e deixar o `@ux` marcá-las. Sem efeito sobre dinheiro em ambos os casos |

**Conclusão.** Plano de dados: 9,2 / 10 como design; projetada 9,4 depois que o `@dev` confirmar as HIPÓTESES num PostgreSQL 18 isolado e o `@qa` rodar 9.4 verde. Recomendado antes do P5: fechar N-1 e N-2 com uma frase cada na seção 10 (`@architect`); N-3 a N-5 podem esperar os pacotes. Nenhum achado bloqueia a continuação para `@ux-design-expert`, `@po` e `@qa`.

### 9.8 Revisão das colunas `settlement_cause` e `settled_external_at` da M2a e dos CA 34-41 (design v2.4, 2026-11-15)

**Autor:** `@data-engineer` (Dara) — **Modo:** YOLO — **Entrada:** [architect-design-v2.md](architect-design-v2.md) (3.13 A, B, F; seção 10, linha "v2.4", M2a, M2b, M3, M3a, M3b, "Reversibility"), [story.md](story.md) CA 34-41, 9.2-9.7 acima. **Classe de evidência:** leitura estática do design, do texto dos CA e de `apps/api/prisma/schema.prisma:60-109` (`Entry.redemptionId` é `@unique`; `Redemption` não tem `entry_id`; `queue_id` aceita nulo). Nada foi executado; todo SQL abaixo é **referência, NÃO APLICADA**. `ux-plan-v2.md` e `po-validation.md` não foram lidos em detalhe (são entradas de outros gates); este texto está em paridade com o gêmeo em inglês.

**Nota: 9,3 / 10 (atinge a meta de 9,0).** As duas colunas e o índice estão confirmados. Há uma lacuna Média (DB-12: as regras "gravada só em `awaiting_choice`" e "limpa quando sai" não têm `CHECK` no design) e cinco pontos Baixos. Nenhum bloqueia a P5 depois que o DB-12 entrar no texto da M2a. Projeção de 9,5 depois que o plano de 9.4 mais o de 9.8 passar em PostgreSQL 18 isolado; a projeção não é resultado.

**1. Confirmação dos objetos da M2a**

| Objeto | Veredito | Nota |
|---|---|---|
| `settlement_cause text NULL` | Confirmado | Aceita nulo, sem default: só metadado, sem reescrita no PostgreSQL 18. Conjunto fechado de cinco (`policy_wait`, `cannot_ask`, `chat_clear`, `legacy_residue`, `reentry_cap`). Os números da linha do teto não são gravados (correto: calculados na leitura a partir de `refunded_at`) |
| `settled_external_at timestamptz(3) NULL` | Confirmado | Mesmo tipo dos demais carimbos de `redemptions` (`Timestamptz(3)`); `outcome` não precisa de coluna (`remote_status` já diz `FULFILLED` ou `CANCELED`); `displayName` vem de `entries` por `entries.redemption_id` (único), sem cópia |
| Índice do histórico `(queue_id, settled_external_at DESC) WHERE settlement_state = 'settled_external'` | Confirmado com correção (DB-14) | Acrescentar o desempate `redemption_id DESC` |
| Lista de pendências (no máximo 200) | Confirmada, atendida pelo índice de pendências existente | Ver DB-15 |

**DDL de referência (substitui a linha v2.4; entra na regeneração da M2a do N-4)**
```sql
-- REFERENCE, NOT APPLIED. M2a: nullable, no default (catalog only)
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_cause"   TEXT,
  ADD COLUMN "settled_external_at" TIMESTAMPTZ(3);

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_cause_check" CHECK (
  ("settlement_cause" IS NULL OR "settlement_cause" IN
     ('policy_wait','cannot_ask','chat_clear','legacy_residue','reentry_cap'))
  AND ("settlement_state" = 'awaiting_choice' OR "settlement_cause" IS NULL)
) NOT VALID;

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settled_external_check" CHECK (
  ("settlement_state" = 'settled_external') = ("settled_external_at" IS NOT NULL)
) NOT VALID;

CREATE INDEX "redemptions_settled_external_idx"
  ON "redemptions" ("queue_id", "settled_external_at" DESC, "redemption_id" DESC)
  WHERE "settlement_state" = 'settled_external';
-- M2b: VALIDATE CONSTRAINT for the two above (now five constraints in M2b), own transaction
```

**2. Coerência com o restante do plano**
- *`CHECK` de estado do DB-1:* independente. `awaiting_choice` continua exigindo só `expected_status IS NULL` e `remote_status = 'UNFULFILLED'`; a restrição da causa acrescenta uma regra de coluna e não mexe na forma do estado. `settled_external` mantém `expected_status IS NULL` e `remote_status IN ('FULFILLED','CANCELED')`; a nova bicondicional acrescenta que `settled_external_at` existe exatamente nesse estado. Linhas existentes atendem as duas (estado `none`, ambas as colunas `NULL`), então a M2b não pode falhar.
- *Transições:* entrar em `awaiting_choice` vindo de `none`, `held_for_service` ou `check_group` grava a causa; sair para `none` (restaurar), `intent_recorded` (escolha) ou `settled_external` grava `NULL` na mesma instrução, senão o `CHECK` falha alto (é uma vantagem). Os escritores externos (`recordExternalRedemptionState`, `queue-repository.mjs:2713`; `applyEntryTransition` externo, `:2355`) devem gravar estado, `remote_status`, `expected_status = NULL`, `settled_external_at` e limpar a causa em uma só instrução. `check_group` e `held_for_service` não têm causa.
- *Gatilho de guarda:* `settled_external` já é absorvente. Acrescentar `settled_external_at` à lista do `UPDATE OF` e recusar alterá-la depois de gravada, para a ordem do histórico não ser reescrita. O gatilho não precisa impor a causa; o `CHECK` impõe.
- *M3, M3a, M3b:* nenhum DDL da M3 referencia as colunas novas (conferido no texto de M3, M3a e M3b); o `CHECK` da M3a (`refunded_at => CANCELED`) não conflita, pois uma linha `settled_external` tem `expected_status IS NULL` e nunca carrega `refunded_at`. A guarda do M3-down não precisa de estado novo.
- *Rollback:* o M2-down remove, nesta ordem, o gatilho e a função de guarda, os dois índices adicionados aqui, as restrições (inclusive as não validadas, para o M2a-down funcionar mesmo sem a M2b ter rodado) e depois as colunas. O M2b-down segue sem efeito. A guarda do M2-down "recusa após o primeiro uso" já cobre estas colunas, porque `settled_external` e `awaiting_choice` são estados diferentes de `none`; só se perde o que a funcionalidade criou. A ordem reversa estrita não muda (M3b, M4, M3a, M3, M2, M1).
- *Locks:* os dois `ADD COLUMN` são só de catálogo; `ADD CONSTRAINT ... NOT VALID` é um `ACCESS EXCLUSIVE` curto; `CREATE INDEX` toma `SHARE` e varre uma vez com predicado falso (registrar a contagem de linhas de `redemptions` no dry-run, como nos demais índices da M2a). Nenhuma aresta de lock nova: causa e horário são gravados por instruções que já seguram o lock da fila.
- *Dados pessoais:* um carimbo e um código fechado; nenhum identificador. Apagar a redemption remove os dois. A pseudonimização de `user_id` da OPS-32 não precisa tocá-los.

**3. Achados e correções ao `@architect`**

| # | Severidade | Achado | Correção |
|---|---|---|---|
| DB-12 | Média | O design 3.13 A diz que a causa é limpa quando a linha sai de `awaiting_choice`, e a seção 10 diz que o conjunto fechado tem `CHECK`, mas nada obriga a coluna a ser `NULL` fora de `awaiting_choice`; uma `reentry_cap` velha numa linha resolvida mostraria uma linha errada e iria para o histórico | Restrição `redemptions_settlement_cause_check` acima (conjunto fechado **e** causa só em `awaiting_choice`), `NOT VALID` na M2a, validada na M2b. Decisão do `@architect`: exigir também `awaiting_choice => causa NOT NULL`? Recomendado sim depois da P7; antes da P7, se algum escritor das P1-P6 entrar em `awaiting_choice` sem causa, manter anulável e a API mapeia `NULL` para uma linha de causa genérica (nunca para um código adivinhado) |
| DB-13 | Baixa | `settled_external_at` não tem regra de coerência com o estado e é mutável | Restrição bicondicional acima; incluir a coluna na lista do gatilho de guarda (imutável depois de gravada) |
| DB-14 | Baixa | O índice do histórico ordena só por `settled_external_at`; empates (mesmo milissegundo) tornam as "20 últimas" não determinísticas | Acrescentar `redemption_id DESC` ao índice e ao `ORDER BY` da rota (mesmo padrão da M4) |
| DB-15 | Baixa | A lista de pendências lê um índice de três estados mas quer dois (`held_for_service` não é decisão), então linhas retidas são varridas e descartadas; e o `GET /api/state` calcula a contagem por fila a cada consulta | **HIPÓTESE** de que é barato (as linhas retidas são limitadas pela fila da live). Medir com `EXPLAIN (ANALYZE, BUFFERS)` numa tabela sintética de 1M linhas; criar um segundo índice parcial só nos dois estados se o plano mostrar desperdício. Calcular as contagens de todas as filas da resposta de estado em uma consulta agrupada, não uma por fila |
| DB-16 | Baixa | `items` para em 200 mas `total` é o número do selo; se as pendências passarem de 200, a lista e o selo divergem em silêncio | `total` é contagem real, não o tamanho de `items`; acrescentar um indicador `truncated` (ou documentar que o selo pode superar a lista) |
| DB-17 | Baixa | A seção 10 mantém "Payload `settlementCause` nas linhas financeiras da outbox (sem coluna)" ao lado da nova coluna `settlement_cause`; dois nomes para fatos parecidos | Declarar que o payload, quando existir, usa a mesma lista fechada, ou eliminar a cópia no payload (a linha de auditoria `settlement.transition` já carrega a causa) |

**4. Revisão dos CA 34-41 quanto a dados**

| CA | Veredito | Lacuna |
|---|---|---|
| 34 | OK | Colunas da política, defaults e faixas batem com a M3 (teto `smallint NULL` 1-20, janela `smallint` 1-72 padrão 12, conjuntos fechados, S1 padrão `legacy` até a M3b). A evidência deve listar os `CHECK` de faixa explicitamente (teto 0 e 21, janela 0 e 73) |
| 35 | OK | Compare-and-set em `settlement_policy_rev` coberto pela corrida de duas edições. A evidência deve incluir que a rev incrementa no mesmo `UPDATE` dos valores (sem ler e depois escrever) |
| 36 | OK | Sem objeto de dados; nada falta |
| 37 | Lacuna | A evidência cita os `CHECK` de estado mas não o da causa: incluir conjunto fechado, `NULL` fora de `awaiting_choice`, limpeza em toda saída (restaurar, escolha, `settled_external`), bicondicional e imutabilidade de `settled_external_at` (DB-12, DB-13). A frase do CA está correta e não muda |
| 38 | Lacuna | "Usa os índices parciais de pendências e de `settled_external_at`" não é testável em tabelas pequenas (o planejador escolhe varredura sequencial): a evidência deve ser um `EXPLAIN` em volume sintético (plano como evidência, sem asserção de tempo), com ordem determinística incluindo o desempate (DB-14) e `total` versus `truncated` (DB-16). Dizer também que a rota só considera redemptions com `queue_id` (as com `queue_id NULL` nunca aparecem) |
| 39 | Lacuna | A evidência omite o job de limpeza de `refunded_at` de 72 h e seu horizonte (testado em 9.4 item 3, mas não nomeado no CA); incluí-lo, e o plano da contagem no índice parcial |
| 40 | Lacuna | A evidência omite a retenção por sessão inteira (90 dias, mantém a mais recente e qualquer aberta) e a faixa 1-60 de `live_session_policy` (validação em código mais o `CHECK` opcional); incluir ambos. As asserções de catálogo da LIVE-1 (sem chave estrangeira, gatilho, regra ou visão em `stream_sessions`) estão em 9.4 item 4(g) e podem ser citadas |
| 41 | OK | Sem objeto de dados |

**5. Acréscimos ao plano de testes de 9.4** (arquivo `tests/integration/ops31-migrations-postgres.test.js`, salvo indicação)
1. `CHECK` da causa: cada um dos cinco códigos aceito só com `awaiting_choice`; código desconhecido recusado; código com qualquer outro estado recusado; `awaiting_choice` com `NULL` aceito (ou recusado se a forma estrita do DB-12 for adotada).
2. Matriz de saída: `awaiting_choice` para `none`, para `intent_recorded` e para `settled_external` falha se a causa não for limpa na mesma instrução.
3. `settled_external` sem `settled_external_at`, e `settled_external_at` em outro estado, são ambos recusados; alterar `settled_external_at` depois de gravada é recusado pelo gatilho.
4. M2a sozinha e depois M2b: `convalidated` verdadeiro nas cinco restrições; o M2-down em dados semeados remove as duas colunas, o índice, as restrições e o gatilho, e o checksum das colunas preexistentes é igual ao original; o M2a-down funciona sem a M2b aplicada.
5. `ops31-pending-decisions-postgres.test.js`: 201 pendências dão `items` 200, `total` 201, `truncated` verdadeiro; histórico de 25 linhas devolve as 20 mais recentes com empate resolvido por `redemption_id`; `held_for_service` não é listada nem contada; `EXPLAIN` em `redemptions` sintética de 1M linhas registrado como evidência dos dois índices parciais.

**Conclusão.** As duas colunas e o índice do histórico estão certos para o modelo de dados; aceitar com DB-12 e DB-13 escritos no texto da M2a (cada um é um `CHECK` e uma coluna no gatilho), e DB-14 a DB-17 tratados na P5/P7. DB-12 a DB-14 devem fechar antes de a P5 começar; DB-15 a DB-17 podem esperar a P7. Nenhum achado bloqueia a continuação.

### 9.9 Revisão da M2a (seis causas), da M3 (configurações do limite, `refund_origin`) e da M3a (design v2.6, 2026-11-15)

**Autor:** `@data-engineer` (Dara) — **Modo:** YOLO — **Entrada:** [architect-design-v2.md](architect-design-v2.md) v2.6 (3.14 C e F, 3.15 B-D e F, seção 10 linhas "v2.5" e "v2.6", M2a, M2b, M3, M3a, "Reversibility", seção 18 item 8), [story.md](story.md) CA 35, 37, 39, 9.8 acima e o estilo de gatilho de 2.2. **Classe de evidência:** somente leitura estática. Nada foi executado; todo o SQL abaixo é **referência, NÃO APLICADO**. O par pt-BR do design não foi relido; esta seção e o par em inglês seguem em sincronia.

**Nota: 9,4 / 10 (atinge a meta de 9,0).** DB-12, DB-13 e DB-14 estão fechados no texto do design (bicondicional estrita da causa, bicondicional e imutabilidade de `settled_external_at`, índice com desempate) e o sexto código consta na restrição de 3.14 C e na seção 10. O modelo de `refund_origin` é sólido. Quatro achados Baixos (DB-18..DB-21); nenhum bloqueia a P5 ou a P5b. É nota de documento; tempos de bloqueio e planos seguem como **HIPÓTESE** até o dry-run e o plano de 9.4 rodarem.

**1. Respostas às duas perguntas abertas do `@architect` (3.15 D, seção 18 item 8)**

| Pergunta | Decisão | Motivo |
|---|---|---|
| `refund_origin` como coluna `INCLUDE` do índice de devoluções `(queue_id, user_id, refunded_at) WHERE refunded_at IS NOT NULL`? | **Não.** Manter o índice como projetado | Uma pessoa tem poucas linhas em uma janela (limite de no máximo 20, janela de no máximo 72 h), então o filtro de origem roda sobre um punhado de linhas do heap. Varredura só de índice exige páginas totalmente visíveis e as linhas de `redemptions` são atualizadas pela liquidação, então o mapa de visibilidade raramente cobriria as páginas recentes: o heap seria visitado de qualquer forma. O `INCLUDE` alarga cada entrada e o job de anulação de 72 h já reescreve entradas. Rever só se o `EXPLAIN (ANALYZE, BUFFERS)` de 9.4 em volume sintético mostrar `Heap Fetches` dominando uma contagem quente medida; isso seria uma nova migração de índice, não edição da M3 |
| O gatilho de guarda congela `refund_origin` depois de gravada? | **Sim, junto com `refunded_at`, em um gatilho pequeno separado, com uma exceção: ambas podem voltar a `NULL` (o job de anulação de 72 h)** | Uma troca de `automatic` para `streamer` (ou um `refunded_at` deslocado) mudaria em silêncio a contagem do limite e, portanto, o comportamento do dinheiro; o `CHECK` não vê valor antigo versus novo. A exceção já é forçada a ser conjunta pelo `CHECK`. Uma função separada evita que a M3 redefina a função de guarda da M2 (a M3 continua sem objetos da M2, regra de acoplamento da seção 10) |

DDL de referência do gatilho (vai na M3, depois das colunas e do `CHECK`):
```sql
-- REFERÊNCIA, NÃO APLICADO
CREATE FUNCTION redemptions_refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.refunded_at IS NOT NULL AND NEW.refunded_at IS NOT NULL
     AND NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
    RAISE EXCEPTION 'refunded_at is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD.refund_origin IS NOT NULL AND NEW.refund_origin IS NOT NULL
     AND NEW.refund_origin <> OLD.refund_origin THEN
    RAISE EXCEPTION 'refund_origin is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;   -- NULL -> valor (primeira gravação) e valor -> NULL (job de anulação) passam
END $$;
CREATE TRIGGER redemptions_refund_guard BEFORE UPDATE OF refunded_at, refund_origin
  ON "redemptions" FOR EACH ROW EXECUTE FUNCTION redemptions_refund_guard();
```

**2. DDL de referência — M2a (seis causas, DB-12..DB-14)** (substitui o trecho de 9.8; o resto de 2.2 vale, com DB-20)
```sql
-- REFERÊNCIA, NÃO APLICADO. M2a, redemptions: anuláveis, sem default (só catálogo)
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_cause"    TEXT,
  ADD COLUMN "settled_external_at" TIMESTAMPTZ(3);

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_cause_check" CHECK (
  ("settlement_cause" IS NULL OR "settlement_cause" IN
     ('policy_wait','cannot_ask','chat_clear','legacy_residue','reentry_cap','batch_deferred'))
  AND (("settlement_state" = 'awaiting_choice') = ("settlement_cause" IS NOT NULL))
) NOT VALID;                                           -- DB-12 (forma estrita)

ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settled_external_check" CHECK (
  ("settlement_state" = 'settled_external') = ("settled_external_at" IS NOT NULL)
) NOT VALID;                                           -- DB-13

CREATE INDEX "redemptions_settled_external_idx"        -- DB-14 (veja DB-18 sobre onde roda)
  ON "redemptions" ("queue_id", "settled_external_at" DESC, "redemption_id" DESC)
  WHERE "settlement_state" = 'settled_external';

-- gatilho de guarda, último comando da M2a (forma final: substitui a função e o gatilho de 2.2)
CREATE FUNCTION redemptions_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settlement_state IN ('intent_recorded','settled_external')
     AND NEW.settlement_state <> OLD.settlement_state THEN
    RAISE EXCEPTION 'settlement_state % is absorbing', OLD.settlement_state USING ERRCODE = '23514';
  END IF;
  IF OLD.group_decision IN ('eligible','not_eligible')
     AND NEW.group_decision IS DISTINCT FROM OLD.group_decision THEN
    RAISE EXCEPTION 'conclusive group_decision is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.settled_external_at IS NOT NULL
     AND NEW.settled_external_at IS DISTINCT FROM OLD.settled_external_at THEN
    RAISE EXCEPTION 'settled_external_at is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER redemptions_settlement_guard
  BEFORE UPDATE OF settlement_state, group_decision, settled_external_at ON "redemptions"
  FOR EACH ROW EXECUTE FUNCTION redemptions_settlement_guard();
```
Notas: `settlement_state` é `NOT NULL`, então as bicondicionais nunca veem `NULL`. As linhas existentes (`none`, as duas colunas `NULL`) satisfazem todas as restrições, então a M2b não pode falhar. A lista de seis códigos é a única mudança em relação a 9.8 (`batch_deferred`; a forma estrita foi adotada em 3.14 C).

**M2b** (arquivo próprio, transação própria; `SHARE UPDATE EXCLUSIVE`): `VALIDATE CONSTRAINT` das três restrições de DE 2.2, de `redemptions_settlement_cause_check` e de `redemptions_settled_external_check` (cinco), e do `CHECK` de status do `outbox` se for recriado `NOT VALID`.

**M2 down** (dentro do `rollback.sql`, depois da guarda existente de DE Q7), nesta ordem:
```sql
-- REFERÊNCIA, NÃO APLICADO
DROP TRIGGER  IF EXISTS redemptions_settlement_guard ON "redemptions";
DROP FUNCTION IF EXISTS redemptions_settlement_guard();
DROP INDEX    IF EXISTS "redemptions_settled_external_idx";   -- e os demais índices da M2a
ALTER TABLE "redemptions"
  DROP CONSTRAINT IF EXISTS "redemptions_settlement_cause_check",
  DROP CONSTRAINT IF EXISTS "redemptions_settled_external_check";   -- inclusive as não validadas
ALTER TABLE "redemptions"
  DROP COLUMN IF EXISTS "settlement_cause",
  DROP COLUMN IF EXISTS "settled_external_at";
-- depois as demais colunas da M2, como em DE 2.2; M2b-down é no-op
```

**3. DDL de referência — M3 (configurações do limite, `refund_origin`)** (as demais colunas e `CHECK`s da M3 da seção 10 valem e não se repetem)
```sql
-- REFERÊNCIA, NÃO APLICADO. M3, queues: um ALTER, só metadados (defaults constantes, sem reescrita)
ALTER TABLE "queues"
  /* ... settlement_on_*, reentry_refund_cap, reentry_window_hours, settlement_policy_rev ... */
  ADD COLUMN "reentry_cap_hold"          TEXT    NOT NULL DEFAULT 'after_n',
  ADD COLUMN "reentry_cap_counts_manual" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "queues" ADD CONSTRAINT "queues_reentry_cap_hold_check"
  CHECK ("reentry_cap_hold" IN ('after_n','at_n'));        -- simples, veja DB-19

-- M3, redemptions
ALTER TABLE "redemptions"
  ADD COLUMN "refunded_at"   TIMESTAMPTZ(3),
  ADD COLUMN "refund_origin" TEXT;
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_refund_origin_check" CHECK (
  (("refund_origin" IS NULL) = ("refunded_at" IS NULL))
  AND ("refund_origin" IS NULL OR "refund_origin" IN ('automatic','streamer'))
) NOT VALID;
-- + o CHECK opcional refunded_at => CANCELED, NOT VALID, só se adotado
-- + o gatilho da seção 1, depois o índice parcial (veja DB-18):
CREATE INDEX "redemptions_refunded_idx" ON "redemptions" ("queue_id","user_id","refunded_at")
  WHERE "refunded_at" IS NOT NULL;

-- M3a (sempre presente desde a v2.6), arquivo e transação próprios
ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_refund_origin_check";
-- + VALIDATE do CHECK opcional de refunded_at se adotado
```
Sem default e sem backfill: nenhuma linha tem `refunded_at` antes da M3, então a restrição vale por construção e a M3a custa só uma varredura (registrar no dry-run a contagem de linhas de `redemptions` e o tempo do `VALIDATE`). O `NOT VALID` já confere toda linha nova ou atualizada a partir da M3.

**M3 down** (guarda primeiro, depois os objetos em ordem de dependência; `rollback.sql`):
```sql
-- REFERÊNCIA, NÃO APLICADO
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "redemptions" WHERE "refunded_at" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "redemptions"
                WHERE "settlement_state" IN ('awaiting_choice','held_for_service','check_group'))
     OR EXISTS (SELECT 1 FROM "queues" WHERE "settlement" = 'refund_on_end') THEN
    RAISE EXCEPTION 'M3 down refused: settlement data in use' USING ERRCODE = '55000';
  END IF;
END $$;                                      -- guarda inalterada; refund_origin só existe com refunded_at
DROP TRIGGER  IF EXISTS redemptions_refund_guard ON "redemptions";   -- antes das colunas: depende delas
DROP FUNCTION IF EXISTS redemptions_refund_guard();
DROP INDEX    IF EXISTS "redemptions_refunded_idx";
ALTER TABLE "redemptions"
  DROP CONSTRAINT IF EXISTS "redemptions_refund_origin_check",
  DROP COLUMN IF EXISTS "refund_origin",
  DROP COLUMN IF EXISTS "refunded_at";
ALTER TABLE "queues"
  DROP CONSTRAINT IF EXISTS "queues_reentry_cap_hold_check",
  DROP COLUMN IF EXISTS "reentry_cap_hold",
  DROP COLUMN IF EXISTS "reentry_cap_counts_manual";
-- + as demais colunas da M3 da seção 10; M3a-down é no-op
```
O `DROP COLUMN` de uma coluna citada na lista `UPDATE OF` de um gatilho falha sem `CASCADE`, daí a remoção explícita do gatilho primeiro. `refund_origin` não precisa de guarda própria: é `NULL` sempre que `refunded_at` é (o `CHECK`).

**4. Ordem.** Aplicar: M1, M2a, M2b, M3, M3a, M4 e, com a P7, M3b. Reverter, ordem inversa estrita: M3b, M4, M3a, M3, M2, M1 (M2b-down e M3a-down são no-ops). Confirmado como está na seção 10; a M3a existe em todo caso.

**5. Achados e correções**

| # | Severidade | Achado | Correção |
|---|---|---|---|
| DB-18 | Baixa | A M2a e a M3 criam índices em `redemptions` no mesmo arquivo do `ALTER TABLE`. O `ACCESS EXCLUSIVE` do `ALTER` dura até o fim do arquivo, então a varredura do índice (`SHARE`, que já bloqueia escritas) passa a bloquear também leituras. É a mesma lição do DB-2, agora para índices | Ou rodar a criação dos índices de `redemptions` no arquivo de validação (M2b, M3a: o arquivo passa a "validar e indexar"; nada lê esses índices antes da P7), ou mantê-los e registrar os tempos de bloqueio no dry-run com o app parado (já é o plano). Recomendado: mover; `CREATE INDEX CONCURRENTLY` não é necessário com o app parado e é **HIPÓTESE** sob a transação implícita do Prisma |
| DB-19 | Baixa | A seção 10 pede os `CHECK`s de conjunto fechado de `queues` como `NOT VALID` e depois `VALIDATE` no mesmo arquivo. Em tabela com poucas linhas, na mesma transação, isso não ganha nada sobre um `ADD CONSTRAINT` simples (o `ACCESS EXCLUSIVE` é mantido de qualquer forma) | `ADD CONSTRAINT` simples em `queues`; manter `NOT VALID` mais `VALIDATE` separado só em `redemptions` e `outbox` |
| DB-20 | Baixa | O `redemptions_settlement_values_check` de DE 2.2 ainda lista cinco estados, sem `settled_external` (linha 96); copiar 2.2 faria a primeira gravação de `settled_external` falhar com `23514` | A regeneração da M2a (N-4) deve listar seis estados e usar as formas do DB-1 no `CHECK` de estado; o teste de 9.8 item 3 (gravar `settled_external`) pega o erro. 2.2 não é seguro para copiar: segue marcada como substituída |
| DB-21 | Baixa | O design deixa o gatilho e o `INCLUDE` em aberto (3.15 D) | Fechado na seção 1: sem `INCLUDE`; um gatilho separado congela `refunded_at` e `refund_origin`, com a exceção conjunta para `NULL`. O `@architect` registra na seção 10 |

DB-15, DB-16 e DB-17 (3.14 F) estão **confirmados como trabalho da P7**: DB-15 (uma consulta agrupada de contagens, `EXPLAIN` em 1 milhão de linhas, segundo índice só se o plano mostrar desperdício), DB-16 (`total` é contagem real, sinalizador `truncated`), DB-17 (o payload `settlementCause` usa a mesma lista fechada ou é descartado). Nenhum toca a M2a, a M3 ou a M3a. DB-12..DB-14 podem ser dados como fechados no próximo índice da story.

**6. Acréscimos ao plano de testes de 9.4 e 9.8** (`tests/integration/ops31-migrations-postgres.test.js`)
1. `CHECK` da causa com seis códigos: cada um aceito só em `awaiting_choice`; `batch_deferred` aceito; código desconhecido recusado; `awaiting_choice` com causa `NULL` recusado (forma estrita); código em qualquer outro estado recusado.
2. Matriz do `CHECK` de `refund_origin`: origem e `refunded_at` ambos `NULL` ou ambos preenchidos; valor fora do conjunto recusado; origem sem `refunded_at` e o inverso recusados.
3. `redemptions_refund_guard`: alterar origem ou `refunded_at` depois de gravada é recusado (`23514`); primeira gravação de `NULL` para valor passa; o comando do job de anulação (ambos para `NULL`) passa.
4. `queues`: `reentry_cap_hold` fora do conjunto recusado; linha pré-existente lê os defaults `after_n` e `true`.
5. M3 up com dados semeados, depois a M3a: `convalidated` verdadeiro; M3 down recusada com qualquer `refunded_at` preenchido e funcional quando não houver; após a M3 down, os checksums das colunas originais de `redemptions` e `queues` são iguais; o gatilho some; a ordem inversa M3b, M4, M3a, M3, M2, M1 deixa `_prisma_migrations` linear.
6. `EXPLAIN` da consulta de contagem com e sem o filtro de origem em volume sintético, como evidência do índice parcial (plano, sem asserção de tempo).

**Conclusão.** A M2a com seis causas, a M3 com as duas configurações do limite e `refund_origin`, e a M3a sempre presente estão certas para o modelo de dados. Registrar DB-18..DB-21 na seção 10 (uma frase cada); nenhum bloqueia a P5 ou a P5b. Projeção de 9,5 depois que o plano rodar verde em PostgreSQL 18 isolado; a projeção não é resultado.
