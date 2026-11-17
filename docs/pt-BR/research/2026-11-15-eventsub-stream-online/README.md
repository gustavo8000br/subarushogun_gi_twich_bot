# EventSub `stream.online` / `stream.offline` para o teto de devoluções "por live" (nota de pesquisa, OPS-31 Q-2)

[English](../../../research/2026-11-15-eventsub-stream-online/README.md)

- Autor: `@analyst` (Atlas). Data: 2026-11-15. Escopo: só pesquisa; nenhum código, chamada à Twitch ou teste foi executado. Nada aqui prova comportamento real da Twitch.
- Rótulos: **VERIFIED** (página oficial lida nesta sessão, código do Twurple 8.2.0 instalado ou código do repositório), **PARTIAL** (relato de fórum), **UNVERIFIED** (inferência).
- Reaproveitado: `docs/research-index.md` linhas #6 (EventSub chat, WebSocket) e #20/#27 (tipos EventSub, fonte do Twurple 8.2.0). A linha #6 não cobre eventos de stream: era uma **LACUNA**, que esta nota fecha.
- Contexto: `docs/stories/OPS-31/architect-design-v2.md` seção 3.11 (sem tratamento de `stream.online` em `apps/`; janela hoje em horas corridas) e decisão do dono Q-2 (2026-11-15: contar o teto "por live").

## Veredito

**SUFFICIENT** para o desenho. **REFRESH IF** a Twitch mudar `stream.online`/`stream.offline` (versão 1), os limites do WebSocket, ou o `@twurple/*` sair da 8.2.0. O comportamento numa live real (atrasos, reinícios) é **UNVERIFIED**; um teste ao vivo fecha isso.

## Respostas

