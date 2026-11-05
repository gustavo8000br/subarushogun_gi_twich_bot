# OPS-21 — Modelo de dados e plano de migration (máquina de estados de idempotência do painel, fatia 4)

[English](../../../stories/OPS-21/data-model.md)

**Autoria:** `@data-engineer` (Dara), 2026-10-22. **Story:** [story.md](story.md) (CA 17–30). **Decisão:** [api-contract-decision.md](../OPS-15/api-contract-decision.md) (D4.1–D4.9, §7 Q1–Q6, §9 fatia 4, §11). **Pesquisa:** [api-contract-research.md](../OPS-15/api-contract-research.md); linhas 13/14 do [research-index.md](../../research-index.md) (SUFICIENTE, nenhuma pesquisa nova feita).
**Natureza:** apenas gate de planejamento. Nenhum arquivo de migration, código, comando de banco ou Docker foi criado ou executado. O comportamento atual descrito abaixo vem de leitura somente de `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/202610020001_foundation/migration.sql`, `apps/api/src/persistence/queue-repository.mjs` e `apps/api/src/http/queue-routes.mjs` em `feat/ops-15-next-panel`. Motor-alvo: `postgres:18.6-bookworm`, Prisma 6.19 (igual ao [modelo de dados da OPS-20](../OPS-20/data-model.md)).

## 0. Fatos de base

| Fato | Fonte |
|---|---|
| `processed_operations(operation_key TEXT PK, result JSONB NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`. Nenhuma outra coluna, nenhum índice além da PK, sem `updated_at`. | migration foundation; `ProcessedOperation` no `schema.prisma` |
| Linhas do painel: `beginPanelOperation` faz `create` com `result = { kind: 'panel_mutation', fingerprint, state: 'processing' }`; em violação de unicidade faz `findUnique` e classifica (conflict / replay / in_progress). `completePanelOperation` é **ler-depois-escrever** (`findUnique` e depois `update`), não condicional. | `queue-repository.mjs` 285–305 |
| Chave: `panel:${localSession.id ?? 'unknown'}:${key}`; regex `^[A-Za-z0-9._:-]{8,128}$`. Fingerprint = SHA-256 hex de `{ method, url, body }` (a url inclui a query string). | `queue-routes.mjs` 13–16, 119–127 |
| A conclusão roda no `onSend`, fora de qualquer transação de domínio, e é pulada para `statusCode >= 500` (`processing` preso). | `queue-routes.mjs` 139–152 (N3, N7) |
| Outros escritores na mesma tabela: `chat-message:<id>` (`{ status }`, sem `kind`), `chat-viewer-cooldown:<canal>:<usuário>` (`{ lastAcceptedAt }`, upsert), ambos sob `pg_advisory_xact_lock`; `queue.local_archive.challenge:<sha256>` com `result.kind = 'queue_local_archive_challenge'` e **seu próprio `state` em JSON (`issued` / `completed`)**. | `queue-repository.mjs` 398–425, 592–665 |
| Não há RLS em nenhuma migration; o único cliente do banco é a API/worker via Prisma com um papel. | grep em `apps/api/prisma/migrations` |
| Convenção: `TEXT` + `CHECK` nomeado, nunca `ENUM` do PG. | modelo de dados OPS-20 §1; `20261007190000_queue_admission_modes` |

Consequência do fato do desafio de arquivamento: uma coluna nova chamada `state` precisa ser **restrita às linhas do painel por CHECK**, ou pareceria uma segunda fonte de verdade para o `state` em JSON do desafio. O desenho abaixo mantém toda coluna nova `NULL`/padrão para linhas que não são do painel.

## 1. Respostas ao §7 da decisão

