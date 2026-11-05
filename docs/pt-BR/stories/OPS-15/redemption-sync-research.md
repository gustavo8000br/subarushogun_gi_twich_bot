# Pesquisa OPS-15: sincronização de resgates de Pontos do Canal (`redemption.fulfill` preso em `unknown`, exclusão de fila bloqueada, integração `degraded`)

[English](../../../stories/OPS-15/redemption-sync-research.md)

- Data: 2026-10-26 (incidente relatado da live de 2026-10-27). Autor: @analyst (Atlas). Somente leitura: código, `node_modules` instalado e a referência oficial da API da Twitch. Nenhuma operação na Twitch, no GitHub, no banco ou em containers foi executada.
- Notas anteriores consultadas primeiro (regra de ouro): #5 FND-9, #10 OPS-8, #13/#14 contrato de API, #15/#17 OPS-20. Nenhuma cobria o formato da *leitura* de resgates no Helix nem o Delete Custom Reward com resgates pendentes; por isso, esta é uma nota de LACUNA.
- Rótulos: **VERIFIED** (documento oficial ou código-fonte lido hoje), **PARTIAL** (confirmado em parte ou inferido a partir de partes verificadas), **UNVERIFIED** (precisa de teste ao vivo ou de logs).

## Resumo: causa raiz mais provável (confiança alta, ~90%)

O `helix-adapter.mjs` lê o status do resgate com `redemptionStatus(value)`, que verifica `value.isFulfilled`, depois `value.isCanceled` e, por fim, recorre a `value.status`. No `@twurple/api` 8.2.0, a classe `HelixCustomRewardRedemption` **não tem getter `status`** (só `isFulfilled` e `isCanceled`; os dados brutos ficam atrás de um símbolo privado). Para um resgate `UNFULFILLED`, os dois booleanos são `false` e `value.status` é `undefined`, então o adapter devolve `UNKNOWN`. O `classifyRemoteState` do worker transforma `UNKNOWN` em `unknown` e grava `remote_state_unavailable` (caminho da linha ~86, não o do 404). É determinístico, o que bate com "attempts=2, mesma falha". **VERIFIED no código** (`node_modules/@twurple/api/lib/endpoints/channelPoints/HelixCustomRewardRedemption.js`, getters nas linhas 17-113; `apps/api/src/twitch/helix-adapter.mjs:15-19`; `apps/api/src/outbox/financial-worker.mjs:27-32, 84-87`).

Por que os testes não pegaram: os fakes unitários devolvem objetos simples (`{ isFulfilled: false, isCanceled: true }` em `tests/unit/twitch-adapter.test.js:202`) ou strings (`'UNFULFILLED'` em `tests/unit/twitch-reconciliation.test.js:20`). Nenhum teste usa uma instância `UNFULFILLED` da classe real do Twurple. O caminho do EventSub funciona porque `EventSubChannelRedemptionAddEvent` **tem** getter `status` (VERIFIED, `@twurple/eventsub-base`, linha 85). Essa assimetria explica por que o evento chega e a entrada é criada, enquanto a verificação no Helix falha.

Por que o caminho do 404 é improvável: o Twurple lança `HttpStatusCodeError`, que expõe `statusCode` (VERIFIED, `@twurple/api-call/.../HttpStatusCodeError.js:21`), e não `status`. O worker verifica `error.status === 404`, então um 404 real do Helix não chegaria a esse ramo: cairia no ramo de nova tentativa (`remote_lookup_failed`). O `{status: 404}` do próprio adapter só é lançado quando o Twurple devolve `null` (200 com `data` vazio), caso que o Helix documenta como 404. Portanto, `remote_state_unavailable` com essas tentativas aponta para o caminho de "estado não reconhecido". (PARTIAL: confirmado pela leitura do código, não por uma linha de log.)

