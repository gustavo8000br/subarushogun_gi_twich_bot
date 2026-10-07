# Evidências TDD da OPS-7

[English](../../../stories/OPS-7/tdd-log.md)

Estado da implementação: em andamento. As evidências abaixo registram somente comandos realmente executados nesta worktree; não validam comportamento Twitch ao vivo.

## Incremento 1 — decisão de nível mínimo herdado

- **Comportamento:** mínimo `subscriber` permite claims de inscrito, VIP (quando habilitado), moderador e streamer, rejeitando `everyone`/viewer; desligar VIP remove somente claim VIP.
- **Red:** `npx vitest run tests/unit/hierarchical-command-policy.test.js` — 2 testes, 1 falhou. O resolvedor existente retornou `role_not_allowed` para `subscriber` no mínimo `subscriber`, pois só tratava listas explícitas. Foi falha comportamental.
- **Green:** Adicionado ramo por nível para definições `minimumRole` válidas e helper puro para cargo efetivo mais alto. `npx vitest run tests/unit/hierarchical-command-policy.test.js tests/unit/command-catalog.test.js tests/unit/command-authorization.test.js` — 3 arquivos, 18 testes passaram; `npm run lint -- --no-warn-ignored` passou.
- **Refactor/reteste:** Mantida avaliação de rank em helper puro e executado novamente `npm run typecheck && npx vitest run tests/unit/hierarchical-command-policy.test.js tests/unit/command-catalog.test.js tests/unit/command-authorization.test.js` — typecheck passou e 3 arquivos/18 testes passaram.

## Incremento 2 — alteração do rótulo da conta exclusiva do streamer

- **Comportamento:** Moderador do canal de destino não pode usar `!fila conta <nome>` nem `!fila conta reset`; a identidade broadcaster pode. Consulta somente leitura `!fila conta` por viewer permanece igual.
- **Red:** Alterada expectativa regressiva de autorização antes da implementação; `npx vitest run tests/unit/command-authorization.test.js -t 'restricts account changes to the streamer'` — 1 teste selecionado falhou porque moderador foi permitido (`allowed: true`) em vez de negado com `streamer_only`.
- **Green:** Definidos ambos os comandos como imutáveis para `streamer` no catálogo canônico. Expectativas antigas do catálogo/API foram alinhadas ao contrato aprovado. `npx vitest run tests/unit/command-authorization.test.js tests/unit/command-catalog.test.js tests/unit/queue-routes.test.js` — 3 arquivos, 51 testes passaram.
- **Refactor/reteste:** Extraída a decisão/motivo de comando imutável para helper puro. `npx vitest run tests/unit/command-authorization.test.js tests/unit/command-catalog.test.js tests/unit/queue-routes.test.js` — 3 arquivos/51 testes passaram; `npm run lint -- --no-warn-ignored` e `npm run typecheck` passaram. Isso conclui somente este incremento.

## Incremento 3 — persistência versionada e compatibilidade legacy

- **Comportamento:** Separar versão do schema da revisão de concorrência; leituras não reescrevem arrays v1; o primeiro salvamento v2 explícito converte arrays não tocados para `legacy_exact` e muda somente o comando escolhido.
- **Red:** Novas verificações de integração PostgreSQL falharam primeiro pela ausência de `schemaVersion`, estado v2 inválido e objetos de política não suportados; o teste de projeção do catálogo também falhou porque uma política objeto era convertida para allowlist vazia.
- **Green:** Adicionados parsers v1/v2 estritos, conversão legacy explícita, controle de revisão otimista, auditoria e projeção do catálogo v2. PostgreSQL isolado real verifica persistência, preservação legacy, conflito de atualização concorrente e ausência de reescrita na leitura. `npx vitest run tests/integration/command-policy-persistence.test.js tests/unit/hierarchical-command-policy.test.js tests/unit/queue-routes.test.js` — 44 testes passaram naquele ponto.
- **Refactor/reteste:** Extraída a projeção canônica `resolveCommandPolicy`/cargos e mantido DTO único para schema/revisão. O conjunto focado posterior, incluindo as duas suítes PostgreSQL, passou: 10 arquivos, 196 testes.

## Incremento 4 — editor de nível mínimo e rótulos localizados

- **Comportamento:** Trocar checkboxes por seletor de nível mínimo, mostrar cargos herdados, preservar seleções legacy intocadas, salvar somente comandos alterados e iniciar consentimento quando nível follower não tem escopo.
- **Red:** `npx vitest run tests/unit/command-catalog-view.test.js -t 'projects threshold'` falhou porque o modelo de visualização não tinha `minimumRole` nem estado de revisão legacy.
- **Green:** Adicionados helpers de projeção/mesclagem do seletor, renderização segura com `textContent`, estado dirty por comando, aviso de escopo follower e rótulos en/pt-BR/es. `npx vitest run tests/unit/command-catalog-view.test.js tests/unit/localization-parity.test.js` — 15 passaram; `npm run lint:web` e `npm run typecheck:web` passaram.
- **Refactor/reteste:** Dados legacy continuam visíveis sem conversão implícita; somente cards alterados são enviados. Suítes web focadas passaram novamente na execução final focada.

