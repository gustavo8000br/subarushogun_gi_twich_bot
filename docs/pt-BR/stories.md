# Stories de desenvolvimento

[English](../stories.md)

## Fundação do produto: bot local de filas da Twitch para Genshin Impact

**Fonte:** Especificação do usuário “Prompt 1 — Bot local de filas da Twitch para Genshin Impact”, recebida em 2026-10-02.
**Status do planejamento:** Spec Pipeline e Greenfield Fullstack/Service/UI foram planejados; o painel mutável de produto é requisito. A sequência FND está em implementação até FND-6 por solicitação explícita do operador. Várias stories permanecem Em andamento; consulte lacunas de aceite e evidências TDD em cada seção.
**Complexidade:** COMPLEX. Os requisitos abrangem infraestrutura local, concorrência no PostgreSQL, operações financeiras duráveis, OAuth, APIs e EventSub da Twitch, recuperação, segurança local, comportamento no chat e painel bilíngue.
**Regra de execução:** Cada incremento de comportamento começa com um teste que falha pelo comportamento ausente, seguido por Green e Refactor. Registrar neste arquivo e na versão em português o comando exato e os resultados observados. Nenhum resultado de teste é declarado antes de sua execução.

### Sequência de entregas

A ordem abaixo segue as etapas sugeridas na especificação. Cada story deve ser refinada e validada pelo fluxo de stories do AIOX antes da implementação. Os testes são escritos antes da implementação dentro de cada story; garantias de integração usam uma instância isolada real de PostgreSQL e migrations reais.

#### FND-1 — Identidade de versão e fundação do runtime local

**Status:** InProgress (validação PO GO, 9/10).
**Story:** `docs/stories/FND-1/story.md` e equivalente pt-BR; validação em `docs/stories/FND-1/validation.md` e `docs/pt-BR/stories/FND-1/validation.md`.
**Evidência TDD:** política/CLI de versão, Compose/bootstrap, migrations PostgreSQL, grupo do segredo, projeção health, documentação bilíngue, aceitação Compose isolada, script POSIX e ponto de entrada web estático têm testes e resultados observados. Verificações Linux passaram. A execução do batch Windows segue sem validação neste host Linux; FND-1 permanece InProgress até resolver esse critério de plataforma.
**Gates atuais (2026-10-02):** `npm test` — 21 arquivos/140 testes passaram; `npm run lint`, `npm run typecheck`, `npm run review:static` (OpenGrep 1.30.0; 19 arquivos JavaScript da aplicação, 0 achados), `docker compose config --quiet`, `npm run validate:version` e `git diff --check` passaram. A análise local executa regras versionadas no repositório e apenas reporta achados.

##### Evidência TDD FND-1 — Funções de política de versão

- **Comportamento:** Validar SemVer base, estágios permitidos, identidade de origem de sete caracteres, marcador pré-Git e prefixo exato de sete caracteres de commit Git completo; rejeitar identidade malformada ou commit ausente.
- **Red:** `npm test -- --run tests/unit/version-policy.test.js` — 11 falhas, 0 sucessos após endurecimento. O módulo de versão não existia, então comportamento/exports esperados estavam ausentes. A execução preliminar com 8 falhas/3 sucessos foi descartada porque testes de entrada inválida podiam passar com `TypeError` de função ausente.
- **Green:** `npm test -- --run tests/unit/version-policy.test.js` — 11 sucessos após implementar funções puras em `apps/infra/src/version.mjs`.
- **Refactor:** mesmo comando — 11 sucessos após remover exportação acessória não usada.

##### Evidência TDD FND-1 — Arquivos de versão e CLIs de build

- **Comportamento:** Validar `package.json`, `.release-stage` e `VERSION` somente leitura; materializar marcador de artefato sem metadados Git; usar exatamente sete caracteres de origem commitada; falhar quando repo Git não tem commit localizável; preservar todas as fontes do checkout.
- **Red:** `npm run test:integration -- tests/integration/version-cli.test.js` — 4 falhas, 0 sucessos porque arquivos/comportamentos CLI de versão estavam ausentes. Vitest e fixtures Git temporárias executaram; falhou pelos comandos da aplicação ausentes.
- **Green:** `npm test -- --run tests/unit/version-policy.test.js tests/integration/version-cli.test.js` — 15 sucessos após adicionar `apps/infra/src/version-files.mjs` e os dois CLIs.
- **Refactor:** mesmo comando — 15 sucessos após tornar resolução do path de artefato portável.
- **Checagem somente leitura:** `npm run validate:version` — `Product version is valid: v0.1.0-0000000-alpha`.
- **Escopo:** o repositório atual ainda não tem commit, portanto materialização de build deste checkout não foi executada; comportamento com commit foi exercitado em fixture Git descartável.

##### Evidência TDD FND-1 — Compose, bootstrap de segredo e URL do banco

- **Comportamento:** Topologia/ordem do Compose, loopback e callback com porta avançada, segredo único persistente, montagem de URL segura e scripts de início não destrutivos.
- **Red:** `npm test -- --run tests/unit/bootstrap-secret.test.js tests/integration/compose-contract.test.js` — 8 falhas, 0 sucessos porque configuração Compose e helper de segredo não existiam.
- **Green:** mesmo comando — 8 sucessos após adicionar helper e arquivos iniciais de Compose/Docker/início; fixture foi ajustada para tornar o arquivo `0440` gravável antes de simular corrupção.
- **Red/Green do helper URL:** `npm test -- --run tests/unit/database-url.test.js` primeiro falhou 2 comportamentos porque o módulo não existia; depois os testes passaram junto à suíte anterior após implementação.
- **Red/Green da porta avançada:** contrato Compose observou primeiro target/publicação 3000 em vez de 3217; após adicionar consistência com `APP_PORT`, `npm test -- --run tests/integration/compose-contract.test.js tests/unit/bootstrap-secret.test.js tests/unit/database-url.test.js` passou 11 testes.
- **Contrato da imagem/ignore:** após fixar identidade da imagem e adicionar OpenSSL, os testes de imagem passaram; `tests/unit/local-ignore-policy.test.js` primeiro falhou porque `runtime-secrets/` não era ignorado, depois passou com a política de ignore.
- **Red/Green do runtime:** o primeiro `docker compose up --build -d` real falhou na migration porque UID/GID `10001:10001` não lia o segredo `0440` do Postgres. Foi adicionado teste de contrato Compose; `npm test -- --run tests/integration/compose-contract.test.js` observou o grupo suplementar ausente, depois passou após conceder GID 999 a migrate e bot.
- **Refatoração/suíte combinada:** `npm test -- --run tests/integration/compose-contract.test.js tests/integration/postgres-foundation.test.js` — 9 sucessos após correção de grupo. `docker compose config --quiet` passou.
- **Aceitação no host:** `docker compose up --build -d` concluiu na ordem bootstrap → banco saudável → migration → bot; health retornou `{"status":"ok"}`, bot rodou como UID 10001 com GID 999, leu o segredo e permaneceu saudável após `docker compose restart bot`. Histórico de migrations persistiu. Verificado somente no Docker Engine Linux.

