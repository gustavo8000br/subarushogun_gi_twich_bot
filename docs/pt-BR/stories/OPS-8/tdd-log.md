# Registro TDD da OPS-8

[Read in English](../../../stories/OPS-8/tdd-log.md)

## Fase de planejamento — 2026-10-07

- O Spec Pipeline foi concluído antes da implementação de comportamentos. A frase “nenhum teste foi executado” é o registro histórico daquele instante; as evidências de implementação estão acrescentadas abaixo.
- O planejamento identificou a primeira regressão necessária: erro de rede/timeout durante validação do token no startup atualmente define `reconnect_required` e marca o registro da credencial, embora não comprove revogação. O teste deve primeiro demonstrar esse comportamento incorreto.
- Cada mudança de comportamento registra abaixo o comando exato, a falha Red causada por comportamento ausente/incorreto, o resultado Green e a repetição após refatoração.

## Incremento P1 — recuperação tipada de token no startup e retry horário (2026-10-07)

- **Comportamento:** erros transitórios de validação permanecem recuperáveis e não marcam OAuth como perdido; access token 401 tenta o refresh salvo; somente refresh definitivamente rejeitado ou incompatibilidade de identidade/escopo pede reconexão; falha transitória na validação horária tenta novamente com timer controlado.
- **Red — startup transitório:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'keeps saved credentials recoverable when startup validation fails transiently'` — falhou porque runtime retornou `reconnect_required` para `TypeError: fetch failed`.
- **Red — refresh do access token:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'keeps saved credentials recoverable|refreshes an invalid access token'` — 2 falharam: validação transitória pedia consentimento e access token inválido ignorava o refresh salvo.
- **Red — retry horário:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'retries transient hourly validation failures'` — falhou porque callback do intervalo não expunha resultado assíncrono ao teste controlado e nenhum retry observável era agendado.
- **Green/refactor:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js` — 7 passaram. Runtime agora cria provider depois da validação remota, renova access token inválido, aguarda persistência durável antes de ativar, classifica somente 400/401 estruturados do endpoint de token conhecido como falha definitiva de refresh e usa retry com jitter limitado de 5 segundos a 5 minutos na validação horária transitória. Erros brutos do SDK não são projetados.
- **Correção do TDD:** o primeiro rascunho do teste de rejeição no startup tratava erro genérico de validação como permanente. Ele foi atualizado antes do Green para usar `InvalidTokenError` real do Twurple e HTTP 401 estruturado no endpoint de token, correspondendo ao contrato verificado do SDK.

## Incremento P2 — supervisor de integração sem bloquear o painel (2026-10-07)

- **Comportamento:** a criação do runtime local retorna enquanto a validação/consulta de elegibilidade Twitch aguarda; falhas transitórias de autenticação e disponibilidade de Pontos do Canal agendam um retry com jitter; parar cancela o retry; a recuperação bem-sucedida cria um único adapter/listener ativo.
- **Red — disponibilidade local:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'returns the local integration while Twitch eligibility is still unreachable'` — falhou porque a integração local aguardou a promessa de elegibilidade sem resolução e atingiu o limite de 25 ms do teste.
- **Red — elegibilidade transitória:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'retries transient Channel Points eligibility failures'` — falhou porque `channel_points_unavailable` foi tratado como `ineligible` permanente, sem agendar retry.
- **Green/refatoração:** `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js` — 17 passaram depois de desacoplar a disponibilidade local da Twitch, supervisionar retries entre 5 e 300 segundos com jitter e impedir inicialização tardia após parar. Falhas de elegibilidade recuperam sem duplicar listeners.

## Incremento P3 — esgotamento de conexão inicial EventSub (2026-10-07)

