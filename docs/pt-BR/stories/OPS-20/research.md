# OPS-20 — Pesquisa: elegibilidade de reembolso por fila conforme status de inscrição

[English](../../../stories/OPS-20/research.md)

**Autoria:** `@analyst` (Atlas), 2026-10-21. **Story:** [story.md](story.md), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76).
**Natureza:** pesquisa documental mais leitura do código atual, sem alterar nada. Nenhum código, teste, chamada Twitch ou banco foi executado. Nada aqui é evidência de comportamento real da Twitch.

## 0. Estado atual do código (lido em 2026-10-21, branch `feat/ops-15-next-panel`)

| Área | Constatação |
|---|---|
| Decisão de reembolso | `apps/api/src/domain/entry-transitions.mjs` `decideEntryTransition()` retorna `financialDecision: 'request_cancel'` (reembolso) quando: uma entrada de resgate é removida de `waiting` (sempre); é removida de `called`/`in_progress` com `refundIfRemovedWhileCalled` (ou `refundIfViewerLeavesWhileCalled` quando a origem é o espectador); vai para `no_show` com `refundOnNoShow`; ou é removida com motivo `queue_cleared`/`queue_deleted` (sempre, ignorando a política). Observações externas nunca solicitam nada. |
| Origem da política | `apps/api/src/domain/queue-service.mjs` monta o snapshot a partir de três colunas booleanas da fila (`apps/api/prisma/schema.prisma`, linhas 26–28; padrões `true`, `false`, `false`). |
| Execução | A decisão vira tarefa durável na outbox financeira (`redemption.cancel` → `CANCELED`) em `apps/api/src/outbox/financial-worker.mjs`. |
| Limpeza | `apps/api/src/domain/clear-confirmation.mjs` conta `refundsRequested` como toda entrada de resgate; a cópia de chat (`chat.queue.clear_confirm`/`clear_done`) anuncia esse número. |
| Escopos OAuth | `apps/api/src/twitch/oauth.mjs` e `auth-runtime.mjs`: obrigatórios `channel:manage:redemptions`, `user:read:chat`, `user:write:chat`; opcional `moderator:read:followers`. |
| Padrão de escopo opcional | `helix-adapter.mjs` `checkFollower()` já retorna `'unknown'` quando falta o escopo opcional ou a chamada falha. É o padrão a reaproveitar. |
| Badges de chat | `apps/api/src/commands/authorization.mjs` deriva `subscriber`/`vip`/`moderator` dos badges do chat (EventSub). Verifica só o badge `subscriber`, não `founder`. |

Implicação: há duas famílias de reembolso. Uma é **por política** (chamado/no-show/saída); a outra é **forçada** (remoção de quem aguarda, limpeza/exclusão de fila). A OPS-20 precisa definir quais famílias a regra afeta (pergunta 3 abaixo).

## 1. Qual API informa se uma pessoa é inscrita

| Endpoint | Token | Escopo | Serve ao bot? |
|---|---|---|---|
| **Get Broadcaster Subscriptions** `GET /helix/subscriptions?broadcaster_id=…&user_id=…` | Token da pessoa streamer | `channel:read:subscriptions` | **Sim.** O filtro `user_id` pode ser repetido (a Twitch documenta até 100 IDs; não reconferido nesta passada). Retorna `tier` (`1000`/`2000`/`3000`), `is_gift`, `gifter_id`/`gifter_login`/`gifter_name` (vazios quando não é presente) e `plan_name`. Quem não é inscrito simplesmente não aparece em `data`. |
| Check User Subscription `GET /helix/subscriptions/user` | Token **do espectador** | `user:read:subscriptions` | **Não.** Exige que cada espectador autorize o app. |

O que falta nos escopos atuais: `channel:read:subscriptions`. Ele deve entrar como escopo **opcional** (igual a `moderator:read:followers`). Tokens mantêm os escopos concedidos, então **streamers já conectados precisam autorizar de novo**. Até lá, uma fila configurada como "somente inscritos" deve resultar em `unknown`, e o painel deve oferecer a ação "Reconecte a Twitch para permitir a verificação de inscritos". "Todos" e "ninguém" não precisam de escopo novo. Não torne o escopo obrigatório: isso quebraria todas as conexões existentes.

Limites: o endpoint lista apenas inscrições **ativas**. Relatos da comunidade dizem que os dados de quem presenteou cobrem só presentes ativos. Inscrições Prime aparecem como tier `1000`. Não encontrei flag Prime documentada nesse endpoint (não verificado).

