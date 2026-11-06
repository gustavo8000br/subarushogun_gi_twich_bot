# Devolução de pontos de canal por grupo (inscritos, moderadores, VIPs, lista própria) e avisos da fila (nota de pesquisa)

[English](../../../research/2026-11-06-queue-group-refund/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-05 (pasta datada de 2026-11-06 a pedido do coordenador). Branch: `main` (`3225c8f`).
- Rótulos: **VERIFICADO** (página oficial lida nesta sessão, código instalado do Twurple 8.2.0 ou código do repositório), **PARCIAL** (fonte secundária ou incompleta), **NÃO VERIFICADO** (inferência ou nenhuma fonte encontrada; só um teste real na Twitch ou uma decisão fecha).
- Escopo: somente pesquisa e recomendação. Nenhum código, teste, chamada à Twitch, banco de dados ou operação Git foi executado. Nada aqui prova o comportamento real da Twitch.
- Reaproveitado, não repetido: `docs/pt-BR/research-index.md`, linhas #15 (OPS-20, devolução por status de inscrito, **LACUNA**), #17, #20 (sincronia de resgates, **SUFICIENTE**) e #9 (chat da OPS-7, **REVISAR SE** o Twurple sair da 8.2.0). Os achados são citados pelo número, sem nova pesquisa. Esta nota acrescenta só o que eles não cobriam.
- Decisões do dono (2026-11-06) tomadas como dadas: `redemption.fulfill` ao iniciar o atendimento (`in_progress`) continua sendo o fluxo padrão; o novo escopo da 0.4.0-beta+ é (1) aviso no chat ao entrar, (2) mensagens de não compareceu/pular/reordenar, (3) mensagem de fim de atendimento e "próximo" no widget, (4) pausar/fechar com aviso, (5) devolução por grupo a critério do streamer, com o **momento** (ao entrar ou ao iniciar) também escolhido por fila.

## 1. Resumo executivo

1. **Tudo o que foi pedido é tecnicamente viável com a API da Twitch que o projeto já usa.** A devolução é só `Update Redemption Status` com `CANCELED`; as consultas de grupo são três endpoints Helix que aceitam até 100 `user_id` por chamada. Item 1 SIM, item 2 SIM com custo de reautorização, item 3 SIM com restrições, item 4 SIM, item 5 SIM com restrições (seção 8).
2. **Um resgate FULFILLED nunca pode ser devolvido pela API.** O texto oficial só permite alterar a partir de `UNFULFILLED`, e só pelo aplicativo que criou a recompensa. Logo, a escolha devolver-ou-cumprir é **irreversível e deve ser feita uma única vez, a partir de uma decisão gravada antes da chamada à Twitch**.
3. **O evento de resgate não traz papel.** Inscrito, moderador e VIP precisam ser consultados (Helix, com o token do próprio streamer) no momento da decisão. Badges do chat valem **só para comandos de chat**, nunca para o caminho do resgate.
4. **Três escopos opcionais novos**, um por grupo: `channel:read:subscriptions` (subs), `moderation:read` (mods), `channel:read:vips` (VIPs). A "lista própria" não precisa de escopo. Peça cada escopo **somente quando o streamer ativar aquele grupo** (a Twitch exige pedir apenas os escopos que as chamadas usam). Canais já conectados precisam refazer o OAuth; o projeto já tem o mecanismo de escopo opcional (`optionalScopes` em `apps/api/src/twitch/oauth.mjs`) e o padrão `unknown` que falha fechado (`checkFollower`).
5. **Desenho recomendado em uma linha:** configuração `settlement` por fila (`fulfill_on_start` padrão, `refund_on_start`, `refund_on_join`) mais um conjunto de grupos reembolsados por fila; decisão = `eligible | not_eligible | unknown`, gravada uma vez por resgate; `unknown` nunca vira cancelar nem cumprir sozinho.
6. **Construa `refund_on_start` primeiro.** Ele só troca a operação terminal (cancelar em vez de cumprir) no caminho existente. `refund_on_join` cria um estado novo (entrada mantida sem resgate pendente) e toca nas regras de resgate duplicado, limpeza e remoção; é a segunda fatia.
7. **Avisos no chat são baratos e seguros** com o remetente atual: o bot escreve como o streamer, então o limite é 100 mensagens por 30 s. Os riscos reais são rajadas (limpar, reordenar em massa) e descartes com `is_sent=false`. Agregue mensagens; continue tratando `is_sent != true` como não entregue (o worker de chamadas já faz isso).
8. **Ainda em aberto (exige teste real ou o dono):** se a Twitch alguma vez expira um resgate UNFULFILLED (nenhuma fonte, de novo), se um resgate cancelado libera o limite por pessoa/por transmissão da recompensa, se `...redemption.update` dispara para mudanças feitas pela API, a representação de Prime e se o streamer aparece nas próprias listas.

## 2. Viabilidade por item

| # | Item | Veredito | Evidência principal |
|---|---|---|---|
| 1 | Cancelar = devolver; sem devolução após FULFILLED | **SIM** | Update Redemption Status, oficial: "Setting the status to CANCELED refunds the user's channel points"; "You may update a redemption only if its status is UNFULFILLED. The app used to create the reward is the only app that may update the redemption." (linha #15, rodada 2, reconfirmado abaixo) |
| 2a | Verificar inscrito | **SIM, COM RESTRIÇÕES** | Get Broadcaster Subscriptions, `channel:read:subscriptions`; Prime indistinguível; streamer na própria lista NÃO VERIFICADO |
| 2b | Verificar moderador | **SIM** | Get Moderators, `moderation:read` ou `channel:manage:moderators`; `user_id` até 100 |
| 2c | Verificar VIP | **SIM** | Get VIPs, `channel:read:vips` ou `channel:manage:vips`; até 100 IDs |
| 2d | Lista própria | **SIM** | Sem chamada à Twitch; guardar o ID numérico; privacidade na seção 7 |
| 3a | Devolver ao entrar | **SIM, COM RESTRIÇÕES** | Cancelar logo após criar a entrada; novo estado "entrada sem resgate pendente" |
| 3b | Devolver ao iniciar | **SIM** | Cancelar no lugar de cumprir; mesma outbox, mesma leitura de verificação |
| 4 | Avisos no chat, mensagens de reordenação | **SIM** | Helix Send Chat Message; o projeto já envia e confere `is_sent` |
| 5 | Privacidade de lista própria | **SIM, COM RESTRIÇÕES** | Guardar só o ID; logs sem UID; base de consentimento OAuth para retenção (PARCIAL) |

## 3. Item 1: cancelar = devolver (VERIFICADO, salvo indicação)

Fontes (lidas em 2026-11-05): [Update Redemption Status](https://dev.twitch.tv/docs/api/reference/#update-redemption-status), conforme citado nas linhas #15 e #20; o adaptador do projeto chama o Twurple `updateRedemptionStatusByIds(broadcasterId, rewardId, [redemptionId], status)` (`apps/api/src/twitch/helix-adapter.mjs:162`).

- Transições: `UNFULFILLED -> CANCELED` (devolve) e `UNFULFILLED -> FULFILLED`. Nenhuma outra. **Um resgate FULFILLED não pode ser devolvido pela API** (confirmado, como o dono supunha).
- Só o Client ID que criou a recompensa pode atualizar. O projeto cria e gerencia a própria recompensa, então isso vale; recompensas criadas no painel da Twitch ou por outra ferramenta estão **fora de alcance** e não podem ser oferecidas como filas reembolsáveis.
- Erros: 404 = ids não encontrados **ou** não UNFULFILLED (um segundo cancelamento, ou cancelar depois de cumprir, retorna 404 e é indistinguível de "nunca existiu" sem uma leitura); 403 inclui "broadcaster is not a partner or affiliate"; 401 = token/escopo. Até 50 ids por chamada, uma `reward_id` e um status por chamada.
- `should_redemptions_skip_request_queue = true` deixa os resgates FULFILLED na hora, então essa recompensa **nunca** pode ser devolvida. O projeto já força `false`; mantenha isso como pré-condição rígida de qualquer modo de devolução.
- Apagar uma recompensa com resgates UNFULFILLED os marca FULFILLED (sem devolução) (linha #20). Qualquer modo de devolução deve bloquear a exclusão da recompensa enquanto houver resgates reembolsáveis pendentes (o projeto já bloqueia a exclusão da fila).
- Resgates UNFULFILLED antigos: a referência oficial diz apenas que o status "follows the normal request queue process". **Nenhuma fonte oficial ou da comunidade fala em expiração, limite ou devolução automática.** Nova busca em 2026-11-05 de novo não achou nada (só documentação de ferramentas de terceiros sobre cumprir/cancelar manualmente). Situação: **NÃO VERIFICADO**, igual à LACUNA 1 do índice. Consequência de desenho: não dependa de expiração em nenhum sentido; `refund_on_start` pode segurar pontos por muito tempo, o que é assunto de UX e do dono (seção 9).
- Efeito colateral não verificado: se um resgate CANCELED restaura os contadores `max_per_user_per_stream` / recarga global / máximo por transmissão. Nenhuma fonte encontrada. Isso decide se `refund_on_join` deixa membros do grupo reentrarem de graça várias vezes. Tratar como **NÃO VERIFICADO**; testar ao vivo.

## 4. Item 2: identificar o grupo (VERIFICADO, salvo indicação)

### 4.1 Onde o papel não está

O payload de `channel.channel_points_custom_reward_redemption.add` tem `user_id`, `user_login`, `user_name`, `user_input`, `status`, `reward`, `redeemed_at` e **nenhum badge nem papel** (linha #15). O `channel.chat.message` traz `badges`, e a Twitch diz: leia em cada mensagem, não guarde, "a user may change their chat badges at any time" ([Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/), lido em 2026-11-05; linha #9 RF-1/RF-2). Use badges **somente** em comandos de chat (`apps/api/src/commands/authorization.mjs` já faz isso). Uma pessoa pode resgatar sem nunca ter falado no chat, então badges não decidem devolução.

### 4.2 Endpoints, escopos e limites

Os três exigem token de usuário do **streamer** ("`broadcaster_id` must match the user ID in the access token") e aceitam filtro `user_id` com limite de 100, devolvendo só quem corresponde (linha #15, rodada 2, texto oficial; redação dos escopos reconfirmada em [Scopes](https://dev.twitch.tv/docs/authentication/scopes/) em 2026-11-05).

| Grupo | Endpoint | Escopo (qualquer um) | Método do Twurple 8.2.0 (código instalado) | Redação oficial do escopo |
|---|---|---|---|---|
| Inscrito | `GET /helix/subscriptions?broadcaster_id&user_id` | `channel:read:subscriptions` | `api.subscriptions.getSubscriptionsForUsers(broadcaster, users)` / `getSubscriptionForUser` | "View a list of all subscribers to a channel and check if a user is subscribed to a channel." |
| Moderador | `GET /helix/moderation/moderators` | `moderation:read` ou `channel:manage:moderators` | `api.moderation.getModerators(channel, {userId})` / `checkUserMod` | "View a channel's moderation data including Moderators, Bans, Timeouts, and Automod settings." |
| VIP | `GET /helix/channels/vips` | `channel:read:vips` ou `channel:manage:vips` | `api.channels.checkVipForUsers(broadcaster, users)` / `checkVipForUser` | "Read the list of VIPs in your channel." |

Notas:
- Prefira os escopos de **leitura** (`channel:read:subscriptions`, `moderation:read`, `channel:read:vips`); as variantes `manage` permitem alterar papéis e violam o menor privilégio. `moderation:read` é amplo (banimentos, timeouts, configurações do AutoMod): a tela de consentimento fica mais pesada que o propósito do grupo. Explique o motivo ao streamer. **PARCIAL**: o texto exato da tela de consentimento de cada escopo não foi checado.
- Inscritos: `tier` `1000/2000/3000`, `is_gift`. Prime vem como tier 1000 e não se distingue (resposta da comunidade, PARCIAL); o streamer na própria lista é **NÃO VERIFICADO**. Decida o streamer pela regra explícita `user_id == broadcaster_id` (sem chamada). Faça o mesmo para moderador/VIP.
- Pessoa em vários grupos: a elegibilidade é a **união** dos grupos ativados; grave qual grupo casou (`matched_group`) para auditoria, em ordem fixa (lista própria, moderador, VIP, inscrito) para o valor ser determinístico.
- O `callApi` do Twurple recebe os `scopes` de que precisa e o adaptador pode ler `getCurrentScopesForUser`, como o `checkFollower` faz hoje; escopo ausente -> `unknown`, nunca "não é membro".

### 4.3 Limites de taxa, cache e frescor

- Balde de fichas da Helix, 1 ponto por requisição por padrão, 429 quando esgota, cabeçalhos `Ratelimit-Limit/Remaining/Reset`; limites de token de usuário são por Client ID por usuário por minuto ([guia](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits), linhas #15, #17). Não assuma o número 800; leia os cabeçalhos.
- Custo por resgate: no máximo uma chamada por grupo ativado (1 a 3). Mesmo limpar 100 entradas dá no máximo 3 chamadas por 100 pessoas. É desprezível frente a qualquer balde documentado.
- **Recomendação de cache:** sem cache persistente. Consulte na hora da decisão, mantenha o resultado em memória por poucos segundos só para juntar rajadas (mesma pessoa, mesmo momento) e **grave a decisão** por resgate. Cache mais longo traz papéis desatualizados e uma tabela de rol (superfície de privacidade).
- Rol por eventos (opcional, depois): EventSub `channel.subscribe`/`channel.subscription.end` ("Must have `channel:read:subscriptions` scope"), `channel.moderator.add/remove` ("Must have `moderation:read` scope"), `channel.vip.add/remove` ("Must have `channel:read:vips` or `channel:manage:vips` scope"), todos versão 1, existem ([tipos de assinatura EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), lido em 2026-11-05). São pelo-menos-uma-vez, perdem eventos com desconexão e não dão retrato inicial (linha #15), então só poderiam **atualizar** um cache, nunca substituir a consulta. Não vale para esta escala. Reabrir se a consulta algum dia levar 429.
- Frescor: o status vale "no momento da decisão", não no do resgate. Em `refund_on_start` isso pode ser minutos depois; quem deixou de ser inscrito nesse intervalo perde a devolução. Diga isso no texto do painel.

### 4.4 Custo de reautorizar o canal

- Tokens mantêm os escopos concedidos. Incluir escopos exige nova autorização; a página de autenticação da Twitch não descreve isso, e uma resposta da comunidade diz que os mesmos escopos não pedem consentimento de novo sem `force_verify=true`, e que a tela lista todos os escopos ([tópico](https://discuss.dev.twitch.com/t/incremental-authorization-practices/19550), PARCIAL; sem declaração oficial). Portanto peça **obrigatórios mais todos os opcionais desejados** no novo fluxo e confira com `/validate` que a lista concedida os contém (o projeto já faz isso em `oauth.mjs`, linhas ~96-98).
- Impacto no repositório (VERIFICADO, código lido): `requiredScopes` é checado em todo token, então os escopos novos **devem continuar opcionais**, senão toda conexão existente quebra. `optionalScopes = ['moderator:read:followers']` e `issue({scopes})` rejeitam escopos opcionais desconhecidos, então acrescentar três strings mais a UX "Reconectar a Twitch para ativar este grupo" é toda a mudança. Grupo ativado sem escopo deve mostrar `reconnect_required` e avaliar como `unknown`.
- Uma reconexão a mais por streamer, uma vez por conjunto de escopos. Pedir os três de uma vez custa uma só reconexão, mas pede demais a quem ativa um grupo. Recomendação: **pedir só o escopo do grupo que está sendo ativado**, acumulando (novo pedido = conjunto concedido mais o novo), de modo que um segundo grupo custe uma segunda reconexão pequena. É decisão do dono (seção 9, D-1).
- A regra da Twitch: "An application must request only the scopes required by the APIs that their app calls", com aviso de suspensão ([Scopes](https://dev.twitch.tv/docs/authentication/scopes/)). Pedir escopos sem uso de antemão é a escolha arriscada.

## 5. Item 3: momento da devolução

### 5.1 Comportamento de cada momento

| | `refund_on_start` | `refund_on_join` |
|---|---|---|
| Operação terminal na Twitch | `CANCELED` no lugar de `FULFILLED` quando a entrada vira `in_progress` | `CANCELED` logo após criar a entrada `waiting` |
| Pontos durante a espera | Retidos (gastos) até o início | Devolvidos em segundos (a pessoa vê gasto e devolução) |
| Estado ao iniciar | Resgate UNFULFILLED, como hoje | **Sem resgate pendente**; `redemption.fulfill` deve ser pulado |
| Mudanças no código atual | Tipo de operação escolhido ao iniciar (`redemption.cancel` em vez de `redemption.fulfill`) | Novo estado de liquidação; regras de "devolver na remoção de espera / limpeza / duplicado" precisam tratar resgate já devolvido como concluído |
| Abuso por quem não é do grupo | Impossível: não membros recebem FULFILLED como hoje | Igual; mas membros podem reentrar de graça, então dependa de `duplicate_active_entry`, limites por pessoa e do comportamento não verificado dos contadores (item 3) |
| Espera longa | Pontos ficam retidos por muito tempo; expiração NÃO VERIFICADA | Sem problema |
| Encaixe com "nunca confirmar sem leitura remota" | Direto | Direto, mas a entrada existe com `settlement=refunded` que precisa ser confirmada por leitura |

### 5.2 Outbox e recuperação da OPS-22

- A outbox tem `redemption.fulfill` e `redemption.cancel`, cada um verificado por leitura do estado remoto antes e depois (`apps/api/src/outbox/financial-worker.mjs`, `classifyRemoteState`; linha #20). A política de recuperação (6 tentativas, leitura de verificação, resolução manual) vale sem mudança para um cancelamento emitido como devolução.
- **Corrida fulfill vs cancel:** dois intentos para o mesmo resgate podem ficar pendentes (por exemplo, a entrada é iniciada enquanto um cancelamento de `refund_on_join` está em nova tentativa, ou a entrada é removida enquanto o início cumpre). A Twitch aceita só o primeiro e responde 404 ao outro, o que a leitura de verificação transforma em "divergência". Invariante exigida: **um intento terminal por resgate** (restrição única por resgate mais tipo terminal), gravado na mesma transação que decide a elegibilidade; um pedido posterior que queira o resultado terminal oposto vira caso de resolução manual, nunca troca silenciosa. Isso casa com a regra do projeto de que resposta ausente ou contraditória nunca é confirmação.
- **Cancelamento duplo:** a segunda chamada retorna 404 (não UNFULFILLED); a leitura mostra `CANCELED` = esperado, então deve resolver como já feito, não como falha. O `classifyRemoteState` atual e a correção de `statusCode` vs `status` (linha #20) já cobrem esse caminho; acrescente teste com instância real do Twurple, não objeto simples.
- **Decisão antes da chamada:** grave `eligibility_decision`, `matched_group`, `settlement_mode`, `checked_at` e um código `unknown_reason` antes de enfileirar, como a linha #15 recomendou para a OPS-20 (tentativas repetidas não podem reconsultar e inverter a resposta).
- **Desconhecido:** com `refund_on_join`, desconhecido significa que o resgate segue UNFULFILLED, a entrada segue `waiting` e a outbox guarda um item "aguardando elegibilidade" com novas tentativas (429/5xx) e uma ação no painel (devolver / cumprir / manter). Com `refund_on_start`, desconhecido **bloqueia o cumprimento automático**; o início não pode escolher em silêncio, porque FULFILLED é irreversível.
- **Rastreabilidade:** depois de um cancelamento ao entrar, a entrada não tem resgate pendente para correlacionar. Mantenha `redemption_id` e o status terminal na entrada, mais uma linha de auditoria (sem UID em logs). `Entry.redemptionId` e as linhas `Redemption` (Prisma) já permitem isso; o que muda são os valores de status.
- Risco de evento perdido: existe um evento EventSub `...redemption.update` ("Must have `channel:read:redemptions` or `channel:manage:redemptions`"; o comentário do campo status no payload diz "Either fulfilled or cancelled"), mas o texto não diz que ele dispara para mudanças feitas pelo próprio aplicativo. **NÃO VERIFICADO**. Nunca use como confirmação; a leitura continua sendo a fonte da verdade.

### 5.3 Recomendação sobre o momento

Implemente `refund_on_start` primeiro (baixo risco, mesmo caminho, sem estado novo de entrada). Acrescente `refund_on_join` como segunda fatia, só depois que o teste real responder a questão dos contadores (3). Mantenha `fulfill_on_start` como padrão das filas existentes, para nada mudar em silêncio.

## 6. Item 4: avisos no chat e reordenação (VERIFICADO, salvo indicação)

Fontes lidas em 2026-11-05: [Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/), [guia de chat: limites](https://dev.twitch.tv/docs/chat/), [referência Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message).

- Remetente: o projeto chama o Twurple `api.chat.sendChatMessage(broadcasterId, message)` com o token `user:write:chat` do streamer, então o **remetente é o streamer**. Nenhum escopo novo.
- Limites: bot que não é streamer/mod/VIP: 20 mensagens por 30 s e 1 por segundo por canal; streamer, moderador ou VIP: 100 por 30 s; bots verificados 7.500 por 30 s ("rarely granted"). Exceder faz a Twitch ignorar as mensagens do bot por uma hora, exceto onde o bot é streamer/mod/VIP. Como o remetente é o streamer, a regra de 1 por segundo não se aplica e o teto é 100 por 30 s. O balde do Send Chat Message é separado do balde comum da Helix.
- Mensagem de até 500 caracteres; 422 "The message is too large"; 403 remetente não pode falar ali; 429 limite excedido. Resultado da entrega: `is_sent` e `drop_reason {code, message}` (exemplo `automod_held`). O projeto já trata `is_sent !== true` como `chat_delivery_not_confirmed` e tenta de novo (`chat-worker.mjs`).
- Mensagens duplicadas: a seção do Send Chat Message não traz regra de duplicidade; o conhecimento comunitário de uma janela de mensagens repetidas é **NÃO VERIFICADO** aqui. Varie o texto por destinatário (nome e posição), o que também lê melhor.
- Rajadas: um evento em massa (limpar, fechar, reordenar, cadeia de não compareceu) pode passar de 100 por 30 s. Política recomendada: uma mensagem-resumo por tipo de evento, fila de envio com limite (por exemplo, no máximo N por 30 s com folga), prioridade da chamada "sua vez" sobre avisos informativos, juntar ou descartar avisos informativos no estouro, nunca repetir indefinidamente aviso informativo.
- Anúncios: `Send Chat Announcement` é uma API à parte (não é a de mensagem; cor de faixa; não pode ser resposta). O escopo não foi verificado nesta passada (**NÃO VERIFICADO**; provavelmente de moderador). Não é preciso: mensagens simples bastam e não somam escopo.
- Respostas: `reply_parent_message_id` encadeia a resposta ao comando da pessoa. Útil para `!posição`; opcional.
- Comando de presença (`!aqui`) após a chamada: tratado no chat com badges para permissão, no pipeline de comandos existente; a única necessidade nova é checar a identidade do dono da entrada (`user_id`), não papéis.
- Outros bots de fila (PARCIAL, só complementar, READMEs de repositórios): o [Firebot queue](https://github.com/giff-h/FirebotQueue) move quem foi pulado para uma lista de pulados, recoloca a pessoa à frente quando volta e anuncia a nova posição; o [Jambo](https://github.com/Nertsal/jambo) tem `!skip`, `!skip next`, `!unskip` só do streamer e pulo automático se o dono não responder em um prazo; o [twitch-queue-bot](https://github.com/sirskaro/twitch-queue-bot) tem `!wait` e `!drop`; a [Viewer Queue](https://blog.streamelements.com/level-up-your-engagement-with-viewer-queue-2cdcdcd40f6a) do StreamElements lista só escolher/remover/posição. Nenhum documenta "não compareceu" como tal. Leve as ideias (lista de pulados, prazo e depois pular, eco da posição), não o comportamento, como requisitos.
- O `ChatClient` (IRC) do Twurple não é usado nem necessário; mantenha a Helix. A leitura do chat continua no EventSub `channel.chat.message` (linha #6).

## 7. Item 5: privacidade e conformidade

- **Lista própria:** guarde só o `user_id` numérico da Twitch (estável; logins mudam) e, opcionalmente, o nome de exibição como rótulo do painel, atualizado pelo Get Users quando exibido. Resolva o login digitado pelo streamer para ID uma única vez ao adicionar (Get Users não exige escopo especial). Marque as entradas com `added_at`; permita remover e limpar tudo; apague-as junto com a fila e com os dados do canal. **Titularidade:** a lista é dado do streamer sobre a própria audiência, o que mantém a retenção dentro da finalidade consentida via OAuth.
- **Logs:** sem UID, login, token, cabeçalho nem texto de chat nos logs (regra do projeto, `AGENTS.md`); use contagens e códigos de motivo (`matched_group`, `unknown_reason`). Respostas do painel/API podem mostrar logins somente ao dono autenticado.
- **Termos de desenvolvedor (PARCIAL):** a página do [Developer Services Agreement](https://legal.twitch.com/en/legal/developer-agreement/) é renderizada por script e seu corpo não pôde ser lido pela ferramenta de busca nesta sessão. Pelo fórum de desenvolvedores: uma pessoa cita a cláusula que permite aos aplicativos "cache such information for only a twenty-four hour time period without further sharing it with third parties"; uma resposta de 2025-07-14 de uma conta ligada à Twitch (`jbulava`, "we"; selo não exibido) diz que, com um fluxo OAuth, "you are compliant with our Developer Services Agreement to store and present this information" além de 24 horas e que os demais termos continuam valendo ([tópico](https://discuss.dev.twitch.com/t/storage-of-data-from-twitch-api/63884)). Portanto guardar as escolhas de rol do próprio streamer obtidas por OAuth é aceitável; o que **não** está estabelecido é um direito geral de manter um rol de todo inscrito/mod/VIP. Isso apoia a recomendação "sem rol persistente, guardar só a decisão". Trate a redação como não confirmada até o `@po` ou o dono lerem o acordo vigente.
- **Minimização:** o registro da decisão guarda `matched_group`, tier (opcional), `checked_at`; não guarde a identidade de quem presenteou (linha #15). A "lista própria" é o único armazenamento de IDs de espectadores além das entradas que já existem.
- **Pedidos de exclusão:** se uma pessoa pedir para sair de uma lista própria, o streamer remove a linha (ação do painel); documente. Não é preciso caminho automático de exclusão.

## 8. Desenho recomendado de alto nível

1. **Configuração da fila:** enum `settlement` (`fulfill_on_start` padrão, `refund_on_start`, `refund_on_join`); `refund_groups` como conjunto de (`subscriber`, `moderator`, `vip`, `own_list`), vazio significa ninguém; streamer tratado por regra explícita (decisão D-3). Estende a opção A do modelo de dados da OPS-20 (enum por fila) de "todos/inscritos/ninguém" para um conjunto; recomenda-se que `@architect` e `@data-engineer` tratem como um só desenho, não duas histórias.
2. **Serviço de decisão:** `decide(userId, queue)` -> `{decision: eligible|not_eligible|unknown, matched_group, reason}`; desconhecido para escopo ausente, 401/403/429/5xx, timeout, corpo malformado, canal não afiliado; consultas limitadas aos grupos ativados; lista própria consultada primeiro (sem chamada).
3. **Gravar antes de agir:** linha de decisão mais um único intento terminal por resgate em uma transação; a outbox faz a chamada à Twitch com a leitura de verificação e a recuperação existentes.
4. **Mapeamento terminal:** elegível -> cancelar; não elegível -> cumprir (no momento da fila); desconhecido -> aguardando elegibilidade com ações no painel (tentar de novo / devolver / cumprir / manter UNFULFILLED).
5. **Pré-condições impostas (senão os modos de devolução ficam desativados):** recompensa criada por este Client ID; pular a fila de pedidos desligado; canal afiliado/parceiro; escopo concedido para cada grupo ativado.
6. **Trava de exclusão de recompensa/fila** enquanto houver resgates reembolsáveis pendentes (já existe para filas; manter para recompensas).
7. **Avisos:** catálogo tipado de avisos com chave liga/desliga e modelos por fila, fila de envio limitada com prioridade, rajadas agregadas, confirmação por `is_sent` e nenhum UID no texto, a menos que a fila já o exiba.
8. **Painel:** chave por grupo com ação "Reconectar a Twitch para ativar" quando falta escopo, seletor do momento, texto dizendo que o status é checado no momento da decisão e que "desconhecido" espera o streamer. O plano de UX e a revisão 9,0 são do `@ux-design-expert`.

## 9. O que depende do dono

- **D-1 Reautorização:** aceitar uma reconexão ao ativar um grupo pela primeira vez (recomendado: um escopo por grupo ativado, acumulando) ou uma única reconexão com os três de antemão. Também se `moderation:read` (texto de consentimento amplo) é aceitável para o grupo de moderadores.
- **D-2 Desconhecido:** confirmar que "não foi possível checar" nunca devolve nem cumpre sozinho e espera o streamer (recomendado), ou escolher um padrão (cumprir = seguro para o streamer, perde a devolução para sempre).
- **D-3 Streamer, Prime e subs presenteados:** o streamer é elegível por regra? Prime e presenteados contam como inscritos (recomendado sim)? É preciso restringir por tier?
- **D-4 Pontos retidos:** é aceitável que `refund_on_start` retenha os pontos por uma espera longa, dado que a expiração não foi verificada?
- **D-5 Escopo da lista própria:** por fila ou uma lista do canal; tamanho máximo.
- **D-6 Teste real:** autorização do canal de teste da Twitch para fechar os itens NÃO VERIFICADOS (lista na seção 11).

## 10. Perguntas abertas para os especialistas

- `@architect`: unicidade do intento terminal e como um intento tardio contraditório vira resolução manual; onde mora o serviço de decisão; relação com a OPS-20 (fundir ou substituir); agrupar cancelamentos (até 50 ids por chamada, mesma recompensa) sem perder o resultado por resgate; desenho da fila de envio dos avisos.
- `@data-engineer`: esquema de `settlement`, `refund_groups`, linhas da lista própria (só ID), colunas de decisão/auditoria; migração com padrões que preservem `fulfill_on_start`; se a entrada pode manter um resgate cancelado sem quebrar a unicidade de `Entry.redemptionId` e a relação `Restrict`.
- `@ux-design-expert`: ativar um grupo exige reconexão; texto de "checado no momento da decisão", "aguardando sua decisão", pontos retidos; como mostrar o grupo que casou sem expor dados de espectadores; modelos de aviso e a política de rajadas visível ao streamer.
- `@qa`: testes com a classe real `HelixCustomRewardRedemption` (linha #20), leitura de verificação de 404 após cancelar, corrida fulfill/cancel, 429 na consulta, escopo ausente = desconhecido, integração PostgreSQL com migrations reais.

## 11. Limitações e o que só um teste real fecha

- Nenhuma chamada real à Twitch foi feita. Cabeçalhos de taxa, latência e texto da tela de consentimento não foram observados.
- **NÃO VERIFICADO, testar em um canal afiliado de teste:** (a) expiração de resgates UNFULFILLED; (b) se CANCELED restaura os limites por pessoa/por transmissão e a recarga; (c) se `...redemption.update` dispara para mudanças feitas pelo aplicativo; (d) representação de Prime; (e) streamer na própria lista de inscritos/mods/VIPs; (f) comportamento de uma segunda autorização (o novo token traz só o conjunto recém-pedido?).
- O corpo do Developer Services Agreement não foi lido diretamente (página renderizada por script); a cláusula de 24 horas e a exceção por OAuth vêm de um tópico do fórum de desenvolvedores (PARCIAL).
- O escopo do Send Chat Announcement e a janela de mensagens duplicadas não foram verificados. O comportamento de bots concorrentes vem de READMEs de repositórios, não de testes.
- A documentação da Twitch muda; as referências refletem páginas lidas em 2026-11-05. **REVISAR SE** a Twitch mudar o Update Redemption Status, os três endpoints de papel ou seus escopos, os limites de chat, ou o `@twurple/api` sair da 8.2.0.

## 12. Autoavaliação (rubrica, alvo mínimo 9,0)

| Critério | Nota | Base |
|---|---|---|
| Fontes oficiais | 9,0 | Referência, tipos EventSub, escopos e limites de chat lidos em dev.twitch.tv; código do Twurple 8.2.0 lido; corpo do acordo ilegível (PARCIAL) |
| Evidência e honestidade sobre lacunas | 9,3 | Cada item rotulado; seis itens NÃO VERIFICADOS com método de fechamento; lacuna de expiração pesquisada de novo, sem fonte |
| Aderência ao caso | 9,2 | Ligada à outbox, ao adaptador, ao OAuth e aos dados da OPS-20 reais; o desenho mapeia caminhos de código existentes |
| Riscos | 9,0 | Corrida, cancelamento duplo, cumprimento irreversível, pontos retidos, limites em rajada, papéis desatualizados e reconsentimento cobertos |
| Mensurabilidade | 8,8 | Lista de testes e checklist de teste real dados; sem números reais |
| **Geral** | **9,1** | Atinge o alvo 9,0; as lacunas são de teste real, não de pesquisa |

## Fontes (acessadas em 2026-11-05)

- Referência da API da Twitch: [Update Redemption Status](https://dev.twitch.tv/docs/api/reference/#update-redemption-status), [Send Chat Message](https://dev.twitch.tv/docs/api/reference/#send-chat-message), [Get Broadcaster Subscriptions](https://dev.twitch.tv/docs/api/reference/#get-broadcaster-subscriptions), [Get Moderators](https://dev.twitch.tv/docs/api/reference/#get-moderators), [Get VIPs](https://dev.twitch.tv/docs/api/reference/#get-vips)
- [Tipos de assinatura EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Escopos](https://dev.twitch.tv/docs/authentication/scopes/), [Limites de taxa](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits)
- [Send and receive chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/), [Guia de chat](https://dev.twitch.tv/docs/chat/)
- Comunidade (complementar): [autorização incremental](https://discuss.dev.twitch.com/t/incremental-authorization-practices/19550), [armazenamento de dados](https://discuss.dev.twitch.com/t/storage-of-data-from-twitch-api/63884), [subs Prime](https://discuss.dev.twitch.com/t/distinguishing-prime-sub-from-recurring-sub-in-subscriptions-api/46189)
- Bots de fila (complementar): [FirebotQueue](https://github.com/giff-h/FirebotQueue), [Jambo](https://github.com/Nertsal/jambo), [twitch-queue-bot](https://github.com/sirskaro/twitch-queue-bot)
- Repositório: `docs/pt-BR/stories/OPS-20/research.md`, `docs/pt-BR/stories/OPS-15/redemption-sync-research.md`, `docs/stories/OPS-7/spec/research.json`, `apps/api/src/twitch/{oauth,auth-runtime,helix-adapter}.mjs`, `apps/api/src/outbox/{financial-worker,chat-worker}.mjs`, `node_modules/@twurple/api` 8.2.0