**Q1 — Colunas ou JSON.** Colunas. Um `UPDATE` condicional por caminho JSON (`WHERE result->>'state' = 'processing' AND (result->>'leaseUntil')::timestamptz < now()`) também é atômico em READ COMMITTED (o `UPDATE` único toma o lock da linha e o PostgreSQL reavalia o `WHERE` na versão mais nova da linha depois de esperar — EvalPlanQual), então atomicidade não decide. Colunas vencem porque: (a) lease e estado ganham `CHECK` (um erro de digitação não cria um quarto estado); (b) os predicados do reaper e da tomada viram predicados de índice parcial sem índices de expressão sobre casts; (c) o desafio de arquivamento já usa `result.state` com outros valores, então estado em JSON exigiria filtro por `kind` em todo predicado de qualquer forma. A primitiva atômica é **um único `UPDATE ... RETURNING` condicional** (§3), nunca `findUnique` + `update`.

**Q2 — Backfill das linhas legadas.** As linhas `panel_mutation` existentes têm chaves `panel:<sessão>:<chave>`; depois da D4.6 elas nunca mais casam (o prefixo novo é `panel:v2:`). Apagar é seguro, mas a migration é **só de expansão** e não apaga: faz backfill para `kind = 'panel_mutation'`, `state = 'completed'`, `lease_until = NULL`, `updated_at = created_at`, `attempt_count = 0`. Como `updated_at` é o horário antigo de criação, a primeira execução do reaper depois do deploy (início da API) apaga toda linha legada com mais de 24 h, e o restante em até 24 h. Linhas legadas em `processing` também viram `completed` (não `failed_retryable`): não casam com nada, então o estado só decide qual ramo do reaper as remove, e `completed` sem lease é a linha mais simples que satisfaz o CHECK.
**Consequência de retenção:** o id de sessão cru some de `processed_operations` no máximo 24 h depois do primeiro início da API na versão nova. Ele **permanece** em `audit_logs.actor_id` (append-only, nunca removido por esta story). Isso mantém a opção A bloqueada (CA 16, D5.3); limpar exige uma story separada (HMAC ou id de operador não secreto, mais uma decisão sobre reescrever linhas históricas de auditoria). Antes de reiniciar a API na versão nova, as sessões a que esses ids pertencem já morreram (store em memória), então o resíduo é um valor obsoleto, não uma credencial viva.

**Q3 — Linhas que não são do painel.** Mesma tabela, sem divisão. Todas as colunas novas são anuláveis ou têm padrão constante, então os escritores de chat e do desafio de arquivamento (`create`/`upsert` só com `operationKey` e `result`) continuam funcionando sem mudança; um `CHECK` restrito obriga essas linhas a manter toda coluna do painel `NULL`/`0`. Uma tabela separada seria mais limpa, mas exigiria migration com movimentação de dados e uma segunda superfície de idempotência sem ganho neste volume. [AUTO-DECISION] Separar as linhas do painel em `panel_operations`? → Não (motivo: o CA 17 pede mudança aditiva em `processed_operations`; restringir por CHECK dá o mesmo isolamento).

**Q4 — Índices.** Dois índices parciais pequenos valem a pena mesmo com volume baixo, porque a tabela **não** tem volume baixo: cada mensagem de chat grava uma linha `chat-message:*` que hoje nunca é apagada, então o reaper não pode fazer seq scan de uma tabela crescente a cada intervalo. A tomada usa só a PK. Ver §4.

**Q5 — Conclusão dentro da transação de domínio.** Recomendação: **fora na fatia 4, dentro como opção por rota na fatia 5.**
- A fatia 4 mantém a conclusão no `onSend` (fora), mas a transforma num `UPDATE` condicional **com fencing** (§3.3, `attempt_count` como token de fencing). É a menor mudança que corrige o S-04 e é segura porque toda rota começa `terminal_unknown`: uma queda entre o commit de domínio e a conclusão deixa `processing`; depois do lease, a tomada grava `OPERATION_OUTCOME_UNKNOWN` e nunca reexecuta.
- Dentro da transação fecha o N7 apenas na parte de **banco**: a mudança de domínio e a linha `completed` sofrem commit ou rollback juntas. **Não** fecha o N7 para chamadas à Twitch feitas antes ou depois da transação (o efeito externo está fora do PostgreSQL). Viabilidade: o repositório já expõe métodos `*InTransaction(tx, ...)` e `withQueueTransaction`; a rota passaria um callback `completeInTx(tx, { statusCode, responseBody })`, e o corpo gravado passa a ser o resultado de domínio serializado pela rota, não o payload HTTP final do `onSend`. Custo: encanamento por rota, a linha processada fica bloqueada durante a transação de domínio (aceitável, um operador) e o caminho do `onSend` passa a pular linhas já concluídas (o `UPDATE` com fencing retorna 0 linhas — inofensivo). Portanto é uma **guarda de domínio válida para promoção a `reexecutable`** apenas para rotas sem chamada externa depois do commit; a fatia 5 registra isso por rota.
- **Alerta N7:** até a fatia 5 provar uma rota, uma tomada de lease nunca pode reexecutá-la. Isso é garantido no código pela classe da rota, não pelo esquema; o esquema só garante um único vencedor.

