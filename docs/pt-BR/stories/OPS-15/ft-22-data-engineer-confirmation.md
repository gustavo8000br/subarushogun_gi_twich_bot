# FT-22 (#90) — Confirmação escrita do `@data-engineer`: `outbox.payload` guarda `{ previousPosition }`

- **Data:** 2026-10-28
- **Agente:** `@data-engineer` (Dara)
- **Escopo:** o gate da story OPS-15, seção "Fatias FT-21 e FT-22", FT-22 ("confirmação escrita do `@data-engineer` de que o JSON de `outbox.payload` guarda `{ previousPosition }` sem DDL"), e a linha da FT-22 em `docs/process/backlog-inventory.md`.
- **Método:** leitura estática do schema, das migrations reais e do código deste checkout. Nenhum banco foi consultado, nenhum Docker foi iniciado, nenhum teste foi executado e nada foi implementado. Este documento é uma confirmação de desenho, não evidência de execução.

## Decisão

**CONFIRMADO, SEM MIGRAÇÃO.** `outbox.payload` é o lugar certo para `{ previousPosition }`. A FT-22 não precisa de DDL, de índice novo, de mudança de constraint nem de backfill. O `@dev` pode iniciar a FT-22 (depois da FT-21, mesmo arquivo `chat-handler.mjs`).

## Evidências

| # | Fato | Local |
|---|------|-------|
| E1 | `payload` é `JSONB NOT NULL DEFAULT '{}'::jsonb`, sem CHECK e sem restrição de formato JSON no conteúdo. | `apps/api/prisma/migrations/202610020001_foundation/migration.sql:91` |
| E2 | Nenhuma migration posterior altera `payload` (as migrations seguintes da outbox só mexem em `lease_token` e no CHECK de `status`). | `202610030001_outbox_lease_token/migration.sql:1`, `202610050001_manual_outbox_resolution/migration.sql:1-2`, `20261014230000_outbox_deletion_cancel_verification/migration.sql:1-2` |
| E3 | O Prisma mapeia como `payload Json @default("{}")`; o único índice da outbox é `(status, next_attempt_at)`. | `apps/api/prisma/schema.prisma:117,130` |
| E4 | O payload já é o lugar estabelecido para dados por tarefa lidos pelos workers (`isOpen`, `queueVersion`, `requestMayHaveReachedTwitch`, `safeToDelete`, `previous`, `baselineRewardIds`). | `apps/api/src/persistence/queue-repository.mjs:511,534,578,828,1088`; `apps/api/src/outbox/reward-worker.mjs:106,172-175,384` |
| E5 | As linhas `chat.call` são criadas hoje com `payload: {}`; a chave é única por entrada (`chat.call:<entryId>`). | `queue-repository.mjs:942-950` |
| E6 | A posição original só existe antes da transição: chamar grava `position: null`, registra `safeDetail.previousPosition` na auditoria e devolve `previousPosition`. | `queue-repository.mjs:1108,1110,1112` (`callSpecificEntry`) e `:1141-1143` (`callNext`) |
| E7 | O claim devolve `callPosition: entry.position` no nível de cima (sempre `null` para uma entrada chamada) e não devolve `payload`. | `queue-repository.mjs:1017` |
| E8 | O worker lê `entry.callPosition` (campo que não existe em `entry`), por isso sempre mostra `?`. | `apps/api/src/outbox/chat-worker.mjs:17,29` |
| E9 | Os três pontos que enfileiram têm `previousPosition` em mãos, mas não o repassam. O handler do chat passa `message`, que o repositório ignora. | `apps/api/src/http/queue-routes.mjs:612-613,618-619`; `apps/api/src/commands/chat-handler.mjs:203-208` |
| E10 | O padrão de fallback legado já existe: a busca na auditoria `entry.transitioned` `waiting -> called`, aceita só se `Number.isInteger`. | `queue-repository.mjs:386-391` |
| E11 | `entries.position` é `INTEGER CHECK (position IS NULL OR position > 0)`, então um valor válido sempre cabe num número JSON sem perda de precisão. | `migration.sql:70` |
| E12 | Nenhum caminho leva uma entrada de `called` de volta a `waiting`, então a chave única `chat.call:<entryId>` não precisa de um segundo payload por entrada. | `queue-repository.mjs` (só as admissões gravam `status: 'waiting'`, `:1930`) |

## Contrato para o `@dev`