Efeitos colaterais do mesmo bug (VERIFIED no código, impacto PARTIAL):
- O `listUnfulfilledRedemptions` também mapeia cada item com `redemptionStatus(item)`. Assim, o reconciliador passa `status: 'UNKNOWN'` para `processor.onRedemptionAdd`, que devolve `unknown_remote_state` sem importar (`redemption-processor.mjs:17`) e **sem** registrar issue na reconciliação. Resgates perdidos nunca são importados pela reconciliação, e nada fica no log.
- As verificações de entradas não resolvidas/ativas na reconciliação ignoram `UNKNOWN` em silêncio (só agem em FULFILLED/CANCELED); essa parte é inofensiva, mas cega.
- Um segundo bug latente: todas as checagens de `error.status` (ramos 404/401 do worker e do reconciliador) não reconhecem erros do Twurple, que usam `statusCode`. Respostas 401/403/404 reais são tratadas como transitórias, e 404 reais nunca viram `remote_history_unavailable`.

## Q1. Get Custom Reward Redemption / Update Redemption Status

Fonte: [referência da API da Twitch](https://dev.twitch.tv/docs/api/reference/) (seções "Get Custom Reward Redemption" e "Update Redemption Status"), lida em 2026-10-26. **VERIFIED.**

| Item | Get Custom Reward Redemption (`GET /helix/channel_points/custom_rewards/redemptions`) | Update Redemption Status (`PATCH` no mesmo caminho) |
|---|---|---|
| Query obrigatória | `broadcaster_id` (igual ao usuário do token), `reward_id`; `status` obrigatório **exceto** quando há `id` | `id` (até 50), `broadcaster_id`, `reward_id` |
| Opcional | `id` (até 50), `sort` OLDEST/NEWEST, `after`, `first` 1-50 | corpo `status`: apenas `CANCELED` ou `FULFILLED` (CANCELED reembolsa os pontos) |
| Escopo | `channel:read:redemptions` **ou** `channel:manage:redemptions` | `channel:manage:redemptions` |
| Mesmo Client ID | "The app used to create the reward is the only app that may get the redemptions" | Mesma regra para atualizar; só resgates `UNFULFILLED` podem ser atualizados |
| 400 | falta `broadcaster_id`/`reward_id`; falta `status` sem `id`; `status`/`sort` inválido | parâmetro ausente; `status` inválido |
| 401 | token de usuário ausente/inválido, escopo ausente, Client-Id diferente do token | idem |
| 403 | o Client-Id não é o que criou a recompensa; canal não é parceiro/afiliado | idem |
| 404 | nenhum dos resgates em `id` encontrado | recompensa não encontrada, ou resgates não encontrados **ou não UNFULFILLED** |
| Valores de status | `CANCELED`, `FULFILLED`, `UNFULFILLED` (diferencia maiúsculas); CANCELED/FULFILLED só são devolvidos por alguns dias após a mudança | a resposta pode trazer qualquer um dos três |

- Consulta por `id` de um resgate `UNFULFILLED` logo após o EventSub: a documentação não restringe isso nem menciona atraso. **PARTIAL** (não há declaração oficial sobre atraso de consistência; nenhum relato da comunidade foi encontrado nesta rodada).
- Twurple 8.2.0 (VERIFIED, `HelixChannelPointsApi.js:134-157`): `getRedemptionById` chama `getRedemptionsByIds`, que usa o endpoint certo com `broadcaster_id`, `reward_id` e `id` (então `status` não é necessário) e devolve `null` quando `data` vem vazio. Ele **não** trata o 404: `callApi` lança `HttpStatusCodeError` (`statusCode` 404). O endpoint está certo; o bug é o mapeamento de status no nosso adapter, somado à diferença entre `status` e `statusCode`.
- Observação sobre `setRedemptionStatus`: atualizar um resgate já FULFILLED/CANCELED devolve **404**, não 409. O desenho do worker ("ler, atualizar, ler de novo") é o certo para isso, quando as leituras funcionarem.

## Q2. ID do EventSub vs. ID do Helix

- O payload do evento `channel.channel_points_custom_reward_redemption.add` tem `id` (ID do resgate), `reward.id`, `status` e `redeemed_at`. O Twurple mapeia `event.id` para `rawData.id` e `event.rewardId` para `rawData.reward.id` (VERIFIED em `@twurple/eventsub-base`, linhas 17-19 e 91-93). É o mesmo `id` aceito pelo parâmetro `id` do Helix (VERIFIED pela lista de campos da [referência de tipos de assinatura do EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/); a projeção no nosso processor usa `event.id`).
- Pegadinhas: (a) não confundir com o `metadata.message_id` do WebSocket (ID de deduplicação da mensagem), que o Twurple não expõe como `event.id` (VERIFIED pelo código); (b) `reward_id` precisa ser a recompensa do resgate, senão o Helix devolve 404 para aquele `id` (PARTIAL: inferido do texto do 404); (c) atraso de consistência: nenhuma declaração oficial encontrada (UNVERIFIED). Note que (b) apareceria como `remote_lookup_failed` (nova tentativa) no nosso worker, e não como `remote_state_unavailable`.

## Q3. Delete Custom Reward com resgates pendentes

- Referência oficial (VERIFIED, lida em 2026-10-26): escopo `channel:manage:redemptions`; só o app que criou a recompensa pode excluí-la (senão 403); 404 se a recompensa não existir; **"If a redemption is still UNFULFILLED when the reward is deleted, its status changes to FULFILLED"**. Ou seja, a API documenta que a exclusão é permitida e que os pendentes são **cumpridos, não reembolsados**.
- O proprietário viu o **painel da Twitch** recusar a exclusão com pedidos pendentes. Isso é a interface do painel de criador, não a API; os dois comportamentos podem diferir (PARTIAL: comportamento do painel observado pelo proprietário; comportamento da API segundo a documentação; não testados juntos).
- Ordem para excluir a fila (recomendação): (1) desativar/pausar a recompensa (`is_enabled=false` ou `is_paused=true`) para não entrarem resgates novos; (2) listar os `UNFULFILLED` (`status=UNFULFILLED`, com paginação) e, conforme a regra do produto, **CANCELAR** (reembolsar) ou **CUMPRIR** cada um explicitamente, em lotes de até 50 IDs; (3) listar de novo e confirmar zero `UNFULFILLED`; (4) excluir a recompensa; (5) tratar 404 na exclusão como "já removida". Contar com o FULFILLED implícito da exclusão cobraria espectadores sem atendê-los, o que contradiz a expectativa de reembolso ao excluir. O bloqueio atual (`queue_deletion_financial_conflict`) some quando a tarefa `fulfill` sair de `unknown`.

## Q4. Por que `twitch_integration: degraded`

Como o código calcula (VERIFIED, `apps/api/src/twitch/integration.mjs`): `degraded` é publicado quando (a) uma reconciliação termina com `status !== 'complete'` (qualquer issue a torna `partial`), (b) a reconciliação lança exceção (`reconciliation_failed`), (c) o WebSocket do EventSub cai, ou (d) uma assinatura é revogada. O `/health` reporta esse valor diretamente. No caso (a), o array `issues` só é publicado no objeto de status, sem linha de log, o que bate com "degraded sem linha de log explicativa". O bug acima, sozinho, não gera issue; por isso o gatilho exato é **UNVERIFIED**. Os códigos candidatos são `reward_verification_failed`, `reward_configuration_mismatch`, `reconciliation_failed`, `redemption_import_failed`, `redemption_verification_failed` e `active_entries_query_failed`. Erros 401/403/404 reais lidos como transitórios (a diferença `status`/`statusCode`) podem gerar `redemption_verification_failed`.

Lado do EventSub (VERIFIED, [Get EventSub Subscriptions](https://dev.twitch.tv/docs/api/reference/#get-eventsub-subscriptions) e [Handling WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)): assinaturas WebSocket ficam `enabled` ao serem criadas (`webhook_callback_verification_pending` só existe para webhook); os status de revogação incluem `authorization_revoked`, `user_removed` e `version_removed`; assinaturas WebSocket são removidas quando a sessão termina (`websocket_disconnected`, `websocket_failed_ping_pong` etc.); os limites são `max_total_cost` e 300 assinaturas por transporte WebSocket/3 conexões por usuário. O stream ficar online não muda o status da assinatura (PARTIAL: nenhum documento liga as duas coisas; o evento chegou, então a assinatura funcionava). Diagnóstico: `GET /helix/eventsub/subscriptions?type=channel.channel_points_custom_reward_redemption.add` com o mesmo token de usuário e Client ID, conferindo `status`, `transport.session_id` e `total_cost`/`max_total_cost`.

## Q5. Idempotência e autorrecuperação

- Tratar `UNKNOWN` de uma leitura como classificação **transitória**, com backoff limitado (o worker já tem `retryDelay` com jitter e teto de 1 hora), e não como `unknown` terminal. Manter `unknown` terminal só depois de N tentativas ou de um "não encontrado" real e explícito que signifique "histórico expirado" (CANCELED/FULFILLED só ficam disponíveis "alguns dias", segundo a documentação).
- Ler antes de escrever (já feito) é a chave de idempotência certa: o Update Redemption Status só é seguro em `UNFULFILLED` e devolve 404 nos demais casos; ler de novo converte o 404 em "confirmado" ou "conflito".
- Mapear erros do Twurple numa única função: `status = error.statusCode ?? error.status`, repassando `Retry-After` no 429 (ver nota #17).
- Deixar a reconciliação periódica (`reconciliation.mjs`, a cada 5 minutos) reenfileirar tarefas financeiras em `unknown` cujos resgates continuem `UNFULFILLED`, e importar resgates vindos de `listUnfulfilledRedemptions` (o que depende da correção do mapeamento).
- Registrar as issues da reconciliação como linhas estruturadas (só códigos e contagens, sem dados de usuários), para que o `degraded` seja explicável.
- Teste de contrato: rodar o adapter contra **instâncias reais das classes do Twurple** construídas a partir do JSON bruto do Helix (`{status: 'UNFULFILLED', ...}`), e não contra objetos simples. O Twurple expõe `getRawData(obj)` para o sentido inverso; construir a classe basta para esse teste (PARTIAL: assinatura do construtor `(data, client)` vista no código).

## O que só um teste ao vivo confirma

1. **Causa raiz (confirma o resumo):** no canal de teste, resgatar uma recompensa criada por este app, iniciar o atendimento e capturar no worker: o JSON bruto do Helix `data[0].status` (ou `getRawData(redemption).status`), o valor devolvido pelo adapter, o resultado de `classifyRemoteState` e o código HTTP (`error.statusCode`) quando houver exceção. Esperado: HTTP 200, `status: "UNFULFILLED"` bruto, adapter `UNKNOWN`. Um script Node pontual, somente leitura, com o mesmo token, faz o mesmo: `getRedemptionById(broadcasterId, rewardId, redemptionId)` e imprimir `getRawData(result)`.
2. **Gatilho do `degraded`:** registrar `issues[].code` de cada resultado de reconciliação e o campo `reason` de cada publicação de `degraded`, e rodar o Get EventSub Subscriptions uma vez durante a live.
3. **Exclusão com pendentes via API:** com um resgate UNFULFILLED, chamar o Delete Custom Reward e depois o Get Custom Reward Redemption com `status=FULFILLED` para confirmar a documentação (status vira FULFILLED, sem reembolso).
4. **Atraso de consistência:** logo depois do evento add do EventSub, chamar o Get Custom Reward Redemption por `id` e registrar se vem 200 ou 404.

## Fontes (acessadas em 2026-10-26)

- Referência da API da Twitch, Get/Update Redemption, Delete Custom Reward, Get EventSub Subscriptions: https://dev.twitch.tv/docs/api/reference/
- Tipos de assinatura do EventSub (payload de add/update de resgate): https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
- Tratamento de eventos WebSocket e revogação: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- Código instalado, `@twurple/api` 8.2.0: `node_modules/@twurple/api/lib/endpoints/channelPoints/HelixChannelPointsApi.js`, `HelixCustomRewardRedemption.js`; `@twurple/api-call` `HttpStatusCodeError.js`; `@twurple/eventsub-base` `EventSubChannelRedemptionAddEvent.js`.
- Código do projeto: `apps/api/src/twitch/helix-adapter.mjs`, `apps/api/src/outbox/financial-worker.mjs`, `apps/api/src/twitch/reconciliation.mjs`, `apps/api/src/twitch/redemption-processor.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/health-route.mjs`.

## Veredito

**SUFFICIENT** para decidir a correção (causa raiz encontrada no código com confiança alta). As verificações ao vivo acima a confirmam; não são mais pesquisa. **REFRESH IF** o `@twurple/api` sair da 8.2.0 ou a Twitch mudar a API de Custom Rewards.
