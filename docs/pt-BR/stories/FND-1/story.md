# Story FND-1: Identidade de Versão e Fundação do Runtime Local

[English](../../../stories/FND-1/story.md)

**Complexidade:** COMPLEX
**Executor:** @dev
**Quality gate:** @architect
**Ferramentas do quality gate:** Vitest, integração com PostgreSQL isolado, configuração/aceitação Docker Compose, checklist DOD de story AIOX
**Épico/capacidade:** Fundação do produto, FND-1
**Fonte:** `docs/stories/FND-0/spec/spec.md`; `docs/stories/FND-0/spec/plan.json`; `docs/prd.md`; `docs/fullstack-architecture.md`; `docs/architecture.md`; `docs/framework/tech-stack.md`; `docs/framework/testing-strategy.md`.

## Status

**InProgress**

## Story

**Como** streamer instalando o bot local de filas,
**quero** inicializar identidade de runtime, segredos locais, banco de dados e migrations de forma determinística,
**para que** o painel abra sem configuração manual e os dados permaneçam recuperáveis após reinícios.

## Critérios de Aceitação

1. Fontes de versão validam SemVer base em `package.json`, estágio permitido em `.release-stage` e identidade runtime completa em `VERSION`; antes de Git, o valor é `v0.1.0-0000000-alpha`. Materialização usa exatamente sete hexadecimais do commit de origem e não grava o próprio SHA no commit que o produz.
2. Validação/inicialização comum não altera arquivos de versão. Git ausente usa marcador somente quando metadados Git não existem; se Git existe e a descoberta do commit falha, materialização falha.
3. Primeira execução Compose faz bootstrap idempotente → PostgreSQL saudável → migrations Prisma concluídas → bot sem root. Senha aleatória do banco persiste e é montada em leitura no db/migrate/bot; não é impressa, armazenada em `.env`/YAML do produto ou regenerada para banco inicializado.
4. PostgreSQL não publica porta no host; bot publica `127.0.0.1:3000:3000`, Fastify escuta em `0.0.0.0`, aguarda saúde do banco/conclusão de migrations e fornece healthchecks/encerramento gracioso. Scripts normais nunca removem volumes.
5. Prisma CLI/client/adapter fixados juntos em 6.19.3, `prisma-client-js`, `prisma.config.mjs` e `pg`; migrations impõem unicidade/integridade de chaves globais de fila, resgates, entrada ativa parcial, fonte/ID e operações financeiras.
6. Suite real de integração PostgreSQL isolado executa migrations versionadas e comprova restrições/persistência/reinício; verificações Compose usam configuração Compose real. Sem SQLite ou Prisma mock como substituto.
7. Scripts raiz executam `docker compose up --build -d`, aguardam o endereço publicado configurado, tentam abrir navegador no host e imprimem endereço exato alternativo. No Windows, caminhos do projeto com espaços funcionam.
8. Contrato do estado/endpoint runtime lê identidade completa sem confundi-la com versão do contrato API ou revisão do estado; URL do banco, senha e outros segredos não aparecem em erros/logs.
9. Arquivos da aplicação ficam em `apps/web`, `apps/api`, `apps/infra`; `.env.example` AIOX permanece intacto como scaffolding e não é carregado como configuração do produto.
10. Documentação/changelogs de instalação/versão/integração/stories em inglês e pt-BR são equivalentes e ligados. Registrar somente comandos e evidências realmente observados.

## Escopo

Inclui: base de package/tooling, validação/materialização exata da versão runtime, imagem Docker e grafo Compose, bootstrap persistente de segredo único, schema PostgreSQL/Prisma e migrations SQL, scripts de início/saúde/encerramento, infraestrutura de teste de integração isolada e documentação operacional/de versão bilíngue necessária a esses comportamentos.

Fora de escopo: domínio de fila, credenciais/OAuth Twitch, chamadas Twitch reais, comandos e implementação do painel. Pertencem a FND-2 a FND-6 e cada qual terá seu ciclo TDD.

## Notas de Desenvolvimento

### Arquitetura e restrições de implementação