## Incremento 5 — projeção protegida e rota de início OAuth

- **Comportamento:** Expor somente booleano de prontidão do escopo follower; uma requisição autenticada e protegida por CSRF pode preparar políticas e iniciar consentimento opcional sem gravar a política.
- **Red:** O teste de projeção encontrou `followerScopeReady` ausente; a rota de consentimento retornou 404 e o teste sem threshold follower confirmou que autorização não deve iniciar.
- **Green:** Adicionadas projeção booleana segura, validação do formato/threshold e rota que retorna somente URL de autorização. Nenhum token ou array de escopos foi adicionado à resposta. `npx vitest run tests/unit/queue-routes.test.js -t 'follower authorization|follower consent'` — 3 testes passaram; lint/typecheck da API passaram.
- **Refactor/reteste:** Adicionado 503 sanitizado quando a integração falha ao iniciar; Red foi HTTP 500, Green retornou somente mensagem segura. A suíte da rota passou depois na execução focada com 196 testes.

## Incremento 6 — escopo OAuth opcional e intenção vinculada à sessão

- **Comportamento:** Adicionar `moderator:read:followers` somente para pedido opcional aprovado, vincular política/revisão staged ao estado one-time da sessão e rejeitar callback cujo token validado omite escopo solicitado.
- **Red:** `npx vitest run tests/unit/twitch-oauth.test.js -t 'optional follower|omits the optional scope'` — 2 falhas: URL sem escopo e callback aceito sem ele.
- **Green:** Estado one-time protegido por hash passou a guardar escopos opcionais aprovados e contexto server-side; validação exige que Twitch informe todos os escopos solicitados antes de persistir. Suíte OAuth completa passou (8 testes); lint/typecheck da API passaram.
- **Refactor/reteste:** Adicionada injeção de validação de token na integração para exercitar fronteira de callback/persistência sem Twitch ao vivo. Suítes unitárias OAuth e integração passaram.

## Incremento 7 — gravação transacional de token/política e consulta Helix

- **Comportamento:** Callback verificado grava token substituto e política follower staged na mesma transação PostgreSQL; falha da política desfaz token. Consultas Helix usam token do broadcaster, IDs Twitch exatos, resultado tri-state e coalescência somente enquanto chamadas estão em andamento.
- **Red:** Para rollback de credenciais, `npx vitest run tests/integration/queue-repository.test.js -t 'staged OAuth policy work'` inicialmente resolveu e gravou token novo porque ignorava callback transacional. Os testes do adaptador falharam porque `checkFollower` não existia. Os testes de integração também falharam porque autorização follower e persistência do callback estavam ausentes.
- **Green:** Adicionado `commitAdditional` dentro da transação das credenciais, atualização de política pelo repositório na transação do chamador, contexto vinculado à sessão e uso de `api.channels.getChannelFollowers(broadcasterId, userId)` protegido por `getCurrentScopesForUser`. Falhas resultam em `unknown`; vínculo concluído não fica em cache. Testes de transação de credenciais e políticas em PostgreSQL, adaptador follower e integração passaram.
- **Nota de processo:** O protótipo do helper do repositório de filas foi escrito antes de seu teste regressivo. Desabilitei o helper para demonstrar Red comportamental e então restaurei para Green; isso não é estritamente teste antes do primeiro rascunho do helper. O callback do repositório de credenciais teve Red verdadeiro antes da implementação. Manter a story aberta até QA independente avaliar esse desvio e os critérios restantes.

## Incremento 8 — autorização de chat, ajuda e cooldown

- **Comportamento:** Verificar follower somente para comandos/ajuda dependentes; permitir que inscritos e cargos superiores herdem sem Helix; status desconhecido não executa comando; aplicar cooldown de cinco segundos para viewer/follower/subscriber/VIP.
- **Red:** `npx vitest run tests/unit/command-authorization.test.js -t 'inherits follower access'` falhou porque nenhum claim follower era aceito. Testes do chat falharam porque não havia verificação follower/aviso na ajuda. `npx vitest run tests/integration/queue-repository.test.js -t 'applies the viewer cooldown to follower'` falhou com cargo inválido porque somente viewer/VIP/moderador/streamer eram aceitos.
- **Green:** Adicionada entrada confiável de verificação ao autorizador puro, herança para inscrito, mensagens localizadas fail-closed e cooldown para todos os cargos abaixo de moderador. Resultado follower negado não consulta nem altera fila. Passaram: `npx vitest run tests/unit/chat-command-handler.test.js tests/unit/command-authorization.test.js tests/unit/twitch-adapter.test.js` — 46 testes; o teste PostgreSQL isolado de cooldown passou.
- **Refactor/reteste:** Removidas consultas de rede para inscritos/moderadores/streamer e resultados concluídos não são armazenados. Conjunto integrado focado passou: 10 arquivos, 196 testes.

