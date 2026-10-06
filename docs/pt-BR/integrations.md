# Decisões de integração

[English](../integrations.md)

**Documentação consultada:** 2026-10-05 (UTC). Os formatos da API do SDK também foram conferidos nas versões instaladas neste repositório. OAuth, validação/renovação de token, elegibilidade Affiliate/Partner e disponibilidade da API Channel Points, criação/recuperação de recompensa gerenciada, adapters Helix de resgate/chat, normalização EventSub WebSocket e base de reconciliação estão implementados e cobertos com fakes. Não há credenciais autorizadas para teste Twitch real. Edição/abertura/fechamento/arquivamento/exclusão de recompensas e suas recuperações seguem pendentes. Criar uma fila registra duravelmente a solicitação de recompensa Twitch pausada; criação ambígua pode ser resolvida no painel por ação auditada e revalidada.

### Pesquisa do runtime de contêiner

A imagem da API usa a imagem oficial fixada `node:24.20.0-alpine3.24`. Em 2026-10-05, build Docker AMD64 limpo e inicialização Compose isolada real confirmaram que Prisma 6.19.3 gera e carrega sua engine `linux-musl-openssl-3.0.x` no Alpine 3.24. Bootstrap, as três migrations versionadas, runtime sem root, health HTTPS e conexão ao banco passaram. Depois, a stack Compose local normal foi reconstruída e reiniciada sobre os volumes existentes de PostgreSQL/segredos, sem apagá-los. PostgreSQL continua em `postgres:18.6-bookworm`. O GitHub Actions/QEMU pós-merge compilou e publicou as imagens AMD64 e ARM64, verificadas nos manifests GHCR `main` e `v0.1.0-3e0c935-alpha`. O uso em hosts Windows/macOS não foi repetido após esta troca de base.

