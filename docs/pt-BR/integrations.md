# Decisões de integração

[English](../integrations.md)

**Documentação consultada:** 2026-10-03 (UTC). Os formatos da API do SDK também foram conferidos nas versões instaladas neste repositório. Os itens abaixo descrevem o contrato planejado dos adaptadores; a integração Twitch **ainda não está implementada**.

## Versões de runtime

| Componente | Versão | Decisão |
| --- | --- | --- |
| Node.js | 24.20.0 | Runtime e versão de desenvolvimento fixados. |
| `@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws` | 8.2.0 | Mesma linha de release; usar `RefreshingAuthProvider`, clientes Helix e EventSub WebSocket. |
| Prisma CLI, `@prisma/client`, `@prisma/adapter-pg` | 6.19.3 | CLI e cliente alinhados; `prisma-client-js` gera saída compatível com JavaScript. O gerador `prisma-client` do Prisma 7 produz TypeScript e não atende a aplicação JavaScript-only. |
| PostgreSQL | 18.6 | Serviço local Compose; testes usam PostgreSQL isolado e migrations reais. |
| Docker Compose | v2 | Condições de saúde/conclusão de `depends_on` definem a ordem; volumes nomeados preservam o banco e os segredos locais. |

## Mapa de operações Twitch

| Operação | Endpoint ou evento EventSub | Escopo/autorização necessária | Adaptação no SDK |
| --- | --- | --- | --- |
| Validar Client ID/Secret | `POST https://id.twitch.tv/oauth2/token` com `grant_type=client_credentials` | Client ID + Secret; app token | Twurple `AppTokenAuthProvider`; não usar uma chamada Helix com token de usuário para validar o secret. |
| Conectar o broadcaster | Authorization Code; callback `/callback`; validação via `GET https://id.twitch.tv/oauth2/validate` | `channel:manage:redemptions`, `user:read:chat`, `user:write:chat` | Provider de usuário e `RefreshingAuthProvider`; validar na inicialização e ao menos a cada hora. `state` OAuth deve ser único, de curta duração e vinculado à sessão local que iniciou o fluxo. |
| Ler elegibilidade do broadcaster | `GET /helix/users` | Token de usuário do broadcaster conectado | API Helix de usuários; verificar `broadcaster_type` (`affiliate`, `partner` ou vazio) antes de habilitar pontos do canal. |
| Criar e consultar recompensas gerenciadas | `POST` / `GET /helix/channel_points/custom_rewards` | `channel:manage:redemptions`; broadcaster deve corresponder ao usuário autorizado | `ApiClient.channels.createCustomReward` e consulta de recompensas. Gerenciar somente recompensas desta aplicação. Atualmente, a Twitch limita um canal a 50 recompensas (incluindo desabilitadas); título de até 45 e descrição de até 200 caracteres. |
| Observar resgates | `channel.channel_points_custom_reward_redemption.add` e `.update` | `channel:manage:redemptions` para o broadcaster conectado | `EventSubWsListener.onChannelRedemptionAdd` / `onChannelRedemptionUpdate`; normalizar os valores do SDK para estados internos e deduplicar pelo ID do resgate. Uma queda abrupta no WebSocket não reproduz os eventos perdidos; é preciso reconciliar com Helix. |
| Reconciliar recompensas pendentes | `GET /helix/channel_points/custom_rewards/redemptions` (paginar `UNFULFILLED`) | `channel:manage:redemptions`; recompensa criada por esta aplicação | `ApiClient.channelPoints.getRedemptionsForBroadcasterPaginated`; consumir todas as páginas e considerar uma falha parcial como reconciliação incompleta. |
| Cancelar ou concluir resgate | `PATCH /helix/channel_points/custom_rewards/redemptions` | `channel:manage:redemptions`; somente o app criador pode gerenciar | `ApiClient.channelPoints.updateRedemptionStatusByIds`; interpretar `CANCELED` como reembolso e `FULFILLED` como consumo somente após confirmar o resultado. Consultar estado remoto após resposta incerta. |
| Receber comandos do chat | `channel.chat.message` | `user:read:chat` para o usuário autorizado do streamer | `EventSubWsListener.onChannelChatMessage`; usar identidade e badges confiáveis do evento e ignorar comandos de outros canais no Shared Chat. |
| Enviar resposta no chat | `POST /helix/chat/messages` | `user:write:chat` | `ApiClient.chat.sendChatMessage`; conferir `is_sent` e motivo de descarte. Sucesso HTTP, sozinho, não confirma entrega. A Twitch limita cada mensagem a 500 caracteres. |