**Q6 — Segurança da migration.** Confirmado aditivo: `ADD COLUMN` anulável ou com padrão constante (só metadados desde o PG 11, sem reescrita de tabela no PG 18), constraints adicionadas `NOT VALID` e depois validadas, `CREATE INDEX` simples e pequeno, um `UPDATE` de backfill limitado às linhas do painel. As fixtures PostgreSQL da QRA tocam só a linha do desafio de arquivamento via `findUnique`/`update` com `result`; continuam funcionando, e `postgres-foundation.test.js` lista tabelas, não colunas. A reversão é por migration futura (§6).

## 2. Colunas

| Coluna (BD) | Campo Prisma | Tipo | Nulo / padrão | Linhas do painel | Outras linhas |
|---|---|---|---|---|---|
| `kind` | `kind` | `TEXT` | `NULL` | `'panel_mutation'` | `NULL` |
| `state` | `state` | `TEXT` | `NULL` | `processing` \| `completed` \| `failed_retryable` | `NULL` |
| `fingerprint` | `fingerprint` | `TEXT` | `NULL` | SHA-256 hex (copiado de `result.fingerprint` no backfill) | `NULL` |
| `lease_until` | `leaseUntil` | `TIMESTAMPTZ(3)` | `NULL` | definido só enquanto `processing` | `NULL` |
| `attempt_count` | `attemptCount` | `INTEGER` | `NOT NULL DEFAULT 0` | `1` na inserção, `+1` por tomada/nova tentativa; token de fencing | `0` |
| `updated_at` | `updatedAt` | `TIMESTAMPTZ(3)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | definido explicitamente a cada transição | padrão na inserção; nunca usado |

- `result` continua `JSONB NOT NULL`. As linhas do painel mantêm `result.kind`/`result.fingerprint` (imutáveis, gravados uma vez, úteis para rollback do código antigo, §6) mais `statusCode`/`responseBody` quando `completed`. `result.state` **deixa de ser gravado**; a coluna é a única fonte de verdade.
- `updated_at` **não** é `@updatedAt` no Prisma (isso só funciona em escritas do Prisma e mudaria silenciosamente o significado das linhas de cooldown do chat); o SQL o define.
- Fonte de tempo: **relógio do banco** (`statement_timestamp()`), não o relógio do Node, para que comparações de lease e cortes do reaper usem um único relógio entre reinícios da API. Os testes movem o tempo escrevendo `lease_until`/`updated_at` diretamente.

### 2.1 Constraints (nomeadas, no estilo de `queues_*_check`)

```sql
CONSTRAINT "processed_operations_kind_check"
  CHECK ("kind" IS NULL OR "kind" = 'panel_mutation'),