## Incremento 9 — contrato de localização para textos de audiência

- **Comportamento:** Cada novo template de audiência do painel declara o placeholder `{roles}` ao validador de catálogo em todos os idiomas suportados.
- **Red:** A primeira execução completa de `npm test` terminou com 87 arquivos, 6 falhas e 696 aprovações. Todas as falhas eram a mesma rejeição do contrato comportamental: `Placeholder allowlist mismatch for key panel.command.audience.current` durante descoberta/validação do catálogo do painel.
- **Green:** Adicionadas as entradas permitidas `{roles}` para `panel.command.audience.current` e `panel.command.audience.proposed` no contrato compartilhado do catálogo do painel. `npx vitest run tests/integration/panel-localization-contract.test.js tests/unit/command-catalog-view.test.js tests/unit/localization-parity.test.js` — 3 arquivos, 34 testes passaram.
- **Refactor/reteste:** Suíte completa executada novamente: `npm test` — 87 arquivos, 702 testes passaram. Também passaram `npm run lint`, `npm run typecheck`, `npm run review:static` (0 achados), `npm run validate:version` e `docker compose config --quiet`.

## Pendências de aceite

QA independente AIOX com score 10/10 e verificação autorizada ao vivo do consentimento/API Twitch permanecem abertos. Não marcar OPS-7 como Done nem iniciar OPS-8 antes desses gates. Nenhuma chamada Twitch follower ao vivo foi executada.
## Regressão QA — identidade inconsistente na resposta de seguidores

- **Comportamento:** Tratar uma resposta Helix com qualquer ID de usuário diferente do ID consultado como `unknown`; não conceder acesso de seguidor com base em resposta mista ou inconsistente.
- **Red:** `npx vitest run tests/unit/twitch-adapter.test.js -t 'unexpected user id'` — 1 teste falhou porque o adaptador retornou `follower` para uma resposta que continha o ID consultado e outro ID sem relação.
- **Green:** O adaptador agora retorna `unknown` se qualquer linha tiver ID inválido ou inesperado; somente um resultado não vazio composto exatamente pelo ID consultado retorna `follower`. `npx vitest run tests/unit/twitch-adapter.test.js` — 1 arquivo, 14 testes passaram.
- **Refactor/reteste:** Suíte completa `npm test` — 87 arquivos, 703 testes passaram; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 achados), `npm run validate:version` e `docker compose config --quiet` passaram.
## Incremento 10 — restaurar consentimento opcional de seguidores

- **Comportamento:** Se comandos salvos exigem acesso de seguidores, mas falta o escopo opcional da Twitch, mostrar uma ação direta de reautorização que prepare as políticas de seguidores já salvas sem exigir uma alteração artificial de permissão.
- **Red:** `npx vitest run tests/unit/command-catalog-view.test.js -t 'offers reauthorization'` — 1 teste falhou porque `followerAuthorizationRequest` não existia; o painel não tinha uma projeção segura do payload para restaurar o consentimento.
- **Green:** Adicionada uma projeção que inclui somente políticas configuráveis salvas com nível de seguidor e a revisão atual; o painel mostra um botão localizado de reautorização somente quando falta o escopo e há essas políticas. A ação usa a rota OAuth protegida, vinculada à sessão. `npx vitest run tests/unit/command-catalog-view.test.js tests/unit/localization-parity.test.js` — 2 arquivos, 16 testes passaram; `npm run lint:web` e `npm run typecheck:web` passaram.
- **Refactor/reteste:** O início do consentimento agora é compartilhado com o fluxo normal de salvamento, evitando comportamentos divergentes. Reteste completo: `npm test` — 87 arquivos, 704 testes passaram; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 achados), `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram.
## Remediação TDD — regressão da fronteira transacional

- **Comportamento:** O repositório expõe a mutação de política vinculada à transação, necessária para confirmar credenciais OAuth e estado das políticas atomicamente.
- **Red:** Com o teste de regressão PostgreSQL já definido, removi temporariamente o método transacional do repositório e executei `npx vitest run tests/integration/queue-repository.test.js -t 'commits staged OAuth policy work atomically with the replacement token'` — o teste falhou pela capacidade transacional ausente (`TypeError`), comprovando o comportamento faltante.
- **Green:** Restaurei o método do repositório, que delega à implementação transacional compartilhada. O mesmo teste PostgreSQL isolado passou: 1 teste selecionado passou, 74 foram ignorados.
- **Refactor/reteste:** A nota processual anterior continua acima para preservar a cronologia do protótipo inicial; esta remediação estabelece uma nova verificação Red → Green test-first na fronteira de persistência, sem reescrever o histórico.