##### Evidência TDD FND-1 — Schema PostgreSQL e restrições de integridade

- **Comportamento:** Aplicar migrations versionadas reais em PostgreSQL 18.6 isolado; criar nove tabelas do produto; aplicar restrições globais de chave, ID de resgate, viewer/fila ativo, integridade entre origem manual/resgate e idempotência da outbox.
- **Red:** `npm test -- --run tests/integration/postgres-foundation.test.js` — 2 falhas após container PostgreSQL descartável e `prisma migrate deploy` real concluírem. A consulta de tabelas retornou `[]`; inserts falharam com `relation "queues" does not exist`.
- **Green:** mesmo comando — 2 sucessos após adicionar models Prisma e migration SQL inicial; chaves/resgates/entradas ativas/idempotência duplicados geraram `23505` PostgreSQL, e relação origem/resgate inválida gerou `23514`.
- **Refatoração/validação:** `DATABASE_URL='postgresql://queuebot:isolated-test-password@127.0.0.1:5432/queuebot?schema=public' npm exec prisma validate` — schema válido no Prisma 6.19.3. `docker compose build bot` — sucesso, incluindo `npm ci` e `prisma generate` sem banco ativo.
- **Suíte combinada afetada:** `npm test -- --run tests/integration/postgres-foundation.test.js tests/integration/compose-contract.test.js tests/unit/bootstrap-secret.test.js tests/unit/database-url.test.js tests/unit/local-ignore-policy.test.js tests/unit/version-policy.test.js tests/integration/version-cli.test.js` — 31 sucessos antes da regressão de grupo suplementar; repetição focada após correção passou 9 testes.

##### Evidência TDD FND-1 — Discovery Vitest e gates de qualidade

- **Comportamento:** `npm test` do produto descobre somente `tests/`, excluindo suítes Jest/templates do framework AIOX; comandos obrigatórios de lint e typecheck JSDoc sem emissão existem e executam.
- **Red/Green do discovery:** `npm test -- --run tests/unit/test-discovery-contract.test.js` falhou porque `vitest.config.js` não existia; depois passou ao limitar discovery a `tests/**/*.test.js` e excluir `.aiox-core/**`. O primeiro `npm test` sem configuração teve 32 testes do produto aprovados e 12 falhas das suítes do framework por globals Jest/`@aiox/testing` ausentes; com a configuração, `npm test` passou 33 testes.
- **Red/Green dos scripts:** `npm test -- --run tests/unit/quality-script-contract.test.js` falhou porque faltavam scripts `lint` e `typecheck`; após adicionar ESLint/TypeScript pinados, configuração flat ESLint e configuração JSDoc `allowJs/checkJs` sem emissão, o contrato passou.
- **Refatoração/resultados:** `npm run typecheck` e `npm run lint` passaram após corrigir tipagem de estágio e achados do lint. `npm test` final passou 34 testes em 9 arquivos; `docker compose config --quiet`, `npm run validate:version` e `git diff --check` passaram.

##### Evidência TDD FND-1 — Projeção da resposta de saúde

- **Comportamento:** `/health` inclui identidade do produto em execução e estados explícitos de banco/Twitch; só informa banco conectado após consulta bem-sucedida; Twitch sem configuração aparece como `not_configured`, sem presumir conexão; falhas do banco retornam 503 sem vazar detalhes.
- **Red:** `npm test -- --run tests/unit/health-route.test.js` — 2 falhas porque `health-route.mjs`/a projeção ainda não existiam; o contrato esperava campos de versão/dependências e resposta 503 sanitizada.
- **Green:** mesmo comando — 2 sucessos após adicionar registro de rota testável e conectar `VERSION` do runtime e estado de consulta real `SELECT 1` a `/health`.
- **Refatoração/verificação runtime:** `npm test`, `npm run lint` e `npm run typecheck` passaram (36 testes / 10 arquivos). Após `docker compose up --build -d`, `curl --fail --silent --show-error http://localhost:3000/health` retornou `{"status":"ok","product_version":"v0.1.0-0000000-alpha","dependencies":{"database":"connected","twitch_api":"not_configured"}}`.

##### Evidência TDD FND-1 — README central bilíngue e referência de integrações

