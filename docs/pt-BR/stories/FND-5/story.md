# Story FND-5: Comandos de chat, chamadas, ciclo de atendimento e propriedade da conta

[English version](../../../stories/FND-5/story.md)

**Complexidade:** COMPLEX
**Executor:** @dev
**Quality gate:** @qa
**Épico/capacidade:** Chat, ciclo de vida das filas e propriedade da conta (FND-5)
**Status:** Done
**Issue:** [#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)
**Fonte dos requisitos:** seção FND-5 em `docs/pt-BR/stories.md`, especificação do produto e issue aceita no GitHub.

## História do usuário

Como streamer que opera comandos de fila durante uma live, quero ações de chat autorizadas, chamadas e timeouts recuperáveis e alterações da conta atual com propriedade correta, para manter filas e conta consistentes durante concorrência e reinícios.

## Escopo e critérios de aceite

- Parser e autorização usam identidade/canal/badges confiáveis da mensagem Twitch; mensagens mutáveis são deduplicadas e cooldown de viewer é aplicado.
- Chamadas são limitadas e persistidas; entrega da notificação é durável, privacidade é consultada no envio e timeout começa somente após entrega confirmada.
- Iniciar atendimento aplica `called → in_progress` e impede ausência; decisões de timeout são serializadas com ações manuais e recuperação.
- Limpeza exige confirmação do mesmo ator/canal/fila e snapshot inalterado de entradas ativas em até 15 segundos; confirmação inválida não produz efeitos de domínio ou pontos.
- Troca automática de conta ocorre somente em chamada individual. Estado da conta atual tem uma única proprietária global entre filas; somente o encerramento dessa entrada retorna ao padrão mais recente.
- Alterações manuais preservam o vínculo de propriedade atual, reset limpa a propriedade e todas as mudanças são persistidas/auditadas.
- Handlers de chat, timers e painel usam serviços compartilhados de domínio/aplicação.
- Filas arquivadas somem da descoberta do viewer, preservam entradas existentes para atendimento pelo operador, só podem ser desarquivadas após pausa confirmada e nunca reabrem automaticamente.
- Exclusão exige confirmação explícita no painel, fecha/arquiva a fila de forma durável, solicita cancelamento das entradas ativas ligadas a resgate, pagina todos os resgates remotos `UNFULFILLED` e aguarda confirmação dos cancelamentos antes de excluir a recompensa Twitch. Operações desconhecidas, falhas, conflitos ou interrupções ficam visíveis e podem ser retomadas; o histórico preserva a identidade antiga da fila.
- Testes cobrem concorrência, reinício, falha de entrega, mudanças de privacidade e ausência de operações de pontos indevidas.

## Progresso atual

Implementado: integração do parser/autorização, comandos centrais de viewer/gestão, chamadas limitadas, outbox durável de chat, timeout após envio confirmado, início de atendimento, prévia/confirmação de limpeza, rótulos persistidos e propriedade em chamada individual, serviço compartilhado de transição, serialização PostgreSQL global das mutações da conta, reenvio de chamada pelo painel, ciclo de arquivamento e exclusão retomável confirmada.

Abrir/fechar recompensa grava intenção durável, atualiza a Twitch pelo worker e só informa confirmação após estado remoto compatível ou resolve resposta perdida consultando novamente. Retries de notificação de chat usam backoff exponencial com jitter persistido e respeitam retry-after do 429. Cooldown durável de viewer e deduplicação por ID da mensagem estão implementados no PostgreSQL. Implementação, lista de arquivos e execução completa da qualidade estão concluídas; FND-5 está em revisão independente de QA. FND-7 continua bloqueada por FND-5 e FND-6.

## Registro TDD — concorrência da propriedade da conta entre filas (2026-10-06)

- **Comportamento:** chamadas individuais concorrentes em filas diferentes serializam a propriedade da conta e auditam o estado predecessor real; a conta final corresponde à última troca commitada.
- **Red:** `npm test -- --run tests/integration/queue-repository.test.js -t 'serializes automatic account ownership across concurrent calls from separate queues'` — 1 falhou porque as duas auditorias registraram `Streamer` como estado anterior.
- **Green:** mesmo comando — 1 passou após adicionar advisory lock transacional PostgreSQL compartilhado por trocas automáticas, resets do proprietário, alterações/resets manuais e atualização do rótulo padrão.
- **Refactor/reteste:** teste focado passou novamente. `npm test -- --run tests/integration/queue-repository.test.js tests/integration/queue-repository-chat.test.js` — 47 passaram com PostgreSQL isolado e migrations reais.

## Registro TDD — deduplicação durável de mensagens e cooldown de viewer (2026-10-06)

- **Comportamento:** persistir reivindicações por ID de mensagem e cooldown de cinco segundos por viewer/canal; duplicatas continuam bloqueadas após recriar o repositório, mensagem recusada por cooldown não executa em redelivery posterior, comandos simultâneos de viewer são serializados e gestão não sofre cooldown de viewer.
- **Red — contrato PostgreSQL:** `npm test -- --run tests/integration/queue-repository.test.js -t 'persists chat message deduplication|serializes viewer cooldown claims'` — 2 falharam porque `claimChatCommand` não existia.
- **Red — contrato do handler:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'claims each authorized command durably'` — 1 falhou porque o handler não reivindicava a operação antes dos efeitos.
- **Green:** contrato PostgreSQL — 2 passaram após implementar reivindicações transacionais em `processed_operations`, protegidas por advisory locks por mensagem/viewer; suíte focada do handler — 7 passaram após ligar a reivindicação durável e barrar duplicatas/cooldown antes da execução.
- **Refactor/reteste:** contratos PostgreSQL e handler passaram novamente. O resultado persiste somente IDs/estado/data seguros; texto da mensagem e entrada rejeitada não são gravados.

## Registro TDD — abrir/fechar recompensa com confirmação remota e backoff de retry de chat (2026-10-06)

- **Comportamento:** abrir/fechar recompensa gerenciada cria operação durável e só informa sucesso após confirmação da Twitch; resposta perdida é resolvida consultando a recompensa sem repetir mutação possivelmente aplicada. Chamadas de chat sem entrega confirmada agendam backoff durável e não são reclamadas antes do prazo.
- **Red — intenção PostgreSQL de recompensa:** `npm test -- --run tests/integration/queue-repository.test.js -t 'persists a remote reward pause intent'` falhou porque `setQueueOpen` alterava somente o estado local e não criava tarefa de outbox.
- **Red — reconciliação do worker:** `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'confirms queue opening|reconciles a lost open response'` falhou porque o worker não suportava `reward.set_open`.
- **Red — resposta do chat:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'does not announce an opening reward as open'` falhou porque a resposta não descrevia a confirmação remota pendente.
- **Red — agenda de retry:** `npm test -- --run tests/unit/chat-outbox-worker.test.js -t 'backs off after unconfirmed delivery'` falhou porque nenhum `nextAttemptAt` era persistido.
- **Green/refatoração:** testes focados passaram após incluir intenção/lease/confirmação transacional de abertura da recompensa, preflight e reconciliação segura após resposta perdida, texto de chat correto para pendência e backoff exponencial limitado com jitter/atraso 429. Os testes foram executados individualmente; o comando agregado dos filtros não é registrado como uma execução única.
- **Contrato PostgreSQL de retry:** a primeira tentativa falhou na preparação porque `callSpecificEntry` não enfileira notificação; após usar `enqueueCallNotification`, a asserção corrigida validou `nextAttemptAt`. `npm test -- --run tests/integration/queue-repository.test.js -t 'persisted retry time' tests/unit/chat-outbox-worker.test.js` — 1 integração passou e 51 casos não relacionados foram ignorados; a tarefa não é reclamada antes do prazo e volta a ser reclamada no vencimento.

## Registro TDD — reenvio de notificação de chamada pelo operador (2026-10-06)

- **Comportamento:** ação do painel protegida por sessão/CSRF re-enfileira a notificação existente somente enquanto a entrada continua `called`; não repete a transição de domínio, não cria outra linha na outbox nem altera `calledAt`/prazo existente. Uma tarefa em processamento não é enviada em paralelo.
- **Red — contrato PostgreSQL:** `npm test -- --run tests/integration/queue-repository.test.js -t 'resends an existing call notification'` falhou porque `resendCallNotification` não existia.
- **Red — contrato HTTP:** `npm test -- --run tests/unit/queue-routes.test.js -t 'call notification resend'` retornou 404 porque a rota não existia.
- **Green/refatoração:** contratos do repositório e rota passaram; o caso PostgreSQL confirma reutilização da mesma tarefa da outbox, auditoria de ator/motivo, transição inalterada e prazo preservado. `npm test -- --run tests/integration/queue-repository.test.js -t 'resends an existing call notification'` — 1 passou; `npm test -- --run tests/unit/queue-routes.test.js -t 'call notification resend'` — 2 passaram; `npm test -- --run tests/unit/queue-routes.test.js -t 'requires the local session and CSRF token for call notification resend'` — 1 passou. `npm run lint` e `npm run typecheck` passaram.

## Registro TDD — repetição de abrir fila enquanto aguarda confirmação remota (2026-10-06)

- **Comportamento:** repetir a mesma solicitação de abertura durante `pending_open` retorna pendência e não cria segunda tarefa; não pode informar confirmação apenas pelo estado desejado local.
- **Red — regressão PostgreSQL:** `npm test -- --run tests/integration/queue-repository.test.js -t 'repeated open request pending'` falhou porque o repositório rejeitava recompensa pendente como não pronta em vez de devolver o estado pendente persistido.
- **Green/refatoração:** o mesmo teste PostgreSQL isolado passou após distinguir no-op sincronizado, mesma intenção pendente e estado remoto não resolvido antes de permitir nova transição. Verifica exatamente uma intenção na outbox. `npm test -- --run tests/unit/chat-command-handler.test.js tests/unit/queue-routes.test.js -t 'opening reward|open-state'` também passou 1 caso de chat selecionado (21 casos não relacionados ignorados).

## Registro TDD — filas arquivadas, exclusão retomável e recuperação pelo operador (2026-10-05)

- **Comportamento:** arquivar pausa recompensa aberta e oculta a descoberta, preservando atendimento das entradas existentes; desarquivar mantém a fila fechada. Exclusão exige confirmação protegida explícita, remove entradas ativas pela decisão de domínio compartilhada, solicita cancelamento independentemente da política da fila, importa todos os resgates `UNFULFILLED` paginados e não exclui a recompensa Twitch antes da confirmação de cada cancelamento. Tarefas de exclusão em estado desconhecido podem ser tentadas novamente no painel; retries restauram a etapa pendente correta. Histórico permanece vinculado ao ID antigo e as chaves só podem ser reutilizadas após confirmação final.
- **Red — domínio da exclusão:** `npm test -- --run tests/unit/entry-transitions.test.js -t 'queue deletion'` falhou porque a exclusão retornava `no_operation` em vez de intenção de cancelamento.
- **Red — confirmação explícita no painel:** `npx vitest run tests/unit/queue-routes.test.js -t 'requires CSRF and calls the domain service to request queue deletion'` falhou porque uma requisição válida com CSRF sem `confirm: true` ainda retornava 200.
- **Red — ação no painel:** `npx vitest run tests/unit/web-route.test.js -t 'offers explicit queue deletion confirmation'` falhou porque faltavam a ação de exclusão e a proteção do estado pendente.
- **Red — projeção segura de operação:** `npx vitest run tests/unit/queue-routes.test.js -t 'exposes only safe queue-deletion operation fields'` falhou porque a resposta da API omitia entidade da exclusão e campos de retry.
- **Red — regressão de recuperação PostgreSQL:** a primeira execução completa de `npm test` falhou porque retry manual tentou consultar uma fila usando o ID da operação de resgate (UUID PostgreSQL inválido, `22P02`); os outros 326 testes passaram.
- **Red — etapa de retry da exclusão:** `npm test -- --run tests/integration/queue-repository.test.js -t 'restores the pending pause stage when an operator retries an unknown queue deletion'` falhou porque `close_unknown` persistia após redefinir a tarefa como pendente, impedindo o worker de reivindicá-la.
- **Red — operação oculta pelo limite:** `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps deletion tasks visible when the financial operation history exceeds the panel page limit'` falhou porque 205 operações financeiras mais novas removiam da consulta conjunta de 200 linhas uma exclusão pendente antiga.
- **Green/refatoração:** testes HTTP, web, PostgreSQL e worker focados passaram. Casos PostgreSQL cobrem intenção, recompensa já pausada, bloqueio financeiro/preservação histórica/reuso de chaves, retorno à etapa de pausa e visibilidade apesar de mais de 200 operações novas; tarefas de ciclo de vida têm agora consulta independente do histórico financeiro paginado. Worker passou ao esperar cancelamentos e ao resolver resposta perdida do DELETE com somente uma chamada DELETE.
- **Comandos/resultados Green:** `npm test -- --run tests/unit/queue-routes.test.js -t 'requires CSRF and calls the domain service to request queue deletion|exposes only safe queue-deletion operation fields'` (2 aprovados); `npm test -- --run tests/unit/web-route.test.js -t 'offers explicit queue deletion confirmation'` (1 aprovado); `npm test -- --run tests/integration/queue-repository.test.js -t 'requests resumable deletion|starts reward deletion directly|prevents reward deletion|restores the pending pause stage'` (4 aprovados); `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps deletion tasks visible when the financial operation history exceeds the panel page limit'` (1 aprovado); `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'records every unfulfilled redemption|reconciles a lost reward-delete response'` (2 aprovados).

## Execução de qualidade — 2026-10-06

- **TDD — documentação da política de versão por PR:** primeiro foi adicionado um contrato documental bilíngue. Red — `npm test -- --run tests/unit/documentation-contract.test.js -t 'owner-controlled per-PR version increment'` falhou porque os documentos não explicitavam as regras PATCH/MINOR/MAJOR nem reservavam mudanças de estágio ao proprietário. Green — o mesmo comando passou após atualizar os dois documentos de versão; essas asserções estão incluídas na suíte final abaixo.
- **TDD — regra de atualização da issue vinculada:** primeiro foi adicionado um teste de contrato para `AGENTS.md`. Red — `npm test -- --run tests/unit/documentation-contract.test.js -t 'DevOps to update the linked issue'` falhou porque o projeto não exigia que `$aiox-devops` atualizasse a issue de uma story concluída após o merge nem limitava comentários. Green — o teste focado passou após registrar a regra em `AGENTS.md`; changelogs técnicos foram atualizados nos dois idiomas.
- **TDD — legibilidade do changelog público:** primeiro foi adicionado contrato bilíngue para seções de release curtas e sem jargão de implementação. Red — `npm test -- --run tests/unit/documentation-contract.test.js -t 'keeps public changelogs concise'` falhou na seção v0.2.0 por expor identidade runtime, retry-after e terminologia de endpoint. Green — o mesmo comando passou após resumir os dois changelogs públicos em resultados para usuários; detalhes de implementação ficam nos changelogs internos.
- **TDD — comando AIOX port-denylist:** `npm test -- --run tests/unit/port-denylist-validation.test.js` Red — módulo validador ausente. Green — os dois testes do wrapper passaram após criar o adaptador CLI, e `npm run validate:port-denylist` analisou 1.028 arquivos sem achados.
- **TDD — divergência de versão da imagem Compose:** `npm test -- --run tests/integration/compose-contract.test.js -t 'defaults local app images'` Red — Compose resolvia `v0.1.0-0000000-alpha` enquanto `VERSION` versionado era `v0.2.0-0000000-alpha`. `npm test -- --run tests/integration/version-cli.test.js -t 'CI image'` Red — o contrato exigia o fallback obsoleto. Green — ambos os testes focados passaram após limpar o default do Compose e do argumento Dockerfile; CI continua fornecendo explicitamente a identidade materializada. O build limpo e a verificação de `/app/VERSION` serão registrados abaixo.
- `npm test` na revisão QA — 48 arquivos, 329 testes passaram (inclui migrations PostgreSQL isoladas, contrato de primeira execução Compose isolado e contrato documental de versão).
- `npm test` após o contrato de sincronização da issue — 48 arquivos, 330 testes passaram. Os testes adicionais de legibilidade do changelog e port-denylist estão incluídos na execução final pós-alterações abaixo.
- `npm test` final após as alterações — 49 arquivos, 333 testes aprovados.
- `npm run lint` — passou.
- `npm run typecheck` — passou.
- `npm run review:static` — OpenGrep analisou 41 arquivos JavaScript; 0 achados.
- `npm test -- --run tests/integration/version-cli.test.js tests/unit/documentation-contract.test.js` — 10 testes passaram antes de adicionar o contrato de política; o novo contrato passou no Red/Green focado e está incluído na suíte completa final.
- `npm run validate:version` — passou em `v0.2.0-0000000-alpha`.
- `npm run validate:port-denylist` — analisou 1.028 arquivos sem achados.
- `docker compose config --quiet` e `git diff --check` — passaram.
- `docker compose build bot` — build da imagem de produção passou com a imagem Node 24 Alpine fixada.
- Regressão final de identidade: `docker compose build bot` passou sem substituir a versão; `docker compose run --rm --no-deps --entrypoint cat bot /app/VERSION` retornou `v0.2.0-0000000-alpha`, igual ao `VERSION` versionado.
- Integração Twitch real não foi exercitada; nenhuma credencial Twitch nem operação de pontos real foi usada.

## Lista de arquivos deste incremento

- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/outbox/chat-worker.mjs`
- `apps/api/src/commands/chat-handler.mjs`
- `apps/api/src/http/queue-routes.mjs`
- `apps/api/src/domain/queue-service.mjs`, `apps/api/src/domain/entry-transitions.mjs`
- `apps/web/app.js`
- `apps/web/call-notification-actions.mjs`
- `tests/integration/queue-repository.test.js`
- `tests/unit/reward-outbox-worker.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/web-route.test.js`, `tests/unit/entry-transitions.test.js`, `tests/unit/chat-command-handler.test.js`, `tests/unit/chat-outbox-worker.test.js`
- `tests/unit/call-notification-actions.test.js`
- `tests/unit/documentation-contract.test.js`
- `AGENTS.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/FND-5/story.md`, `docs/pt-BR/stories/FND-5/story.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `package.json`, `package-lock.json`, `VERSION`, `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/qa/gates/FND-5-chat-calls-account-ownership.yml`
- `docs/qa/assessments/FND-5-risk-20261006.md`, `docs/qa/assessments/FND-5-nfr-20261006.md`
- `apps/infra/scripts/validate-port-denylist.mjs`, `tests/unit/port-denylist-validation.test.js`
- `.aiox/project-status.yaml`

## Checklist de implementação

- [x] Critérios de aceite e caminhos compartilhados de domínio implementados.
- [x] Testes dos comportamentos passaram, incluindo PostgreSQL isolado/migrations.
- [x] Stories, índice central e changelogs aplicáveis em inglês e pt-BR sincronizados.
- [x] Lista de arquivos e evidências Red → Green → Refactor atualizadas.
- [x] `npm test` — 48 arquivos, 330 testes aprovados; snapshot de QA com 329 mais o novo contrato pós-revisão para sincronização da issue.
- [x] `npm run lint`, `npm run typecheck` e `npm run review:static` passaram.
- [x] `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram.
- [x] Revisão independente de QA e decisão do gate — CONCERNS, 9,0/10; operações reais da Twitch seguem sem validação.

## Histórico de alterações

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-05 | 0.1.0 | Implementados arquivamento/desarquivamento e exclusão retomável; registradas evidências PostgreSQL, worker, HTTP e painel; enviada para QA. | @dev |
| 2026-10-06 | 0.2.0 | Gate de QA CONCERNS — Status: InReview → Done | @qa |

## Resultados de QA

### Data da revisão: 2026-10-06

### Revisado por: Quinn (Test Architect)

### Revisão analisada

`worktree-source-sha256:e672280cd8705933b2b04fbae506a600d77db32c97e1a88ac766bf30bbe74b59`

### Avaliação da qualidade do código

Os nove critérios de aceite estão mapeados a testes unitários e de persistência. Passaram a suíte completa de 329 testes, migrations/concorrência em PostgreSQL real, contrato isolado de primeira execução do Compose, lint, typecheck, OpenGrep, validação de versão, configuração do Compose e verificação de diff. Nenhum defeito bloqueante de implementação foi encontrado. Nota de qualidade: **9,0/10**.

### Refatoração realizada

Nenhuma durante a revisão de QA.

### Verificação de conformidade

- Padrões de código: ✓ ESM/JSDoc, lint e typecheck passaram.
- Estrutura do projeto: ✓ Responsabilidades de API/domínio/persistência/outbox/web seguem separadas.
- Estratégia de testes: ✓ Persistência usa migrations reais isoladas; fronteiras de rede/adaptadores usam fakes.
- Todos os critérios de aceite: ✓ Os critérios automatizados passaram; não se alega aceite em canal real.

### Revisão de segurança

Nenhum problema bloqueante. A autorização do chat usa campos confiáveis do evento; mutações do painel exigem sessão local/CSRF; projeções de erro são sanitizadas e texto do usuário não é interpretado como HTML.

### Considerações de desempenho

Backoff é limitado e chamadas Twitch ocorrem fora de transações de banco. Uma melhoria de baixa prioridade é substituir a leitura de todo o histórico local de resgates na apuração de bloqueios da exclusão por consultas limitadas/contagem se filas muito grandes se tornarem comuns.

### Arquivos modificados durante a revisão

- `docs/qa/gates/FND-5-chat-calls-account-ownership.yml`
- `docs/qa/assessments/FND-5-risk-20261006.md`
- `docs/qa/assessments/FND-5-nfr-20261006.md`
- Resultados de QA e campos de ciclo de vida desta story.

### Status do gate

Gate: CONCERNS → `docs/qa/gates/FND-5-chat-calls-account-ownership.yml`
Perfil de risco: `docs/qa/assessments/FND-5-risk-20261006.md`
Avaliação NFR: `docs/qa/assessments/FND-5-nfr-20261006.md`

### Transição de ciclo de vida

QA aplica `InReview → Done`. O gate é CONCERNS porque operações reais autorizadas da Twitch não foram exercitadas; fakes de adaptador não comprovam alterações reais de pontos. Nota 9,0/10 atende ao limite de 8,5/10 para PR definido pelo projeto.