Referências: [tags oficiais da imagem Node](https://hub.docker.com/_/node/tags?name=24.20.0-alpine), [guia de deploy Docker do Prisma](https://docs.prisma.io/docs/guides/deployment/docker), [engines de plataforma do Prisma ORM 6](https://docs.prisma.io/docs/orm/v6/reference/prisma-schema-reference).

## Versões de runtime

| Componente | Versão | Decisão |
| --- | --- | --- |
| Node.js | 24.20.0 | Runtime e desenvolvimento fixados; a imagem do app usa `node:24.20.0-alpine3.24` oficial (musl), enquanto PostgreSQL permanece em `postgres:18.6-bookworm`. Prisma 6.19.3 gerou e carregou `linux-musl-openssl-3.0.x` em Compose Alpine real em 2026-10-05. |
| `@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws` | 8.2.0 | Mesma linha de release; usar `RefreshingAuthProvider`, clientes Helix e EventSub WebSocket. |
| Prisma CLI, `@prisma/client`, `@prisma/adapter-pg` | 6.19.3 | CLI e cliente alinhados; `prisma-client-js` gera saída compatível com JavaScript. O gerador `prisma-client` do Prisma 7 produz TypeScript e não atende a aplicação JavaScript-only. |
| PostgreSQL | 18.6 | Serviço local Compose; testes usam PostgreSQL isolado e migrations reais. |
| Docker Compose | v2 | Condições de saúde/conclusão de `depends_on` definem a ordem; volumes nomeados preservam o banco e os segredos locais. |
| Publicação GHCR | GitHub Actions com QEMU/Buildx e actions Docker fixadas por SHA | Pacote de pré-lançamento é privado por padrão; job de publicação exige `packages: write`. A visibilidade precisa ser alterada para pública antes do lançamento. | Tags `main` e versão completa são manifests multi-plataforma para `linux/amd64` e `linux/arm64`; `-linux-amd64`/`-linux-arm64` expõem variantes individuais. Compose usa `IMAGE_TAG=main` por padrão; pulls de início/atualização selecionam pela arquitetura do host. Publicação ocorre somente em push para `main` após todos os gates de qualidade/build passarem. |

## Mapa de operações Twitch

| Operação | Endpoint ou evento EventSub | Escopo/autorização necessária | Adaptação no SDK |
| --- | --- | --- | --- |
| Validar Client ID/Secret | `POST https://id.twitch.tv/oauth2/token` com `grant_type=client_credentials` | Client ID + Secret; app token | Implementado com `fetch` sanitizado no backend; token temporário é descartado. Não usar uma chamada Helix com token de usuário para validar o Secret. |
| Conectar o broadcaster | Authorization Code; callback `https://localhost:${APP_PORT:-3000}/callback`; validação via `GET https://id.twitch.tv/oauth2/validate` | `channel:manage:redemptions`, `user:read:chat`, `user:write:chat` | `createOAuthStateStore` e `RefreshingAuthProvider`; validação no início/por hora e persistência de renovação. `state` OAuth é único, curto e vinculado à sessão local inicial. |
| Ler elegibilidade do broadcaster | `GET /helix/users` | Token de usuário do broadcaster conectado | Implementado por `ApiClient.users.getUserById`; verificar `broadcasterType` antes de habilitar pontos do canal. |
| Verificar disponibilidade de Channel Points e capacidade de recompensas | `GET /helix/channel_points/custom_rewards` | Token do usuário com `channel:manage:redemptions`; ID do broadcaster deve corresponder ao token | Consultar por `ApiClient.channelPoints.getCustomRewards(broadcasterId, false)` somente após validar Affiliate/Partner. Contar todas as recompensas, inclusive criadas por outros apps e desativadas; alertar a partir de 45 e impedir criação quando o total observado for 50. Falha da API mantém a integração indisponível sem expor detalhes do SDK. |
| Criar e consultar recompensas gerenciadas | `POST` / `GET /helix/channel_points/custom_rewards` | `channel:manage:redemptions`; broadcaster deve corresponder ao usuário autorizado | Worker durável usa `ApiClient.channelPoints.createCustomReward` e métodos relacionados, não `ApiClient.channels`. Cria recompensa pausada com `autoFulfill=false`; o adapter normaliza/verifica `should_redemptions_skip_request_queue=false`. Resposta perdida é reconciliada contra a lista gerenciada anterior à criação; associação ambígua exige resolução auditada no painel. Gerencia somente recompensas desta aplicação. Twitch limita um canal a 50 recompensas (inclusive desativadas); título até 45 e descrição até 200 caracteres. Edição/abertura/fechamento/arquivamento/exclusão seguem pendentes. |
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
| Transporte do painel e OAuth | HTTPS em `https://localhost:${APP_PORT:-3000}`. O bootstrap persiste uma autoridade certificadora local e um certificado de servidor localhost no volume de segredos, exporta somente o certificado público da autoridade em `.local/` e monta a chave de servidor somente para leitura no serviço `bot`. O operador importa a autoridade certificadora no repositório confiável do usuário atual; não é necessário domínio público nem proxy. |
| Encerramento e dados | SIGTERM/SIGINT fecha trabalho HTTP/banco; volumes nomeados do Compose preservam banco e segredo gerado. Instruções normais de parada nunca removem volumes. |
| ORM / transações | Prisma 6.19.3 usa `PrismaPg({ connectionString })` com `PrismaClient({ adapter })`. Transações interativas são curtas; um advisory lock transacional do PostgreSQL serializa mutações da fila, enquanto índices unique do banco continuam sendo a última proteção de concorrência. Nenhum I/O de rede acontece dentro de transações. |
| Migrations e testes ORM | Migrations Prisma são versionadas e executadas por `prisma migrate deploy`; contratos de teste usam PostgreSQL real e essas migrations, não SQLite nem Prisma mockado. |
| Registry de imagens | `ghcr.io/gustavo8000br/subarushogun_gi_twich_bot` | O GHCR cria o pacote inicial como privado. Use PAT clássico com `read:packages` somente nos testes privados de pré-lançamento; altere a visibilidade para pública antes do lançamento para que usuários possam baixar sem credenciais do registry. O produto nunca armazena tokens. |

Os documentos OAuth da Twitch ainda mostram `http://localhost:3000` nos exemplos ([guia OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [Get Started](https://dev.twitch.tv/docs/api/get-started/)). Durante esta instalação, o console de desenvolvedor recusou o valor configurado `http://localhost:3000/callback` e exigiu HTTPS. Por isso, o produto usa `https://localhost:3000/callback` por padrão e documenta a confiança na autoridade certificadora local. O `redirect_uri` OAuth permanece idêntico byte a byte entre o cadastro do app Twitch, o pedido de autorização, a troca do token e a exibição no painel.

## Referências oficiais

- [Twitch: registrar um aplicativo](https://dev.twitch.tv/docs/authentication/register-app/) — app confidencial, e-mail verificado, 2FA e URL de callback.
- [Twitch: obter tokens OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) — fluxos Client Credentials e Authorization Code.
- [Twitch: validar requisições](https://dev.twitch.tv/docs/authentication/validate-tokens/) — validação na inicialização e de hora em hora e comportamento de tokens revogados.
- [Referência da API Helix](https://dev.twitch.tv/docs/api/reference/) — usuários, recompensas/resgates de pontos e envio de chat. A referência atual limita cada canal a 50 recompensas personalizadas, incluindo desativadas; criação exige `channel:manage:redemptions`.
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
- [Docker: builds multi-plataforma](https://docs.docker.com/build/building/multi-platform/) e [imagens multi-plataforma no GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/) — manifests, QEMU/binfmt e publicação `linux/amd64` + `linux/arm64`.
- [GitHub: publicar imagens Docker com Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) e [trabalhar com GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — `GITHUB_TOKEN`, `packages: write`, autenticação e padrão de pacote privado.

## Limites da verificação

As declarações Twurple instaladas foram verificadas para `getCustomRewards`, `createCustomReward`, `getRedemptionsForBroadcasterPaginated`, `updateRedemptionStatusByIds`, `sendChatMessage`, os três métodos de listener EventSub e callbacks de renovação. A verificação de elegibilidade usa `getCustomRewards(broadcasterId, false)` para contar todas as recompensas do canal, não somente as gerenciáveis por esta aplicação. Não havia credenciais autorizadas de streamer para um teste Twitch real. Fakes do SDK podem verificar o comportamento do adaptador; não comprovam um reembolso ou operação de recompensa reais.