- **Comportamento:** fornecer READMEs centrais recíprocos em inglês/pt-BR com estado real da implementação, primeira execução, atualização, operação diária, alertas sobre persistência, orientação de contribuição/testes, Conventional Commits e política de versão; publicar nos dois idiomas a matriz datada de operação Twitch/SDK/infraestrutura, escopo e adaptação.
- **Red (referências de projetos reais):** o contrato foi ampliado para exigir os três projetos pesquisados; ao executá-lo novamente, 1 teste falhou e 1 passou porque essas referências ainda não estavam nos READMEs.
- **Green:** `npm test -- --run tests/unit/documentation-contract.test.js` — 2 sucessos após alinhar o rótulo do link recíproco, verificar o texto equivalente em português e documentar referências nos dois READMEs, mantendo identificadores técnicos comuns.
- **Refatoração/qualidade:** suíte focada passou 2 testes; `npm run lint`, `npm run typecheck` e `npm test` completo passaram (38 testes / 11 arquivos). `docker compose config --quiet`, `npm run validate:version` e `git diff --check` passaram.
- **Parada/início Compose:** antes de parar, o banco reportou uma migration aplicada com sucesso. `docker compose stop -t 30 bot` parou corretamente; `docker compose start bot` repetiu as etapas dependentes de bootstrap/migration e reiniciou o bot. `/health` retornou status `ok`, banco `connected`, Twitch `not_configured`; a contagem de migrations permaneceu 1 e `docker compose ps` mostrou o bot saudável. Verificado somente no Docker Engine Linux.
- **Teste de aceitação Compose:** `npm test -- --run tests/integration/compose-runtime.test.js` falhou inicialmente na asserção do marcador porque a consulta do teste tratava um escalar JSON como objeto; a fixture foi corrigida para `value #>> '{}'`. A repetição passou 2 testes, provando health/migrations na primeira execução isolada e persistência do marcador/senha/migration após parada/início gracioso. A falha inicial era defeito do teste, não Red de comportamento do app.
- **Teste dos scripts:** `npm test -- --run tests/unit/start-script.test.js` — 2 passaram. Executou o helper POSIX de uma cópia do projeto em caminho com espaços e comandos falsos de Docker/navegador, confirmou o comando Compose e URL exatos e o fallback impresso se o navegador falhar. `tests/integration/compose-contract.test.js` também verifica `cd /d "%~dp0"` entre aspas e abertura de janela no helper Windows.
- **Red/Green/Refatoração da rota web estática:** `npm test -- --run tests/unit/web-route.test.js` falhou primeiro porque `apps/api/src/web-route.mjs` não existia. Após a implementação, encontrou conflito de rota raiz registrada por `@fastify/static`; a rota duplicada foi removida. Ao adicionar asserções para CSS, observou HTTP 404 com `serve:false`; habilitar entrega estática/índice do plugin fez passar as asserções finais HTML e CSS (1 teste). HTML raiz e `200 text/css` foram conferidos depois de `docker compose up --build -d`.
- **Validação completa de qualidade/runtime:** `npm run lint`, `npm run typecheck`, `npm test` (43 testes / 14 arquivos), `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram. Health runtime retornou versão do produto, banco `connected`, Twitch `not_configured`; `docker compose ps` mostrou bot saudável.
- **Limite de plataforma:** este host não tem `cmd.exe`, Wine ou PowerShell; o `.bat` foi inspecionado estruturalmente, mas não executado. Não alegar compatibilidade runtime Windows até testar no Windows. Teste Twitch real está fora de FND-1.
- **Pesquisa:** documentação oficial Twitch, Twurple, Prisma 6, PostgreSQL 18 e Docker Compose foi consultada em 2026-10-03 UTC; declarações instaladas do Twurple 8.2.0 foram verificadas. Não havia credenciais Twitch reais disponíveis.

**Escopo:** Scripts/testes de identidade SemVer/runtime; documentação/changelogs bilíngues; bootstrap Compose, PostgreSQL, migrations, saúde e scripts de início.
**Critérios de aceite:**

- A identidade runtime segue `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`, com `0.1.0`, `alpha` e `0000000` antes da materialização Git.
- Testes de validação/materialização cobrem consistência das fontes, SHA de sete caracteres, marcador sem Git, falha ao descobrir Git, materialização do artefato e ausência de alteração da versão em validações comuns.
- Compose inicia bootstrap → PostgreSQL saudável → migrations → bot sem root; banco não publica porta no host, volumes nomeados persistem e scripts normais nunca removem volumes.
- Schema PostgreSQL e migrations SQL aplicam as restrições especificadas para chaves de fila, entradas ativas, resgates e idempotência; testes de integração usam PostgreSQL isolado e migrations reais.
- Documentos em inglês e equivalentes em `docs/pt-BR/` existem com links recíprocos e instruções operacionais consistentes.
- **Evidência TDD:** ver os ciclos observados de versão, Compose/bootstrap, regressão do runtime, PostgreSQL, discovery de testes, scripts de qualidade, projeção health, documentação, aceitação Compose, helper POSIX e ponto de entrada web estático acima. FND-1 segue InProgress somente pela validação ainda não executada no host Windows.
- **TDD da migração da análise estática:** `tests/unit/aiox-static-review.test.js` falhou primeiro porque a Layer 2 não executava o comando configurado; um Red posterior revelou a fase de análise estática ausente no executor de workflow. `tests/unit/opengrep-quality-gate.test.js` falhou inicialmente pela ausência do template/comando e depois detectou a falta da flag bloqueante `--error`. Os testes direcionados passam após corrigir esses comportamentos. `npm run review:static` reporta 0 achados em 19 arquivos JavaScript da aplicação. Uma fixture temporária confirmou anteriormente as regras para HTML inseguro e logging de credenciais.

#### FND-2 — Domínio de filas, validação, ordenação e parser

**Status:** Done (2026-10-05; critérios, revisões de domínio/dados e QA e gates obrigatórios passaram)
**Story:** `docs/stories/FND-2/story.md` e equivalente `docs/pt-BR/stories/FND-2/story.md`; validação em `docs/stories/FND-2/validation.md` e `docs/pt-BR/stories/FND-2/validation.md`.
**Escopo:** Regras puras do domínio, tratamento de UID, parser de comandos, decisões de autorização e operações de fila com transações.
**Critérios de aceite:**

- Transições e fotografias das políticas financeiras seguem a tabela, sem transições inválidas ou de estado terminal para ativo.
- UID aceita somente string de nove dígitos ASCII após `trim` no modo visível; o modo oculto descarta sem persistir nem divulgar.
- Parser trata caixa, espaços repetidos, variantes com acento, nomes reservados, aliases, quantidade de argumentos e restrições de identidade de viewers.
- Testes PostgreSQL comprovam unicidade de usuário ativo por fila e tratamento de concorrência; mudanças de ordem são atômicas e preservam a ordem persistida.
- **Evidência TDD:** decisões de transição, UID, parser/chaves/autorização, operações de repositório PostgreSQL real e serviço de domínio unificado estão registrados abaixo. A revisão de fronteira de 2026-10-05 encontrou e corrigiu caminhos legados de chat/painel/repositório que ignoravam o serviço de transição; a revisão final passou.

##### Evidência TDD FND-2 — Função de decisão de transição de entrada

- **Comportamento:** Aceitar somente transições de ciclo de vida especificadas; rejeitar transições inválidas/terminal-para-ativo; distinguir observações terminais externas de operações de pontos solicitadas localmente; fotografar a política fornecida da fila.
- **Teste primeiro / correção do harness:** `npm test -- --run tests/unit/entry-transitions.test.js` inicialmente coletou zero testes porque faltava o módulo importado. Foi falha de importação, não um Red válido. Adicionado stub de contrato vazio e executado novamente.
- **Red:** Mesmo comando — 12 testes, inicialmente 4 falharam contra o stub. A tabela de casos foi então corrigida para refletir que `waiting → completed` e `in_progress → no_show` são inválidos, enquanto observações terminais externas são permitidas. O Red comportamental resultante foi 12 testes, 1 falha / 11 aprovados: conclusão externa foi classificada incorretamente como solicitação local de conclusão de pontos.
- **Green:** Mesmo comando após implementação — 12 aprovados.
- **Refactor:** `npm run typecheck` encontrou propriedades JSDoc ausentes e tipagem do código de erro; o primeiro ajuste encontrou incompatibilidade na entrada de um helper. Após a correção, `npm run typecheck && npm test -- --run tests/unit/entry-transitions.test.js` passou (typecheck; 12 testes). `npm run lint -- --no-warn-ignored` passou.
- **Estado no incremento inicial:** Decisões/fotografias de políticas e persistência/auditoria pelo repositório estavam implementadas nos casos cobertos. O serviço comum foi adicionado em um incremento TDD posterior, registrado abaixo. Isso não comprova outbox ou comportamento remoto Twitch.

##### Evidência TDD FND-2 — Validação de UID e descarte em modo oculto

- **Comportamento:** Remover espaços externos e aceitar somente nove dígitos ASCII em modo visível; permitir UID ausente somente quando opcional; descartar qualquer entrada em modo oculto; erros inválidos não repetem texto do usuário.
- **Red:** `npm test -- --run tests/unit/uid.test.js` — 11 testes falharam contra o contrato vazio do validador.
- **Green:** Mesmo comando após implementação — 11 passaram.
- **Refactor:** `npm test -- --run tests/unit/uid.test.js && npm run typecheck && npm run lint` — 11 passaram, typecheck e lint passaram.
- **Estado:** A validação pura de UID está implementada; testes PostgreSQL reais também verificam a limpeza do UID persistido e do payload de chamada pendente ao ativar modo oculto.

##### Evidência TDD FND-2 — Chaves, parser de comandos e autorização

- **Chaves:** `npm test -- --run tests/unit/queue-keys.test.js` Red — 25 falhas contra contrato vazio; Green — 25 passaram após implementação; `npm test -- --run tests/unit/queue-keys.test.js && npm run typecheck && npm run lint` passou.
- **Parser:** `npm test -- --run tests/unit/command-parser.test.js` Red — 18 testes, 11 falhas / 7 passaram contra parser vazio. A primeira execução da implementação detectou fixture que classificava a sintaxe válida `add login uid` como rejeitada; corrigido o fixture, o teste de regressão seguinte observou 19 testes, 1 falha / 18 passaram porque `!<fila>` produzia `join`. Alterado para `lista`, sem escrita; `npm test -- --run tests/unit/command-parser.test.js && npm run typecheck && npm run lint` passou (19 testes).
- **Autorização:** `npm test -- --run tests/unit/command-authorization.test.js` Red — 6 falhas contra contrato vazio; Green — 6 passaram. Red de regressão encontrou moderador usando `sair outra-pessoa` (1 falha / 6 passaram); após mudar a regra, a suíte direcionada passou com 7 testes, typecheck e lint.
- **Estado:** Parser, validações de formato/reserva de chaves e predicado de autorização estão implementados como funções puras. Testes PostgreSQL cobrem chaves globais e substituição/rollback atômicos; handlers runtime de chat/EventSub ficam para FND-4/FND-5.

##### Evidência TDD FND-2 — Repositório PostgreSQL e ordenação

- **Red inicial:** `npm test -- --run tests/integration/queue-repository.test.js` — 4 falhas porque as operações de repositório não existiam. O teste inicia PostgreSQL isolado e aplica as migrations Prisma reais do projeto.
- **Green/refinamento:** Foram implementados criação/adição/movimentação, substituição de chaves, limpeza de privacidade de UID e persistência de transição/auditoria. Execuções revelaram erros de desserialização de `void` do Prisma e colisão no formato do resultado; fixtures também precisaram ser corrigidas para a ordem de aquisição do lock e uma colisão prévia de alias. Cada defeito foi corrigido e a suíte PostgreSQL afetada executada novamente; execuções intermediárias passaram com 4, 6 e 8 testes.
- **Verificação adicional:** `npm test -- --run tests/integration/queue-repository.test.js` — 13 aprovados. Cobre a mesma pessoa em filas diferentes, duplicata ativa na mesma fila, adição manual em fila fechada, rejeição para filas arquivadas/em exclusão, movimentação e decisões terminais concorrentes, unicidade/rollback de chaves, limpeza de UID, transições/auditoria persistidas e rejeição no banco de combinações inconsistentes de origem/ID de resgate. As assertions finais verificam comportamento/migrations existentes; não alteraram código da aplicação.
- **Gates finais anteriores:** `npm test` — 20 arquivos/139 testes passaram; `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram.
- **TDD do serviço de domínio unificado:** `npm test -- --run tests/unit/queue-domain-service.test.js` Red — 2 falharam porque o contrato vazio não tinha `transitionEntry`; Green — 2 passaram após implementar `createQueueDomainService`. `npm test -- --run tests/integration/queue-repository.test.js` — 13 passaram após encaminhar persistência de transições PostgreSQL reais pelo serviço. Comprovou decisão usando estado/política atuais sob lock e nenhuma gravação de status/auditoria para transição inválida. Refatoração/reteste: `npm run typecheck && npm run lint` e ambas as suites focadas passaram.
- **Limite de conclusão:** todos os critérios FND-2 foram concluídos. Caminhos de produção para transições, chamadas e limpeza usam o serviço comum de decisão de domínio; FND-2 não declara importação de resgates Twitch, finanças remotas nem conclusão de FND-3/FND-4.
- **Checkpoint anterior de gates (2026-10-03):** `npm test` — 22 arquivos/142 testes passaram; a suite isolada de integração — 5 arquivos/28 testes passaram, incluindo 13 casos do repositório PostgreSQL. Naquele checkpoint ainda faltavam revisão formal e algumas fronteiras do serviço.
- **Limite atual:** O dispatch runtime de chat/EventSub não está ligado. O serviço não importa resgates Twitch nem executa operações financeiras remotas. Os testes de persistência usam PostgreSQL, sem mock do Prisma.
- **Evidência TDD — fronteira de propriedade de transições (2026-10-05):** `npm test -- --run tests/unit/queue-domain-service.test.js` falhou primeiro porque `callNext` não existia no serviço compartilhado. Testes de regressão reproduziram os desvios quando chat e painel foram temporariamente ligados aos métodos antigos do repositório: 2 testes de chat e 2 de rotas não observaram o serviço de domínio. Em seguida `npm test -- --run tests/unit/queue-transition-boundary.test.js` falhou porque uma transição direta de persistência alcançou o Prisma em vez de falhar explicitamente. Depois de encaminhar transição/chamada/limpeza pelo serviço, exigir a função decisora nas fronteiras de persistência e remover a mutação de timeout direta sem uso, o comando focado de unidades/PostgreSQL passou 57 testes; o Red da integração PostgreSQL de chamada por entrada específica (`Queue calling is unavailable`) passou após conectar `callSpecificEntry`. Suíte final completa: 41 arquivos/240 testes passaram. Também passaram `npm run lint`, `npm run typecheck`, `npm run review:static` (OpenGrep, 37 arquivos JS/0 achados), `npm run validate:version`, Prisma validate, `docker compose config --quiet` e `git diff --check`.
- **Decisão das revisões (2026-10-05):** revisão arquitetural AIOX encontrou o desvio e confirmou a fronteira corrigida; revisão de dados conferiu o índice parcial PostgreSQL real, a constraint de origem/ID de resgate, a estratégia de transação/advisory lock e os testes com migrations; revisão de QA mapeou todos os critérios FND-2 para testes unitários e PostgreSQL. Não há achados FND-2 pendentes. Comportamento Twitch real e a validação de Windows nativo de FND-1 não pertencem a esta story.
- **Gates finais (2026-10-05):** `npm test` — 41 arquivos/240 testes passaram; `npm run lint`; `npm run typecheck`; `npm run review:static` — OpenGrep analisou 37 arquivos JavaScript com 0 achados; `npm run validate:version`; Prisma validate; `docker compose config --quiet`; e `git diff --check` passaram.

