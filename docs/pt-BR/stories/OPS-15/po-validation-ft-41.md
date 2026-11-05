# FT-41 — validação do `@po` (onda 5 do cutover: retirar `POST /api/queues/:queueId/archive`)

[English](../../../stories/OPS-15/po-validation-ft-41.md)

**Validador:** `@po` (Pax) — **Data:** 2026-11-05 — **Modo:** YOLO (`[AUTO-DECISION]` marca escolhas autônomas)
**Fatia:** FT-41 (linha em [backlog-inventory.md](../../process/backlog-inventory.md)) da [OPS-15](story.md) — **Issue:** [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (issue da OPS-15, existe; mesmo padrão das ondas irmãs).
**Fontes:** [ft-41-data-engineer-confirmation.md](ft-41-data-engineer-confirmation.md), [cutover-plan.md](cutover-plan.md) (A-08, onda 5, DP-6 linha 206), [queue-route-action-inventory.md](queue-route-action-inventory.md) (QRA-18), `.claude/rules/story-lifecycle.md` (10 pontos).

## Veredito

**GO — 9,3/10.** A FT-41 passa de **Draft/não iniciado -> Ready**. Ready significa "validada para planejamento"; os gates da fatia continuam valendo (`@dev` test-first, veredito e nota do `@qa` antes de qualquer commit).

## Decisão do dono sobre a perda do arquivamento reversível

**Já tomada; o dono não é necessário.** Base: DP-6 (cutover-plan.md:206) — "RESOLVIDA (dono, 2026-10-27): sim, apagar `archiveQueue` e `POST /api/queues/:queueId/archive`, manter o ramo `archiveAfterConfirm` do worker". A rota era a única entrada do arquivamento reversível de fila saudável; apagá-la é, por construção, aceitar essa perda. A rota é só de API (QRA-18: nenhuma chamada no painel Next, no painel vanilla nem na baseline `845a58f`), logo nenhuma capacidade visível ao operador desaparece. `[AUTO-DECISION]` tratada como decidida porque a consequência decorre do texto da decisão e nada voltado à pessoa usuária é removido (motivo: sem escopo novo para o dono). A consequência agora está explícita na FR-10 (abaixo). Se o dono quiser manter um arquivamento reversível de filas saudáveis, isso é uma **funcionalidade nova** do backlog, fora desta onda.

## Checklist de 10 pontos

| # | Ponto | Nota | Observação |
|---|---|---|---|
| 1 | Título | 1,0 | Nomeia rota, método e onda. |
| 2 | Descrição | 1,0 | A-08 do plano de cutover + confirmação do `@data-engineer`. |
| 3 | ACs testáveis | 0,8 | A linha do inventário tinha itens Red/Green sem ACs numerados; as 5 condições agora são AC-41-1..8 abaixo (Dado/Quando/Então). |
| 4 | Escopo DENTRO/FORA | 0,9 | FORA explícito abaixo (AC-41-7). |
| 5 | Dependências | 1,0 | FT-40 concluída; FT-23/ST-15/ST-16 bloqueiam o fechamento da OPS-15, não esta onda. |
| 6 | Complexidade | 1,0 | M; 2-4 h `@dev`, 0,5-1 h `@data-engineer`, 1,5-2 h `@qa`. |
| 7 | Valor de negócio | 0,8 | Remove uma superfície pública de escrita inalcançável; valor de higiene e menor superfície de ataque. |
| 8 | Riscos | 0,9 | Fila `pending_close` encalhada se o ramo do worker for removido (coberto por AC-41-2/3/4); linhas vivas desconhecidas (inofensivas com o ramo). |
| 9 | Critérios de pronto | 0,9 | Gates listados; docs en/pt-BR; veredito do `@qa`. |
| 10 | Alinhamento | 1,0 | Rastreia ao cutover-plan onda 5, DP-6, QRA-18. Sem invenção. |

Total 9,3/10 (média), nenhum abaixo de 0,8.

## Critérios de aceite (vinculantes para `@dev`/`@qa`)

Cada condição do `@data-engineer` virou um AC. Ordem: testes primeiro.

- **AC-41-1 (Red, rota).** Dada uma sessão válida, quando `POST /api/queues/:id/archive` é chamada, então a resposta é o 404 JSON genérico (nunca HTML, nunca bypass de sessão) e `repository.archiveQueue` nunca é invocada. Escrito e visto vermelho **antes** da remoção. *(Condição 1; Tests da onda 5 do cutover-plan.)*
- **AC-41-2 (PostgreSQL, linha legada feliz).** Dado um PostgreSQL isolado com migrations reais, uma fila semeada à mão (`rewardId`, `isArchived: true`, `isOpen: false`, `remoteSyncStatus: 'pending_close'`) e uma linha de outbox `reward.set_open` com `payload { isOpen:false, queueVersion, archiveAfterConfirm:true, requestMayHaveReachedTwitch:false }`, quando `claimNextRewardOperation` e o worker rodam com adaptador falso, então a linha termina `confirmed`, a fila termina `synced` / `isArchived=true` / `isOpen=false`, e `unarchiveQueue` em seguida tem sucesso. *(Condição 2; o `reward-outbox-worker.test.js:263` com mocks não a substitui.)*
- **AC-41-3 (PostgreSQL, caminhos de retry/falha).** Mesma fixture: um 429 vai para `retry` mantendo a flag e o estado da fila; uma linha `unknown`, após retry manual, volta a `pending` e ainda confirma; uma fila com tombstone faz a linha ir a `cancelled`/`unknown` e a Twitch nunca é chamada. *(Condição 3.)*
- **AC-41-4 (guarda).** Uma linha `reward.set_open` **sem** `archiveAfterConfirm` para fila arquivada continua falhando com `reward_open_operation_invalid` (o ramo não se alarga). *(Condição 4.)*
- **AC-41-5 (remoção).** Após o Red do AC-41-1, remover a rota (`queue-routes.mjs:686-697`) e `archiveQueue` (`queue-repository.mjs:562-584`), e os casos de arquivamento de `tests/unit/queue-routes.test.js`, `tests/integration/qra-postgres-fixtures.test.js` e `tests/integration/queue-repository.test.js` (linhas conforme a confirmação). `git grep` não encontra chamador de `archiveQueue`.
- **AC-41-6 (docs, en + pt-BR).** Remover `archive` da lista INV-06 em `endpoint-catalog-inventory.md`; marcar QRA-18 como retirada em `queue-route-action-inventory.md`; a publicação de formatos de resposta da OPS-21 não lista a rota. FR-10 e `information-architecture.md` já foram reescritos pelo `@po` (abaixo). *(Condição 5.)*
- **AC-41-7 (FORA, não pode mudar).** `unarchiveQueue`, `isArchivePause` (`reward-worker.mjs`), o código `localArchive*`, qualquer status/enum e qualquer migration ficam intactos. Sem backfill nem exclusão de chaves `reward.archive` históricas ou de eventos de auditoria `queue.archive_requested`/`queue.archived`. Rollback = reverter o commit.
- **AC-41-8 (gates).** O `@qa` roda a suíte completa em PostgreSQL isolado mais `lint`, `typecheck`, `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static`, e emite PASS/CONCERNS/FAIL com nota antes de o `@devops` comitar.

## FR-10 — nova redação

Aplicada em `docs/prd/functional-requirements.md` e `docs/pt-BR/prd/functional-requirements.md`. Texto (pt-BR): "FR-10 — Fornecer operações de lista/posição/saída/inclusão/remoção/próximo/início/conclusão/movimentação/abertura/fechamento/limpeza/conta, notificações e timeout conforme política. Ciclo de vida da fila (onda 5 do cutover, FT-41, DP-6): o arquivamento reversível de fila saudável deixa de ser oferecido como rota pública (`POST /api/queues/:queueId/archive` é retirada e responde o 404 JSON genérico); uma fila sai de operação apenas pela exclusão com confirmação explícita (`delete`, com limpeza da recompensa) ou, quando a sincronização com a Twitch está incerta ou falhou, pela exclusão somente local (`archive-local`, que termina em tombstone e não é revertida por `unarchive`). O `unarchive` permanece apenas para filas já arquivadas: uma fila arquivada antes da atualização, inclusive uma ainda em `pending_close`, termina de pausar a recompensa pelo fluxo existente de outbox/worker e depois pode ser desarquivada. Sem migração de dados."

## Arquivos tocados pelo `@po`

`docs/prd/functional-requirements.md`, `docs/pt-BR/prd/functional-requirements.md`, `docs/front-end-spec/information-architecture.md`, `docs/pt-BR/front-end-spec/information-architecture.md`, `docs/process/backlog-inventory.md` (+ pt-BR), `docs/stories/OPS-15/story.md` (+ pt-BR; histórico), este arquivo (+ en).

## O que ainda falta para o `@dev`

Nada bloqueia. Comece pelos AC-41-1 e AC-41-2 (ambos vermelhos primeiro). `endpoint-catalog-inventory.md` e `queue-route-action-inventory.md` (en + pt-BR) são atualizados pelo `@dev` junto com o código (AC-41-6), pois descrevem o estado do código. Opcional: o `@devops` pode rodar a consulta somente leitura da confirmação no banco instalado do dono; não é gate.

## Adendo 2026-11-05 (FT-41 / AC-41-3, decisão do Orion, opção B)

Ao escrever o teste em PostgreSQL do AC-41-3, o `@dev` observou que a expectativa do AC-41-3 ("`unknown`, após nova tentativa manual, volta a `pending` e ainda confirma") não se sustenta. Uma linha legada `archiveAfterConfirm` que chegou a `unknown` ou `failed` leva a fila a `close_unknown` / `close_failed`. `retryOutboxManually` devolve a linha a `pending`, mas só rearma a fila para `reward.delete`, `reward.update` e `deleteAfterConfirm`; `claimNextRewardOperation` exige `pending_close`, então a linha continua sem ser reivindicada e a fila encalhada. O Orion decidiu (2026-11-05) aceitar essa limitação conhecida: é comportamento já existente, a remoção não cria linhas novas, o beta não tem usuários ativos e a correção muda o comportamento do repositório fora do AC-41-7. Saídas manuais: excluir a fila ou `archive-local`. O comportamento está fixado por `tests/integration/queue-archive-legacy-row-postgres.test.js` (`unknown` e `failed`) e registrado como risco não bloqueante FT-41-L1 no inventário (sem issue).