- Código de app somente em `apps/*`; `Dockerfile`, `compose.yaml`, scripts de início, package e docs da raiz são pontos de entrada/tooling. Não reutilizar `.env.example`.
- Versões exatas: imagem Node `node:24.20.0-bookworm-slim`; PostgreSQL `postgres:18.6-bookworm`; Prisma CLI/client/adapter `6.19.3`; Vitest `5.0.3`. Confirmar tags/suporte antes do build.
- Connection string runtime é montada no backend com host Compose `db` e senha montada, com URL encoding correto antes de carregar Prisma. Nunca imprimir.
- Volumes de segredo/banco são nomeados e persistentes. Bootstrap executa uma vez. Usar dependências Compose `service_healthy` e `service_completed_successfully`.
- Restrições SQL podem complementar Prisma. Estados ativos: `waiting`, `called`, `in_progress`; fonte `manual` ou `redemption`. Não apagar histórico fisicamente.
- Bot Docker sem root; escuta `0.0.0.0` somente dentro do contêiner e publica loopback por padrão. Não escolher outra porta automaticamente se ocupada.
- Versão runtime usa marcador versionado por padrão; build com Git descobre SHA completo e deriva exatamente sete hexadecimais, tratando falha como erro.
- Trabalho de infraestrutura/persistência: @data-engineer apoia revisão de migrations; @devops revisa segurança de contêiner/deploy. Sem release/tag/push.

### Sequência TDD obrigatória

Para cada comportamento abaixo, criar/executar primeiro o teste e observar falha comportamental; registrar saída exata nesta story e em `docs/stories.md`/`docs/pt-BR/stories.md`. Só então implementar o mínimo, obter Green, refatorar separadamente e reexecutar suite afetada. Dependência ausente, erro de sintaxe ou Docker indisponível não contam como Red.

1. Teste de versão antes do módulo/CLI de versão.
2. Teste de contrato Compose antes de configuração de serviços, Docker/scripts de bootstrap/início.
3. Teste de migration com PostgreSQL real antes de schema Prisma/migration SQL.
4. Teste Compose de primeira execução/reinício antes de mudanças operacionais para satisfazê-lo.
5. Documentação acompanha comportamento observado; declarar verificações de plataforma bloqueadas, sem alegar paridade sem evidência.

### Casos unitários/integração obrigatórios

- Gramática exata de identidade completa, somente SemVer base, estágio permitido, consistência, sete hex, marcador sem Git, Git ausente/malformado, falha de descoberta, prefixo exato do commit, materialização somente do artefato e preservação de arquivos em validação comum.
- Topologia/ordem Compose, sem porta DB no host, bind loopback, senha persistente única, montagens read-only, usuário não root, saúde, encerramento gracioso e nenhum volume removido.
- Migrations PostgreSQL reais: namespace de chaves, identificadores únicos de resgate/mensagem/idempotência, usuário ativo parcial, integridade de fonte/ID e persistência de resgate rejeitado.
- Compose primeira execução, migrations antes do bot, persistência após recriação e URL exata dos scripts. Testar cada plataforma host antes de declarar compatibilidade.

### Limitações conhecidas

- Owner/mode de secret Compose baseado em arquivo varia entre Engine/Desktop. Plataforma não exercitada permanece não verificada.
- Sem credenciais Twitch; esta story não faz alegações de teste real da Twitch.
- Repositório não tem commit no momento. `VERSION` mantém marcador `0000000` até materializar artefato de commit existente. Não criar commit com SHA autorreferencial.

## Tarefas / Subtarefas

- [x] 1. Funções de política de versão — Red/Green/Refactor concluídos (AC: 1, 2)
  - [x] 1.1 Adicionar/executar testes Vitest para SemVer base, consistência das fontes, estágios, marcador sem Git, prefixo do commit completo e erros de descoberta.
  - [x] 1.2 Implementar funções puras ESM de validação/materialização em `apps/infra/src/version.mjs` após Red observado; provar Green.
  - [x] 1.3 Remover exportação acessória não utilizada e reexecutar testes afetados; comportamento preservado.
- [x] 2. Contrato de arquivos/CLI da versão — Red/Green/Refactor concluído (AC: 1, 2, 8)
  - [x] 2.1 Adicionar/executar testes dos arquivos de versão, validação somente leitura, descoberta Git exata e materialização somente do artefato; capturar Red comportamental.
  - [x] 2.2 Implementar `VERSION`, `.release-stage`, CLI de validação e materialização somente após Red observado; comprovar que validação não grava fontes de versão.
  - [x] 2.3 Refatorar resolução de paths CLI e reexecutar testes unitários/integração de versão.
- [x] 3. Contrato Compose/bootstrap — Red/Green/Refactor e regressão runtime Linux verificados (AC: 3, 4, 7, 9)
  - [x] 3.1 Testes Compose observaram comportamentos Compose/segredo ausentes antes da implementação.
  - [x] 3.2 Implementar bootstrap one-shot, Compose, imagem e scripts após Red.
  - [x] 3.3 Regressões de porta avançada e segredo ilegível foram reproduzidas e corrigidas; contrato Compose e `docker compose config --quiet` passam.