#### FND-3 — Outbox durável e recuperação financeira

**Status:** Done; transição financeira, worker, recuperação de lease, resgate rejeitado, resolução de estado externo, reconhecimento explícito do operador de estado irrecuperavelmente desconhecido e eventos Twitch terminais posteriores estão cobertos por testes e gates finais.
**Escopo:** Máquina de estados da outbox, worker, leases, retries, auditoria e confirmação do estado remoto do resgate.
**Critérios de aceite:**

- Uma transição terminal local, entrada de auditoria e intenção financeira única são confirmadas atomicamente antes de qualquer chamada à Twitch.
- Reinício recupera tarefas pendentes e leases vencidos; timeout/resposta perdida é reconciliado com a Twitch antes de retry; estado remoto oposto aparece como conflito.
- 429, 401/revogação, falhas transitórias, falhas permanentes e resultados desconhecidos permanecem observáveis e recuperáveis sem falsa confirmação.
- Testes de integração PostgreSQL comprovam unicidade, atomicidade transacional, recuperação de lease e recuperação de resgate rejeitado.
- **Evidência TDD — intenção terminal atômica:** `npm test -- --run tests/integration/queue-repository.test.js -t "terminal transition"` falhou primeiro porque nenhuma tarefa outbox era persistida junto com a transição; após implementação, o teste PostgreSQL focado passou e comprovou uma tarefa e intenção no mesmo commit transacional.
- **Evidência TDD — lease durável:** testes do repositório detectaram `claimNext` ausente (Red); após implementação de claim/recuperação, os testes PostgreSQL passaram para claim concorrente único e lease expirado. A suíte completa depois encontrou erro de visibilidade de alias PostgreSQL `42P01`; SQL usa agora `UPDATE FROM candidate, redemptions` e o rerun da regressão passou.
- **Evidência TDD — worker financeiro:** `npm test -- --run tests/unit/financial-outbox-worker.test.js` — 9 testes passaram para operação já aplicada, confirmação, resposta perdida, 429, 401, 404, falha permanente e retry limitado. O teste de 4xx permanente observou primeiro retry indefinido.
- **Evidência TDD — loop e rejeitado:** `npm test -- --run tests/unit/outbox-loop.test.js` — 2 passaram após Red pela ausência do loop; teste PostgreSQL registra cancelamento de resgate rejeitado sem entrada nem texto bruto. Teste PostgreSQL de estado externo passou para confirmação compatível e conflito oposto.
- **Evidência TDD — reconhecimento do operador (2026-10-05):** `npm test -- --run tests/integration/queue-repository.test.js -t 'operator resolution of unknown|outside unknown state'` primeiro falhou em dois casos porque `resolveUnknownFinancialOperation` não existia. Depois, os testes PostgreSQL isolados passaram: somente operação financeira `unknown` pode ser resolvida, a intenção esperada e o estado remoto `UNFULFILLED` permanecem, sync status muda para `operator_resolved`, auditoria registra ator/origem/motivo e `remoteConfirmed: false`, e a operação resolvida não aceita retry manual nem claim. Testes da API/painel protegidos, `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js`, passaram 11 casos, incluindo bloqueio CSRF, vínculo do ator e texto do painel sem afirmar confirmação. O harness PostgreSQL real aplicou a migration `202610050001_manual_outbox_resolution`.
- **Evidência TDD — evento remoto após resolução do operador (2026-10-05):** `npm test -- --run tests/integration/queue-repository.test.js -t 'later Twitch terminal observation'` primeiro falhou porque um evento terminal posterior atualizava o resgate mas mantinha a outbox como `resolved_manual`. O repositório agora reconcilia registros resolvidos manualmente quando a Twitch confirma estado terminal posterior; a regressão PostgreSQL passou com cancelamento remoto correspondente levando a `confirmed`. Estado oposto segue o ramo de conflito existente.
- **Aceite final (2026-10-05):** a integração PostgreSQL de lease também confirma que um token expirado não finaliza a tarefa recuperada, enquanto o token novo confirma. A regressão de `.gitignore` foi corrigida com teste primeiro; as três migrations SQL Prisma agora permanecem visíveis ao Git. Suíte final: 41 arquivos/245 testes passaram. `npm run lint`, `npm run typecheck`, OpenGrep (37 arquivos JS/0 achados), validação de versão, Prisma, Compose config e `git diff --check` passaram. Revisões de arquitetura/persistência/QA não encontraram bloqueios FND-3 restantes. Reembolso/consumo Twitch real não foi testado sem credenciais autorizadas; nenhuma operação real é alegada.