1. **Formato:** `payload = { "previousPosition": <inteiro >= 1> }`. Grave um número JSON, nunca uma string. Não grave o texto de `message`, login, UID nem qualquer outro dado do chat no payload (minimização de dados; o payload não é cache da mensagem).
2. **Escrita:** `enqueueCallNotification({ entryId, queueId, previousPosition })` grava o valor no mesmo `create`. Quem chama repassa `moved.previousPosition` / `entry.previousPosition` (E9). Se o valor não for inteiro >= 1, grave `{}` (isso aciona o fallback); nunca grave `null` nem `NaN`.
3. **Leitura:** o claim devolve `payload` (ou o `previousPosition` já validado) no objeto reivindicado. O worker usa o valor da tarefa reivindicada (AC 2), não `entry.callPosition` nem `entry.position`.
4. **Fallback (AC 3):** se `payload.previousPosition` estiver ausente ou não for inteiro, use a busca na auditoria de E10 (a mesma regra de `:386-391`), feita dentro da transação do claim. Se a auditoria também não tiver nada, mantenha `?`; nunca invente um número.
5. **Reenvio:** `resendCallNotification` só altera campos de status/tentativa (`:963-965`), então o payload e o valor são preservados. Não zere o payload ali.

## Riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| R1 — Mudar o modo de UID de uma fila para oculto cancela as linhas `chat.call` pendentes e grava `payload: {}` (`queue-repository.mjs:1080-1083`). Um reenvio posterior reativa a linha com payload vazio. | Baixa | O fallback pela auditoria cobre o caso. Não altere esse caminho na FT-22 (ele pertence à privacidade do UID); apenas teste. |
| R2 — Linhas legadas (`payload: {}`) já existentes no banco. | Baixa | O fallback cobre; sem backfill. O projeto está em beta sem usuários ativos e o banco de desenvolvimento é descartável. |
| R3 — `enqueueCallNotification` roda numa transação separada, depois da chamada (E9); o valor vem de quem chama. | Baixa | O valor é capturado na transação da transição (E6) e não muda depois; não há corrida sobre ele. |
| R4 — Gravar `{ previousPosition: undefined }` no Prisma remove a chave; gravar `null` cria JSON `null`. | Baixa | Validar antes de gravar (item 2 do contrato); a leitura sempre usa `Number.isInteger`. |
| R5 — Desempenho. | Nenhuma | A leitura é por chave primária na linha reivindicada; não há filtro por `payload`, então não é preciso índice GIN. |

## Rollback

Não há mudança de schema. Reverter é reverter o código; as linhas gravadas com `previousPosition` continuam válidas para o código antigo, que ignora chaves desconhecidas em `payload`.

## O que o `@dev` e o `@qa` devem testar em PostgreSQL isolado (migrations reais; nunca SQLite nem mocks do Prisma)

1. **Chamada pelo painel (entrada específica):** uma entrada na posição N >= 2 é chamada pela rota; a linha `chat.call:<entryId>` da `outbox` tem `payload->>'previousPosition' = N` e `jsonb_typeof(payload->'previousPosition') = 'number'`; o worker envia a mensagem com `posição N`.
2. **`callNext` pelo painel e pelo chat com `count` > 1:** cada linha recebe a própria posição (1, 2, ...), igual ao `safeDetail.previousPosition` da auditoria da mesma entrada.
3. **Chat `!fila proximo`:** a mesma verificação do item 1 (a LB-29 espera `1`).
4. **Linha legada:** inserir uma linha `chat.call` com `payload = '{}'` para uma entrada chamada com `previousPosition` na auditoria; o worker usa o valor da auditoria.
5. **Sem dado nenhum:** `payload = '{}'` e nenhuma transição na auditoria; a mensagem mantém `?` e a tarefa termina normalmente (sem quebrar).
6. **Reenvio após falha:** linha em `retry`/`failed`, reenviada pelo painel; o payload não muda e a mensagem mantém a posição.
7. **UID oculto (R1):** linha pendente cancelada pela mudança de UID e depois reenviada; o fallback dá a posição correta.
8. **Valor inválido não é persistido:** o enqueue com `previousPosition` ausente ou inválido grava `{}`, nunca `null`.
9. **Guarda de schema:** `prisma migrate status` (ou o teste de migrations existente) não mostra migration nova no diff da FT-22.

Além disso, o teste unitário do worker, Red primeiro (AC 4), separado como evidência unitária.
