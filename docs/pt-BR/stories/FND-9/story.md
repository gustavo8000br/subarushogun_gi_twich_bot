# FND-9 — Modos de fila local e com reward conforme capacidade Twitch

[English](../../../stories/FND-9/story.md)

**Issue:** [#19](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/19)  
**Complexidade:** COMPLEX (23/25)  
**Status:** InProgress  
**Executor:** @dev  
**Revisão de arquitetura:** @architect  
**Revisão de dados:** @data-engineer  
**Gate de qualidade:** @qa  
**Épico/capacidade:** FND-9 — modos locais de fila quando APIs de reward Twitch não estão disponíveis

## História

**Como** streamer que usa o chatbot local,
**quero** manter o chat e as filas operacionais independentemente das APIs de Pontos do Canal, com filas vinculadas a reward ou locais/manuais,
**para que** viewers possam entrar por uma reward gerenciável ou ser adicionados gratuitamente por mim/moderadores sem perder rastreabilidade financeira dos resgates.

## Limites de produto aprovados

- O modo da fila é `channel_points` ou `manual_only`. No modo `channel_points`, a reward é `bot_created` por padrão ou `dashboard_existing` somente se este Client ID comprovar o ciclo completo.
- Entrada manual é uma origem separada, permitida nos dois modos. Somente streamer/moderador adiciona explicitamente o usuário Twitch; chat livre de viewer nunca faz autoinscrição.
- Entrada manual tem origem `manual`, sem ID de resgate e sem intenção financeira na outbox.
- Streamer pode converter uma fila vinculada a reward, uma única vez, para modo local/manual. A conversão fica pendente até a Twitch confirmar a pausa. Manter ID/origem da reward como histórico, não excluí-la durante a conversão, preservar/drenar resgates existentes e cancelar duravelmente qualquer resgate concorrente.
- Pausa Twitch com falha/resultado desconhecido não ativa modo local. Retry/reconciliação resolve o estado remoto sem repetir efeitos cegamente.
- O painel permanece porque faz parte da operação do produto. Implementar domínio/chat/API antes dos controles visuais; painel usa os mesmos contratos testados.
- Sem autoinscrição de viewer, processamento/verificação de pagamento/Bits/inscrição, prioridade automática, serviço externo novo, escopo OAuth novo sem necessidade comprovada ou persistência de chat bruto.

## Critérios de aceite

1. [ ] Autorização válida de chat do broadcaster inicia o tratamento de `channel.chat.message` mesmo quando APIs de reward não são suportadas; health/painel distinguem estado do chat da capacidade de reward.
2. [ ] Escopos OAuth só são divididos após evidência documentada e aceite autorizado. Falhas temporárias de rede, OAuth, escopo, 429, 5xx ou timeout são `unknown/retryable`, nunca prova para rebaixar uma fila existente.
3. [ ] Capacidade de reward é determinada por operações API realmente suportadas, não apenas por `broadcasterType`. Reward do Dashboard só pode ser selecionada após prova do ciclo completo por reward; caso contrário, painel oferece fila local/manual e não adota recompensas sem relação.
4. [ ] Migration/backfill PostgreSQL distingue fila local nova (sem ID de reward) de fila convertida (ID/origem histórica mantidos), aplica restrições coerentes de modo/origem e preserva filas, entradas, resgates, auditoria, configurações e OAuth existentes.
5. [ ] Streamer/moderador pode adicionar explicitamente e sem custo usuário Twitch resolvido a fila com reward, local/manual, fechada ou `conversion_pending`, respeitando duplicidade/arquivamento/exclusão. Entrada é manual, FIFO normal, auditada e sem vínculo de resgate ou finanças.
6. [ ] `!<fila> add` enviado por viewer, ator/badge falsificado, Shared Chat de outro canal, login/UID inválido e pedido em texto livre não causam consulta, inserção, operação financeira Twitch nem anúncio inseguro.
7. [ ] `!fila ping` localizado permanece exclusivo de streamer/mod e funciona com chat conectado e APIs de reward indisponíveis; retorna Pong, versão do produto e latência Twitch em cache, sem consulta Helix/reward por mensagem.
8. [ ] Pedido de conversão persiste intenção única/idempotente e fica `conversion_pending` enquanto a pausa não for resolvida. Bloqueia novos resgates/chamadas da reward nessa fila, mas mantém add manual explícito.
9. [ ] Pausa Twitch confirmada ativa modo local/manual, mantém ID/origem antigos da reward como histórico, deixa a reward pausada e não executa DELETE da reward como parte da conversão.
10. [ ] Timeout, 429, 5xx, falha OAuth, resposta perdida e reinício do processo durante conversão recuperam por retry/reconciliação. Nenhuma falha ou resultado desconhecido ativa modo local ou repete efeitos cegamente.
11. [ ] Resgate concorrente com conversão é registrado de forma durável e recebe cancelamento solicitado; resgates já admitidos e suas tarefas financeiras seguem confirmação/recuperação normal. Falha no cancelamento permanece visível/recuperável e impede exclusão destrutiva da fila.
12. [ ] Restrições/transações PostgreSQL serializam conversão com importação EventSub, add, chamada, exclusão e outbox; testes usam PostgreSQL isolado real e migrations versionadas, sem mock de Prisma.
13. [ ] Painel protegido permite criar/selecionar modo, solicitar conversão com confirmação revisável, exibir estados pendente/confirmado/falha recuperável e reward histórica, revalidando sessão/CSRF/chave de operação/versão no backend.
14. [ ] Textos de produto/localização são adicionados nos idiomas suportados e dados escritos pelo usuário não são alterados, sendo renderizados com segurança. Não expor enum Twitch, erro bruto, segredo, token, UID inválido nem mensagem bruta.
15. [ ] Testes existentes de reward em canal elegível, EventSub, reconciliação, outbox, comandos, ordenação e exclusão continuam passando; cada comportamento novo registra Red → Green → Refactor real nos índices de stories em inglês e pt-BR.
16. [ ] Revisão independente @qa e gates do projeto passam. Aceite de chat Twitch ao vivo só é informado se executado; mocks não comprovam reward/reembolso/consumo real.
17. [ ] Toda documentação afetada e ambos os changelogs seguem equivalentes em inglês/pt-BR. FND-9 não fica Done até todos os critérios e gates de evidência serem concluídos.
18. [x] Fechar, arquivar ou converter uma fila de recompensa gerenciada confirma `is_paused=true` na Twitch; reabrir confirma `is_paused=false`. Não enviar nem exigir `is_in_stock`, pois o corpo atual de Update Custom Reward da Helix não aceita esse campo, embora as respostas GET o exponham. Preservar o valor retornado como estado controlado pela Twitch e não afirmar que a recompensa foi marcada como esgotada. A reconciliação usa somente campos graváveis documentados e não deve indicar divergência apenas porque `is_in_stock=true` em uma recompensa pausada. Coberto pelos testes do adapter/worker/reconciliação, testes de migration/reconciliação no PostgreSQL real e consulta autorizada idempotente descrita em validation.md.

## Tarefas / subtarefas

- [x] Correção de regressão — criação de fila com o formato da rota HTTP (AC: 4, 13)
  - [x] Red: `npm test -- --run tests/integration/queue-repository.test.js -t 'normalized key bundle passed'` falhou 2/2 no PostgreSQL isolado porque o Prisma rejeitou `keys` auxiliar da rota como valor de relação.
  - [x] Green: o mesmo comando passou 2/2 depois que os dois caminhos do repositório descartaram o pacote auxiliar `keys` e recalcularam as chaves a partir de `slug`/`aliases`.
  - [x] Refactor: a normalização central do repositório continua como fonte das `queue_keys` persistidas; metadados de validação da rota não são tratados como campo do modelo Prisma.
  - [x] Reprodução no Chrome: uma requisição autorizada retornou HTTP 400 antes de persistência ou chamadas Twitch; nenhum dado ou serviço Compose ativo foi alterado. Nova tentativa no navegador com o runtime atualizado continua pendente porque o bot ativo não foi reiniciado.

- [x] 1. Persistir modo da fila, origem da reward e estado de transição (AC: 4, 8, 12)
  - [x] Escrever primeiro testes PostgreSQL reais para backfill, fila local, associação histórica convertida, constraints, idempotência, recuperação após reinício e preservação de dados não relacionados.
  - [x] Implementar schema/migration/repository após Red comportamental; serializar mutações com a estratégia PostgreSQL existente.
  - [x] Registrar Red, Green, Refactor e executar novamente a suíte PostgreSQL afetada.
- [x] 2. Separar capacidades de chat e reward (AC: 1, 2, 3, 7)
  - [x] Testar runtime de chat quando a capacidade de reward não é suportada, além dos estados disponível/desconhecido, validação/renovação de token e retry. Reduzir escopos OAuth para chat continua condicionado a evidência Twitch autorizada.
  - [x] Manter comandos ativos enquanto workers/subscriptions de reward dependem de capacidade verificada e modos configurados.
  - [x] Preservar contrato `/health` e projeção localizada; não expor erros brutos do backend.
- [x] 3. Implementar modos de fila e gates de origem da reward (AC: 3, 4, 9, 14)
  - [x] Testar contratos de criação e seleção antes de alterar rotas/repositório.
  - [x] Manter reward criada pelo bot como padrão; seleção de reward do Dashboard permanece indisponível até este Client ID comprovar o ciclo completo.
  - [x] Criar fila local sem chamadas de reward; preservar metadados históricos na conversão.
- [x] 4. Implementar add manual explícito e gratuito nos dois modos (AC: 5, 6, 15)
  - [x] Testar autorização, resolução de ID, duplicidade/UID/privacidade, ausência de intenção financeira e de autoinscrição por texto livre antes de alterar handlers.
  - [x] Encaminhar add manual por chat e painel ao serviço de domínio compartilhado.
  - [x] Preservar FIFO contínuo e auditar ator/origem.
- [x] 5. Implementar conversão recuperável reward-para-manual (AC: 8–12)
  - [x] Escrever testes PostgreSQL para pausa pendente/confirmada/desconhecida/falha, reinício, retry/idempotência e corrida entre transição/eventos.
  - [x] Adicionar intenção durável; chamar Twitch fora da transação; reconciliar pausa remota desconhecida antes do retry.
  - [x] Cancelar resgate concorrente de forma durável; preservar operações financeiras anteriores; proibir reward DELETE durante conversão.
- [x] 6. Implementar controles protegidos do painel após contratos do backend (AC: 13, 14)
  - [x] Adicionar seleção de modo e estados localizados de confirmação/status após testes da API.
  - [x] Renderizar texto com segurança; validar sessão, CSRF, chave de operação e versão; fornecer erros seguros. Revisão UX independente permanece para a auditoria planejada.
- [ ] 7. Recuperação, QA, documentação e conclusão (AC: 15–17)
  - [x] Testar recuperação após reinício/falha parcial Twitch; preservar filas/rewards existentes.
  - [ ] Executar revisão independente @qa e gates do projeto. Reportar testes Twitch ao vivo separadamente.
  - [x] Atualizar docs, índices, roadmaps, integrações e changelogs nos dois idiomas; completar Lista de arquivos e evidências. O roteiro de teste Twitch está em `docs/pt-BR/stories/FND-9/validation.md` e no par em inglês.
- [x] 8. Contrato Helix de pausa e recuperação (AC: 18)
  - [x] Testar o PATCH de pausa suportado, filas arquivadas/fechadas, retry após resposta perdida e reconciliação quando a Twitch mantém `is_in_stock=true`.
  - [x] Remover gravação/snapshot de estoque não suportados; confirmar pausa pelo provider Twurple instalado e pelos campos oficiais da Helix.

## Notas de desenvolvimento

- Fontes dos requisitos/decisões: [spec FND-9](spec/spec.md), [requirements](spec/requirements.json), [research](spec/research.json), [critique](spec/critique.json) e [plano](plan/implementation.yaml), com equivalentes pt-BR.
- Entradas existentes de implementação identificadas no repositório: `apps/api/src/twitch/{auth-runtime,integration,eventsub-runtime,helix-adapter,reconciliation}.mjs`; `apps/api/src/persistence/queue-repository.mjs`; `apps/api/src/http/queue-routes.mjs`; `apps/api/src/commands/chat-handler.mjs`; `apps/api/prisma/schema.prisma`; `apps/web/app.js`; `apps/web/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`.
- Transições de domínio permanecem em serviços de domínio. Handlers HTTP/chat/EventSub/workers não podem escrever status de fila/entrada diretamente.
- Chamada Twitch nunca ocorre dentro de transação PostgreSQL aberta. Pausa desconhecida exige reconciliação remota, não retry cego nem sucesso local.
- Conversão para modo manual é unidirecional nesta story. Modo local não recebe novos resgates ativos, mas fila convertida conserva ID/origem antiga como metadado histórico.
- Add manual permanece permitido em `conversion_pending`; resgates EventSub concorrentes após a intenção recebem cancelamento durável. Entradas aceitas antes da conversão mantêm o ciclo financeiro atual.
- Não informar reembolso/consumo antes da confirmação Twitch. HTTP 404 ou ausência em uma página parcial não comprovam cancelamento.
- Não alterar dependências, estágio de release ou versão runtime fora da alteração de versão de produto exigida na PR futura.

### Testes

- JavaScript ESM + Vitest; testes em `tests/unit/` e `tests/integration/`.
- Contratos PostgreSQL, índices parciais, transações e migrations usam o harness PostgreSQL isolado em `tests/helpers/isolated-postgres-cleanup.mjs` e migrations Prisma reais. Não usar SQLite ou mock Prisma como evidência de atomicidade.
- Usar relógio controlável e fakes Twitch/EventSub somente nas fronteiras externas. Afirmar ausência de consultas, inserções, chamadas API, reembolsos/consumos, mensagens e exposição de UID indevidos.
- TDD obrigatório por comportamento: teste que falha por ausência do comportamento, implementação mínima, refatoração e repetição da suíte afetada. Erro de sintaxe/dependência/ambiente não conta como Red.
- Registrar comandos, falhas, resultados aprovados e notas de refatoração reais em `docs/stories.md` e `docs/pt-BR/stories.md`; nunca inventar evidências.

## Plano de gates de qualidade

**Tipo principal:** Integração full-stack (API/domínio/banco/chat/painel)  
**Tipos secundários:** Migration PostgreSQL, integração Twitch, segurança/privacidade, localização  
**Complexidade:** Complexa — 23/25  
**Executor:** @dev  
**Revisão de arquitetura:** @architect  
**Revisão de dados:** @data-engineer  
**Gate de qualidade:** @qa  
**Ferramentas de gate:** Vitest, PostgreSQL isolado + migrations Prisma, `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, `git diff --check`.

**Foco da análise estática:** autorização, limites transacionais, retries idempotentes, ausência de downgrade silencioso, ordenação de corridas EventSub, sanitização de segredos/texto bruto, verificações CSRF/sessão/versão e equivalência bilíngue.

- [ ] Pré-commit @dev: testes afetados e gates completos exigidos.
- [ ] Revisão @architect: modelo persistido da fila/transição e semântica de recuperação.
- [ ] Revisão @data-engineer: migration, unicidade, locks e recuperação após reinício.
- [ ] QA independente @qa: todos os AC com evidência, bloqueadores e score.
- [ ] Pré-PR @devops: fluxo branch/PR, versão/changelogs e sincronização de issue ao concluir.

### Evidências de implementação — 2026-10-07

Evidências TDD registradas durante a branch ativa `feat/fnd-9-manual-queue-modes`:

- **Resultados duráveis de reward correlacionados:** Red: o teste focado do worker falhou porque um resultado `unknown` não gerava diagnóstico; um teste separado do reporter falhou porque códigos `snake_case` em minúsculas eram descartados. Um teste de composição do runtime então falhou porque a factory do worker de reward não recebia o reporter. Green: o worker informa códigos persistidos de retry/falha/unknown ao reporter seguro, o runtime fornece o callback, e o reporter aceita códigos snake_case restritos em maiúsculas/minúsculas. Testes focados passaram: `npm test -- --run tests/unit/reward-outbox-worker.test.js tests/unit/error-diagnostics.test.js tests/unit/runtime-composition.test.js` (registrar contagem final após a nova suíte completa). O `reward_create_response_unverified` atual foi salvo antes dessa mudança e não tem referência retroativa.

- **Schema e migration de modo:** `npm test -- --run tests/integration/queue-repository.test.js -t 'admission mode and reward provenance'` Red — PostgreSQL `42703`, `column "queue_mode" does not exist`. Green após a migration versionada e os padrões do repositório: o teste PostgreSQL direcionado passou. Uma regressão seguinte de proveniência observou `bot_created` quando registros preexistentes não verificados devem ser `legacy_unknown`; Green passou após separar registros legados de recompensas novas criadas pelo bot.
- **Persistência de fila local:** um teste PostgreSQL real falhou primeiro porque `createManualQueue` não existia. Depois da implementação, `npm test -- --run tests/integration/queue-repository.test.js -t 'creates a local manual-only queue'` revelou que preferências eram ignoradas (esperava mensagem, prazo e UID visível configurados; recebia os padrões); Green passou após persistir as opções locais validadas. O mesmo teste confirma entrada manual sem ID de resgate e sem tarefa financeira na outbox.
- **API protegida e painel:** `npm test -- --run tests/unit/queue-routes.test.js -t 'manual-only queue through the protected API'` Red — esperava 201 e recebeu 400 porque a rota exigia custo em pontos. Green passou com o ramo local e campos explícitos no DTO. `npm test -- --run tests/unit/web-route.test.js -t 'serves overview, queues'` Red — o formulário não tinha `queueMode`; Green passou após adicionar seletor do modo, agrupamento de campos de recompensa e payload condicional.
- **Ciclo local:** Red PostgreSQL observou `QUEUE_REWARD_NOT_READY` ao abrir fila local. Green passou com alteração de estado somente local, auditada e sem outbox Twitch. A exclusão de fila sem reward falhou primeiro no requisito existente de reward gerenciável; Green passou com exclusão lógica, liberação das chaves, histórico preservado e nenhuma operação financeira. Comando direcionado: `npm test -- --run tests/integration/queue-repository.test.js -t 'deletes a never-rewarded local queue|opens and closes a local queue'`.
- **Conversão e corrida com reward:** o teste de resgate concorrente falhou primeiro porque `requestManualModeTransition` não existia. Green passou após persistir a intenção de pausa; o contrato PostgreSQL também prova que resgate `UNFULFILLED` durante a troca é registrado e recebe tarefa `redemption.cancel`. O teste de confirmação comprova que o modo permanece `channel_points` antes da confirmação e só muda após a confirmação da pausa com lease; ID/origem/custo da reward permanecem como histórico e nenhum reward DELETE é criado.
- **Recuperação da conversão:** Red PostgreSQL observou que uma pausa desconhecida não podia ser tentada novamente. Green passou após criar outra tarefa idempotente de pausa mediante retry explícito. `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'retries a manual-mode pause safely'` Red — o worker retornou `unknown` enquanto a Twitch ainda mostrava a reward ativa; Green passou após retry seguro com backoff da pausa idempotente. `npm test -- --run tests/unit/twitch-reconciliation.test.js -t 'converted manual queue reward'` Red — a reconciliação marcava como divergente uma reward pausada corretamente quando a entrada manual local estava aberta e não finalizava a troca pendente; Green passou após tratar o modo manual como sempre pausado remotamente e confirmar a intenção pelo estado remoto verificado.
- **Bloqueio de chamadas durante a conversão:** Red PostgreSQL — `npm test -- --run tests/integration/queue-repository.test.js -t 'blocks new calls while a reward-backed queue is switching to manual mode'` falhou porque `callNext` movia uma entrada para `called` enquanto a pausa Twitch estava pendente. Green — o mesmo teste PostgreSQL isolado passou após as operações de chamada em grupo e individual rejeitarem estados de conversão pendentes/desconhecidos/falhos sem mover entradas nem enfileirar avisos de chat. Red HTTP — `npm test -- --run tests/unit/queue-routes.test.js -t 'stable conflict code when reward-to-manual conversion blocks calls'` retornou 400 sem código estável; Green — 409 com `QUEUE_MODE_TRANSITION_PENDING` passou sem expor o erro interno. Red do texto no painel — `npm test -- --run tests/unit/panel-error-presentation.test.js -t 'state-conflict codes'` usou texto genérico para o novo código; Green — o mapeamento localizado em en/es/pt-BR passou. A refatoração centralizou a validação PostgreSQL nos dois caminhos de chamada. A instância usada no teste ao vivo do operador não foi reconstruída durante o teste.
- **Orientação no chat durante a conversão:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'explains that calls are paused while a reward queue switches to manual mode'` Red — `proximo` de moderador recebia apenas falha genérica. Green — o handler agora escolhe mensagem localizada e controlada pelo produto para o conflito de transição; não enfileira aviso de chamada nem envia detalhes técnicos ao chat. `npm run validate:localization` confirmou a integridade dos catálogos.
- **Prazo da chamada no painel do operador:** `npm test -- --run tests/unit/call-deadline-presentation.test.js` Red — o módulo de apresentação do prazo não existia, então o painel não podia mostrar o tempo restante nem distinguir envio pendente, ausência de prazo e prazo expirado. Green — a nova projeção usa o prazo persistido, a API protegida inclui a confirmação do envio e a interface mostra o tempo/status localizado em en/es/pt-BR. Os testes direcionados também verificam os campos do prazo na projeção protegida; a contagem atualiza junto com o polling existente de cinco segundos e não altera o estado da entrada.
- **Capacidades independentes:** testes direcionados de EventSub/integração/health cobrem chat conectado quando rewards não são suportadas e mantêm os estados Twitch separados. Nenhuma operação real autorizada de reward, resgate, pausa, cancelamento ou escrita de chat foi executada.
- **Capacidade pelo resultado real da API:** `npm test -- --run tests/unit/twitch-adapter.test.js -t 'actual Helix reward capability'` Red — um `broadcasterType` desconhecido era marcado como não suportado sem chamar `getCustomRewards`. Green após remover o gate baseado somente em metadados e consultar a Helix; agora o adapter distingue leitura bem-sucedida, `403` documentado como não suportado, `401` como token inválido e demais falhas temporárias. `npm test -- --run tests/unit/twitch-adapter.test.js tests/unit/twitch-integration.test.js` revelou depois a expectativa antiga para `403` (`authorization_required`); o teste foi alinhado para `channel_ineligible` e uma regressão de integração confirma que a negativa da consulta mantém chat/EventSub sem iniciar reconciliação de rewards. Refatoração/reexecução direcionada: **35/35 testes passaram**. Isso valida o contrato com fakes; documentação Twitch e teste autorizado real ainda são necessários para aceite.
- **Snapshot de estoque da reward (desenho histórico, supersedido em 2026-10-08):** O ciclo Red/Green anterior implementou snapshot de estoque e PATCH direto sob a suposição de que `is_in_stock` podia ser gravado. A revisão do contrato oficial e a consulta real autorizada refutaram a suposição: HTTP 200 manteve `is_in_stock=true` na resposta do PATCH e no GET seguinte. A implementação anterior foi removida; o registro original de TDD fica aqui como histórico, não como comportamento atual.
- **Correção de pausa/sincronização da reward Twitch (2026-10-08):** Red 1: testes de adapter/outbox/reconciliação falharam porque a lógica anterior enviava/exigia estado de estoque e persistia `reward_stock_before_close`; o contrato de migration PostgreSQL real confirmou a existência da coluna. Red 2: `npx vitest run tests/unit/twitch-adapter.test.js tests/unit/reward-outbox-worker.test.js -t 'updates only pause through|stale response|missing persisted reward|wrong persisted reward id|failed remote read|does not confirm a reward pause|explicit 429'` falhou em **10 testes**: pausa ainda contornava o cliente Twurple configurado, estado remoto desatualizado/ausente era classificado incorretamente no contrato do adapter e workers não reconheciam erros Twurple `statusCode` 400/401/403/429. Red 3: `npx vitest run tests/integration/queue-repository.test.js -t 'does not clear a remote divergence'` falhou porque a reconciliação removia `diverged` após uma edição local feita depois da leitura Twitch. Green: remover a coluna de snapshot por migration aditiva; enviar somente `{isPaused, autoFulfill:false}` via `updateCustomReward` do Twurple, reler a reward e rejeitar resultados ausentes/ID incorreto/erro de leitura; normalizar `statusCode` do Twurple junto do `status` para retry/falha permanente/resultado desconhecido; vincular a confirmação de divergência à versão da fila comparada com a Twitch. Green direcionado: `npx vitest run tests/unit/twitch-adapter.test.js tests/unit/reward-outbox-worker.test.js tests/unit/twitch-reconciliation.test.js tests/integration/postgres-foundation.test.js tests/integration/queue-repository.test.js` passou **158 testes em 5 arquivos**, incluindo migrations reais e corrida de versão stale. Refactor usa o SDK fixado e o cliente/rate limiter configurado em vez de chamada Helix manual. Evidência ao vivo: o PATCH autorizado idempotente anterior retornou HTTP 200, mas o estoque continuou verdadeiro; nenhuma reward foi excluída e nenhum resgate foi alterado. `npm test` passou **833 testes em 99 arquivos**; lint, typecheck, OpenGrep (0 achados), localização, versão, configuração Compose e diff passaram. A verificação runtime foi concluída após reconstruir somente o bot: a migration foi aplicada, `/health` retornou `ok` com banco/API/chat/rewards conectados e ping de 198 ms, e a recarga do Chrome mostrou canal conectado, sete filas preservadas e rewards disponíveis. Os volumes do banco e dos segredos foram preservados. Nenhuma reward ou resgate foi alterado nessa verificação runtime.
- **Adição manual gratuita durante conversão:** `npm test -- --run tests/integration/queue-repository.test.js -t 'keeps free operator adds available during conversion'` passou **1/1** na primeira execução. Foi apenas reforço de cobertura: o repositório já permitia essa operação; não declaramos Red nem mudança de implementação. A asserção PostgreSQL real confirma que a entrada manual não tem vínculo com resgate/financeiro enquanto o cancelamento do resgate concorrente continua pendente.
- **Suíte completa e gates de qualidade (2026-10-07, após a apresentação do prazo e cobertura de conversão):** `npm test -- --run` — **89 arquivos / 765 testes passaram**. `npm run lint`, `npm run typecheck`, `npm run validate:localization`, `npm run validate:version`, `npm run review:static` (**0 achados / 73 arquivos JS**), `docker compose config --quiet` e `git diff --check` passaram. QA independente, revisão UX, aceite Twitch real autorizado e prova do ciclo de reward remoto continuam pendentes; isso não conclui a FND-9.
- **Verificação da regressão de criação de fila (2026-10-07):** Após adicionar testes do pacote de chaves no formato da rota e tornar a asserção de rollback independente da ordem, `npm test -- --run` passou com **89 arquivos / 767 testes**. `npm run lint`, `npm run typecheck`, `npm run review:static` (**0 achados / 73 arquivos JS**), `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet` e `git diff --check` também passaram. O Compose ativo não foi reiniciado; nova confirmação no navegador e aceite Twitch ao vivo continuam pendentes.
- **Adaptador Twitch runtime e diagnóstico seguro (2026-10-07):** Red: `npm test -- --run tests/unit/twitch-integration.test.js -t 'exposes the active Twitch adapter'` falhou porque `integration.twitch` era `undefined` após inicialização, deixando workers de chat/reward inativos apesar do probe API saudável. Green expôs o adaptador ativo por getter e o teste focado passou. Testes Red de diagnóstico reproduziram erro inesperado de fila classificado como 400, detalhes brutos do Fastify na resposta e ausência de correlação para falhas de worker. Green adicionou resposta genérica localizada com `referenceId` e diagnóstico estruturado sem mensagens/stacks/payloads/segredos brutos. O comando focado `npm test -- --run tests/unit/safe-http-error-handler.test.js tests/unit/error-diagnostics.test.js tests/unit/outbox-loop.test.js tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js tests/unit/panel-error-presentation.test.js` passou 73 testes em 6 arquivos. A fila/outbox do teste autorizado no navegador foi preservada; gates completos e validação runtime Docker continuam.
- **Sanitização do logger Twurple (2026-10-07):** As declarações instaladas de `@twurple/eventsub-ws` 8.2.0 documentam a sobrescrita `logger.custom`. Red: `npx vitest run tests/unit/eventsub-runtime.test.js -t 'replaces Twurple EventSub raw logs with correlated safe diagnostics'` falhou com `Cannot read properties of undefined (reading 'custom')` sem configurar o logger EventSub. Green injeta logger seguro, envia erros ao reporter compartilhado e escreve somente o ID de referência/código fixo de aviso; mensagens brutas do SDK são descartadas. A repetição Green passou 1 teste. Lint e tipos exigiram documentar o segundo argumento opcional da factory do listener, mantendo compatibilidade com factories de teste de um argumento. Isso sanitiza os logs; não comprova por si só que as assinaturas EventSub foram ativadas.
- **Diagnósticos de recuperação e verificação runtime (2026-10-07):** Red: `npx vitest run tests/unit/queue-routes.test.js -t 'correlates unavailable Twitch adapter responses for reward recovery'` falhou porque respostas 503 com adaptador indisponível não tinham referência; Green correlacionou os caminhos de consulta/associação, e o teste focado passou. Validação completa: `npm test -- --run` passou **92 arquivos / 780 testes**; lint, typecheck, validadores de localização/versão, OpenGrep (**0 achados / 76 arquivos JS**), configuração Compose e diff check passaram. Após rebuild/reinício somente de `bot`, `/health` retornou banco/API Twitch/chat conectados e ping API de 202 ms; os volumes do banco/segredo foram preservados. Novo teste no Chrome mostrou a reward existente no Dashboard, mas o painel corretamente não encontrou correspondência exata e não executou mutação/retry. Logs desde o reinício não continham erros Twurple brutos. FND-9 segue aberta: associação exata da reward, ativação da assinatura EventSub e ciclo de resgate autorizado ainda não foram verificados.
- **UX dos controles de ciclo de vida da fila (2026-10-07):** Red: `npx vitest run tests/unit/queue-action-state.test.js` primeiro mostrou três estados incorretos (recompensa não resolvida sem representação segura; fila manual arquivada sem reativar entrada; filas local/sincronizada válidas com falso motivo de bloqueio). Green: projeção pura mantém visíveis pausar/ativar/arquivar/desarquivar/excluir quando aplicável, desativa ações remotas até confirmar propriedade/estado e explica a recuperação; rótulos e controles ficam agrupados abaixo do título. O Red do contrato de localização detectou referências antigas de `abrir/fechar`; foram atualizadas para `ativar/pausar`. Testes focados e verificação no Chrome foram executados. A revisão UX confirma que uma fila `create_unknown` precisa permanecer sem exclusão até resolver a propriedade da recompensa; nenhuma mutação Twitch ou remoção de volume ocorreu.
- **Mensagem de erro ao associar recompensa (2026-10-07):** O Chrome reproduziu lista vazia de candidatas; a reward do dashboard com mesmo nome e custo não cumpriu ao menos um critério de correspondência exata, mas a interface não explicava os requisitos. Red: `npx vitest run tests/integration/panel-localization-contract.test.js -t 'explains why a reward with a matching title may still be unavailable for recovery'` falhou porque a mensagem não mencionava pausa/propriedade gerenciável. Green: a mensagem agora informa propriedade do app, estado pausado e correspondência de UID/descrição/limites; o contrato focado passou em pt-BR/en/es e o validador de localização passou. Um erro inicial no matcher (`managed` versus `manageable`) foi corrigido e executado novamente. Nenhuma recompensa Twitch foi editada ou associada.
- **Diagnóstico de associação e logs por severidade (2026-10-08):** Red de compatibilidade: `npx vitest run tests/unit/pending-queue-reward-compatibility.test.js` falhou 4/4 porque o comportamento não existia. Red do logger estruturado: os testes focados falharam porque exportações/filtro de nível estavam ausentes; a regressão `npx vitest run tests/unit/queue-routes.test.js -t 'logs safe mismatch counts'` falhou porque lista vazia de candidatas não gerava evento. Green adiciona avaliação pura com motivos enumerados, rejeita campos críticos ausentes, registra somente contagens/códigos de motivo e mapeia o getter `autoFulfill` do Twurple ao campo Helix `should_redemptions_skip_request_queue`. Reprodução real no Chrome/Compose antes e depois da normalização: 2 rewards gerenciáveis, 0 candidatas; após corrigir, motivos `reward_not_paused: 2`, `title_mismatch: 1`. Portanto, a reward com o título da fila não está pausada; a outra tem título diferente. Suíte completa passou em 95 arquivos / 796 testes; lint, typecheck, OpenGrep (0/79 arquivos JS), validação de localização/versão, configuração Compose e diff check passaram. Nenhuma reward Twitch foi alterada nem volume removido.
- **Contrato de pausa na criação de Custom Reward (2026-10-08):** A consulta à documentação oficial Helix revelou que `is_paused` é campo de leitura/atualização, não um campo documentado no POST de criação. Red: `npx vitest run tests/unit/reward-outbox-worker.test.js` falhou em 6 casos porque a criação esperava uma reward já pausada e não confirmava a resposta real do POST. Green: o worker envia `is_enabled=false` no POST, depois faz PATCH da reward única criada para ativa+pausada, e só confirma a associação local quando a resposta do PATCH corresponde. Na recuperação de resposta perdida do POST, encontra somente uma reward nova com configuração exata; falha/resposta perdida do PATCH é repetida sem repetir o POST. Suíte focada do worker: 19/19 passou. Esta correção ainda não foi validada com uma criação real de reward na Twitch.
- **Diagnóstico ao vivo após rebuild (2026-10-08):** `APP_LOG_LEVEL=verbose docker compose up -d --build bot` concluiu e preservou os volumes existentes de PostgreSQL e segredos operacionais. Após recarregar o Chrome explicitamente, `/health` retornou `ok`, banco/chat/rewards `connected/available` e ping da API Twitch de `195 ms`. O clique em **Vincular recompensa** executou a consulta somente de leitura e registrou totais `2 gerenciáveis / 0 candidatas` em `info` e motivos `reward_not_paused: 2`, `title_mismatch: 1` em `verbose`. O painel exibiu os critérios; nenhuma reward foi alterada/associada e nenhum POST foi repetido. Suíte completa: 95 arquivos / 797 testes; lint, typecheck, OpenGrep (0/79 arquivos JS), localização/versão, Compose e diff check passaram. Criação real e PATCH de pausa ainda precisam de teste autorizado em canal elegível.
- **Vínculo da latência no ping do chat (2026-10-08):** o histórico do Chrome mostrou resposta a `!fila ping` sem latência enquanto `/health` já media a API Twitch. Red: `npx vitest run tests/unit/chat-command-handler.test.js -t 'handler created before health registration'` falhou porque não havia leitura de saúde compartilhada com vínculo tardio. Green: uma ponte estável permite ao handler criado antes da rota ler a medição real em cache depois que ela é anexada; suítes de chat/saúde passaram 36/36. O canal está offline neste momento, então não enviamos outra mensagem para alegar teste real do chat.
- **Fluxo de criação da fila e resposta PATCH Twitch desatualizada (2026-10-08):** Red: `npx vitest run tests/unit/queue-onboarding-flow.test.js` falhou 4/4 porque as transições após criar/salvar configurações não existiam. Green adiciona fluxo testado que abre as configurações imediatamente após criar, mantém a fila fechada por padrão e só direciona para ativação depois de salvar e confirmar sincronização da reward; sem confirmação, a ativação permanece desabilitada com orientação localizada. A suíte completa revelou um contrato de localização antigo que esperava o toast `queue_created` removido; foi atualizado para as chaves do onboarding atual e passou. O Creator Dashboard mostrou “resgates em pausa” após uma pausa real, enquanto o PATCH Helix trouxe indicadores ativos desatualizados. Red: `npx vitest run tests/unit/twitch-adapter.test.js -t 'stale response'` falhou porque o adaptador retornou o estado ativo antigo. Green: agora o adaptador consulta a reward persistida pela Twurple depois do PATCH; testes focados de adaptador/ciclo passaram. Conjunto focado: **110/110 testes**. Os volumes Compose atuais foram preservados; reconstrução runtime e verificação no navegador ainda pendentes.
- **Recuperação pelo seletor de rewards da Twitch (2026-10-08):** O Chrome reproduziu o comportamento relatado: ao clicar em **Vincular recompensa** sem candidatas compatíveis, só aparecia um aviso e o diálogo não abria. Red: `npx vitest run tests/unit/reward-link-dialog.test.js` falhou por comportamento porque registros incompletos de reward eram exibidos como selecionáveis; Green filtra candidatas inválidas. O diálogo agora abre antes da consulta à Twitch, apresenta estados localizados de carregamento/vazio/erro e permite atualizar a lista de rewards gerenciáveis; o vínculo fica desabilitado sem candidata completa e compatível, e a API verifica novamente propriedade/configuração. Testes diretos da rota Twitch e conjunto focado de diálogo/onboarding/adaptador/localização passaram **94/94**. Rebuild Compose e verificação renovada no navegador pendentes.
- **Regressão de erro após criar fila no navegador (2026-10-08):** O Chrome mostrou a fila persistida, mas manteve a tela de nova fila com erro genérico. Era um bug de sucesso da interface depois do `POST /api/queues` retornar 201: `event.currentTarget` fica null após a requisição aguardada. Red: o novo teste de captura antes do await em `tests/integration/panel-localization-contract.test.js` falhou; o Chrome reproduziu o sintoma. Green captura o formulário antes de qualquer await, reseta pela referência estável e segue para as configurações. Regressão focada passou 1/1, com lint/typecheck aprovados. Rebuild e confirmação ao vivo no navegador pendentes.
- **Sincronização da reward concorrendo com o salvamento das configurações (2026-10-08):** A fila nova de Pontos do Canal abriu as configurações no Chrome, mas salvar retornou conflito de versão enquanto o worker alterava a versão da fila. Red: `npx vitest run tests/unit/queue-settings-version.test.js` falhou porque não existia o predicado de retry seguro. Green tenta novamente o PATCH uma vez somente se a fila continuar ativa/fechada e todos os campos locais permanecerem iguais à referência capturada; mudanças concorrentes de configuração ou ciclo de vida falham de forma fechada. Testes do predicado, lint e typecheck passaram; rebuild e confirmação no navegador pendentes.
- **Validação completa e verificação no navegador após atualizar o contêiner (2026-10-07):** `npm test -- --run` passou com **93 arquivos / 785 testes**; lint, typecheck, validação de localização/versão, OpenGrep (**0 achados / 77 arquivos JavaScript**), configuração Compose e `git diff --check` passaram. Somente `bot` foi reconstruído/reiniciado; `operational_secrets` e `postgres_data` foram preservados, e o Chrome foi recarregado explicitamente. Os novos controles da fila e a explicação de recompensa incompatível apareceram na guia atualizada. `/health` retornou banco/API Twitch/chat conectados e ping API de 193 ms. Nenhuma associação ou mutação remota nem remoção de volume ocorreu. Erros EventSub sanitizados vistos anteriormente permanecem como verificação separada; conectividade de saúde não comprova entrega de assinaturas.
- **Explicação de exclusão bloqueada (2026-10-07):** Red: o contrato de localização passou a exigir que a mensagem de recompensa indisponível mencionasse exclusão; falhou porque o texto anterior só descrevia a correspondência de parâmetros. Green: os três idiomas agora dizem que ativação, pausa, arquivamento e exclusão exigem reward pausada, gerenciada por este app e com configurações iguais; o contrato focado e o validador de localização passaram. A suíte final de **93 arquivos / 785 testes** e todos os gates acima incluem esse ajuste de texto.
- **Checkpoint direcionado anterior:** `npm test -- --run tests/integration/queue-repository.test.js tests/unit/queue-routes.test.js tests/unit/reward-outbox-worker.test.js tests/unit/twitch-reconciliation.test.js tests/unit/web-route.test.js tests/unit/eventsub-runtime.test.js tests/unit/twitch-integration.test.js tests/unit/health-route.test.js tests/unit/health-status.test.js` — **195 testes passaram em 9 arquivos** antes do incremento de estoque.

## Histórico de alterações

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-07 | — | Story materializada do Spec Pipeline aprovado após o proprietário autorizar a implementação. | @sm |

## Registro do agente dev

### Modelo do agente usado

Implementação por @dev coordenada com a autoridade global de banco de dados @data-engineer. Revisão independente de @qa pendente.

### Referências de logs de depuração

Consulte as evidências TDD datadas acima.

### Notas de conclusão

Implementação continua em andamento. A execução completa de qualidade de 2026-10-08 passou em 103 arquivos / 866 testes; lint, typecheck, validações de localização/versão, OpenGrep, Compose e diff check passaram. Esta branch também adiciona um ambiente Codespaces coberto por teste de contrato. QA independente, revisão UX e aceite financeiro de resgates continuam pendentes.

### Lista de arquivos

- `.aiox-core/development/agents/data-engineer.md`
- `.aiox/project-status.yaml`
- `.devcontainer/devcontainer.json`
- `.devcontainer/post-create.sh`
- `AGENTS.md`
- `CHANGELOG.md`
- `CHANGELOG_INTERNAL.md`
- `apps/api/prisma/migrations/20261007190000_queue_admission_modes/migration.sql`
- `apps/api/prisma/migrations/20261007203000_reward_pause_stock_state/migration.sql`
- `apps/api/prisma/migrations/20261008010000_remove_unsupported_reward_stock_state/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/commands/chat-handler.mjs`
- `apps/api/src/domain/queue-service.mjs`
- `apps/api/src/health-route.mjs`
- `apps/api/src/http/queue-routes.mjs`
- `apps/api/src/http/safe-http-error-handler.mjs`
- `apps/api/src/observability/error-diagnostics.mjs`
- `apps/api/src/observability/structured-logger.mjs`
- `apps/api/src/outbox/loop.mjs`
- `apps/api/src/outbox/reward-worker.mjs`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/runtime.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/twitch/eventsub-runtime.mjs`
- `apps/api/src/twitch/helix-adapter.mjs`
- `apps/api/src/twitch/integration.mjs`
- `apps/api/src/twitch/pending-queue-reward-compatibility.mjs`
- `apps/api/src/twitch/reconciliation.mjs`
- `apps/api/src/twitch/route-integration-proxy.mjs`
- `apps/shared/localization/discover-catalog-module.mjs`
- `apps/web/app.js`
- `apps/web/call-deadline-presentation.mjs`
- `apps/web/dom-localization.mjs`
- `apps/web/health-status.mjs`
- `apps/web/index.html`
- `apps/web/localization/catalogs/chat/en.tsv`
- `apps/web/localization/catalogs/chat/es.tsv`
- `apps/web/localization/catalogs/chat/pt-BR.tsv`
- `apps/web/localization/catalogs/panel/en.tsv`
- `apps/web/localization/catalogs/panel/es.tsv`
- `apps/web/localization/catalogs/panel/pt-BR.tsv`
- `apps/web/panel-catalog.mjs`
- `apps/web/panel-error-presentation.mjs`
- `apps/web/queue-action-state.mjs`
- `apps/web/queue-onboarding-flow.mjs`
- `apps/web/queue-settings-version.mjs`
- `apps/web/queue-sync-status.mjs`
- `apps/web/reward-link-dialog.mjs`
- `apps/web/styles.css`
- `compose.yaml`
- `docs/DEVELOPMENT.md`
- `docs/ROADMAP.md`
- `docs/integrations.md`
- `docs/pt-BR/CHANGELOG.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/pt-BR/ROADMAP.md`
- `docs/pt-BR/integrations.md`
- `docs/pt-BR/stories.md`
- `docs/pt-BR/stories/DOC-3/story.md`
- `docs/pt-BR/stories/FND-9/plan/implementation.yaml`
- `docs/pt-BR/stories/FND-9/spec/complexity.json`
- `docs/pt-BR/stories/FND-9/spec/critique.json`
- `docs/pt-BR/stories/FND-9/spec/requirements.json`
- `docs/pt-BR/stories/FND-9/spec/research.json`
- `docs/pt-BR/stories/FND-9/spec/spec.md`
- `docs/pt-BR/stories/FND-9/story.md`
- `docs/pt-BR/stories/FND-9/validation.md`
- `docs/pt-BR/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`
- `docs/stories.md`
- `docs/stories/DOC-3/story.md`
- `docs/stories/FND-9/plan/implementation.yaml`
- `docs/stories/FND-9/spec/complexity.json`
- `docs/stories/FND-9/spec/critique.json`
- `docs/stories/FND-9/spec/requirements.json`
- `docs/stories/FND-9/spec/research.json`
- `docs/stories/FND-9/spec/spec.md`
- `docs/stories/FND-9/story.md`
- `docs/stories/FND-9/validation.md`
- `docs/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`
- `tests/helpers/isolated-compose-cleanup.mjs`
- `tests/integration/codespaces-contract.test.js`
- `tests/integration/compose-contract.test.js`
- `tests/integration/compose-runtime.test.js`
- `tests/integration/panel-localization-contract.test.js`
- `tests/integration/postgres-foundation.test.js`
- `tests/integration/queue-repository.test.js`
- `tests/unit/call-deadline-presentation.test.js`
- `tests/unit/chat-command-handler.test.js`
- `tests/unit/documentation-contract.test.js`
- `tests/unit/dom-localization.test.js`
- `tests/unit/error-diagnostics.test.js`
- `tests/unit/eventsub-runtime.test.js`
- `tests/unit/health-route.test.js`
- `tests/unit/health-status.test.js`
- `tests/unit/isolated-compose-cleanup.test.js`
- `tests/unit/outbox-loop.test.js`
- `tests/unit/overlay-routes.test.js`
- `tests/unit/panel-catalog-placeholders.test.js`
- `tests/unit/panel-error-presentation.test.js`
- `tests/unit/pending-queue-reward-compatibility.test.js`
- `tests/unit/queue-action-state.test.js`
- `tests/unit/queue-domain-service.test.js`
- `tests/unit/queue-onboarding-flow.test.js`
- `tests/unit/queue-routes.test.js`
- `tests/unit/queue-settings-version.test.js`
- `tests/unit/queue-sync-status.test.js`
- `tests/unit/reward-dialog-contract.test.js`
- `tests/unit/reward-link-dialog.test.js`
- `tests/unit/reward-outbox-worker.test.js`
- `tests/unit/runtime-composition.test.js`
- `tests/unit/safe-http-error-handler.test.js`
- `tests/unit/structured-logger.test.js`
- `tests/unit/twitch-adapter.test.js`
- `tests/unit/twitch-integration.test.js`
- `tests/unit/twitch-reconciliation.test.js`
- `tests/unit/twitch-route-integration-proxy.test.js`
- `tests/unit/web-route.test.js`

### Verificação de operações do painel e Compose isolado — 2026-10-08

- Red: `npx vitest run tests/unit/isolated-compose-cleanup.test.js` falhou porque não havia helper de limpeza segura. Green adiciona `tests/helpers/isolated-compose-cleanup.mjs`, valida o nome exclusivo do projeto de aceitação e cada volume configurado/listado, encerra sem `--volumes` e remove somente volumes retornados sob o label Compose daquele projeto. A execução real de aceitação passou 3/3.
- Contratos direcionados de painel/Twitch/domínio/outbox/widgets/Compose passaram 132/132. Testes adicionais cobrem reward que desaparece entre a consulta e a confirmação do vínculo e falha inesperada de exclusão com resposta sanitizada/correlacionada; ambos passaram na primeira execução porque o comportamento seguro já existia (nenhum Red é alegado). A suíte completa antes desses dois testes passou 102 arquivos / 854 testes. A contagem final e os gates constam no relatório de validação. Nomes/datas dos volumes do produto permaneceram iguais durante o teste isolado. Nenhuma exclusão de reward foi enviada à Twitch.
- Metadados Docker mostram volumes do produto criados em `2026-10-08T00:02:57-03:00`; o PostgreSQL atual tem zero filas, uma credencial OAuth salva, e `/health` informa API/chat/rewards Twitch conectados com sondagem de 223 ms. A origem da recriação anterior não foi determinada. A story continua InProgress, aguardando QA independente, revisão UX e verificação autorizada do ciclo real da reward.

### Regressões de salvamento, localização e ciclo real de reward — 2026-10-08

- Red: `npx vitest run tests/integration/queue-repository.test.js -t 'includes operator queue settings in the panel projection'` falhou porque a projeção PostgreSQL omitia texto/prazo de chamada e configurações de reembolso/conta. Green inclui esses campos e o horário de notificação; o teste isolado com PostgreSQL real passou. No Chrome, após o rebuild, as configurações reabriram com texto de chamada, prazo padrão de 10 minutos e opções de reembolso persistidas; alterei o prazo para 12, salvei e o painel confirmou sucesso.
- Red: `npx vitest run tests/unit/dom-localization.test.js -t 'preserves documented placeholder tokens in static help text'` exibiu o texto seguro indisponível porque a aplicação estática do catálogo descartava a allowlist de placeholders. Green mantém somente tokens documentados como texto literal. O painel reconstruído exibiu a lista completa de placeholders aceitos.
- Red: `npx vitest run tests/unit/queue-routes.test.js -t 'returns a safe diagnostic reference when saving local queue settings fails unexpectedly'` falhou porque a rota não retornava ID de correlação. Green adiciona `referenceId` sanitizado e `x-error-reference` para falhas inesperadas ao salvar configurações locais/reward e para falhas inesperadas ao abrir/arquivar/desarquivar/trocar o modo da fila; conflitos conhecidos continuam com resposta estável e ação possível. O teste de diagnóstico dos quatro controles passou.
- Red: a regressão do DTO do operador detectou que o campo de reembolso quando viewer sai tinha nome diferente do campo do formulário, podendo apagar essa opção ao reabrir a tela. Green alinha a propriedade de resposta ao contrato do formulário/persistência; verificações direcionadas de rota, configurações, localização e PostgreSQL passaram **186/186**.
- O aceite real autorizado usou uma reward descartável criada pelo bot enquanto o canal Twitch estava offline: atualizei as configurações locais e salvei com sucesso; ativei a reward e confirmei `synced`; pausei e confirmei `synced`; arquivei e a pausa foi confirmada; desarquivei e confirmei que continuou fechada; depois excluí a fila pelo fluxo confirmado. A outbox registrou `reward.delete=confirmed` e uma busca atualizada no Creator Dashboard não encontrou o título da reward descartável. Nenhum resgate, cancelamento ou conclusão foi criado. Os volumes PostgreSQL e de segredos mantiveram os horários originais `2026-10-08T00:02:57-03:00`.
- Gates locais finais: `npm test` passou com **102 arquivos / 862 testes**; lint, typecheck, validações de localização/versão, OpenGrep (**0 achados / 84 arquivos JS**), configuração Compose e `git diff --check` passaram. Rebuild e reinício do bot Compose concluídos, seguido de recarga do Chrome; `/health` retornou `ok`, com banco, API Twitch, integração, chat e rewards disponíveis. FND-9 continua InProgress até completar QA/UX independentes e os critérios de aceite restantes.

### Contrato padronizado para falhas HTTP inesperadas — 2026-10-08

- Red: `npx vitest run tests/unit/safe-http-error-handler.test.js tests/unit/queue-routes.test.js -t 'generic message plus reference|safe diagnostic reference when saving local queue settings fails unexpectedly'` falhou porque tanto o handler global quanto a rota de configurações omitiam um código estável. A regressão da criação da fila também falhou com `npx vitest run tests/unit/queue-routes.test.js -t 'unexpected queue creation failures'`.
- Green: falhas inesperadas agora retornam `code: INTERNAL_ERROR`, texto localizado e seguro e `referenceId`; a mesma referência é retornada em `x-error-reference` e incluída nos diagnósticos sanitizados. Red também reproduziu erros esperados de configuração (`STALE_QUEUE_VERSION` e valores inválidos) que viravam o toast genérico porque a rota não devolvia `code`. Green adiciona códigos estáveis para validação de configurações/reward, modelo, fila alterada/removida/indisponível e atualização Twitch pendente, com traduções em pt-BR, inglês e espanhol. O painel ignora mensagens brutas do backend e exibe texto do catálogo e referência validada como UUID.
- Verificação focada de rotas/apresentação de erros/PostgreSQL real passou 161/161. A suíte completa passou com 102 arquivos/863 testes; lint, typecheck, contrato documental, validação de localização/versão, OpenGrep (0 achados), Compose e diff também passaram.
- Runtime: bot reconstruído/reiniciado sem remover ou recriar volumes de dados do produto. `/health` retornou `ok`; banco, API/integração Twitch, chat e rewards estavam conectados/disponíveis. Os timestamps dos volumes de banco e segredos permanecem `2026-10-08T00:02:57-03:00`. Uma nova aba do Chrome recarregou o painel sem o toast genérico antigo. O salvamento/recarga anterior e o ciclo autorizado de reward descartável estão registrados acima.
- Refatoração: falhas inesperadas das rotas usam o helper compartilhado de diagnóstico, e o handler global do Fastify agora segue o mesmo contrato de resposta.

## Resultados de QA

Revisão independente @qa pendente após a implementação.

### Mensagens de reward conforme o contexto — 2026-10-08

- Red: `npx vitest run tests/unit/panel-error-presentation.test.js -t 'stable locale, Twitch, OAuth, widget, and state-conflict codes'` falhou porque `QUEUE_REWARD_NOT_READY` exibia uma mensagem exclusiva de exclusão, inadequada no editor de reward. Green usa texto próprio com orientação para atualizar o painel e conferir operações pendentes, nos catálogos pt-BR, inglês e espanhol. A regressão focada passou 1/1 e `npm run validate:localization` passou.