## 2. Requisito de Afiliado/Parceiro

Pontos de canal e inscrições exigem Afiliado ou Parceiro. `Update Redemption Status` retorna **403** quando o canal não é parceiro nem afiliado. O bot já detecta isso (`getChannelEligibility()` → `channel_ineligible`). Um canal não afiliado não tem resgates, então a regra nunca se aplica e a opção pode ficar oculta, como o AC6 já faz para filas só manuais. Se o canal perder o status de afiliado, os resgates UNFULFILLED existentes não podem mais ser atualizados, e o tratamento de falhas atual da outbox já cobre esse caso. Nunca interprete "zero inscritos" como "não inscrito" sem uma resposta 200 bem-sucedida.

## 3. Streamer, moderadores e VIPs (se o proprietário optar)

- Streamer: basta comparar `user_id === broadcaster_id`. Não precisa de chamada à API.
- **Get Moderators** `GET /helix/moderation/moderators` exige `moderation:read` (ou `channel:manage:moderators`). Aceita até 100 `user_id` repetidos, e quem não é moderador fica de fora.
- **Get VIPs** `GET /helix/channels/vips` exige `channel:read:vips` (ou `channel:manage:vips`). Aceita até 100 `user_id`, e quem não é VIP é ignorado.
- Cada um traz mais um escopo opcional e mais um novo consentimento. A story deixa esses públicos fora de escopo, então eles ficam fora do MVP.

## 4. O resgate traz informação de inscrição? Consulta vs. cache

- O payload EventSub `channel.channel_points_custom_reward_redemption.add` e a resposta de Update Redemption Status trazem `user_id`, `user_login`, `user_name`, `user_input`, `status`, `reward` e `redeemed_at`. **Não trazem badges nem status de inscrição.**
- Badges do chat (`badges` do EventSub `channel.chat.message`) só existem quando a pessoa envia mensagem. Mostram o status daquele momento, podem vir como `founder` em vez de `subscriber` e não indicam presente com confiança. Servem no máximo como pista; não servem como fonte de auditoria.
- `channel.subscribe`, `channel.subscription.end`, `channel.subscription.gift` e `channel.subscription.message` (todos com `channel:read:subscriptions`) poderiam manter um cache local. Mas a entrega é pelo menos uma vez, eventos se perdem com o WebSocket fora do ar, não há snapshot inicial, e o cache exige tabela nova e aumenta a superfície de privacidade.

**Recomendação:** consultar o status **no momento da decisão de reembolso** via Get Broadcaster Subscriptions (em lote na limpeza). Isso segue o AC2 ("decidida uma vez, no momento … a partir do status que a Twitch informa"). O resultado tem três estados, `subscriber | not_subscriber | unknown`:
- `subscriber`/`not_subscriber` só vêm de uma resposta 200 com formato válido.
- `unknown` cobre escopo ausente, 401/403/429/5xx, timeout, corpo inválido, ID inválido ou canal não afiliado. **Nunca vira concessão nem negação.** A intenção financeira fica pendente de elegibilidade com motivo localizado, e a pessoa streamer pode tentar de novo, reembolsar manualmente ou manter o resgate.
- Decida o status uma vez por resgate e persista-o antes de criar a tarefa da outbox. Assim, retentativas não consultam de novo nem chegam a outra resposta (idempotência, AC5).

## 5. Limites de taxa e lote na limpeza da fila

- O Helix usa um token bucket por cliente e usuário. O orçamento normalmente documentado é de cerca de 800 pontos/minuto, e cada requisição custa 1 ponto. Leia `Ratelimit-Remaining`/`Ratelimit-Reset`; em caso de 429, recue e mantenha `unknown`/retentável.
- Uma chamada de Get Broadcaster Subscriptions verifica até 100 pessoas. Limpar N entradas custa ceil(N/100) consultas, não N.
- Update Redemption Status aceita até **50 `id` por chamada**, mas para um único `reward_id` e um único status. Cada fila corresponde a uma recompensa, então os reembolsos podem ser agrupados por recompensa em blocos de 50. Observe que a outbox atual usa uma intenção por resgate. O lote é uma otimização para `@architect`/`@data-engineer` e ainda precisa registrar o resultado de cada resgate. Um 404 significa "não está UNFULFILLED"; não o registre como reembolso.
- Latência: uma chamada Helix extra antes do cancelamento (≈100–300 ms típicos, não medido aqui). Na limpeza, a confirmação não pode mais anunciar o número de reembolsos de antemão. Deve dizer "reembolsos conforme a sua regra; X elegíveis, Y não elegíveis, Z aguardando verificação".