#### FND-4 — OAuth Twitch, adaptadores e reconciliação

**Status:** Em andamento; validação de credenciais, state/autorização OAuth, runtime Twurple, adapter Helix, EventSub, processador de resgates, reconciliação e ciclo de vida implementados. Gestão do ciclo de recompensas e validação real do canal permanecem pendentes.
**Escopo:** Pesquisa em documentação oficial, credenciais/OAuth Twitch, persistência/renovação de token, propriedade de recompensa, EventSub WebSocket, adaptadores Helix e reconciliação de recuperação.
**Critérios de aceite:**

- `docs/integrations.md` registra fontes oficiais datadas, versões compatíveis fixadas das bibliotecas, escopos e operação → endpoint/evento → escopo → adaptação do SDK.
- Validação de Client ID/Secret usa Client Credentials; OAuth usa state único vinculado à sessão; segredos/tokens nunca aparecem em respostas, URLs ou logs.
- Somente recompensas próprias deste app são gerenciadas; vínculo de broadcaster/app impede troca insegura de conta; elegibilidade e escopos necessários são verificados.
- EventSub add/update e reconciliação paginada deduplicam por ID do resgate e tratam com segurança update antes de add, falhas parciais, eventos terminais e reconexões.
- Testes de adaptador usam fakes; integração PostgreSQL real cobre tokens persistidos, deduplicação e recuperação. Nenhum sucesso real da Twitch é alegado sem credenciais autorizadas.
- **Evidência TDD — credencial/OAuth:** `npm test -- --run tests/unit/twitch-oauth.test.js` — 6 testes passaram após Red por comportamento OAuth ausente; cobrem Client Credentials sem revelar token, vínculo/expiração/uso único do state, escopos exatos e persistência somente após identidade verificada. Testes de credencial PostgreSQL detectaram suposição inválida de banco vazio e foram rerodados conforme semântica de rotação do mesmo app.
- **Evidência TDD — runtime/adapters Twurple:** testes focados passaram: `tests/unit/twitch-auth-runtime.test.js` (3), `tests/unit/twitch-adapter.test.js` (4), `tests/unit/eventsub-runtime.test.js` (4). O teste EventSub falhou primeiro por ausência de normalização de `userId/channelId`, e passou após adaptar o evento SDK.
- **Evidência TDD — evento/reconciliação:** `tests/unit/twitch-event-processor.test.js` (3), `tests/unit/twitch-reconciliation.test.js` (4), `tests/unit/twitch-integration.test.js` (3) passaram. Teste de ciclo encontrou parada duplicada para canal inelegível; a correção idempotente passou no rerun.
- **Evidência TDD — modo da fila de resgates:** `npm test -- --run tests/unit/twitch-reconciliation.test.js` mostrou primeiro que uma recompensa com `should_redemptions_skip_request_queue=true` era aceita incorretamente; após adicionar projeção normalizada e detecção de divergência, testes de adapter/reconciliação passaram (9 testes focados).
- **Limite:** sem credenciais Twitch autorizadas; nenhum OAuth, recompensa, chat, resgate, reembolso ou EventSub real foi executado. Recuperação para criar/editar/arquivar/apagar recompensa e limite 45/50 não está completa.