As requisições de recompensa devem usar `should_redemptions_skip_request_queue=false`; os campos recebidos de API/EventSub/SDK devem ser normalizados no limite do adaptador. A Twitch é a fonte da verdade dos pontos. Somente o aplicativo que criou a recompensa pode gerenciar seus resgates. Apagar uma recompensa com resgates pendentes pode concluí-los, portanto a exclusão deve esperar a confirmação remota dos cancelamentos.

Este produto usa EventSub WebSocket e Helix Send Chat Message com a conta do streamer. Não usa IRC nem uma segunda conta de bot. Mensagens com token de usuário podem ser propagadas pelo Shared Chat; o produto não deve prometer o contrário.

## Contratos da infraestrutura local

| Tema | Contrato |
| --- | --- |
| Conexão ao banco | PostgreSQL é acessado pelo nome do serviço Compose `db`, nunca pelo `localhost` do contêiner; a connection string de runtime é montada com o segredo e nunca registrada em log. |
| Inicialização das migrations | `migrate` aguarda `db` saudável; `bot` aguarda a conclusão bem-sucedida das migrations. |
| Saúde | `/health` verifica o banco local; ausência de credenciais Twitch informa `not_configured`, não conectado e sem causar reinicialização infinita. |
| Encerramento e dados | SIGTERM/SIGINT fecha trabalho HTTP/banco; volumes nomeados do Compose preservam banco e segredo gerado. Instruções normais de parada nunca removem volumes. |
| ORM / transações | Prisma 6.19.3 usa `PrismaPg({ connectionString })` com `PrismaClient({ adapter })`. Transações interativas são curtas; um advisory lock transacional do PostgreSQL serializa mutações da fila, enquanto índices unique do banco continuam sendo a última proteção de concorrência. Nenhum I/O de rede acontece dentro de transações. |
| Migrations e testes ORM | Migrations Prisma são versionadas e executadas por `prisma migrate deploy`; contratos de teste usam PostgreSQL real e essas migrations, não SQLite nem Prisma mockado. |

## Referências oficiais

- [Twitch: registrar um aplicativo](https://dev.twitch.tv/docs/authentication/register-app/) — app confidencial, e-mail verificado, 2FA e URL de callback.
- [Twitch: obter tokens OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) — fluxos Client Credentials e Authorization Code.
- [Twitch: validar requisições](https://dev.twitch.tv/docs/authentication/validate-tokens/) — validação na inicialização e de hora em hora e comportamento de tokens revogados.
- [Referência da API Helix](https://dev.twitch.tv/docs/api/reference/) — usuários, recompensas/resgates de pontos e envio de chat.
- [Twitch: tipos de assinatura EventSub](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) — escopos e contratos de payload de eventos de resgate e chat.
- [Twitch: lidar com eventos WebSocket](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) — boas-vindas, inscrição, reconexão e recuperação.
- [Twitch: enviar e receber chat](https://dev.twitch.tv/docs/chat/send-receive-messages/) — transporte de chat e limites de mensagem.
- [Twurple `RefreshingAuthProvider`](https://twurple.js.org/reference/auth/classes/RefreshingAuthProvider.html) — callbacks de renovação e tratamento de falha.
- [Twurple `EventSubWsListener`](https://twurple.js.org/reference/eventsub-ws/classes/EventSubWsListener.html) — métodos do listener WebSocket.
- [Documentação Prisma ORM 6](https://www.prisma.io/docs/orm/v6) — compatibilidade do gerador/runtime selecionado.
- [Conector PostgreSQL do Prisma ORM 6](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql) — `@prisma/adapter-pg@6.19.3`, configuração `PrismaPg` por connection string e `PrismaClient` com adaptador.
- [Transações do Prisma ORM 6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions) — API de transação interativa e orientação para evitar trabalho lento/chamadas de rede dentro da transação.
- [Índices parciais no PostgreSQL 18](https://www.postgresql.org/docs/18/indexes-partial.html) — contrato de unicidade de entradas ativas.
- [Ordem de inicialização Compose](https://docs.docker.com/compose/how-tos/startup-order/) e [segredos Compose](https://docs.docker.com/compose/how-tos/use-secrets/) — saúde das dependências e montagem de segredos.

## Limites da verificação

As declarações Twurple instaladas foram verificadas para `createCustomReward`, `getRedemptionsForBroadcasterPaginated`, `updateRedemptionStatusByIds`, `sendChatMessage`, os três métodos de listener EventSub e callbacks de renovação. Não havia credenciais autorizadas de streamer para um teste Twitch real. Fakes do SDK podem verificar o comportamento do adaptador; não comprovam um reembolso ou operação de recompensa reais.