- **Comportamento:** EventSub informa separadamente uma falha inicial do socket e a queda real de um socket previamente estabelecido. Uma falha inicial para o listener e agenda reinicialização supervisionada; a reconexão de socket estabelecido continua sob a política persistente do Twurple e usa o fluxo existente de prontidão/reconciliação.
- **Red — sinal de desconexão EventSub:** `npm test -- --run tests/unit/eventsub-runtime.test.js -t 'reports initial socket exhaustion separately'` — falhou porque o runtime não avisava o chamador quando o primeiro socket caía.
- **Red — reinício supervisionado do listener:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'restarts EventSub after startup socket exhaustion'` — após remover temporariamente o ramo de reinício, falhou porque o estado permaneceu `degraded` em vez de `retrying` e nenhum timer foi criado.
- **Green/refatoração:** `npm test -- --run tests/unit/eventsub-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js` — 23 passaram com metadados seguros de desconexão e um reinício supervisionado do listener. Erros brutos de desconexão não são expostos.

## Incremento P4 — estado visível de retry (2026-10-07)

- **Comportamento:** `/health`, o estado de configuração e o painel exibem retry localizado (`retrying` / “Reconectando”), separado da exigência confirmada de reconexão OAuth.
- **Red:** `npm test -- --run tests/unit/health-status.test.js -t 'shows automatic reconnection as a retrying state'` — falhou porque o novo estado aparecia como “Estado desconhecido”. `npm test -- --run tests/unit/health-route.test.js tests/unit/setup-messages.test.js tests/unit/health-status.test.js` — casos de localização da configuração falharam com o fallback seguro “Status unavailable”.
- **Green/refatoração:** o comando dos três arquivos passou após incluir o estado permitido da rota e rótulos nos catálogos pt-BR, inglês e espanhol. Em seguida, o comando que executa os seis arquivos relevantes passou 81/81 antes do teste adicional de reinício EventSub; a execução final da suíte afetada ainda será registrada.
- **Erro de comando somente de ambiente:** uma chamada combinada inicial do Vitest passou `--testNamePattern` duas vezes e foi rejeitada pela CLI antes de executar testes; ela não conta como evidência Red.

## Incremento P5 — retorno ao estado saudável após retry horário (2026-10-07)

- **Comportamento:** validação horária transitória marca a integração como em retry; uma validação bem-sucedida só retorna o estado para conectado se o socket EventSub estiver pronto naquele momento. Recuperar o token sozinho nunca afirma que o chat está disponível.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'leaves retrying after scheduled token validation recovers'` — falhou porque o callback `onRecovered` não era repassado ao runtime de autenticação (`TypeError: authCallbacks.onRecovered is not a function`).
- **Green/refatoração:** o mesmo comando direcionado passou após ligar o estado de recuperação seguro à disponibilidade atual do EventSub; o teste cobre a recuperação antes e depois da prontidão EventSub.

## Incremento P6 — escopo revogado vs. queda temporária de Pontos do Canal (2026-10-07)

- **Comportamento:** HTTP 401/403 da Helix na consulta de elegibilidade de Pontos do Canal é tratado como perda de autorização e pede novo OAuth; outras falhas continuam recuperáveis e nunca vazam o texto de resposta do SDK.
- **Red — adaptador:** `npm test -- --run tests/unit/twitch-adapter.test.js -t 'distinguishes revoked Channel Points authorization'` — falhou porque HTTP 403 foi reduzido a `channel_points_unavailable`, sem decisão de autorização distinta.
- **Red — integração:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'requires OAuth reconnection when Channel Points returns an authorization denial'` — falhou porque a integração informou `ineligible` e não marcou a autorização salva para reconexão.
- **Green/refatoração:** o adaptador retorna apenas um motivo seguro de autorização; a integração exige reconexão, para tarefas Twitch e não inicia EventSub. As suítes direcionadas finais são registradas abaixo.

## Incremento P7 — manter backoff exponencial após falha inicial EventSub (2026-10-07)

- **Comportamento:** falhas repetidas antes do primeiro evento `ready` do EventSub aumentam o backoff; o contador só é zerado depois de um socket realmente ficar pronto.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'restarts EventSub after startup socket exhaustion'` — falhou porque a segunda tentativa ainda ocorreu após 5.000 ms em vez de 10.000 ms.
- **Green/refatoração:** o contador agora é preservado durante a criação do adaptador/listener e reinicia em `onReady`. Comando direcionado final: `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js tests/unit/eventsub-runtime.test.js tests/unit/twitch-adapter.test.js tests/unit/health-status.test.js tests/unit/health-route.test.js tests/unit/setup-messages.test.js` — 7 arquivos, 99 testes passaram.

## Incremento P8 — cancelar retries durante o encerramento (2026-10-07)