## 6. Opções de modelo de dados (para `@data-engineer`)

| Opção | Prós | Contras |
|---|---|---|
| **A. Coluna enum na fila** `refund_eligibility` (`everyone`/`subscribers`/`nobody`), NOT NULL DEFAULT `everyone` | Combina com as colunas booleanas tipadas atuais, aceita constraint CHECK/enum, preserva o padrão com facilidade | Novos públicos exigem migration do enum |
| B. JSON de configurações | Flexível | Validação mais fraca, consultas mais difíceis, foge do schema atual |

Recomendo **A**. No PostgreSQL, `ADD COLUMN … NOT NULL DEFAULT 'everyone'` mantém o comportamento das linhas existentes (default rápido, PG ≥ 11). O rollback remove a coluna. Faça um snapshot antes.

Auditoria, na intenção financeira ou em uma linha irmã por resgate: `eligibility_rule` (snapshot), `eligibility_decision` (`eligible`/`not_eligible`/`unknown`), `subscriber_status` (`subscriber`/`not_subscriber`/`unknown`), `subscriber_tier` (anulável), `subscriber_is_gift` (anulável), `status_source` (`helix_subscriptions`/`not_required`/`broadcaster_self`), `status_checked_at` e `unknown_reason` (só o código). Não guarde a identidade de quem presenteou nem tokens. Os logs não podem conter UID (regra do projeto). Crie um estado de outbox "aguardando elegibilidade", ou uma coluna de decisão, para que `unknown` nunca vire `request_cancel`/`no_operation` sem aviso.

## 7. Riscos e decisões recomendadas para as perguntas em aberto

| Pergunta | Recomendação | Risco se errar |
|---|---|---|
| Streamer/mods/VIPs elegíveis por padrão? | **Mods/VIPs não, por padrão** (fora de escopo, exigem escopos e novo consentimento). Resgates feitos pela própria pessoa streamer: elegíveis (verificação gratuita, sem escopo). Só o `@po` deve confirmar. | Reembolsos inesperados ou ausentes; aumento de escopo |
| Inscrição presenteada e todos os tiers contam? | **Sim. Qualquer inscrição ativa, de qualquer tier, incluindo Prime e presenteada**, como a Twitch informa. Registre tier e `is_gift` na auditoria, para que uma futura opção "excluir presentes" não precise de migration. | Discussões com espectadores se a regra for mais restrita que o badge que eles veem |
| Toda condição ou por condição? | **Uma regra por fila, aplicada a todo reembolso que o bot solicitaria**: removido quando chamado, no-show, saída, remoção de quem aguarda **e** limpeza/exclusão da fila. Hoje limpeza e exclusão forçam o reembolso, então precisam passar pela regra. Sem isso, um streamer "somente inscritos" reembolsaria todo mundo ao limpar. Escolha por condição pode vir depois, se houver pedido. | Os caminhos forçados atuais contornam a regra sem que ninguém perceba |

Outros riscos: o intervalo até o novo consentimento dos streamers existentes, que exige uma experiência clara para `unknown`. A cópia da limpeza promete números de reembolso hoje. Um resgate não elegível deixado UNFULFILLED continua na fila da Twitch da pessoa streamer, então é preciso decidir de forma explícita entre marcá-lo FULFILLED (sem reembolso) ou deixá-lo como está. Há também a divergência do badge `founder`, se badges forem usados algum dia. E o status reflete o momento da decisão, não o do resgate.

## Fontes (acessadas em 2026-10-21)

- Referência da API Twitch — Update Redemption Status, Get Moderators, Get VIPs (conferidos na página): https://dev.twitch.tv/docs/api/reference/
- Get Broadcaster Subscriptions / Check User Subscription (mesma referência; a leitura da página foi truncada antes desta seção, então os campos foram confirmados por trechos de busca e pela documentação Twurple): https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions, https://twurple.js.org/reference/api/classes/HelixSubscription.html
- Escopos: https://dev.twitch.tv/docs/authentication/scopes/
- Tipos de assinatura EventSub e payload de resgate: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
- Limites de taxa: https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits
- Comunidade (complementar; dados de quem presenteou só para presentes ativos): https://discuss.dev.twitch.tv/t/help-for-gift-subscribe/24582, https://discuss.dev.twitch.tv/t/websocket-notification-know-who-gifted-sub/42189