### 1. Os dois tipos de assinatura
- Ambos **versão 1**, condição só `broadcaster_user_id`, **sem escopo e sem autorização**. Transportes: `webhook`, `websocket`, `conduit`. VERIFIED ([referência EventSub, Stream](https://dev.twitch.tv/docs/eventsub/reference/stream)).
- Evento `stream.online`: `id` (id do stream), `broadcaster_user_id/login/name`, `type` (`live`, `playlist`, `watch_party`, `premiere`, `rerun`), `started_at`. VERIFIED.
- Evento `stream.offline`: `id`, `broadcaster_user_id/login/name`. **Sem timestamp** (use o horário de recebimento). VERIFIED; a falta também é [pedido no fórum](https://discuss.dev.twitch.com/t/stream-ended-event-should-have-timestamp-field/62490) (PARTIAL).
- Entrega: pelo menos uma vez, portanto duplicatas são possíveis; os docs de webhook identificam mensagens por `Twitch-Eventsub-Message-Id` ([handling webhook events](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/)). Os docs nada dizem sobre ordem. Um relato de fórum diz que parar e iniciar rápido pode entregar `offline` por último ([tópico](https://discuss.dev.twitch.com/t/stream-ended-event-should-have-timestamp-field/62490), PARTIAL).
- Atraso: sem número nos docs. Uma resposta da Twitch num [tópico](https://discuss.dev.twitch.com/t/stream-offline-event-is-dealyed/49743) diz que atrasos devem ser de minutos, dias são inesperados, e que a Twitch não guarda log de eventos entregues ou perdidos (PARTIAL).

### 2. Limites e o que o projeto já usa
- WebSocket: só token de usuário; no máximo **3** conexões com assinaturas ativas, **300** assinaturas ativas por conexão, `max_total_cost` **10** por token de usuário; assinar em até **10 s** após o welcome ([WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [manage subscriptions](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/)). VERIFIED.
- Custo: assinaturas que exigem autorização do usuário custam 0; tipos que pedem um usuário sem autorização (a página cita `stream.online`) custam 1, a menos que o usuário tenha autorizado o app. A página é ambígua para tipos sem escopo; assuma o pior caso: +2 de custo. Texto VERIFIED, efeito neste app UNVERIFIED.
- O projeto **já usa EventSub por WebSocket**: `apps/api/src/twitch/eventsub-runtime.mjs:1` importa `EventSubWsListener` (`@twurple/eventsub-ws`); assina `onChannelRedemptionAdd` (`:40`), `onChannelRedemptionUpdate` (`:54`) e `onChannelChatMessage` (`:67`) para um `broadcasterId`, mais `onUserSocketDisconnect/Ready` (`:77-96`) e `onRevoke` (`:100`). `apps/api/src/twitch/integration.mjs:210` cria o runtime e converte desconexões em `degraded`. Com os dois novos tipos: 5 assinaturas numa conexão, custo de no máximo 5 de 10 mesmo se as atuais custarem 1 cada. VERIFIED (código); custos reais UNVERIFIED.

### 3. Estado atual ao iniciar e após uma lacuna
- Perder a conexão WebSocket desativa as assinaturas dela e **eventos da lacuna não são reenviados**; `session_reconnect` (aviso de ~30 s) mantém as assinaturas sem perder nada ([WebSocket events](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)). VERIFIED.
- Reconciliação: chamar [Get Streams](https://dev.twitch.tv/docs/api/reference/streams) com `user_id` (token de usuário ou de app, sem escopo; devolve `id`, `type`, `started_at` só para streams no ar; a página não descreve o resultado vazio nem cache). Twurple: `apiClient.streams.getStreamByUserId(id)` devolve `HelixStream | null` (`@twurple/api` 8.2.0 `HelixStreamApi.d.ts:69`). A doc do próprio Twurple avisa que o Helix "pode estar atrasado por cache", então um `null` logo após `stream.online` pode ser defasado (`EventSubStreamOnlineEvent.d.ts`, VERIFIED).
- Procedimento (recomendação): ao iniciar o serviço e a cada `onReconnected` (já ligado em `eventsub-runtime.mjs:96-99`), compare o Get Streams com a sessão aberta guardada: no ar e sem sessão aberta abre uma com `id`/`started_at` do Helix; fora do ar com sessão aberta fecha no horário da checagem (marcada como "inferida"); no ar com `id` diferente fecha a antiga e abre a nova. Trate um único `null` logo após o início como não confiável (reconferir uma vez após pequeno atraso).

### 4. Twurple 8.2.0
- `EventSubBase.d.ts:246,253`: `listener.onStreamOnline(user, handler)` e `listener.onStreamOffline(user, handler)`, mesmo listener e transporte de hoje. Getters do evento: `id`, `type`, `startDate`, `broadcasterId` (online); offline tem os campos do broadcaster. VERIFIED (fonte instalada).
- Reconexão (`EventSubWsSocket.js`): `session_reconnect` abre nova conexão com sobreposição e não reassina; numa desconexão real o Twurple marca as assinaturas como derrubadas e **reassina automaticamente no próximo `session_welcome`** (`:34-66`). Eventos perdidos continuam perdidos, daí a reconciliação acima. O handler não expõe o id da mensagem, então deduplique pelo `id` do stream (idempotente), não pelo id da mensagem. VERIFIED (fonte), comportamento em execução UNVERIFIED.

### 5. Riscos
- **Reinícios:** um relato de fórum diz que, se o stream cai por tempo suficiente para `stream.offline` disparar, a volta recebe um **novo id de stream**, embora o painel do streamer mostre uma transmissão só ([tópico](https://discuss.dev.twitch.com/t/stream-online-and-stream-offline-events-are-creating-new-stream-id-when-the-stream-is-temporary-down/37049), PARTIAL). Não achei tolerância oficial de reconexão (nenhuma "janela de N minutos" documentada), então o limiar de fusão é **decisão de produto**, não constante da Twitch.
- **Tempo:** `started_at` é UTC RFC3339; use horários da Twitch e UTC do servidor, nunca horário local. O offline não tem timestamp, então ordenar `online`/`offline` pela chegada pode errar em reinícios rápidos; ordene por `started_at` e pelo `id` do stream.
- **Tipos:** `type` pode ser `rerun`, `premiere`, `playlist`, `watch_party`; só `live` deve abrir sessão (recomendação).
- **Duplicatas e fora de ordem:** entrega ao-menos-uma-vez e relatos de fórum de dois `online`; abrir/fechar deve ser idempotente por `id` do stream.
- **Vários canais:** a condição é por `broadcaster_user_id`; o app usa um `broadcasterId` por runtime (código `:40-67`). Multicanal não foi lido nem verificado; cada canal somaria 2 assinaturas e custo, e o teto de custo 10 é por token de usuário (canais com token próprio não o dividem).
- **Revogação:** `authorization_revoked`/`user_removed` interrompem os eventos daquele tipo em silêncio; o `onRevoke` existente deve degradar o teto para a janela em horas (fallback).

### 6. Recomendação para o desenho
- Defina "live" como uma **sessão** com chave no `id` do stream da Twitch, mais regra de fusão: um novo `stream.online` cuja sessão anterior terminou há menos de N minutos (padrão sugerido 10, configurável pelo dono, **valor UNVERIFIED**) continua a mesma sessão (mantém o `streamSessionId`). Sem a regra, uma queda curta de conexão zeraria em silêncio o teto de todas as pessoas.
- Guarde por canal só: `stream_session_id` (id interno), `twitch_stream_id`, `started_at`, `ended_at` anulável, `source` (`event` ou `reconciled`). Sem dados de espectadores, sem títulos. O contador da 3.11 passa a contar `redemptions.refunded_at` (ou coluna de id de sessão) dentro da sessão aberta, em vez de janela corrida.
- Mantenha a janela em horas corridas como **fallback** quando nenhuma sessão é conhecida (sem `stream.online` visto, revogação, offline, Helix indisponível); isso evita teto ilimitado nas lacunas. Devolução fora de uma live pertence à última sessão (escolha de desenho para o `@architect`).
- Proteja contra fechamento errado: não feche com um único `null` do Get Streams; feche em `stream.offline` ou após duas checagens negativas seguidas.

## Limitações
- Páginas oficiais lidas nesta sessão: referência EventSub (Stream), handling WebSocket events, handling webhook events, manage subscriptions, Get Streams. A URL antiga de subscription-types agora redireciona para a referência. Regras da página de webhook foram aplicadas ao WebSocket só onde indicado. Ordem de entrega, atraso real, tolerância de reconexão do backend da Twitch e o custo exato da assinatura neste app **não foram verificados**; nada foi testado numa live real. Itens de fórum são PARTIAL e podem estar desatualizados.