- **Comportamento:** encerramento da integração por SIGTERM/SIGINT cancela o timer de inicialização pendente; um callback de timer tardio não inicia outra tentativa de autenticação/listener.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'cancels a scheduled initialization retry during shutdown'` — falhou porque `clearTimeout` não era chamado para o timer de retry.
- **Green/refatoração:** o mesmo comando passou depois que o encerramento cancela o timer e preserva a proteção de runtime parado. O comando direcionado completo de integração/autenticação/EventSub/adaptador/saúde/configuração passou 7 arquivos / 100 testes.

## Incremento P9 — OAuth ainda não autorizado não é falha de retry (2026-10-07)

- **Comportamento:** um app Twitch validado sem tokens de usuário/broadcaster permanece em `not_configured`; não cria provider de autenticação nem inicia loop de retry antes de o streamer concluir OAuth.
- **Red:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'does not retry while a Twitch app is saved but the channel has not completed OAuth'` — falhou porque o estado virou `retrying` e agendou retry.
- **Green/refatoração:** o mesmo comando direcionado passou depois que o supervisor passou a exigir tokens de usuário salvos antes da validação/retry Twitch; o callback OAuth inicia o fluxo após persistir os tokens.

## Incremento P10 — renovar access token Helix inválido (2026-10-07)

- **Comportamento:** HTTP 401 da Helix é separado de escopo negado (403), validado/renovado pelo refresh Authorization Code salvo e a consulta de elegibilidade é repetida uma vez após recuperação confirmada. HTTP 403 continua em `reconnect_required`; falhas transitórias de rede/serviço permanecem recuperáveis.
- **Red — adaptador:** `npm test -- --run tests/unit/twitch-adapter.test.js -t 'classifies an invalid access token separately'` — falhou porque HTTP 401 foi classificado como negação de autorização.
- **Red — integração:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'refreshes a rejected Helix access token'` — falhou porque a validação do token salvo pelo runtime de autenticação nunca era chamada.
- **Green/refatoração:** `npm test -- --run tests/unit/twitch-integration.test.js tests/unit/twitch-auth-runtime.test.js tests/unit/twitch-adapter.test.js` — 3 arquivos / 40 testes passaram. Recupera o token pelo provider atual e repete a leitura somente uma vez.

## Incremento P11 — reconstruir Twurple após falha transitória de refresh em cache (2026-10-07)

- **Comportamento:** quando `getAccessTokenForUser` falha durante um refresh automático, o Twurple mantém essa falha em cache no provider. Uma queda transitória deve reconstruir o provider a partir das credenciais persistidas para que uma tentativa futura consiga renovar; perda definitiva de autorização continua interrompendo retries.
- **Red:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'access-token acquisition itself cached a transient refresh failure'` — falhou como esperado: `providerFactory` foi chamado uma vez em vez de duas; a próxima tentativa reutilizou o provider com falha em cache do Twurple.
- **Green/refatoração:** o mesmo teste direcionado passou depois que o runtime reconheceu o `CachedRefreshFailureError` público e recriou o provider com as credenciais persistidas. Em seguida, `npm test -- --run tests/unit/twitch-auth-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/twitch-adapter.test.js` passou: 3 arquivos / 41 testes.

## Incremento P12 — aguardar persistência do estado que exige reconexão