**Não verificado nesta passada:** o limite exato de `user_id` em Get Broadcaster Subscriptions, a ausência de flag Prime, o valor atual de 800 pontos e a latência real. Valide com `@architect` contra a documentação e fakes. Não há afirmação sobre a Twitch real.


## Adendo — tentativa de verificação, 2026-10-21 (Orion, WebSearch/WebFetch)

- **Verificado (guia oficial, https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits):** a Helix usa balde de tokens; o custo padrão é 1 ponto por requisição; balde esgotado devolve HTTP 429; requisições de app e de usuário têm baldes separados e, com token de usuário, o limite vale por client ID por usuário por minuto; os cabeçalhos são `Ratelimit-Limit`, `Ratelimit-Remaining` e `Ratelimit-Reset` (use o último para decidir quanto esperar). Alguns endpoints podem devolver 429 por motivos alheios ao balde geral, então é preciso interpretar a mensagem de erro.
- **Confirmado em parte (referência do Twurple, https://twurple.js.org/reference/api/classes/HelixSubscriptionApi.html):** `getSubscriptionsForUsers` é descrito como “o subconjunto da lista de usuários que é inscrito no broadcaster”, `getSubscriptionForUser` consulta com a autorização do broadcaster e `checkUserSubscription` com a do usuário — coerente com usar o token da streamer nas consultas em lote.
- **Evidência da comunidade (https://discuss.dev.twitch.tv/t/channel-points-api-update-redemption-status-endpoint-should-be-accessible-using-client-flow/30939):** Update Redemption Status exige token de usuário e só gerencia recompensas criadas pelo mesmo client ID (tópico antigo; retestar na Twitch real antes de depender disso).
- **Ainda NÃO verificado em texto oficial** (a página de referência da API tem ~517 mil caracteres e foi truncada pela ferramenta): o limite de 100 `user_id` por chamada de Get Broadcaster Subscriptions, o máximo de `first`, a redação exata do escopo, as descrições de `is_gift`/`tier`, a representação de Prime e o limite de 50 ids do Update Redemption Status. **Consequência de projeto para o CA 11:** tamanhos de lote são constantes de configuração, nunca números assumidos; qualquer erro 4xx de lote vira `unknown`; `Ratelimit-Reset` é respeitado no 429; os números serão confirmados na referência viva durante o gate do @architect.

## Rodada de verificação 2 — 2026-10-21 (@analyst Atlas)

Método: a referência oficial completa (https://dev.twitch.tv/docs/api/reference/, `dateModified` da página 2026-10-19) e o guia (https://dev.twitch.tv/docs/api/guide/) foram baixados inteiros e pesquisados como texto, evitando o truncamento do WebFetch. As citações estão no original em inglês. Nenhuma chamada à Twitch real foi feita.

1. **Get Broadcaster Subscriptions — VERIFICADO (oficial); parte de Prime PARCIAL.** Fonte: https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions
   - Token/escopo: “Requires a user access token that includes the channel:read:subscriptions scope.” e `broadcaster_id`: “This ID must match the user ID in the access token.” (ou seja, o token da própria streamer).
   - `user_id`: “You may specify a maximum of 100 subscribers.” `first`: “the maximum is 100 items per page. The default is 20.” `after`/`before`: “Do not specify if you set the user_id query parameter.” `total`/`points`: “If the user_id query parameter is used, this field will be null.”
   - `tier`: “The type of subscription. Possible values are: 1000 — Tier 1 2000 — Tier 2 3000 — Tier 3”. `is_gift`: “Is true if the subscription was gifted.” `gifter_id`/`gifter_login`/`gifter_name`: “Is an empty string if is_gift is false.” (Já o Check User Subscription diz que os campos de gifter aparecem “only if is_gift is true”.)
   - Prime: o texto oficial não tem valor nem flag de Prime. Só comunidade (não é equipe da Twitch, 2023-06-20): “the API alone doesn't give you this data as, as you found, it doesn't distinghish primes” — https://discuss.dev.twitch.com/t/distinguishing-prime-sub-from-recurring-sub-in-subscriptions-api/46189 . Trate Prime como `tier: "1000"`, indistinguível.
   - Broadcaster na própria lista: **NÃO VERIFICADO** — nenhuma afirmação oficial ou da comunidade encontrada. Não dependa de nenhum dos comportamentos; trate a streamer por regra explícita.
2. **Update Redemption Status — VERIFICADO (oficial).** Fonte: https://dev.twitch.tv/docs/api/reference/#update-redemption-status
   - “You may update a redemption only if its status is UNFULFILLED. The app used to create the reward is the only app that may update the redemption.”
   - `id`: “You may specify a maximum of 50 IDs.” `reward_id` é um único parâmetro obrigatório, então todos os ids de uma chamada precisam ser da mesma recompensa (inferência pelo formato do parâmetro; não há frase separada).
   - Corpo `status`: “Possible values are: CANCELED FULFILLED Setting the status to CANCELED refunds the user’s channel points.” 404: “The redemptions specified using the id query parameter were not found or their statuses weren't marked as UNFULFILLED.” O 403 inclui “The broadcaster is not a partner or affiliate.”
   - **Resposta:** só UNFULFILLED → FULFILLED ou UNFULFILLED → CANCELED. Um resgate FULFILLED **não** pode ser reembolsado depois pela API. Marcar como FULFILLED um resgate não elegível impede qualquer reembolso posterior pelo app; mantenha UNFULFILLED se um reembolso manual/automático posterior precisar continuar possível.
   - Fatos oficiais relacionados: Delete Custom Reward — “If the reward’s redemption status is UNFULFILLED at the time the reward is deleted, its redemption status is marked as FULFILLED.” Get Custom Reward Redemption — “Canceled and fulfilled redemptions are returned for only a few days after they’re canceled or fulfilled.” `should_redemptions_skip_request_queue` — se true, os resgates são “set to FULFILLED status immediately” (logo, recompensas assim nunca podem ser reembolsadas pela API).
3. **Resgates UNFULFILLED na fila — NÃO VERIFICADO.** A referência só diz que, com a fila ativa, o status “is set to UNFULFILLED and follows the normal request queue process”. Nenhum texto oficial (referência ou Central de Ajuda; https://help.twitch.tv/s/article/channel-points-guide não renderizou para a ferramenta) nem tópico do fórum afirma expiração automática, reembolso automático ou limite de resgates pendentes. Documentação de terceiros (https://docs.streamer.bot/faq/fulfill-cancel-cpr) só descreve concluir/cancelar manualmente. Premissa de projeto: ficam UNFULFILLED até alguém agir, mas apagar a recompensa os torna FULFILLED (oficial, item 2) — portanto nunca apague uma recompensa com resgates reembolsáveis pendentes.
4. **Moderadores/VIPs — VERIFICADO (oficial).** Get Moderators: “Requires a user access token that includes the moderation:read scope. If your app also adds and removes moderators, you can use the channel:manage:moderators scope instead.”; `user_id` “maximum of 100 IDs… The returned list includes only the users from the list who are moderators”; `first` máximo 100. Get VIPs: “Requires a user access token that includes the channel:read:vips scope. If your app also adds and removes VIP status, you can use the channel:manage:vips scope instead.”; “The maximum number of IDs that you may specify is 100. Ignores the ID of those users in the list that aren’t VIPs.” Ambos exigem que `broadcaster_id` “match the user ID in the access token”. Fontes: https://dev.twitch.tv/docs/api/reference/#get-moderators, https://dev.twitch.tv/docs/api/reference/#get-vips
5. **Tratamento de 429 — VERIFICADO (oficial), já resumido no Adendo.** Guia: “If your bucket runs out of points within 1 minute, the request returns status code 429.”; “For requests that specify a user access token, the limits are applied per client ID per user per minute.”; “Some API endpoints may return HTTP 429 response codes for reasons unrelated to the general rate limit bucket. In these cases, you must parse the error message returned to determine the reason for the response.” O mesmo guia diz que o código “should not take dependencies on message strings” — então classifique o 429 por status + `Ratelimit-Reset` e registre a mensagem só como diagnóstico. Alguns endpoints têm janelas próprias (ex.: Remove Channel Moderator: “exceeded the number of requests allowed within a 10-second window”); nenhum dos cinco endpoints acima documenta custo diferente do padrão.

Limitações restantes: o comportamento de Prime, da streamer na própria lista e da expiração da fila precisa ser confirmado na Twitch real (canal de teste) por `@architect`/`@qa`; nenhum fixture aqui prova comportamento real.