CONSTRAINT "processed_operations_panel_columns_check" CHECK (
  ("kind" IS NULL
     AND "state" IS NULL AND "fingerprint" IS NULL AND "lease_until" IS NULL AND "attempt_count" = 0)
  OR
  ("kind" = 'panel_mutation'
     AND "state" IN ('processing', 'completed', 'failed_retryable')
     AND "fingerprint" IS NOT NULL
     AND "attempt_count" >= 0
     AND ("state" = 'processing') = ("lease_until" IS NOT NULL)
     AND "operation_key" LIKE 'panel:%')
)
```

- Escritores que não são do painel não viram linhas do painel por acidente, e linhas do painel não perdem o lease enquanto `processing` nem o mantêm depois.
- `operation_key LIKE 'panel:%'` aceita chaves legadas `panel:<sessão>:` e novas `panel:v2:`. A regra de ≥ 32 caracteres (decisão do proprietário 3) é aplicada na rota (ela valida a chave do cliente, não a chave gravada), não por CHECK.

## 3. SQL atômico (tudo via `$queryRaw`, instruções únicas, em autocommit ou dentro da transação de quem chama)

`$1` = `panel:v2:<chave>`, `$2` = fingerprint, `$3` = `attempt_count` de fencing, lease = `interval '60 seconds'`.

### 3.1 Início

```sql
INSERT INTO processed_operations (operation_key, result, kind, state, fingerprint, lease_until, attempt_count, updated_at)
VALUES ($1, jsonb_build_object('kind','panel_mutation','fingerprint',$2), 'panel_mutation', 'processing', $2,
        statement_timestamp() + interval '60 seconds', 1, statement_timestamp())
ON CONFLICT (operation_key) DO NOTHING
RETURNING attempt_count;
```

Uma linha → `started` (o dono detém `attempt_count = 1`). Zero linhas → passo 3.2. `ON CONFLICT DO NOTHING` substitui a captura atual da violação de unicidade (sem instrução abortada dentro de uma transação de quem chama).

### 3.2 Tomada (a classe da rota decide qual instrução; nunca as duas)

Rota `reexecutable` — toma um lease expirado ou uma linha `failed_retryable` e executa de novo:

```sql
UPDATE processed_operations
   SET state = 'processing', lease_until = statement_timestamp() + interval '60 seconds',
       attempt_count = attempt_count + 1, updated_at = statement_timestamp()
 WHERE operation_key = $1 AND kind = 'panel_mutation' AND fingerprint = $2
   AND ((state = 'processing' AND lease_until < statement_timestamp()) OR state = 'failed_retryable')
RETURNING attempt_count;
```

Rota `terminal_unknown` — um lease expirado é resolvido sem reexecução:

```sql
UPDATE processed_operations
   SET state = 'completed', lease_until = NULL, updated_at = statement_timestamp(),
       result = result || jsonb_build_object('statusCode', 503,
                 'responseBody', jsonb_build_object('code', 'OPERATION_OUTCOME_UNKNOWN'))
 WHERE operation_key = $1 AND kind = 'panel_mutation' AND fingerprint = $2
   AND state = 'processing' AND lease_until < statement_timestamp()
RETURNING result->'statusCode' AS status_code, result->'responseBody' AS response_body;
```

Uma linha → vencedor (reexecuta com o `attempt_count` retornado, ou faz replay do 503 gravado). Zero linhas → outro é o dono ou a linha não pode ser tomada; então uma leitura **apenas de classificação** (`SELECT kind, state, fingerprint, lease_until, result ... WHERE operation_key = $1`): sem linha (removida pelo reaper nesse meio-tempo) → repete 3.1 uma vez; `kind IS NULL` ou outro fingerprint → 422 `IDEMPOTENCY_KEY_REUSED`; `completed` → replay; `processing` com lease válido → 409 `PANEL_OPERATION_ALREADY_IN_PROGRESS` + `Retry-After: 2`; `failed_retryable` numa rota `terminal_unknown` → ver pergunta 1 ao arquiteto. A leitura nunca decide a posse, então não é ler-depois-escrever.

**Exatamente um vencedor:** em READ COMMITTED, `UPDATE`s concorrentes na mesma PK se serializam no lock da linha; o perdedor reavalia o `WHERE` contra a versão confirmada do vencedor (`state = 'processing'` com lease novo, ou `completed`) e casa 0 linhas.

### 3.3 Conclusão e falha (com fencing)

```sql
-- 2xx/4xx, ou 5xx numa rota terminal_unknown (corpo = {code:'OPERATION_OUTCOME_UNKNOWN'}, status 503)
UPDATE processed_operations
   SET state = 'completed', lease_until = NULL, updated_at = statement_timestamp(),
       result = result || jsonb_build_object('statusCode', $4::int, 'responseBody', $5::jsonb)
 WHERE operation_key = $1 AND fingerprint = $2 AND state = 'processing' AND attempt_count = $3