#### FND-5 — Comandos de chat, chamadas, ciclo de atendimento e propriedade da conta

**Status:** Em andamento; integração do parser/autorização, caminhos principais de viewer/gestão, chamada limitada, outbox de chat, timeout básico, persistência da conta manual/padrão, propriedade da conta por chamada individual e limpeza confirmada implementados. Transições/chamadas/limpeza agora entram pelo serviço de domínio compartilhado; concorrência da conta entre filas, confirmação remota de abrir/fechar, cooldown/deduplicação duráveis de viewers, reenvio confiável e políticas de arquivamento/exclusão permanecem pendentes.
**Issue GitHub:** [#1](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/1)
**Escopo:** Parser/execução de comandos Twitch, autorização, notificações, recuperação de timeout, confirmação de limpeza, estado de conta atual e interfaces de serviços de aplicação compartilhadas com o painel do operador.
**Critérios de aceite:**

- Caminhos de comando e timer usam o mesmo serviço de domínio; deduplicação por ID da mensagem, autorização broadcaster/mod/VIP, verificação de canal e cooldown de viewer seguem a especificação.
- Notificação de chamada é durável, privacidade é consultada no envio, timeout começa somente após envio confirmado e iniciar atendimento impede ausência.
- Limpeza exige mesmo ator/canal/fila e conjunto ativo inalterado em até 15 segundos; caso contrário não ocorre mutação nem operação de pontos.
- Troca automática de conta vale somente para chamada individual e somente sua proprietária pode retornar ao padrão ao encerrar; mudanças e reset manuais persistem e são auditados.
- Handlers do chat e o painel posterior chamam os mesmos serviços de domínio/aplicação; o painel não duplica regras de transição.
- Testes cobrem concorrência, reinício, falha de notificação, mudança de privacidade e ausência de efeitos financeiros indevidos.
- **Evidência TDD — handler/autorização:** `npm test -- --run tests/unit/command-parser.test.js tests/unit/command-authorization.test.js tests/unit/chat-command-handler.test.js` — 30 testes passaram. Red inicial apontou módulo ausente; regressão também expôs autorização/parser do `!conta` público, corrigidos e retestados.
- **Evidência TDD — chamada/notificação:** testes PostgreSQL falharam inicialmente porque operações de chamada não existiam; após implementação, passaram verificações de grupo limitado, identidade Twitch própria e ordem. `tests/integration/queue-repository-chat.test.js` falhou inicialmente porque tarefa durável de chat estava ausente; depois passou para timeout somente confirmado, privacidade UID no envio, cancelamento de chamada obsoleta e lease.
- **Evidência TDD — timeout/conta:** Red do timeout identificou transição de expiração ausente; teste PostgreSQL de transição e `tests/unit/call-timeout-loop.test.js` passaram após gating de recuperação e tolerância de 60 segundos. Red de persistência da conta revelou método ausente; teste PostgreSQL de set/reset/auditoria passou.
- **Evidência TDD — confirmação de limpeza:** `tests/unit/clear-confirmation.test.js` falhou primeiro porque o serviço não existia; `tests/integration/queue-repository.test.js -t 'clears a confirmed snapshot'` falhou porque a limpeza atômica não existia; testes de handler e rotas observaram inicialmente ausência da ação no chat/404. Após implementar vínculo ao snapshot, expiração de 15 segundos, remoção/auditoria/intenção de cancelamento atômicas no PostgreSQL e fluxos preview-confirm no chat/painel, `npm test -- --run tests/unit/web-route.test.js tests/unit/queue-routes.test.js tests/unit/chat-command-handler.test.js tests/unit/clear-confirmation.test.js tests/integration/queue-repository.test.js` passou 42 testes.
- **Evidência TDD — propriedade da conta:** testes PostgreSQL falharam primeiro porque chamadas individuais mantinham a conta padrão. Após vincular atomicamente somente chamadas com `count === 1` à entrada selecionada, preservar intervenção manual sob essa proprietária, voltar ao padrão no término dela e adicionar configuração do rótulo padrão, `npm test -- --run tests/integration/queue-repository.test.js` passou os casos focados de conta. Grupo de tamanho 2 não troca mesmo com uma pessoa disponível; o término de outra entrada não remove a proprietária.
- **Aceite restante:** cooldown de viewer após reinício/concorrência, UI para reenvio confiável, políticas arquivada/em exclusão e cobertura pelo serviço de transição compartilhado continuam incompletos.

#### FND-6 — Painel local, API protegida e documentação operacional

**Status:** Em andamento; base local de sessão/CSRF/Host-Origin, rotas de setup/estado/fila/ações/operações e UI vanilla inicial existem. É implementação parcial inicial, não story concluída.
**Issue GitHub:** [#6](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/6)
**Escopo:** primeiro planejar a experiência do operador com AIOX UX Design Expert e referências atuais de interfaces reais; depois entregar o painel local completo de controle do streamer, assistente de instalação/reconexão, API protegida e guias operacionais. Esta etapa começa após estarem disponíveis as capacidades de domínio e serviços Twitch/aplicação de FND-2 a FND-5 que o painel apresentará.
**Critérios de aceite:**

- Antes de escrever UI do painel, ativar `$aiox-ux-design-expert`, pesquisar projetos reais e referências atuais de UI e produzir fluxos bilíngues do operador e orientação visual/interativa fundamentados nos requisitos. A implementação da UI só começa após revisar esse artefato de planejamento.
- O streamer opera pelo painel toda capacidade aplicável do produto: configuração/reconexão Twitch e elegibilidade; criar/editar/abrir/fechar/arquivar/desarquivar/apagar filas e configurações de recompensas; adicionar manualmente, chamar, iniciar atendimento, concluir, remover, mover e reenviar notificações; consultar aguardando/chamados/em atendimento/histórico; gerir rótulos/conta atual; reconciliar estado Twitch; e consultar/tentar novamente/resolver operações financeiras quando a política permitir.
- Ações sensíveis ou destrutivas mostram resumo revisável e exigem confirmação quando especificado; configuração remota desejada permanece separada do estado confirmado pela Twitch; validação do servidor é autoritativa.
- O painel usa os mesmos serviços de domínio/aplicação do chat e dos workers. A API retorna projeções explícitas e nunca serializa entidades Prisma ou segredos.
- `/api/state` exige sessão e distingue versão do produto, versão do contrato da API e revisão do estado; UID obedece à política de visibilidade atual.
- Mutações validam schemas, sessão, CSRF, chave de idempotência e revisão aplicável; proteção contra DNS rebinding ocorre antes dos handlers administrativos.
- Conteúdo controlado por usuário é renderizado como texto; testes cobrem HTML malicioso, host/origin/CSRF, callback OAuth e não exposição de segredos.
- Todo controle do painel executa uma ação funcional ou aparece explicitamente indisponível com estado/ação possível; sem controles só visuais, mutações não suportadas escondidas ou regras de domínio duplicadas.
- READMEs documentam instalação, login, comandos, política de pontos, recuperação, iniciar/parar/atualizar/logs e identidade de versão nos dois idiomas.
- **Evidência TDD — sessão local:** `npm test -- --run tests/unit/local-session.test.js` falhou primeiro por ausência do módulo de sessão; depois 2 passaram para cookie local, CSRF, Host e Origin.
- **Evidência TDD — API/UI:** `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js` — 4 passaram após Red de rotas ausentes e atualização do contrato HTML do placeholder para o painel. `npm run lint` e `npm run typecheck` passaram após declarar globais de navegador ao ESLint.
- **Planejamento UX:** agente `$aiox-ux-design-expert` ativado; pesquisa documental, fluxos de operador, direção visual e limites registrados em `docs/stories/FND-6/ux-research.md` e sua versão em inglês. Foram consultadas Twitch Creator Dashboard/Channel Points, Streamer.bot Actions/Action Queues e painel/fila StreamElements. Não alegamos entrevistas ou sessões de usabilidade. A primeira versão da UI precede a pesquisa; CSS agora usa fontes do sistema e o artefato define os próximos gates de desenho/interação.
- **Evidência TDD — integração de runtime e projeções administrativas:** `npm test -- --run tests/unit/runtime-composition.test.js tests/unit/financial-outbox-worker.test.js tests/unit/chat-outbox-worker.test.js` falhou primeiro porque instalação nova não expunha OAuth nem ativava workers após conexão; após corrigir composição do runtime e ativação tardia dos workers, 16 testes passaram. `npm test -- --run tests/unit/queue-routes.test.js` falhou primeiro porque DTOs descartavam entradas e `/api/state` vazava UID de operador; após separar projeções de operador e de estado, testes das rotas passaram. Regressão posterior encontrou que a rota removia o caminho permitido por `show_uid_in_overlay`; 7 testes de rota passam com ambos os ramos de privacidade.
- **Evidência TDD — recursos locais:** `npm test -- --run tests/unit/web-route.test.js` falhou ao reproduzir uma importação externa do Google Fonts; depois da troca por fontes do sistema, passou e verifica que o CSS do painel não contém URLs externas.
- **Limitações atuais:** API ainda não oferece idempotência/versão completas, lifecycle das recompensas, edição de políticas/telas de histórico, UI da propriedade da conta, testes end-to-end do callback de instalação e controles completos de status/reconciliação. A limpeza agora tem revisão e confirmação da mesma sessão no chat e painel. `POST /api/queues` atualmente cria fila local sem criar/vincular recompensa Twitch; a UI explica isso e a fila não está pronta para resgates de viewers. Validação de usabilidade ainda está pendente e o painel segue provisório.

### Notas e gates do planejamento

- O prompt do usuário é a fonte dos requisitos; este plano não introduz comportamento adicional ao produto.
- A documentação oficial de Twitch, Twurple, Prisma, PostgreSQL e Docker deve ser conferida antes da implementação dessas integrações.
- Na linha de base do planejamento FND-0, os gates ainda não haviam sido executados. Os resultados FND-1 estão registrados acima; a pendência de aceite conhecida é executar `iniciar.bat` em Windows nativo.
- Criação de release ou tag está fora do escopo desta tarefa de fundação. Promoção de estágio exige aprovação humana explícita.
- Este plano não declara stories aprovadas, implementadas, testadas, aprovadas por QA ou concluídas.
- O preflight de ambiente AIOX verificou Git/GitHub CLI/Node/npm/Docker/Compose e autenticação GitHub; o remoto privado existe na branch `main`. Arquivos de runtime/package do produto aguardam TDD FND-1.
- Artefatos de planejamento: `docs/project-brief.md`, `docs/prd.md`, `docs/front-end-spec.md`, `docs/fullstack-architecture.md`, `docs/architecture.md`, `docs/front-end-architecture.md` e `docs/planning-validation.md`, cada qual com documento correspondente em `docs/pt-BR/`.
- A configuração AIOX `markdownExploder` está ligada. `@kayvan/markdown-tree-parser` v1.6.1 foi instalado globalmente e gerou shards do PRD, especificação frontend e arquiteturas fullstack/serviço/frontend em inglês e pt-BR; os nomes foram alinhados entre idiomas com links recíprocos.
- Um erro de sintaxe JSON foi encontrado na validação dos artefatos e corrigido antes de prosseguir; depois disso, todos os JSON de planejamento foram parseados com sucesso. Foi uma correção documental do planejamento, não comportamento da aplicação nem evidência TDD.
- A operadora escolheu manter o painel mutável obrigatório e confirmou CLI-first como diretriz do framework AIOX; não é necessária CLI de domínio adicional.
- O operador ampliou FND-6 para o streamer gerir todas as operações aplicáveis do produto no painel local. Corpos das issues GitHub #1 e #6 foram atualizados para definir serviços de aplicação compartilhados e o gate de planejamento UX; nenhum comentário foi publicado. Pesquisa UX e ativação `$aiox-ux-design-expert` ficam adiadas até o planejamento do painel.

### Lista de arquivos

- `docs/stories.md`
- `docs/stories/FND-0/spec/requirements.json`
- `docs/stories/FND-0/spec/complexity.json`
- `docs/stories/FND-0/spec/research.json`
- `docs/stories/FND-0/spec/spec.md`
- `docs/stories/FND-0/spec/critique.json`
- `docs/stories/FND-0/spec/plan.json`
- `docs/pt-BR/stories/FND-0/spec/requirements.json`
- `docs/pt-BR/stories/FND-0/spec/complexity.json`
- `docs/pt-BR/stories/FND-0/spec/research.json`
- `docs/pt-BR/stories/FND-0/spec/spec.md`
- `docs/pt-BR/stories/FND-0/spec/critique.json`
- `docs/pt-BR/stories/FND-0/spec/plan.json`
- `docs/project-brief.md` e `docs/pt-BR/project-brief.md`
- `docs/prd.md` e `docs/pt-BR/prd.md`
- `docs/front-end-spec.md` e `docs/pt-BR/front-end-spec.md`
- `docs/fullstack-architecture.md` e `docs/pt-BR/fullstack-architecture.md`
- `docs/architecture.md` e `docs/pt-BR/architecture.md`
- `docs/front-end-architecture.md` e `docs/pt-BR/front-end-architecture.md`
- `docs/planning-validation.md` e `docs/pt-BR/planning-validation.md`
- `docs/framework/tech-stack.md`, `coding-standards.md`, `source-tree.md`, `testing-strategy.md` e equivalentes pt-BR
- `docs/stories/FND-1/story.md`, `validation.md` e equivalentes pt-BR
- Pares shardados: `docs/prd/` ↔ `docs/pt-BR/prd/`, `docs/front-end-spec/` ↔ `docs/pt-BR/front-end-spec/`, `docs/fullstack-architecture/` ↔ `docs/pt-BR/fullstack-architecture/`, `docs/architecture/` ↔ `docs/pt-BR/architecture/` e `docs/front-end-architecture/` ↔ `docs/pt-BR/front-end-architecture/`.
- `docs/pt-BR/stories.md`


#### FND-7 — Widgets locais configuráveis para overlay do OBS

**Status:** Draft — Spec Pipeline aprovado por PM/PO/Arquitetura/QA; implementação não iniciada. **Prioridade:** P0 funcionalidade/segurança; P1 guias bilíngues. **Issue:** [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7). **Story:** `docs/pt-BR/stories/FND-7/story.md`; validação: `docs/pt-BR/stories/FND-7/validation.md`; spec/plano técnico (English): `docs/stories/FND-7/spec/` e `docs/stories/FND-7/plan/`; os artefatos JSON/YAML ficam em inglês para manter os contratos de implementação canônicos. **Escopo:** Browser Source local do OBS, um campo atômico ou texto fixo por widget, estilos/capabilities independentes e SLA de atualização de 2s testado com oito widgets ativos. FND-5/FND-6 concluídas e revisão UX são gates bloqueantes; não reduzir o catálogo. Sem código, testes do produto ou compatibilidade OBS alegados. FND-0 permanece como baseline original do MVP.