- **Comportamento:** quando o Twurple informa rejeição definitiva do refresh por callback e a mesma exceção chega ao startup, os dois caminhos compartilham e aguardam uma única gravação antes de o startup retornar `reconnect_required`.
- **Red:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'waits for reconnect-required persistence when Twurple reports a rejected refresh callback'` — falhou porque a Promise do runtime terminava enquanto a Promise de `markReconnectRequired` do repositório ainda estava pendente.
- **Green/refatoração:** a regressão direcionada passou após `loseAuth` guardar uma Promise compartilhada; a suíte completa do runtime de autenticação passou 10/10.

## Incremento P13 — aplicar teto de retry depois do jitter (2026-10-07)

- **Comportamento:** tanto o ciclo horário de validação do token quanto o supervisor da integração devem manter o atraso aleatório em no máximo 300 segundos, inclusive quando o jitter atinge o máximo.
- **Red — runtime de autenticação:** `npm test -- --run tests/unit/twitch-auth-runtime.test.js -t 'keeps jittered hourly retries at or below the 300-second maximum'` — falhou porque o último atraso foi 359.880 ms.
- **Red — supervisor de integração:** `npm test -- --run tests/unit/twitch-integration.test.js -t 'keeps jittered integration retries at or below the 300-second maximum'` — falhou pelo mesmo atraso de 359.880 ms.
- **Green/refatoração:** os dois comandos direcionados passaram após aplicar o limite depois do jitter. `npm test -- --run tests/unit/twitch-auth-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/twitch-adapter.test.js` passou em 3 arquivos / 44 testes.

## Evidências de persistência e Compose (2026-10-07)

- A execução final de `npm test` passou 87 arquivos / 728 testes e incluiu migrations PostgreSQL isoladas reais, persistência/recuperação de lease da outbox e aceite Compose isolado de primeira inicialização, saúde HTTPS e restart. Essa execução inclui P12 e P13.
- A instalação ativa foi verificada antes do restart: projeto `subarushogun-gi-twitch-queue-bot`, container de banco `7dc88a8c95f2`, dois volumes nomeados existentes (`..._postgres_data`, `..._operational_secrets`), um registro OAuth salvo e zero operações outbox pendentes/em execução/desconhecidas. O canal era inelegível e o probe Twitch somente de leitura estava saudável.
- `docker compose up -d --build` refez a build da branch atual como `v0.11.0-0000000-alpha`, executou bootstrap/migrations com sucesso e manteve o mesmo ID do container PostgreSQL e os dois volumes existentes. `/health` retornou `status=ok`, banco `connected`, Twitch `ineligible` e latência da API somente leitura de 192 ms. O PostgreSQL continuou com um registro OAuth e zero operações outbox pendentes. Nenhuma escrita de reward/chat/resgate Twitch foi executada. Os volumes do produto não foram removidos.

## Aceite da instância limpa e qualidade final (2026-10-07)

- Gates finais após P13: `npm run lint`, `npm run typecheck`, `npm test` (87 arquivos / 728 testes), `npm run review:static` (0 achados / 72 arquivos JavaScript), `npm run validate:version` (`v0.11.0-0000000-alpha`), `npm run validate:localization` (chat/lifecycle/overlay/panel/setup; en/es/pt-BR), `docker compose config --quiet` e `git diff --check` passaram. O lint detectou primeiro um parâmetro callback de teste sem uso e, depois, uma referência ao global `setImmediate` não declarado em P12; substituí-la por `vi.waitFor` corrigiu o harness e todos os gates passaram.
- Um projeto Compose separado e limpo foi buildado e iniciado com `APP_PORT=3308 LOCAL_CERT_DIRECTORY=<diretório-temporário> docker compose -p ops8-clean-accept up -d --build`. Bootstrap e seis migrations concluíram; o banco novo tinha zero registros OAuth; HTTPS `/health` informou `v0.11.0-0000000-alpha`, banco `connected` e Twitch `not_configured`. Após inserir um marcador de persistência somente de teste, parar/iniciar o bot preservou o marcador, a contagem de migrations e o hash da senha do banco. O projeto isolado de teste permanece disponível em `https://localhost:3308`; seus volumes são separados e não substituíram/apagaram os volumes ativos do usuário.
- Depois do teste da instância limpa, a instalação ativa do usuário também foi reconstruída e permaneceu saudável com o container e os volumes nomeados originais do banco; uma credencial OAuth permaneceu e a outbox financeira não tinha operações pendentes. O canal conectado segue inelegível, portanto não houve chamada de escrita para reward, resgate, chat ou EventSub.
- Após P13, as imagens ativa e isolada foram reconstruídas do código atual. `/health` ativa retornou `ok`, banco `connected`, Twitch `ineligible` e ping somente leitura de 191 ms; a instância isolada retornou `ok`, banco `connected`, Twitch `not_configured`. As duas verificações HTTPS passaram usando a CA exportada de cada instalação. O registro OAuth e os volumes de dados/segredos ativos permaneceram intactos; o marcador de persistência isolado continuou disponível. O trust store do host ainda contém uma CA anterior, então a confiança padrão do navegador/curl não foi revalidada.
