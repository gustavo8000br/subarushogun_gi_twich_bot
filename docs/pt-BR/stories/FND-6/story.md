# Story FND-6: Painel local do streamer, API protegida e experiência de operação

[English](../../../stories/FND-6/story.md)

**Complexidade:** COMPLEX<br>
**Executor:** @dev<br>
**Gate de qualidade:** @qa<br>
**Épico/capacidade:** Painel local e operações do streamer (FND-6)<br>
**Status:** InReview<br>
**Issue:** [#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)<br>
**Planejamento UX:** `docs/stories/FND-6/ux-research.md` e equivalente pt-BR. A pesquisa documental e a direção visual estão concluídas; não se alega sessão de usabilidade.

## História do usuário

Como streamer que opera uma instalação local, quero configurar a Twitch, gerenciar todas as operações de fila disponíveis e ver claramente o estado do sistema e da recuperação no painel, para operar o chatbot durante a live sem editar arquivos nem adivinhar se uma ação externa foi confirmada.

## Critérios de aceite

- O painel aplica a arquitetura de informação aprovada para FND-6: visão ao vivo, operações de fila, configuração da fila, recuperação de pontos, conexão Twitch e estado do runtime local.
- O painel separa visão geral, filas/atendimentos, nova fila, operações financeiras, configurações e conexão Twitch em páginas navegáveis por teclado; o assistente OAuth aparece até a conexão, o resumo do canal conectado o substitui depois e a perda de uma conexão anteriormente ativa leva o operador à recuperação.
- O painel permite marcar um aguardante como prioritário após conferência de uma categoria limitada de benefício externo; duas faixas FIFO ordenam prioridade antes da normal, sem interromper atendimento chamado/em andamento.
- Adições prioritárias manuais são identificadas como conferidas pelo operador, preservam semântica financeira de entrada manual/resgate e nunca armazenam comprovantes nem alegam verificação automática.
- Configurações da recompensa da fila incluem máximo nativo de resgates por transmissão, máximo por usuário por transmissão e cooldown global da Twitch, com controles explícitos de habilitação/valor; o app não mantém contadores paralelos desses limites.
- Criação e edição usam o ID Twitch imutável da recompensa criada pelo app, validam restrições dos campos da Twitch, registram intenção remota durável e distinguem configuração local desejada de estado remoto confirmado, inclusive em resultado desconhecido.
- O streamer pode criar e editar configurações de fila, consultar aguardando/chamados/em atendimento/histórico, adicionar manualmente, chamar, iniciar, concluir, remover, mover, reenviar, limpar, arquivar, desarquivar, abrir/fechar e solicitar exclusão segura quando os serviços de aplicação estiverem disponíveis.
- Todo controle visível executa uma operação real ou fica desabilitado com explicação e próxima ação. O painel usa os serviços compartilhados de domínio/aplicação, sem duplicar transições.
- Configuração Twitch e OAuth mostram estados compreensíveis de conexão, elegibilidade, permissões e recuperação. Client Secret e tokens nunca aparecem em HTML, respostas da API, URLs, logs ou erros.
- `/api/state` continua protegido por sessão e usa projeções explícitas para `product_version`, `api_contract_version`, revisão do estado, conta atual, conectividade, filas e UIDs filtrados pela política de privacidade.
- `/health` informa saúde do processo/banco, estado de conexão à API Twitch e latência medida quando configurada. Indisponibilidade Twitch não causa ciclo de reinício do contêiner nem impede o acesso ao painel local.
- Um canal autenticado porém inelegível mantém a renovação do token para probe Helix somente de leitura; `/health` preserva `ineligible` e informa a latência medida sem iniciar processamento de recompensas ou chat EventSub.
- Mutações validam schema, sessão local, Host/Origin, CSRF, idempotência da operação e revisão aplicável. Chaves repetidas não repetem efeitos de domínio nem financeiros.
- Operações destrutivas mostram um resumo revisável e exigem a confirmação definida pelo domínio. Intenção remota permanece distinta de confirmação Twitch.
- Texto de usuário é renderizado com segurança. Testes cobrem Host/Origin/CSRF, sessão/estado do callback, idempotência, revisões obsoletas/concorrentes, HTML malicioso, não exposição de segredo e mudança de privacidade de UID.
- O painel permite navegação por teclado, não comunica estado apenas por cor, polling preserva foco/contexto e layout funciona em janela desktop estreita. Achados de usabilidade manual só são registrados se as sessões ocorrerem.
- Os dois READMEs explicam o fluxo atual do painel, acesso, estados/recuperação de pontos, operação e limites conhecidos de plataforma/validação Twitch real, em inglês e pt-BR.

## Fundação existente

- Painel Fastify/static vanilla, configuração/OAuth, sessão CSRF e validações Host/Origin locais existem.
- Criação de fila e ações de operação, visão de operações de pontos, controles da conta atual, limpeza, resolução de associação ambígua de recompensa, reenvio de chamada, arquivamento/desarquivamento, exclusão retomável, histórico terminal e reordenação de aguardantes têm rotas ou suporte inicial de UI.
- Configurações locais da fila (timeout, template de chamada, toggles de saída do UID e políticas) usam rota PATCH protegida, versionada e transacional no PostgreSQL. Privacidade do UID, texto/custo da recompensa, entrada de UID e limites/cooldown nativos usam o editor de recompensa separado e o fluxo durável `reward.update`. Os dados de UID e textos de chamada pendentes só são limpos como parte dessa intenção remota; configurações locais não contornam a sincronização Twitch. Testes PostgreSQL e do worker cobrem o fluxo; comportamento Twitch real segue sem validação.
- Admissão prioritária conferida pelo operador, ordenação FIFO por faixa, movimento limitado à faixa e rótulos portugueses das categorias têm cobertura de rota/UI/PostgreSQL.
- A revisão da documentação oficial Twitch (2026-10-06) identificou limites/cooldown nativos ausentes; eles agora estão no modelo Prisma `Queue`, adapter e fluxo de criação/edição de recompensa. Consulte `docs/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md` e seu equivalente em inglês.
- DTOs que respeitam a privacidade de UID e projeção de estado local existem. A pesquisa UX FND-6 e a direção visual/de interação estão documentadas.
- A reconciliação acionada pelo operador está disponível na página de conexão Twitch e na API, reutiliza o reconciliador de inicialização/reconexão e agrupa execuções simultâneas. A página de operações expõe retry/reconciliação e resolução manual explícita para estado de resgate irrecuperavelmente desconhecido; criação ambígua de recompensa tem fluxo separado de associação revalidada. Mutações da API exigem chaves de idempotência persistidas e vinculadas à sessão; respostas concluídas são reproduzidas, uma chave usada com outra requisição gera conflito e uma execução ainda em andamento exige que o operador atualize o estado. Aceite restante é QA independente e validação mais ampla de escrita/EventSub com canal elegível. Nenhuma sessão moderada de usabilidade é alegada.

### TDD — editor protegido de configurações locais da fila (parcial)

**Red:** Um contrato focado da rota web foi escrito antes do diálogo de configurações; ele falhou porque o painel ainda não tinha ação/diálogo de opções da fila. O motivo da falha é conhecido pela sessão de trabalho ativa, mas o comando original exato não foi preservado no registro de evidências. Este apontamento é intencionalmente incompleto e não declara rastreio Red completo.

**Green / verificação focada:** `npm test -- --run tests/unit/queue-routes.test.js tests/integration/queue-repository.test.js tests/unit/web-route.test.js` — 3 arquivos, 92 testes passaram naquele momento. O comportamento original de ocultar UID por configuração local foi corrigido depois: as configurações locais atuais rejeitam mudanças Twitch-managed de UID, enquanto a edição protegida e durável da recompensa executa a limpeza PostgreSQL. Veja abaixo o registro da regressão de privacidade.

**Limite:** neste incremento anterior, a troca para UID oculto era feita pela configuração local. Um teste posterior de regressão de privacidade passou essa operação exclusivamente para a edição durável da recompensa Twitch; configurações locais agora rejeitam `uidMode`, e o editor remoto limpa UID e notificações pendentes atomicamente. Edição de recompensa e limites nativos estão cobertos na seção TDD posterior; os gates completos da FND-6 continuam abertos.

## Evidências TDD

Registrar cada comportamento antes da implementação, com comando, Red observado, Green e refatoração/reteste. Não marcar critérios com base apenas em mocks quando a garantia depender de PostgreSQL ou Compose.

### TDD — saúde do painel e latência da Twitch

**Red:** `npm test -- --run tests/unit/health-route.test.js` — cinco falhas mostraram campos de ping, cache/tempo do probe e estado degradado ausentes. `npm test -- --run tests/unit/twitch-adapter.test.js -t 'checks Twitch API reachability'` — falhou porque `adapter.ping` não existia. `npm test -- --run tests/unit/twitch-integration.test.js -t 'exposes a safe Twitch API probe'` — falhou porque a integração não expunha o probe. O contrato do helper e da marcação do painel também falhou primeiro porque módulo/elementos não existiam.

**Green:** rota, adaptador, integração, helper de projeção em português, marcação do painel e exibição passaram nos testes focados. A rota mantém o resultado do probe em cache por 60 segundos, mede `ApiClient.users.getUserById`, retorna apenas estado/latência e informa `degraded` se o probe falha. O navegador consulta `/health` a cada cinco segundos, mas apenas atualiza rótulos locais; o healthcheck Docker de 30 segundos não chama a Twitch em cada requisição.

**Refatoração/reteste:** será coberto pela suíte e gates finais da FND-6, registrados antes de concluir a story. Documentação oficial consultada em 2026-10-06: Twitch [Get Users](https://dev.twitch.tv/docs/api/reference/#get-users) aceita token de usuário para consulta por ID sem escopo adicional; o método instalado do SDK está na documentação Twurple [HelixUserApi](https://twurple.js.org/reference/api/classes/HelixUserApi).

### TDD — projeção protegida do histórico da fila

**Red:** `npm test -- --run tests/unit/queue-routes.test.js tests/integration/queue-repository.test.js -t 'terminal queue history|bounded terminal history'` — o PostgreSQL indicou que `listQueueHistoryProjection` não existia e a rota protegida retornou 404.

**Green:** o comando focado passou 2 testes usando contêiner PostgreSQL isolado e migrations Prisma reais. O repositório seleciona apenas campos de apresentação de entradas terminais, ordena das mais recentes e limita a 100; a rota exige sessão local e retorna um DTO allowlisted. `npm test -- --run tests/unit/web-route.test.js -t 'serves the bundled pt-BR streamer operations panel'` primeiro falhou pela ausência do histórico na UI e passou após o cartão carregar e renderizar sob demanda usando `textContent`.

**Refatoração/reteste:** testes focados passaram 3/3 entre repositório, rota protegida e contrato estático do painel. Suíte final e gates AIOX seguem pendentes.

### TDD — controles protegidos para reordenar fila

**Red:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js -t 'moves only waiting entries|serves the bundled pt-BR streamer operations panel'` — a API retornou 404 e o código do painel não tinha controles de movimento.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js tests/integration/queue-repository.test.js -t 'moves only waiting entries|moves a waiting entry atomically|serves the bundled pt-BR streamer operations panel'` — 4 passaram. A API exige sessão/CSRF, valida IDs/posições e chama a operação existente do repositório com lock da fila, já coberta por teste real de ordenação atômica no PostgreSQL. A UI desabilita movimento na primeira/última posição e usa estado atualizado a cada pedido.

**Refatoração/reteste:** o comando focado de integração/API/UI passou após a implementação; gates finais FND-6 seguem pendentes.

### TDD — movimentação no chat usa posições exibidas sem cruzar faixas

**Red:** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'same priority lane|priority-lane position'` — 2 falharam: o handler enviava a posição global exibida 4 diretamente à operação do repositório que espera posição local da faixa, em vez de convertê-la para 2; também tentava mover para outra faixa em vez de rejeitar.

**Green:** o mesmo comando focado passou 2 testes depois que o handler consultou a ordem persistida de aguardantes, converteu posições globais em posições locais da faixa e rejeitou destinos fora da faixa da entrada.

**Refatoração/reteste:** `npm test -- --run tests/unit/chat-command-handler.test.js tests/integration/queue-repository.test.js` primeiro revelou 3 asserções de auditoria obsoletas que contavam o evento esperado `entry.manual_added` junto com `entry.transitioned`. As asserções passaram a filtrar o evento de transição; o mesmo comando passou 74 testes, incluindo os novos casos do chat e integração PostgreSQL real. Foi um ajuste no escopo da asserção, sem alterar o comportamento de auditoria. Suíte completa e gates FND-6 seguem pendentes.

### TDD — páginas separadas do painel e recuperação da conexão

**Red:** `npm test -- --run tests/unit/panel-navigation.test.js tests/unit/web-route.test.js -t 'shows the connection flow|shows one page|falls back to the overview|separate panel pages'` falhou porque `apps/web/panel-navigation.mjs` não existia e a página servida não tinha navegação principal acessível. Após adicionar o primeiro contrato de página, `npm test -- --run tests/unit/web-route.test.js -t 'separate panel pages'` falhou porque faltava o campo obrigatório Client Secret, revelando uma regressão no formulário de instalação antes de concluir a implementação.

**Green:** `npm test -- --run tests/unit/panel-navigation.test.js tests/unit/web-route.test.js` — 7 passaram após adicionar o seletor de página testado, visões separadas de resumo/filas/nova fila/operações/configurações/conexão, resumo do canal e navegação de configuração/reconexão, restaurar o Secret obrigatório e exibir aviso de validação das credenciais.

**Refatoração/reteste:** adicionados navegação lateral responsiva com modo horizontal em telas estreitas, foco visível por teclado e estado `aria-current`. A execução focada com 7 testes passou depois dessas mudanças. Verificação final: `npm run lint`, `npm run typecheck`, `npm test` (52 arquivos/360 testes), `npm run review:static` (45 arquivos/0 achados), `docker compose config --quiet` e `git diff --check` passaram. QA independente e demais lacunas de aceite continuam pendentes.

### TDD — idempotência persistente da API vinculada à sessão

**Red:** a regressão de mutação repetida falhou porque a resposta reproduzida não tinha `idempotency-replayed`; o handler de criação de fila foi chamado novamente. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists idempotency reservations'` falhou porque `beginPanelOperation` não existia no repositório PostgreSQL.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js -t 'replays a mutation|omit a valid idempotency key'` — 2 passaram. Chave/corpo repetidos reproduzem a resposta armazenada e chamam criação de fila uma vez; chave inválida/ausente é rejeitada antes da mutação. `npm test -- --run tests/integration/queue-repository.test.js -t 'idempotency key in PostgreSQL'` — 1 passou, verificando que uma disputa real de chave única no PostgreSQL produz um `started` e um `in_progress`; o mesmo teste cobre replay da resposta concluída e conflito de fingerprint.

**Refatoração/reteste:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js tests/integration/queue-repository.test.js` — 3 arquivos, 104 passaram antes de adicionar a asserção de disputa simultânea. O painel agora gera UUID novo para cada mutação; o servidor calcula fingerprint canônico de método/rota/corpo, vincula a chave à sessão local, não guarda o pedido bruto e reproduz JSON concluído. Uma requisição ainda marcada como processamento retorna 409 e pede atualização do painel antes do operador usar outra chave. A suíte completa e gates precisam ser executados novamente após este incremento.

### TDD — reconciliação pelo operador e recuperação do callback OAuth

**Red:** `npm test -- --run tests/unit/queue-routes.test.js -t 'request Twitch reconciliation'` — a ação protegida do operador retornou 404. `npm test -- --run tests/unit/web-route.test.js -t 'queue settings editor'` — o painel não tinha controle de sincronização. A regressão para recusa do callback retornou `text/plain` em vez de uma tela HTML de recuperação no padrão visual, sem oferecer uma ação útil ao painel.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js -t 'request Twitch reconciliation|operator reconciliation'` — 3 testes passaram. A rota exige sessão local com CSRF, retorna 503 enquanto a integração não está pronta e delega ao reconciliador existente. Testes da integração confirmam que pedidos simultâneos do operador compartilham uma execução. `npm test -- --run tests/unit/web-route.test.js -t 'queue settings editor'` — 1 passou após incluir a ação na página de conexão Twitch. `npm test -- --run tests/unit/queue-routes.test.js -t 'authorization is declined|on-brand OAuth callback'` — 2 passaram para telas estilizadas de sucesso/recusa, sanitização dos parâmetros OAuth e retorno em 30 segundos.

**Refatoração/reteste:** sucesso e falha do callback compartilham CSS do painel, mensagem localizada, contagem regressiva e link direto; descrição de erro, code e state do provedor nunca são exibidos. Integrações iniciadas pelo callback OAuth e no startup expõem a mesma operação de reconciliação agrupada. Os testes focados de rota/integração/web passaram; os gates globais estão registrados em Qualidade e revisão abaixo.

### TDD — mudança de privacidade do UID somente pela edição durável da recompensa Twitch

**Red:** antes de adicionar as proteções ao repositório e à interface, a regressão observou a rota de configuração local aceitar `uidMode: hidden` com HTTP 200 e o PostgreSQL atualizar a linha, incrementar a versão e contornar a sincronização da recompensa. O teste PostgreSQL também inicialmente resolveu em vez de rejeitar com `INVALID_LOCAL_QUEUE_SETTING`.

**Green:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js tests/integration/queue-repository.test.js` — 3 arquivos, 98 testes passaram. Configurações locais agora rejeitam campos gerenciados pela Twitch, o diálogo local não oferece modo de UID e o PostgreSQL confirma que valores UID/notificações são mantidos por alterações locais e removidos apenas pela edição remota versionada da recompensa. O bypass legado `setUidMode` foi removido do repositório.

**Refatoração/reteste:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js tests/unit/web-route.test.js` — 3 arquivos, 37 testes passaram após as alterações de callback/reconciliação; o teste focado anterior com persistência/API/UI passou após a correção de privacidade. A suíte completa e os gates do projeto estão registrados abaixo.

### TDD — limites nativos de recompensa, edição durável e tela de callback OAuth

**Red:** `npm test -- --run tests/unit/twitch-adapter.test.js tests/unit/queue-routes.test.js -t 'native reward|Twitch-native'` — 2 falhas esperadas mostraram que a projeção Helix omitia as configurações nativas e a rota de criação descartava os campos. `npm test -- --run tests/unit/web-route.test.js -t 'separate panel pages'` falhou porque o formulário de nova fila não tinha os três campos nativos. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists queue creation and a managed reward creation intent atomically'` falhou primeiro porque o Prisma Client gerado ainda não continha as colunas; após executar o permitido `npx prisma generate --schema apps/api/prisma/schema.prisma`, o contrato PostgreSQL com migration passou. Uma asserção adicional da projeção da fila falhou porque o repositório omitia os campos; passou após corrigir a projeção. `npm test -- --run tests/unit/queue-routes.test.js -t 'version-checked Twitch reward edits'` retornou 404 para a rota ausente. `npm test -- --run tests/integration/queue-repository.test.js -t 'persists app-owned reward edits'` falhou porque o método do repositório não existia. `npm test -- --run tests/unit/reward-outbox-worker.test.js -t 'preflights ownership/config|lost PATCH response|no longer matches'` teve 3 falhas porque o worker ainda não tratava `reward.update`. `npm test -- --run tests/unit/web-route.test.js -t 'queue settings editor'` falhou porque o editor de recompensa não existia. O contrato do callback falhou primeiro porque o endpoint retornava uma confirmação simples; uma asserção posterior sobre limpeza do histórico também falhou até code/state serem removidos do endereço do navegador após a troca OAuth. A configuração inicial do teste de restrição PostgreSQL usou um slug inválido; depois da correção, o driver mostrou SQLSTATE PostgreSQL 23514 como erro desconhecido do Prisma, então a asserção passou a verificar o nome real da constraint.

**Green:** os contratos unitários focados passaram com `npm test -- --run tests/unit/queue-routes.test.js tests/unit/twitch-adapter.test.js tests/unit/reward-outbox-worker.test.js tests/unit/web-route.test.js -t 'on-brand OAuth callback|native reward|Twitch-native|persisted Twitch-native limits|version-checked Twitch reward edits|preflights ownership/config|lost PATCH response|no longer matches|separate panel pages|queue settings editor'` — 4 arquivos, 11 aprovados e 45 ignorados pelo filtro. Testes PostgreSQL/migrations passaram com `npm test -- --run tests/integration/queue-repository.test.js -t 'persists app-owned reward edits|persists queue creation and a managed reward creation intent atomically|enforces positive values for persisted Twitch-native reward limits'` — 3 aprovados, cobrindo campos da outbox, projeção, constraints, limpeza privada de UID/chamada, claim/lease, confirmação e auditoria. O callback passou com `npm test -- --run tests/unit/queue-routes.test.js -t 'on-brand OAuth callback'`; cobre nome escapado, integração visual, retorno imediato, redirect após 30 segundos e remoção de code/state do histórico do navegador. Testes do worker cobrem preflight seguro, PATCH confirmado, resolução de resposta perdida sem repetir PATCH e bloqueio diante de recompensa divergente.

**Refatoração/reteste:** o editor de recompensa é separado das políticas locais de atendimento. Campos de limites vazios viram `null` (desativado); o app não mantém contadores paralelos. Cada alteração usa o ID de recompensa criado pelo app, registra configuração anterior e chave de outbox versionada, e apaga UIDs armazenados ao mudar para modo oculto. Resultado incerto de PATCH é consultado antes de retry; recompensa alterada/externa fica como desconhecida. O callback reutiliza o CSS do painel, escapa o rótulo do canal, oferece link imediato e contagem regressiva e remove parâmetros OAuth do histórico. O probe Helix autorizado somente de leitura foi validado ao vivo; operações de recompensa, resgate, chat e EventSub ainda precisam de validação com canal elegível.

### TDD — probe de saúde e recuperação de token em canal autenticado inelegível

**Red:** `npm test -- --run tests/unit/health-route.test.js tests/unit/twitch-integration.test.js -t 'ineligibility distinct|eligibility before opening'` — 2 falhas esperadas mostraram que `/health` retornava ping nulo para canal autenticado inelegível e a integração Twitch não expunha probe depois da negativa de elegibilidade.

**Green:** o mesmo comando focado passou 2 testes. A integração mantém `RefreshingAuthProvider` para probe de saúde autenticado somente de leitura, mas não inicia EventSub de recompensa/chat nem trabalho financeiro para canal inelegível. `/health` mede `getUserById`, mantém cache de 60 segundos, informa a latência real e preserva `ineligible` como estado do canal.

**Refatoração/reteste:** `docker compose up -d --build` reconstruiu e reiniciou somente os serviços de aplicação, preservando volumes PostgreSQL e de segredos operacionais. Verificação real autorizada somente de leitura: `curl --cacert .local/localhost-ca.crt https://localhost:3000/health` retornou HTTP 200, banco `connected`, Twitch `ineligible` e `twitch_api_ping_ms: 193`; depois, o painel do navegador mostrou 322 ms. Não houve alteração Twitch de recompensa, resgate, mensagem de chat ou operação EventSub. `npm test -- --run tests/unit/documentation-contract.test.js -t 'public changelogs concise'` falhou porque a seção pública da versão tinha 6 itens, acima do máximo de 5; depois de incorporar o detalhe ao item existente de estado do painel, o mesmo comando passou. Resultados dos testes focados e gates completos estão registrados abaixo.

### Verificação no navegador — recuperação do callback OAuth

Em 2026-10-06, o Chrome abriu o callback real do app local com recusa Twitch simulada (`/callback?error=access_denied&error_description=must-not-be-shown`). A tela seguiu o visual do painel, mostrou ação localizada de recuperação e contagem de 30 segundos, sem reproduzir `error_description`. Após 31 segundos, o navegador retornou a `https://localhost:3000/`. Isso valida no navegador o ramo de recusa/recuperação e o timer; consentimento Twitch bem-sucedido não foi repetido. Erros de console vieram de uma extensão instalada do Chrome, não dos recursos do projeto.

## Qualidade e revisão

Verificação em 2026-10-06: `npm test` — 52 arquivos, 384 testes passaram; `npm run lint`; `npm run typecheck`; `npm run review:static` — 45 arquivos JavaScript da aplicação, 0 achados; `npm run validate:version`; `docker compose config --quiet`; e `git diff --check` passaram. `docker compose up -d --build` concluiu com banco e bot saudáveis, preservando volumes PostgreSQL e de segredos operacionais. Reconciliação pelo operador, controles protegidos de retry/resolução manual, idempotência persistida, telas de callback OAuth, ramo real de recusa/redirect no navegador e probe Helix autorizado somente de leitura estão cobertos. O canal foi confirmado inelegível; escrita de recompensa, resgates, envio de chat e recuperação EventSub não foram executados. Nenhuma sessão moderada de usabilidade é alegada. QA independente está em andamento. FND-5 foi mesclada; esta story consome os serviços de ciclo de vida de fila e propriedade da conta.

## Lista de arquivos

- `apps/web/app.js`, `apps/web/index.html`, `apps/web/styles.css`
- `apps/web/panel-navigation.mjs`, `tests/unit/panel-navigation.test.js`
- `apps/api/src/health-route.mjs`, `apps/api/src/runtime.mjs`, `apps/api/src/twitch/`
- `tests/unit/health-route.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/health-status.test.js`
- `apps/api/src/http/queue-routes.mjs`, `apps/api/src/http/local-session.mjs`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/prisma/schema.prisma` e `apps/api/prisma/migrations/202610060002_reward_native_limits/`
- `apps/api/src/outbox/reward-worker.mjs`, `apps/api/src/twitch/helix-adapter.mjs`
- `apps/api/src/commands/chat-handler.mjs`
- `tests/unit/chat-command-handler.test.js`, `tests/integration/queue-repository.test.js` e demais arquivos afetados em `tests/unit/`/`tests/integration/`
- `README.md`, `README.pt-BR.md`, `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/FND-6/ux-research.md`, `docs/pt-BR/stories/FND-6/ux-research.md`
- `docs/stories/FND-6/story.md`, `docs/pt-BR/stories/FND-6/story.md`
- `docs/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`, `docs/pt-BR/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md`
- `docs/integrations.md`, `docs/pt-BR/integrations.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `package.json`, `package-lock.json`, `VERSION`, `.aiox/project-status.yaml`

## Registro de alterações

| Data | Versão | Alteração | Autor |
| --- | --- | --- | --- |
| 2026-10-06 | 0.3.0 | Implementação e evidências TDD da FND-6 preparadas para revisão QA independente. | @dev |
