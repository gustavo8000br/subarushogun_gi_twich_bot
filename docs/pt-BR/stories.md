# Stories de desenvolvimento

[English](../stories.md)

## Fundação do produto: bot local de filas da Twitch para Genshin Impact

**Fonte:** Especificação do usuário “Prompt 1 — Bot local de filas da Twitch para Genshin Impact”, recebida em 2026-10-02.  
**Status do planejamento:** Spec Pipeline e Greenfield Fullstack/Service/UI aprovados; sharding AIOX concluído. A operadora escolheu manter o painel mutável obrigatório, com CLI-first como diretriz do framework AIOX e sem CLI de domínio adicional. Story Development Cycle começou pela FND-1, validada GO (9/10), agora InProgress.  
**Complexidade:** COMPLEX. Os requisitos abrangem infraestrutura local, concorrência no PostgreSQL, operações financeiras duráveis, OAuth, APIs e EventSub da Twitch, recuperação, segurança local, comportamento no chat e painel bilíngue.  
**Regra de execução:** Cada incremento de comportamento começa com um teste que falha pelo comportamento ausente, seguido por Green e Refactor. Registrar neste arquivo e na versão em português o comando exato e os resultados observados. Nenhum resultado de teste é declarado antes de sua execução.

### Sequência de entregas

A ordem abaixo segue as etapas sugeridas na especificação. Cada story deve ser refinada e validada pelo fluxo de stories do AIOX antes da implementação. Os testes são escritos antes da implementação dentro de cada story; garantias de integração usam uma instância isolada real de PostgreSQL e migrations reais.

#### FND-1 — Identidade de versão e fundação do runtime local

**Status:** InProgress (validação PO GO, 9/10).  
**Story:** `docs/stories/FND-1/story.md` e equivalente pt-BR; validação em `docs/stories/FND-1/validation.md` e `docs/pt-BR/stories/FND-1/validation.md`.  
**Evidência TDD:** política/CLI de versão, Compose/bootstrap, migrations PostgreSQL e comportamento do grupo do segredo concluíram ciclos Red/Green/Refactor registrados. Verificações operacionais de primeira execução/reinício passaram neste Docker Engine Linux; documentação bilíngue de operação e scripts/gates lint/typecheck ainda faltam para concluir a story.

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

**Escopo:** Scripts/testes de identidade SemVer/runtime; documentação/changelogs bilíngues; bootstrap Compose, PostgreSQL, migrations, saúde e scripts de início.  
**Critérios de aceite:**

- A identidade runtime segue `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`, com `0.1.0`, `alpha` e `0000000` antes da materialização Git.
- Testes de validação/materialização cobrem consistência das fontes, SHA de sete caracteres, marcador sem Git, falha ao descobrir Git, materialização do artefato e ausência de alteração da versão em validações comuns.
- Compose inicia bootstrap → PostgreSQL saudável → migrations → bot sem root; banco não publica porta no host, volumes nomeados persistem e scripts normais nunca removem volumes.
- Schema PostgreSQL e migrations SQL aplicam as restrições especificadas para chaves de fila, entradas ativas, resgates e idempotência; testes de integração usam PostgreSQL isolado e migrations reais.
- Documentos em inglês e equivalentes em `docs/pt-BR/` existem com links recíprocos e instruções operacionais consistentes.
- **Evidência TDD:** ver os ciclos observados de versão, Compose/bootstrap, regressão do runtime, PostgreSQL, discovery de testes e scripts de qualidade acima. Documentação bilíngue completa de operação e itens restantes de aceitação ainda estão pendentes.

#### FND-2 — Domínio de filas, validação, ordenação e parser

**Status:** Rascunho  
**Escopo:** Regras puras do domínio, tratamento de UID, parser de comandos, decisões de autorização e operações de fila com transações.  
**Critérios de aceite:**

- Transições e fotografias das políticas financeiras seguem a tabela, sem transições inválidas ou de estado terminal para ativo.
- UID aceita somente string de nove dígitos ASCII após `trim` no modo visível; o modo oculto descarta sem persistir nem divulgar.
- Parser trata caixa, espaços repetidos, variantes com acento, nomes reservados, aliases, quantidade de argumentos e restrições de identidade de viewers.
- Testes PostgreSQL comprovam unicidade de usuário ativo por fila e tratamento de concorrência; mudanças de ordem são atômicas e preservam a ordem persistida.
- **Evidência TDD:** pendente; registrar Red, Green, Refactor e comandos somente quando executados.

#### FND-3 — Outbox durável e recuperação financeira

**Status:** Rascunho  
**Escopo:** Máquina de estados da outbox, worker, leases, retries, auditoria e confirmação do estado remoto do resgate.  
**Critérios de aceite:**

- Uma transição terminal local, entrada de auditoria e intenção financeira única são confirmadas atomicamente antes de qualquer chamada à Twitch.
- Reinício recupera tarefas pendentes e leases vencidos; timeout/resposta perdida é reconciliado com a Twitch antes de retry; estado remoto oposto aparece como conflito.
- 429, 401/revogação, falhas transitórias, falhas permanentes e resultados desconhecidos permanecem observáveis e recuperáveis sem falsa confirmação.
- Testes de integração PostgreSQL comprovam unicidade, atomicidade transacional, recuperação de lease e recuperação de resgate rejeitado.
- **Evidência TDD:** pendente; registrar Red, Green, Refactor e comandos somente quando executados.

#### FND-4 — OAuth Twitch, adaptadores e reconciliação