RETURNING 1;

-- 5xx numa rota reexecutable
UPDATE processed_operations
   SET state = 'failed_retryable', lease_until = NULL, updated_at = statement_timestamp(),
       result = result - 'statusCode' - 'responseBody'
 WHERE operation_key = $1 AND fingerprint = $2 AND state = 'processing' AND attempt_count = $3
RETURNING 1;
```

O fencing `attempt_count = $3` impede que um dono original lento (cujo lease expirou e foi tomado) sobrescreva o resultado do novo dono. Zero linhas → registra só `code` + hash truncado da chave (CA 26) e mantém a resposta; o cabeçalho `idempotency-store: pending` continua como hoje. Replays nunca gravam nem reenviam cabeçalhos (CA 23); a substituição do corpo do segredo de uso único do overlay continua na rota.

## 4. Índices

```sql
CREATE INDEX "processed_operations_panel_finished_idx"
  ON processed_operations (updated_at)
  WHERE kind = 'panel_mutation' AND state IN ('completed', 'failed_retryable');

CREATE INDEX "processed_operations_panel_lease_idx"
  ON processed_operations (lease_until)
  WHERE kind = 'panel_mutation' AND state = 'processing';
```

- Ambos servem só ao reaper (§5); início, tomada e conclusão usam a PK. O tamanho é limitado a 24 h de mutações do painel (centenas de linhas), e as linhas de chat ficam fora pelo predicado.
- `CREATE INDEX` simples (não `CONCURRENTLY`): mantém um lock `SHARE` (bloqueia escritas, não leituras) durante a construção numa tabela pequena; `CONCURRENTLY` não roda dentro de bloco de transação e adiciona modos de falha (índice inválido) que não compensam aqui. Reavaliar se `processed_operations` passar de ~1 M de linhas (crescimento do chat) — ver risco R5.

## 5. Reaper (processo da API: no início e a cada N minutos; não o worker)

```sql
WITH doomed AS (
  SELECT operation_key FROM processed_operations
   WHERE kind = 'panel_mutation'
     AND ((state IN ('completed', 'failed_retryable') AND updated_at < statement_timestamp() - interval '24 hours')
       OR (state = 'processing' AND lease_until < statement_timestamp() - interval '24 hours'))
   ORDER BY operation_key
   LIMIT 500
   FOR UPDATE SKIP LOCKED
)
DELETE FROM processed_operations p USING doomed d
 WHERE p.operation_key = d.operation_key
