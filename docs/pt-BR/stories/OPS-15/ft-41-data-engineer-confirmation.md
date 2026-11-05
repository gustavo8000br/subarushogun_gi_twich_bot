# FT-41 — Confirmação escrita do `@data-engineer`: segurança da outbox ao retirar `POST /api/queues/:queueId/archive` (onda 5)

- **Data:** 2026-11-05
- **Agente:** `@data-engineer` (Dara)
- **Escopo:** o gate da onda 5 no [plano de cutover](cutover-plan.md) ("o `@data-engineer` confirma que manter o ramo do worker basta para linhas `reward.set_open` com `archiveAfterConfirm: true` já presentes em bancos instalados") e a linha FT-41 de `docs/pt-BR/process/backlog-inventory.md`.
- **Método:** leitura estática do schema, das migrations e do código (HEAD `ea1b1c4`) **mais** uma execução observada: `vitest run tests/integration/queue-repository.test.js -t archive` contra o PostgreSQL isolado e descartável iniciado pelos helpers de teste (12 passaram, 158 ignorados; o arquivo `qra-postgres-fixtures` foi ignorado pelo filtro nessa execução, portanto o caso de arquivamento dele **não** foi observado). Não havia container Docker antes nem depois (`docker ps -a` vazio); nenhum volume foi tocado; nada foi implementado.

## Veredito

**SEGURO COM CONDIÇÕES. Sem migração.** A remoção é segura para os dados **se e somente se** o ramo `archiveAfterConfirm` do worker de recompensas for mantido (a DP-6 já diz isso) e coberto primeiro por um teste em PostgreSQL. Remover esse ramo transformaria toda linha antiga em andamento em `failed` e deixaria a fila presa em `pending_close`.

## Respostas

### 1. Que linhas da outbox o `archiveQueue` produz ou consome?

- **Produz exatamente um tipo de linha, e só no caminho com sincronização de recompensa** (`queue-repository.mjs:722-743`; o ramo `manual_only` não grava linha na outbox, só auditoria):

| Coluna | Valor |
|---|---|
| `operation_type` | `reward.set_open` |
| `entity_type` / `entity_id` | `queue` / id da fila |
| `idempotency_key` | `queue:<queueId>:reward.archive:<version>` (único produtor da chave `reward.archive`) |
| `payload` | `{ isOpen: false, queueVersion, archiveAfterConfirm: true, requestMayHaveReachedTwitch: false }` |
| `status` inicial | `pending` (padrão) |

  Efeitos na mesma transação: `queue.isArchived = true`, `isOpen = false`, `remote_sync_status = 'pending_close'`, `version + 1`; auditoria `queue.archive_requested`.
- **Não consome nada da outbox.** Lê apenas a linha de `queue`. O único chamador é a rota (`queue-routes.mjs:707`).
- **Essa linha pode continuar viva após a remoção? Sim, em qualquer banco que arquivou uma fila com recompensa antes da atualização.** Ela pode estar em `pending`, `retry`, `processing` (lease expirado), `unknown` (inferido: alcançável pelos caminhos `unknownRewardOperation` do worker), `failed` ou `conflict` (inferido), até o worker resolver. `confirmed`, `cancelled` e `resolved_manual` são terminais e inofensivos. O CHECK de status permite `pending, processing, retry, confirmed, conflict, unknown, failed, cancelled, resolved_manual, cancel_verification` (`20261014230000_outbox_deletion_cancel_verification/migration.sql`); a remoção não o toca.

### 2. A remoção deixa algum tipo de operação órfão em algum worker?