**Status:** Rascunho  
**Escopo:** Pesquisa em documentação oficial, credenciais/OAuth Twitch, persistência/renovação de token, propriedade de recompensa, EventSub WebSocket, adaptadores Helix e reconciliação de recuperação.  
**Critérios de aceite:**

- `docs/integrations.md` registra fontes oficiais datadas, versões compatíveis fixadas das bibliotecas, escopos e operação → endpoint/evento → escopo → adaptação do SDK.
- Validação de Client ID/Secret usa Client Credentials; OAuth usa state único vinculado à sessão; segredos/tokens nunca aparecem em respostas, URLs ou logs.
- Somente recompensas próprias deste app são gerenciadas; vínculo de broadcaster/app impede troca insegura de conta; elegibilidade e escopos necessários são verificados.
- EventSub add/update e reconciliação paginada deduplicam por ID do resgate e tratam com segurança update antes de add, falhas parciais, eventos terminais e reconexões.
- Testes de adaptador usam fakes; integração PostgreSQL real cobre tokens persistidos, deduplicação e recuperação. Nenhum sucesso real da Twitch é alegado sem credenciais autorizadas.
- **Evidência TDD:** pendente; registrar Red, Green, Refactor e comandos somente quando executados.

#### FND-5 — Comandos de chat, chamadas, ciclo de atendimento e propriedade da conta

**Status:** Rascunho  
**Escopo:** Parser/execução de comandos Twitch, autorização, notificações, recuperação de timeout, confirmação de limpeza e estado de conta atual.  
**Critérios de aceite:**

- Caminhos de comando e timer usam o mesmo serviço de domínio; deduplicação por ID da mensagem, autorização broadcaster/mod/VIP, verificação de canal e cooldown de viewer seguem a especificação.
- Notificação de chamada é durável, privacidade é consultada no envio, timeout começa somente após envio confirmado e iniciar atendimento impede ausência.
- Limpeza exige mesmo ator/canal/fila e conjunto ativo inalterado em até 15 segundos; caso contrário não ocorre mutação nem operação de pontos.
- Troca automática de conta vale somente para chamada individual e somente sua proprietária pode retornar ao padrão ao encerrar; mudanças e reset manuais persistem e são auditados.
- Testes cobrem concorrência, reinício, falha de notificação, mudança de privacidade e ausência de efeitos financeiros indevidos.
- **Evidência TDD:** pendente; registrar Red, Green, Refactor e comandos somente quando executados.

#### FND-6 — Painel local, API protegida e documentação operacional

**Status:** Rascunho  
**Escopo:** UI/API local Fastify, assistente de instalação/reconexão, operações de filas e resgates, proteção de sessão local/CSRF/Host/Origin e guias operacionais.  
**Critérios de aceite:**

- Painel expõe somente operações especificadas; API retorna projeções explícitas e nunca serializa entidades Prisma ou segredos.
- `/api/state` exige sessão e distingue versão do produto, versão do contrato da API e revisão do estado; UID obedece à política de visibilidade atual.
- Mutações validam schemas, sessão, CSRF, chave de idempotência e revisão aplicável; proteção contra DNS rebinding ocorre antes dos handlers administrativos.
- Conteúdo controlado por usuário é renderizado como texto; testes cobrem HTML malicioso, host/origin/CSRF, callback OAuth e não exposição de segredos.
- READMEs documentam instalação, login, comandos, política de pontos, recuperação, iniciar/parar/atualizar/logs e identidade de versão nos dois idiomas.
- **Evidência TDD:** pendente; registrar Red, Green, Refactor e comandos somente quando executados.

### Notas e gates do planejamento

- O prompt do usuário é a fonte dos requisitos; este plano não introduz comportamento adicional ao produto.
- A documentação oficial de Twitch, Twurple, Prisma, PostgreSQL e Docker deve ser conferida antes da implementação dessas integrações.
- Gates de qualidade do projeto: `npm run lint`, `npm run typecheck` e `npm test`; a especificação do produto também exige testes de integração PostgreSQL, migrations, Compose e política de versão. Ainda não foram executados.
- Criação de release ou tag está fora do escopo desta tarefa de fundação. Promoção de estágio exige aprovação humana explícita.
- Este plano não declara stories aprovadas, implementadas, testadas, aprovadas por QA ou concluídas.
- O preflight de ambiente AIOX verificou Git/GitHub CLI/Node/npm/Docker/Compose e autenticação GitHub; o remoto privado existe na branch `main`. Arquivos de runtime/package do produto aguardam TDD FND-1.
- Artefatos de planejamento: `docs/project-brief.md`, `docs/prd.md`, `docs/front-end-spec.md`, `docs/fullstack-architecture.md`, `docs/architecture.md`, `docs/front-end-architecture.md` e `docs/planning-validation.md`, cada qual com documento correspondente em `docs/pt-BR/`.
- A configuração AIOX `markdownExploder` está ligada. `@kayvan/markdown-tree-parser` v1.6.1 foi instalado globalmente e gerou shards do PRD, especificação frontend e arquiteturas fullstack/serviço/frontend em inglês e pt-BR; os nomes foram alinhados entre idiomas com links recíprocos.
- Um erro de sintaxe JSON foi encontrado na validação dos artefatos e corrigido antes de prosseguir; depois disso, todos os JSON de planejamento foram parseados com sucesso. Foi uma correção documental do planejamento, não comportamento da aplicação nem evidência TDD.
- A operadora escolheu manter o painel mutável obrigatório e confirmou CLI-first como diretriz do framework AIOX; não é necessária CLI de domínio adicional.

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