- [x] 4. Migrations e restrições PostgreSQL — Red/Green em banco real verificados (AC: 5, 6)
  - [x] 4.1 PostgreSQL isolado e migration real observaram ausência de tabelas/restrições.
  - [x] 4.2 Implementar schema Prisma e migration SQL; contrato de migration PostgreSQL real passa.
  - [x] 4.3 Validar schema Prisma e repetir testes de migration/Compose; 9 passaram.
- [x] 5. Resposta de saúde informa versão runtime e estado explícito das dependências (AC: 4, 8)
  - [x] 5.1 Adicionar testes da versão, resultado da consulta real ao banco, Twitch não configurada e falha de banco sanitizada; observar Red.
  - [x] 5.2 Implementar projeção de saúde e ler `VERSION` do runtime; testes focados passam.
  - [x] 5.3 Reconstruir imagem local e conferir resposta via loopback; executar testes, lint e typecheck completos.
- [ ] 5. Aceitação operacional e documentação (AC: 3, 4, 6, 7, 9, 10)
  - [x] 5.1 Adicionar/executar aceitação Compose isolada de primeira execução/reinício; health, migrations reais, marcador persistido, hash do segredo estável e parada/início gracioso do bot foram verificados.
  - [x] 5.2 Verificar health, encerramento gracioso, ordem Compose e volumes persistentes; helper POSIX passou com cópia do projeto em caminho com espaços e fallback de abertura do navegador. Batch Windows foi conferido estruturalmente, mas não executado neste host Linux.
  - [x] 5.3 Criar READMEs centrais e referência de integrações em inglês/pt-BR com links recíprocos; registrar evidência Red/Green/Refactor do contrato documental e atualizar changelogs pareados.
- [x] 6. Gates de qualidade e evidências (AC: todos; execução Windows permanece como item explícito de aceitação aberto)
  - [x] 6.1 `npm run lint`, `npm run typecheck`, `npm test`, integração PostgreSQL/migrations, config/aceitação Compose e checks de versão passam em Linux.
  - [x] 6.2 Atualizar os dois índices de stories e file list/checklist com resultados observados; manter FND-1 InProgress enquanto a execução Windows não estiver disponível.

## Testes

- Suite Vitest unitária: política/helpers de versão (sem token Twitch).
- Suite Vitest de contrato: configuração YAML/processos Compose e saúde.
- Integração PostgreSQL: banco isolado, migrations reais e restrições/contenção impostas pelo banco.
- Aceitação Compose: imagem real local, bootstrap, ordem, usuário não root, persistência de reinício e segredo em cada SO declarado.
- Checagens estáticas: `docker compose config`, sintaxe/lock, `npm run lint`, `npm run typecheck`, `npm test`.
- Evidências Red/Green/Refactor estão registradas em `docs/stories.md` e na contraparte em inglês. Execução Windows não é alegada.

## Revisão Estática Local e Gates de Qualidade

**Tipo da story**: Fundação de infraestrutura e banco de dados
**Agente principal**: @dev
**Revisões especializadas**: @architect, @data-engineer e @devops continuam pendentes.

**Gates de qualidade**
- [x] Scanner local OpenGrep `1.30.0`, com regras versionadas no repositório, executado: 2 regras em 19 arquivos JavaScript, 0 achados.
- [x] `tests/unit/aiox-static-review.test.js` e `tests/unit/opengrep-quality-gate.test.js` passaram (4 testes).
- [ ] Revisões formais de arquitetura, banco de dados e operação de containers.

**Procedimento**: `npm run review:static`. O scanner reporta achados e retorna falha conforme a regra bloqueante; não edita arquivos. A revisão humana AIOX permanece separada.

**Foco**: HTML inseguro e logging de credenciais. A execução nativa do script `.bat` continua sem verificação nesta máquina Linux.

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-02 | 0.1.0 | Desenvolvimento iniciado (modo interativo) — Status: Ready → InProgress | @dev |
| 2026-10-02 | 0.1.0 | Validação PO GO (9/10) — Status: Draft → Ready | @po |
| 2026-10-02 | 0.1.0 | Story criada a partir do planejamento aprovado; ainda sem evidência de implementação. | @sm |

## Registro do Agente Dev

### Modelo do Agente

Pendente implementação.