- **Nenhum tipo fica órfão.** `reward.set_open` continua produzido por `setQueueOpen` (`:669`), pela transição para modo manual (`:692`) e pela exclusão de fila (`:986`); `archiveAfterConfirm` não é um tipo, é uma flag dentro do payload de `reward.set_open`. O `financial-worker.mjs` só trata `redemption.cancel` / `redemption.fulfill` e não é afetado.
- **A flag tem um único leitor:** `reward-worker.mjs:176` (`isArchivePause`), que apenas afrouxa a guarda de `:178-179` (sem ela, `queue.isArchived` invalidaria a tarefa). `confirmRewardOpen` (`queue-repository.mjs:1864-1884`) **não tem lógica específica de arquivamento**: leva `pending_close -> synced`, marca a linha `confirmed` e grava `queue.open_state_confirmed`.
- **O que acontece com uma linha antiga:**
  - *Com o ramo mantido (planejado):* só é reivindicada enquanto a fila está `pending_open`/`pending_close` (`claimNextRewardOperation`, `:1808-1811`); o worker pausa a recompensa, confirma, e a fila termina `isArchived=true, isOpen=false, synced`, e `unarchive` (mantido) pode reabri-la. Filas em tombstone têm a linha cancelada/`unknown` pela reivindicação (`:1795-1805`), independentemente da flag. Erros de limite/autorização vão para `retry`; os ambíguos para `unknown` (resolução manual), como hoje.
  - *Com o ramo removido (rejeitado):* a guarda falha, a linha vira `failed` / `reward_open_operation_invalid` e a fila fica `isArchived=true` + `pending_close`. `setQueueOpen` e `unarchiveQueue` recusam esse estado (`QUEUE_NOT_AVAILABLE` / `QUEUE_REWARD_NOT_READY`), então a fila fica presa até o operador excluí-la ou arquivá-la localmente.
  - Uma nova tentativa manual de linha `unknown`/`failed` antiga volta a `pending`, então o ramo também precisa sobreviver às novas tentativas.

### 3. Precisa de migração? O fluxo da OPS-22 cobre todos os casos de uso?

- **Sem migração.** Não existe coluna, enum, índice ou constraint dedicado a arquivamento: `is_archived` é um booleano simples ainda escrito por exclusão, arquivamento local e `unarchive`; `outbox.payload` é JSONB livre; o CHECK de status não muda. Linhas históricas (chaves `reward.archive`, eventos de auditoria `queue.archive_requested` / `queue.archived`) ficam como histórico imutável; **não** faça backfill nem apague. Rollback = reverter o commit.
- **A OPS-22 não cobre o mesmo caso de uso; é uma decisão de comportamento, não um risco de dados.** `archive-local` (`beginLocalQueueArchive` / `confirmLocalQueueArchive`) termina em `lifecycle_status = 'deleted'` (tombstone, não reversível por `unarchive`) e se limita a estados de sincronização incertos/com falha (`localArchiveRemoteStatuses`). A rota aposentada era o único ponto de entrada do ciclo **reversível** "arquivar uma fila ativa e saudável e guardá-la para depois". Após a remoção, `isArchived` só é alcançado por exclusão (`deleting`), arquivamento local (`deleted`) e linhas antigas; o painel Next nunca chamou a rota (`queue-lifecycle.mjs:4` lista `unarchive`, `archive-local-*`, sem `archive`). A DP-6 (proprietário, 2026-10-27) já aceitou isso; o `@po` deve registrá-lo na FR-10 para que a perda do arquivamento reversível seja explícita, não silenciosa.

### 4. Algum dado de produção/dev depende da rota?

- **Observado:** nenhum container, volume ou banco estava em execução; não consultei nenhum banco instalado, portanto **não consigo confirmar nem negar que existam linhas com `archiveAfterConfirm: true` em algum lugar**. O banco de dev é descartável (regra do proprietário) e não foi tocado.
- **Inferido:** não há consumidor próprio (a rota não tem chamador em `apps/frontend`; o painel vanilla já deixou de ser servido), e o projeto está em beta sem usuários ativos (memória do proprietário), então linhas vivas são improváveis, mas possíveis nas instalações do próprio proprietário. A salvaguarda do plano (manter o ramo do worker) torna o desconhecido inofensivo, então nenhuma consulta prévia é gate obrigatório. Verificação opcional somente leitura em um banco instalado: `SELECT status, count(*) FROM outbox WHERE operation_type='reward.set_open' AND payload->>'archiveAfterConfirm'='true' GROUP BY status;` (não executada por mim).