RETURNING 1;
```

- Repetir enquanto um lote retornar 500 linhas, cada lote em sua própria transação curta; parar após um número limitado de lotes por execução. `SKIP LOCKED` faz o reaper nunca esperar por uma linha que uma tomada ou conclusão está atualizando, e nunca bloqueá-las por mais de um lote.
- `kind = 'panel_mutation'` é a guarda rígida: linhas de chat e do desafio de arquivamento (`kind IS NULL`) nunca são selecionadas (CA 24). A retenção delas está fora do escopo.
- O relógio de retenção é `updated_at` (hora do último resultado), então um replay gravado fica disponível por 24 h após a conclusão, não após a criação. As linhas legadas (backfill `updated_at = created_at`) saem na primeira execução.
- Uma tomada correndo contra a remoção de uma linha expirada há mais de 24 h: o `UPDATE` espera o commit do reaper, não encontra linha, retorna 0; a leitura de classificação não encontra nada e 3.1 reinsere. Correto, porque um lease expirado há 24 h significa que a requisição original já acabou há muito tempo.
- Usar `SET LOCAL lock_timeout = '2s'` por lote; um timeout pula a execução e registra um código, nunca derruba a API.

## 6. Plano de migration (só expansão)

Migration única, por exemplo `2026102xxxxxxx_panel_operation_lease` (nome escolhido pelo `@dev` na implementação; timestamp depois de qualquer migration da OPS-20 que entrar antes, ambas mexem no `schema.prisma`):

1. `SET lock_timeout = '5s'; SET statement_timeout = '60s';` — falhar rápido em vez de enfileirar atrás de uma transação viva da API; o deploy roda com a API parada (`prisma migrate deploy` antes do início), então não se espera contenção.
2. Um `ALTER TABLE processed_operations ADD COLUMN kind TEXT, ADD COLUMN state TEXT, ADD COLUMN fingerprint TEXT, ADD COLUMN lease_until TIMESTAMPTZ(3), ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0, ADD COLUMN updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;` — `ACCESS EXCLUSIVE` por milissegundos; padrões constantes/estáveis ficam no catálogo (sem reescrita). Linhas existentes que não são do painel recebem `updated_at` = hora da migration; inofensivo (nunca lido para elas).
3. Backfill (limitado às linhas do painel, que são poucas): `UPDATE processed_operations SET kind = 'panel_mutation', state = 'completed', fingerprint = COALESCE(result->>'fingerprint', ''), lease_until = NULL, attempt_count = 0, updated_at = created_at WHERE result->>'kind' = 'panel_mutation';` — o `COALESCE` mantém o CHECK satisfazível para qualquer linha legada malformada (ela não casa com nada de qualquer forma).
4. `ADD CONSTRAINT ... CHECK (...) NOT VALID` para as duas constraints, depois `VALIDATE CONSTRAINT` (só `SHARE UPDATE EXCLUSIVE`).
5. Os dois `CREATE INDEX` (§4).
6. Esquema Prisma: campos novos opcionais com `@map`, `attemptCount Int @default(0)`, `updatedAt DateTime @default(now())` (sem `@updatedAt`). Código de chat e do desafio de arquivamento sem mudança.

Risco de duração: os passos 2, 4 e 5 escalam com o tamanho da tabela por causa das linhas de chat (validação e avaliação do predicado do índice varrem a tabela). Nos tamanhos esperados (≤ 10^5 linhas) isso leva de menos de um segundo a poucos segundos; o `statement_timeout` transforma uma tabela inesperadamente grande numa falha limpa, não num deploy travado. Sem `ENUM`, sem mudança de tipo, sem mudança de padrão em colunas existentes, sem `DROP`.

## 7. Snapshot e rollback

- **Snapshot antes do deploy:** `pg_dump --table=processed_operations --format=custom` do banco do produto para um caminho dentro do projeto (nunca uma tabela de backup no banco). A migration só adiciona; o snapshot protege contra um backfill ruim.
- **Rollback de código (preferido):** o código antigo ignora as colunas novas. Ele lê `result.kind`/`result.fingerprint` (mantidos) e suas chaves `panel:<sessão>:` nunca casam com linhas `panel:v2:`, então as linhas v2 ficam inertes. Linhas gravadas pelo código antigo têm colunas com `kind IS NULL` e `result.kind = 'panel_mutation'` → passam no CHECK (ramo não-painel). Voltar para a versão nova exige reexecutar o backfill do passo 3 (idempotente, acrescentando `AND kind IS NULL`) para que o reaper as veja; a migration futura ou o início da API precisa incluí-lo.
- **Rollback de esquema:** uma migration futura que remove os dois índices, as duas constraints e as seis colunas. Remover colunas é destrutivo e exige aprovação explícita do proprietário; não faz parte deste plano.

## 8. RLS

Não se aplica. É um PostgreSQL local de operador único (não Supabase/PostgREST): não há papéis `anon`/`authenticated`, nenhum cliente se conecta direto ao banco e as linhas não têm posse por usuário. A autorização está na API (verificações de host, origem, sessão e CSRF no `onRequest`). Ativar RLS acrescentaria políticas para o único papel da aplicação e não protegeria nada. Reavaliar só se surgir um segundo papel de banco ou acesso direto de cliente.

## 9. Testes de integração em nível SQL (PostgreSQL 18 descartável, migrations Prisma reais; sem SQLite, sem mocks de Prisma)

Testes de corrida usam **duas ou mais conexões reais** (duas instâncias de `PrismaClient` ou dois clientes `pg`); o entrelaçamento é forçado de forma determinística mantendo um lock de linha numa transação aberta na conexão A (`BEGIN; SELECT ... FOR UPDATE` ou o `UPDATE` de tomada sem commit) enquanto a conexão B emite sua instrução, e depois fazendo commit em A.

| # | Teste | Esperado |
|---|---|---|
| T1 | Migration aplicada num banco vazio e num banco com linhas legadas (painel `processing`, painel `completed`, mensagem de chat, cooldown de chat, desafio de arquivamento `issued`) | Linhas legadas do painel → `completed`, sem lease, `updated_at = created_at`; outras linhas com todas as colunas do painel `NULL`/`0`, `result` idêntico byte a byte |
| T2 | CHECK: inserir linha não-painel com `state`; linha do painel `processing` sem lease; `completed` com lease; `state = 'done'`; `kind = 'other'` | Cada uma rejeitada (`23514`) |
| T3 | Escritores inalterados: rodar os caminhos do repositório de cooldown/mensagem de chat e emissão/confirmação do desafio de arquivamento depois da migration | Mesmos resultados de antes; colunas continuam `NULL`/`0` |
| T4 | Início duas vezes em paralelo com a mesma chave (2 conexões) | Exatamente uma linha no `INSERT ... RETURNING`; a outra recebe 0 e classifica `in_progress` |
| T5 | Preso após 5xx: 5xx `terminal_unknown` conclui com 503 `OPERATION_OUTCOME_UNKNOWN` gravado; 5xx `reexecutable` → `failed_retryable`, sem corpo | Estados conforme descrito; replay retorna o código 503; nova tentativa com a mesma chave reexecuta uma vez |
| T6 | Tomada de lease expirado (`lease_until` no passado) para cada classe | `reexecutable`: `attempt_count` 2, lease novo; `terminal_unknown`: `completed` com 503 gravado, sem reexecução |
| T7 | Tomada concorrente, 2 e 5 conexões, lease expirado | Exatamente uma linha retornada no total; perdedores 0 linhas → classificação 409 |
| T8 | Lease válido | Tomada 0 linhas; classificação → 409 + `Retry-After: 2` |
| T9 | Fingerprint divergente (mesma chave, outro corpo/url) em cada estado | 0 linhas na tomada; classificação → 422 `IDEMPOTENCY_KEY_REUSED` |
| T10 | Replay de `completed` | Status/corpo gravados retornados; nenhum cabeçalho gravado em `result` |
| T11 | Fencing: lease do dono A (tentativa 1) expira, B toma (tentativa 2), A conclui com `attempt_count = 1` | `UPDATE` de A com 0 linhas; resultado de B mantido |
| T12 | Reaper preserva linhas não-painel: semear linhas antigas (> 24 h de `created_at`) de chat, cooldown e desafio de arquivamento, mais linhas do painel em cada estado com 23 h / 25 h | Só são apagadas linhas do painel `completed`/`failed_retryable` com `updated_at` > 24 h e `processing` com lease expirado há > 24 h |
| T13 | Lotes do reaper: 1 200 linhas elegíveis, lote de 500 | 3 lotes, todas apagadas, não-painel intactas |
| T14 | Reaper contra tomada (2 conexões): A mantém o lock da linha via tomada numa transação aberta; o reaper roda | O reaper pula a linha bloqueada (`SKIP LOCKED`), não espera; depois do commit de A a linha não é elegível |
| T15 | Reaper apaga linha expirada há > 24 h enquanto a tomada de B espera | B recebe 0 linhas, a classificação não encontra nada, a reinserção funciona uma vez |
| T16 | Isolamento de chave legada: linha legada `panel:<sessão>:<k>` mais requisição com `panel:v2:<k>` | Sem correspondência; linha nova criada; a primeira execução do reaper apaga a legada |
| T17 | Conclusão dentro de transação de domínio (insumo da fatia 5): mudança de domínio + conclusão com fencing numa tx, depois rollback forçado | Ambas desfeitas; a linha continua `processing` com lease |
| T18 | `EXPLAIN` do predicado do reaper numa tabela com 10^5 linhas de chat | Usa os índices parciais, sem seq scan nas linhas de chat |
| T19 | Testes de forma atualizados explicitamente: `postgres-foundation`, `qra-postgres-fixtures`, em andamento do `queue-repository` (`:641,654`) e desafio de arquivamento (`:1807,1868`) | Verdes com asserções explícitas, sem afrouxar |

Classe de evidência de todos: **API/PostgreSQL descartável**. O comportamento 409/422/`Retry-After` no nível da rota também precisa de testes de integração HTTP (plano do `@qa`); estas linhas provam só o contrato SQL.

## 10. Interação com a OPS-20

- A OPS-20 grava `refund_eligibility_decisions` e o outbox financeiro da FND-3 (`financial:{redemption_id}`) dentro de suas transações de domínio; este desenho não toca nenhuma dessas tabelas. Suas novas mutações de painel começam `terminal_unknown`; uma tomada de lease nelas grava `OPERATION_OUTCOME_UNKNOWN` e não consegue recriar uma decisão ou linha de outbox.
- Para a fatia 5, as rotas da OPS-20 têm guardas fortes para citar: a PK da decisão (uma por resgate) e o `idempotency_key` UNIQUE do outbox. A conclusão dentro da transação (Q5) é viável ali; qualquer chamada à Twitch depois do commit ainda impede a promoção.
- As duas stories mudam o `schema.prisma` e adicionam uma migration; a que entrar depois renomeia o timestamp da sua migration e faz rebase. Não há dependência de ordem entre os DDLs.

## 11. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | N7: uma tomada reexecuta uma operação já confirmada numa rota promovida por engano | Padrão `terminal_unknown`; promoção só com prova no estilo do T17 por rota; o fencing impede conclusão dupla, não execução dupla |
| R2 | Lease (60 s) menor que uma requisição real (N8) | Timeouts do CA 25 antes de o lease entrar; o fencing (T11) limita o dano ao resultado gravado |
| R3 | Rollback de código e depois volta deixam linhas do painel com `kind IS NULL` que o reaper nunca vê | Backfill idempotente repetido na volta (§7) |
| R4 | O id de sessão permanece em `audit_logs.actor_id` indefinidamente | Fora do escopo; mantém a opção A bloqueada; story separada |
| R5 | Linhas `chat-message:*` crescem sem limite (pré-existente), deixando DDL futuro nesta tabela mais lento | Não alterado aqui; sinalizar para uma story de retenção; `statement_timeout` na migration |
| R6 | Divergência entre relógio do banco e do Node nos testes | Todos os horários de lease/reaper vêm de `statement_timestamp()`; os testes escrevem as colunas diretamente |

## 12. Perguntas para o `@architect`

1. Uma chave em `failed_retryable` (gravada quando sua rota era `reexecutable`) é tentada de novo depois que a rota volta a `terminal_unknown`: replay de `OPERATION_OUTCOME_UNKNOWN` ou reexecução? Proposta: concluir com `OPERATION_OUTCOME_UNKNOWN` (lado seguro). A linha deve gravar a classe da rota no início (`route_class TEXT`) para deixar isso explícito?
2. Confirmar o relógio do banco (`statement_timestamp()`) como fonte única de tempo para lease e retenção.
3. Confirmar que `result.kind`/`result.fingerprint` continuam em escrita dupla para compatibilidade de rollback até a fatia 7, e que `result.state` deixa de ser gravado.
4. Intervalo do reaper (proposta: a cada 15 minutos, lote de 500, no máximo 10 lotes por execução).

## 13. Veredito do gate

**GO** para o planejamento da implementação da fatia 4 pelo lado de dados: §7 Q1–Q6 respondidas, migration desenhada (só expansão, sem reescrita, reversível por migration futura), SQL atômico e lista de testes definidos. Condições antes do merge da fatia 4: timeouts do CA 25 verificados, respostas do arquiteto às perguntas 1–2 do §12, T1–T19 em Red-first num PostgreSQL descartável. Nada aqui foi executado; é um desenho, não evidência.