### Referências de Debug Log
- TDD da migração da análise estática: `tests/unit/aiox-static-review.test.js` falhou primeiro porque a Layer 2 não executava o comando configurado; outro Red revelou a fase ausente no executor. O comportamento passou depois. Uma asserção no repositório encontrou arquivos gerados de registry desatualizados, que foram regenerados. Comando direcionado final: `npm test -- --run tests/unit/aiox-static-review.test.js tests/unit/opengrep-quality-gate.test.js` — 4 passaram.
- TDD do gate: `tests/unit/opengrep-quality-gate.test.js` falhou inicialmente pela ausência do template/comando; outro Red encontrou a flag bloqueante `--error` ausente. A execução direcionada final acima passou.
- Gates finais: `npm test` — 23 arquivos/145 testes passaram; `npm run lint`, `npm run typecheck`, `npm run review:static` (19 arquivos JS da aplicação/0 achados), `npm run validate:version`, `docker compose config --quiet`, `git diff --check` e validação estrita de sync IDE (109/109, sem divergências) passaram.

- `npm test -- --run tests/unit/version-policy.test.js` — Red: 11 falhas, 0 sucessos após endurecer os testes. O módulo não existia; exports ausentes falharam asserções de comportamento. Execução preliminar anterior (8 falhas/3 sucessos) foi descartada porque testes de entrada inválida podiam passar por um `TypeError` de função ausente.
- `npm test -- --run tests/unit/version-policy.test.js` — Green: 11 sucessos após implementar as funções puras.
- `npm test -- --run tests/unit/version-policy.test.js` — Refactor: 11 sucessos após remover exportação desnecessária.

### Notas de conclusão

Funções de versão, Compose/bootstrap, schema de migration, runtime Linux, documentação bilíngue de operação/integrações, aceitação Compose e gates Linux desta rodada foram validados. FND-1 permanece InProgress porque `iniciar.bat` ainda não foi executado em Windows nativo; não é possível afirmar seu comportamento runtime neste ambiente Linux.

## Lista de Arquivos

- `package.json`
- `package-lock.json`
- `.opengrep/rules.yml`
- `.aiox-core/core/quality-gates/layer2-pr-automation.js`
- `.aiox-core/core/orchestration/workflow-executor.js`
- `tests/unit/aiox-static-review.test.js`
- `tests/unit/opengrep-quality-gate.test.js`

- `tests/unit/version-policy.test.js`
- `apps/infra/src/version.mjs`
- `apps/infra/src/version-files.mjs`
- `apps/infra/scripts/validate-version.mjs`
- `apps/infra/scripts/materialize-version.mjs`
- `.release-stage`
- `VERSION`
- `compose.yaml`
- `Dockerfile`
- `apps/infra/src/bootstrap-secret.mjs`
- `apps/infra/src/database-url.mjs`
- `apps/infra/scripts/bootstrap.mjs`
- `apps/infra/scripts/migrate.mjs`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/202610020001_foundation/migration.sql`
- `apps/api/prisma/migrations/migration_lock.toml`
- `tests/integration/postgres-foundation.test.js`
- `tests/integration/compose-contract.test.js`
- `tests/unit/bootstrap-secret.test.js`
- `tests/unit/database-url.test.js`
- `tests/unit/local-ignore-policy.test.js`
- `tests/unit/test-discovery-contract.test.js`
- `tests/unit/quality-script-contract.test.js`
- `vitest.config.js`
- `eslint.config.js`
- `tsconfig.json`
- `.dockerignore`
- `.gitignore`
- `iniciar.sh`
- `iniciar.bat`
- `apps/infra/scripts/healthcheck.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/health-route.mjs`
- `apps/api/src/web-route.mjs`
- `apps/web/index.html` e `apps/web/styles.css`
- `tests/unit/health-route.test.js`
- `tests/unit/web-route.test.js`
- `tests/unit/documentation-contract.test.js`
- `tests/unit/start-script.test.js`
- `tests/integration/compose-runtime.test.js`
- `tests/integration/compose-contract.test.js`
- `README.md` e `README.pt-BR.md`
- `docs/integrations.md` e `docs/pt-BR/integrations.md`
- `docs/stories.md` e `docs/pt-BR/stories.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md` e changelogs equivalentes pt-BR
- `docs/VERSIONING.md` e `docs/pt-BR/VERSIONING.md`
- `.aiox-core/core/quality-gates/quality-gate-config.yaml`
- Fontes do planejamento constam na entrada FND-0 de `docs/stories.md`.