## Condições para o `@dev` (testes primeiro, nesta ordem)

1. **Red, rota:** `POST /api/queues/:id/archive` com sessão válida retorna o 404 JSON genérico (nunca HTML, nunca bypass de sessão) e `repository.archiveQueue` nunca é invocado. Remova os casos de arquivamento de `tests/unit/queue-routes.test.js` (`:902-924`, `:1386`), `qra-postgres-fixtures.test.js:778-792` e `queue-repository.test.js:1527-1544` só depois de esse teste ficar vermelho.
2. **Novo teste em PostgreSQL (isolado, migrations reais) — o que sustenta a segurança:** semeie à mão uma fila (`rewardId`, `isArchived: true`, `isOpen: false`, `remoteSyncStatus: 'pending_close'`) e uma linha `reward.set_open` com `payload { isOpen:false, queueVersion, archiveAfterConfirm:true, requestMayHaveReachedTwitch:false }`. Execute `claimNextRewardOperation` + o worker com um adaptador falso; verifique que a linha termina `confirmed`, a fila termina `synced`/`isArchived=true`/`isOpen=false`, e que `unarchiveQueue` então funciona. O `reward-outbox-worker.test.js:263` existente usa mocks e não substitui este teste.
3. **Mesma fixture, caminhos de retry e falha:** `retry` (429) mantém a flag e o estado da fila; `unknown` seguido de nova tentativa manual volta a `pending` e ainda confirma; fila em tombstone tem a linha `cancelled`/`unknown` e nunca chama a Twitch.
4. **Teste de guarda:** uma linha `reward.set_open` **sem** `archiveAfterConfirm` para fila arquivada continua falhando com `reward_open_operation_invalid` (o ramo não pode ser ampliado).
5. **Não** remova `unarchiveQueue`, `isArchivePause`, o código `localArchive*` nem qualquer status/enum. Não adicione migração. Atualize FR-10 / `information-architecture.md` / inventário de endpoints (en + pt-BR) via `@po`/`@pm`; a OPS-21 não deve listar a rota.

## Observado versus inferido

| Item | Situação |
|---|---|
| Forma da linha produzida por `archiveQueue`; chamador único; leitor único de `archiveAfterConfirm`; ausência de objetos de schema para arquivamento | **Observado** lendo o código no HEAD `ea1b1c4` |
| Os 12 testes de repositório relacionados a arquivamento passam em PostgreSQL descartável | **Observado** (esta execução) |
| Caso de arquivamento de `qra-postgres-fixtures`, comportamento ponta a ponta do worker com uma linha antiga, consequência `failed` de remover o ramo | **Inferido** do código (ainda não há teste; a condição 2 o cria) |
| Existência de linhas vivas em algum banco instalado | **Não verificado** (nenhum banco consultado) |

## Adendo 2026-11-05 (FT-41 / AC-41-3, decisão do Orion, opção B)

Ao escrever o teste em PostgreSQL da condição 3, o `@dev` observou que a expectativa "`unknown` e, depois, nova tentativa manual ainda confirma" não se sustenta. Uma linha legada `archiveAfterConfirm` que chegou a `unknown` ou `failed` leva a fila a `close_unknown` / `close_failed`. `retryOutboxManually` devolve a linha a `pending`, mas só rearma a fila para `reward.delete`, `reward.update` e `deleteAfterConfirm`; `claimNextRewardOperation` exige `pending_close`, então a linha continua sem ser reivindicada e a fila encalhada. O Orion decidiu (2026-11-05) aceitar essa limitação conhecida: é comportamento já existente, a remoção não cria linhas novas, o beta não tem usuários ativos e a correção muda o comportamento do repositório fora do AC-41-7. Saídas manuais: excluir a fila ou `archive-local`. O comportamento está fixado por `tests/integration/queue-archive-legacy-row-postgres.test.js` (`unknown` e `failed`) e registrado como risco não bloqueante FT-41-L1 no inventário (sem issue).
