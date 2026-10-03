# Story FND-2: Domínio de filas, validação, ordenação e parser

[English](../../../../stories/FND-2/story.md)

**Status:** InProgress<br>
**Executor:** @dev<br>
**Quality gate:** @architect<br>
**Ferramentas do quality gate:** Vitest, testes de integração PostgreSQL isolado com migrations Prisma reais, lint, typecheck<br>
**Complexidade:** COMPLEX<br>
**Fonte:** `docs/stories/FND-0/spec/spec.md`; `docs/stories/FND-0/spec/requirements.json`; `docs/prd/functional-requirements.md`; `docs/architecture/persistence-contract.md`; `docs/architecture/internal-boundaries.md`; `docs/framework/testing-strategy.md`; `docs/framework/source-tree.md`; `apps/api/prisma/schema.prisma`; `apps/api/prisma/migrations/202610020001_foundation/migration.sql`.

## História

**Como** streamer que gerencia várias filas de atividades,<br>
**quero** que regras de fila, transições de entradas, ordenação, tratamento de UID, parsing de comandos e autorização sejam consistentes e persistam corretamente,<br>
**para que** entradas e histórico de atendimento permaneçam corretos no uso normal e em operações concorrentes.

## Dependências e limites

- Depende do schema PostgreSQL, migrations, runtime e base de testes da FND-1. A FND-1 segue InProgress apenas pela execução do `.bat` em Windows; a fundação existente de Linux/PostgreSQL está disponível para esta story.
- FND-3 é responsável pelo processamento durável da outbox financeira, retries e confirmação remota. FND-2 deve expressar e auditar decisões de transição sem afirmar que reembolso ou consumo foi concluído.
- FND-4 é responsável por autenticação e adaptadores da API Twitch em produção; FND-5, por dispatch do chat/EventSub, notificações, timers e troca de conta; FND-6, pela interface de operação.
- Esta story cria pontos de entrada reutilizáveis de domínio/aplicação. Não adiciona cadastro público, identidade por UID, movimentação entre filas, comportamento de frontend ou chamadas reais da Twitch.

## Critérios de aceite

1. Toda transição suportada passa por um único serviço de domínio e segue a tabela do produto; transições inválidas, de terminal para ativo, `waiting → completed` e `in_progress → no_show` são rejeitadas sem efeitos no banco ou fora dele. Cada transição aceita persiste estado anterior/seguinte, ator, origem e motivo na auditoria.
2. Decisões financeiras usam a fotografia da política da fila no momento da transição: remoção em espera solicita cancelamento; remoção após chamada e saída do próprio viewer usam políticas distintas; ausência usa sua política; limpeza/remoção segue a precedência definida. Entradas manuais nunca criam operações de resgate. Esta story registra uma decisão, não executa worker de outbox nem declara confirmação remota.
3. Tratamento de UID aceita exatamente nove dígitos ASCII após remover espaços externos no modo `visible`. Rejeita dígitos Unicode, espaços internos, texto adicional e tamanhos incorretos. No modo `hidden`, qualquer valor fornecido é descartado antes de persistência, auditoria, resposta ou log. Ao mudar uma fila para `hidden`, UIDs armazenados são apagados e testes provam que nenhum valor antigo permanece nas projeções retornadas.
4. Slug e aliases usam ASCII minúsculo `/^[a-z0-9-]{2,24}$/`, compartilham namespace global único e rejeitam palavras reservadas. Criar/editar chaves mantém um slug por fila e impede colisão com slug ou alias de outra fila. Restrições de ciclo de vida para filas arquivadas/em exclusão/excluídas seguem a especificação.
5. O parser puro em pt-BR aceita formas iniciadas pelo slug/alias da fila, caixa variada, espaços repetidos e variantes de comandos com/sem acento; retorna resultados estruturados de sintaxe/ajuda para quantidade inválida de argumentos; não executa comandos nem infere permissão. Login é comparado sem diferenciar caixa e continua distinto do nome de exibição.
6. Autorização é decisão pura baseada somente no ID do broadcaster e metadados/badges confiáveis da mensagem atual do mesmo canal. Viewer só consulta/sai usando sua identidade do evento; privilégios de moderador/VIP não são inferidos de nick, menção ou texto. `allow_vip_management` começa como false.
7. Operações de entrada apoiadas em PostgreSQL preservam ordem persistida, acrescentam novas esperas ao final, mantêm posições contínuas e separam chamados/em atendimento. Reordenação é atômica e local à fila; histórico terminal não é reordenado nem reativado.
8. Testes de integração com PostgreSQL real e migrations versionadas comprovam no máximo uma entrada ativa por `(queue_id, twitch_user_id)`, integridade dos identificadores entre resgates/entradas, tratamento de adições duplicadas concorrentes, ordenação atômica sob mutações concorrentes e conversão de conflitos de unicidade previstos em resultado de domínio, sem erro fatal. Não usar SQLite nem Prisma mock como evidência.
9. Testes unitários e de integração cobrem matriz de transições/políticas, casos de UID, gramática do parser, aliases/reservas/colisões, regras de autorização, operações de ordem, disputas de usuário duplicado e ausência de chamadas/registros financeiros indevidos.
10. Todos os incrementos seguem Red → Green → Refactor observados. Registros em inglês e pt-BR contêm comportamento, comando exato, falha comportamental observada no Red, resultado Green e refatoração/reteste. Não marcar comportamento como concluído se o teste de integração PostgreSQL não pôde ser executado.

## Escopo

Inclui: políticas puras de fila/entrada, serviço de domínio para transições, validação de UID/nome, regras de chaves de fila, gramática pura de comandos e predicado de autorização, operações de repositório para filas/entradas, transações/coordenação PostgreSQL necessárias e testes unitários/de integração. Exclui: worker e mutações financeiras da outbox, Twitch/EventSub, handlers efetivos do chat, notificações/timers de chamada, comportamento de conta e telas do painel.

## Tarefas / Subtarefas

- [x] 1. Definir transições puras e decisões de política de entrada (AC: 1, 2)
  - [ ] 1.1 Adicionar primeiro testes da matriz de transições; executar e registrar Red comportamental antes de implementar.
  - [ ] 1.2 Implementar função pura de transição/política e contrato do serviço de domínio em `apps/api/src/domain/`.
  - [ ] 1.3 Cobrir regras por origem, fotografia das políticas, atualizações terminais externas e transições proibidas; após refatoração, executar novamente os testes afetados.
- [x] 2. Implementar validação de chaves e privacidade de UID (AC: 3, 4)
  - [ ] 2.1 Adicionar testes de UID ASCII, trim, descarte no modo oculto, gramática de chaves, reservas e colisões antes da implementação.
  - [ ] 2.2 Adicionar validadores mínimos e operações de domínio das chaves; provar que `hidden` apaga UID persistido e projeções de domínio antigas.
  - [x] 2.3 Adicionar verificações PostgreSQL com migrations reais para unicidade do namespace e integridade de origem/identificador; criar migration somente se uma falha comportamental observada exigir.
- [x] 3. Implementar parser puro pt-BR e autorização (AC: 5, 6)
  - [ ] 3.1 Testar gramática fila-primeiro, caixa, espaços, acentos, aridade/ajuda, distinção login-nome de exibição, identidade viewer, canal e badges confiáveis.
  - [ ] 3.2 Implementar parser puro separado de autorização e dispatch em `apps/api/src/commands/`.
  - [ ] 3.3 Manter `allow_vip_management` false salvo configuração explícita; provar que texto não confiável no corpo não concede permissão.
- [x] 4. Implementar persistência PostgreSQL e ordenação de fila/entradas (AC: 7, 8)
  - [x] 4.1 Escrever primeiro testes de integração em PostgreSQL real isolado, usando migrations reais; comprovar as falhas comportamentais observadas antes do repositório.
  - [x] 4.2 Implementar transações curtas e coordenação no banco para operações de criar/adicionar/reordenar; preservar ordem persistida e posições contínuas.
  - [x] 4.3 Resolver disputas de unicidade de usuário ativo como duplicata rejeitada/decisão de cancelamento sem derrubar o processo. Não chamar Twitch nem afirmar efeito em pontos.
  - [x] 4.4 Verificar ordenação concorrente, limites entre filas, duplicatas e constraints de origem/identificador. Corridas adicionais de chamada/movimentação/timeout ficam em FND-5.
- [ ] 5. Completar gates e evidência bilíngue (AC: 9, 10)
- [x] 5.1 Executar testes direcionados após cada refatoração e, ao cumprir aceite, gates `npm run lint`, `npm run typecheck`, `npm test`.
- [x] 5.2 Registrar comandos e resultados Red/Green/Refactor em ambas as stories e índices; atualizar checklist e lista de arquivos.
  - [ ] 5.3 Solicitar revisão de qualidade @architect antes de alterar o status desta story para Done.

## Notas de desenvolvimento

### Contrato de domínio e persistência

- Estados ativos são `waiting`, `called`, `in_progress`. Terminais: `completed`, `removed`, `no_show`; terminal nunca volta a ativo. Posições de espera são contínuas `1..N`; outros estados ativos não têm posição de espera. Novas entradas vão ao fim da espera; reordenação manual deve ser preservada na recuperação. [Fonte: `docs/stories/FND-0/spec/spec.md` §6–§8; `docs/architecture/persistence-contract.md`]
- Identidade é `twitch_user_id`; `user_login` é normalizado para busca/apresentação e `display_name` serve somente à apresentação. Um viewer participa de várias filas, mas no máximo uma vez ativamente por fila. [Fonte: `docs/stories/FND-0/spec/spec.md` §6; `docs/prd/functional-requirements.md` FR-5]
- Origem da entrada é `manual` ou `redemption`; registros manuais não têm redemption ID, os de resgate exigem um. A migration existente inclui índice parcial de usuário ativo e restrição de UID. Manter nomes SQL/Prisma consistentes e usar migrations para restrições não expressas pelo Prisma. [Fonte: `apps/api/prisma/schema.prisma` modelos `Queue`, `QueueKey`, `Entry`, `Redemption`; `apps/api/prisma/migrations/202610020001_foundation/migration.sql`]
- Transições, auditoria e persistência de fila/entrada pertencem ao único serviço de domínio/aplicação. Rotas, futuros handlers de chat, timers e reconciliação chamam esse serviço, sem editar status diretamente. Transações são curtas e não fazem I/O externo. [Fonte: `docs/architecture/internal-boundaries.md`; `docs/architecture/persistence-contract.md`]
- FND-3 acrescentará criação atômica de intenção na outbox às transições terminais. Até lá, testar decisão/resultado da transição e provar ausência de chamada financeira/Twitch acidental; decisão local de política não equivale à confirmação remota. [Fonte: `docs/architecture/financial-outbox-contract.md`; FND-0 §8]

### Validação, parser e autorização

- Regra de UID específica do produto: remover espaços externos e validar `/^[0-9]{9}$/` com dígitos ASCII; persistir como string. No modo oculto, não persistir nem retornar UID de evento ou inclusão manual. [Fonte: FND-0 §6]
- Chaves de fila seguem ASCII minúsculo `/^[a-z0-9-]{2,24}$/`. Reservadas: `add remover sair posicao proximo atender concluir mover abrir fechar limpar confirmar filas conta lista`. Slug e aliases compartilham namespace. [Fonte: FND-0 §12]
- Parser é puro, aceita `posicao/posição` e `proximo/próximo`, espaços extras e caixa variada, e retorna resultado de sintaxe sem dispatch. Não comparar usuário pelo nome de exibição. [Fonte: FND-0 §6, §12]
- Permissões usam identidade broadcaster do evento e badges confiáveis da mensagem atual do mesmo canal. Corpo, display name, menção ou texto que imita badge não são dados de autorização. `posicao`/`sair` de viewer usam sempre a identidade Twitch do próprio evento. [Fonte: FND-0 §12]

### Estrutura do projeto e testes

- JavaScript ESM com JSDoc; módulos em `apps/api/src/domain/`, `apps/api/src/commands/` e `apps/api/src/persistence/`. Não adicionar TypeScript ao runtime da aplicação nem expor entidades Prisma aos chamadores. [Fonte: `docs/framework/source-tree.md`; `docs/framework/coding-standards.md`; `docs/framework/tech-stack.md`]
- Testes unitários Vitest ficam em `tests/unit/`; persistência/concorrência em `tests/integration/`, com PostgreSQL isolado e migrations reais. SQLite e mocks de Prisma não provam atomicidade/restrições. [Fonte: `docs/framework/testing-strategy.md`]
- Cada comportamento começa por um teste executado que falha por ausência da regra. Erros de sintaxe/dependência/ambiente não contam como Red. Depois da implementação, executar o mesmo teste, refatorar, executar de novo e registrar somente o observado nos dois idiomas. [Fonte: política TDD obrigatória do usuário; `docs/framework/testing-strategy.md`]

## Testes

- Unitários: matriz completa de transições, combinações true/false das políticas, origens manual/resgate, terminais externos, UID aceito/rejeitado e modo oculto, sintaxe/aliases do parser, palavras reservadas, autorização e fronteiras de permissão.
- Integração PostgreSQL: aplicar migrations reais em banco isolado; comprovar índice parcial de unicidade, integridade origem/ID, namespace único, IDs estáveis de fila, ordem transacional e mutações concorrentes.
- Regressões/efeitos negativos: nenhuma chamada Twitch na FND-2; nenhuma intenção financeira apresentada como confirmada; nenhum UID rejeitado/oculto em linha persistida, auditoria ou projeção; adição duplicada/falha deixa somente a entrada ativa permitida.
- Verificações finais obrigatórias: `npm run lint`, `npm run typecheck`, `npm test`, comando direcionado de integração PostgreSQL, `git diff --check`.

## Revisão Estática Local e Gates de Qualidade

**Análise do tipo da story**<br>
**Tipo principal**: API/domínio e banco de dados<br>
**Tipos secundários**: Segurança, concorrência, persistência<br>
**Complexidade**: COMPLEX

**Atribuição de agentes especializados**
- Primário: @dev
- Apoio: @data-engineer (transações/restrições PostgreSQL), @architect (fronteiras de domínio e revisão), @qa (cobertura)

**Quality gates**
- [x] Pre-commit: @dev executa testes direcionados, gates obrigatórios, revisão estática OpenGrep e revisão do diff.
- [ ] Revisão de domínio/banco: @architect verifica propriedade das transições, limite da transação, corridas e ausência de I/O remoto na transação.
- [ ] @data-engineer revisa migration e evidências de concorrência PostgreSQL.

**Procedimento de revisão:** Execute `npm run review:static` com OpenGrep `1.30.0` fixado e `.opengrep/rules.yml`. Essa análise estática local baseada em regras não é revisão contextual por IA. Não há licença CodeRabbit; não invoque a CLI ou serviço hospedado. Registre a revisão humana/AIOX separadamente.

**Focos**: nenhuma gravação direta de status fora do serviço de domínio; nenhum vazamento de UID; nenhuma identidade/autorização inferida de texto de apresentação; comportamento correto do índice parcial; rollback e ordem corretos com mutações PostgreSQL concorrentes; nenhuma afirmação de efeito financeiro/Twitch antes de FND-3/FND-4.

## Histórico de alterações

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-03 | 0.1.0 | Rascunho da FND-2 a partir dos requisitos aprovados e contrato PostgreSQL existente; sem evidência de implementação. | @sm |
| 2026-10-03 | 0.1.0 | Validação PO GO (9/10) — Status: Draft → Ready. | @po |
| 2026-10-03 | 0.1.0 | Incrementos parciais de domínio e repositório PostgreSQL implementados com TDD; story permanece InProgress porque despacho de aplicação, evidências restantes, gates e revisão de qualidade estão incompletos. | @dev |
| 2026-10-03 | 0.1.0 | Adiciona o serviço unificado de transição e direciona os testes PostgreSQL por ele; 2 testes unitários focados e 13 testes de integração PostgreSQL real passam. Revisões formais @architect/@data-engineer continuam pendentes. | @dev |

## Registro do agente de desenvolvimento

### Modelo do agente utilizado

GPT-6 Codex, persona @dev.

### Referências ao log de depuração

- `npm test -- --run tests/unit/entry-transitions.test.js` — primeira tentativa do harness: nenhum teste coletado porque o módulo importado ainda não existia; foi falha de importação/ambiente, não um Red válido.
- `npm test -- --run tests/unit/entry-transitions.test.js` — Red comportamental contra contrato vazio: 12 testes, 4 falharam por ausência de rejeição/resultado de transição e semântica de estado externo. Após corrigir a tabela de teste para corresponder à especificação, a nova execução teve 12 testes, 1 falha / 11 aprovados: conclusão externa estava solicitando incorretamente outra operação financeira.
- `npm test -- --run tests/unit/entry-transitions.test.js` — Green após implementar a função de decisão de transição: 12 aprovados.
- `npm run typecheck` — a checagem de refatoração encontrou tipos JSDoc incompletos (campos `refund...` e `Error.code`); o primeiro ajuste da anotação encontrou incompatibilidade na entrada de um helper. Corrigidos tipos/construção do erro; execução final de `npm run typecheck` passou.
- `npm run typecheck && npm test -- --run tests/unit/entry-transitions.test.js` — Refactor/reteste: typecheck passou; 12 testes de transição passaram.
- `npm run lint -- --no-warn-ignored` — passou para os novos arquivos de domínio/teste.
- `npm test -- --run tests/unit/uid.test.js` — Red: 11 falharam contra o contrato vazio do validador, cobrindo normalização aceita, formatos rejeitados, valores opcionais/obrigatórios e descarte em modo oculto.
- `npm test -- --run tests/unit/uid.test.js` — Green: 11 passaram após implementar validação ASCII, trim externo, erros genéricos seguros e descarte no modo oculto.
- `npm test -- --run tests/unit/uid.test.js && npm run typecheck && npm run lint` — Refactor/reteste: 11 passaram, typecheck passou, lint passou.
- Gates completos antes do incremento UID: `npm test` — 55 aprovados; `npm run lint`, `npm run typecheck`, `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram. Após a implementação UID, suíte focada, lint e typecheck passaram; suíte completa será reexecutada no próximo checkpoint de aceite.
- `npm test -- --run tests/unit/command-parser.test.js` — Red do contrato do parser contra implementação vazia: 18 testes, 11 falharam / 7 passaram.
- `npm test -- --run tests/unit/command-parser.test.js` — primeira execução da implementação expôs erro no fixture: a forma `add login uid` que se supunha rejeitada é válida pela gramática; fixture trocado por argumento extra em `remover`. Isso não foi registrado como Red comportamental.
- `npm test -- --run tests/unit/command-parser.test.js` — Red de regressão: 19 testes, 1 falha / 18 passaram porque `!<fila>` sem subcomando resultava em `join`, violando entrada exclusiva por resgate/inclusão manual. Após mudar para `lista`, Green: 19 passaram.
- `npm test -- --run tests/unit/command-parser.test.js && npm run typecheck && npm run lint` — refactor/reteste do parser passou: 19 testes, typecheck e lint.
- `npm test -- --run tests/unit/queue-keys.test.js` — Red: 25 falharam contra o contrato vazio de chaves. Green: 25 passaram após normalização de caixa ASCII, gramática/palavras reservadas e colisão interna da fila. `npm test -- --run tests/unit/queue-keys.test.js && npm run typecheck && npm run lint` passou.
- `npm test -- --run tests/unit/command-authorization.test.js` — Red: 6 falharam contra contrato vazio de autorização. Green: 6 passaram após regras de identidade/canal/badges/VIP. Regressão adicional mostrou moderador usando `sair outra-pessoa` (1 falha / 6 passaram); após rejeitar argumentos para `posicao`/`sair` de autoatendimento, 7 passaram. Suíte focada, typecheck e lint passaram.
- `npm test -- --run tests/integration/queue-repository.test.js` — Red inicial: 4 falhas porque operações do repositório não existiam. O teste inicia PostgreSQL isolado e aplica migrations Prisma reais. Foram implementadas criação/adição/movimentação, substituição de chaves, limpeza de privacidade de UID e persistência de transição/auditoria. Execuções revelaram desserialização `void` do Prisma e colisão no formato do resultado; fixtures foram corrigidas para respeitar ordem de aquisição do lock e evitar uma colisão prévia de alias. Defeitos foram corrigidos e os testes afetados passaram em etapas com 4, 6 e 8 casos.
- `npm test -- --run tests/integration/queue-repository.test.js` — verificação adicional, sem mudança de comportamento: 12 passaram, cobrindo participação em filas diferentes, duplicata por fila, adição manual em fila fechada, rejeição em filas arquivadas/em exclusão, movimentos concorrentes, chaves globais/rollback, limpeza de UID, transição/auditoria persistidas e rejeição no banco de combinações inconsistentes de origem/ID de resgate. As assertions finais verificam migrations existentes e não alteraram o código da aplicação.
- O teste PostgreSQL de contrato de origem/identificador inicialmente rejeitou a expectativa específica `P2004`: Prisma 6.19.3 apresentou a violação PostgreSQL `entries_source_redemption_check` como `PrismaClientUnknownRequestError`. Foi incompatibilidade da assertion, não falha do comportamento do banco. A verificação passou a conferir a constraint nomeada; `npm test -- --run tests/integration/queue-repository.test.js` passou com 12 testes.
- Foi adicionado teste PostgreSQL de concorrência para decisões simultâneas `called → completed` e `called → removed`. `npm test -- --run tests/integration/queue-repository.test.js` passou com 13 testes: uma transição terminal e uma auditoria são confirmadas; a concorrente é rejeitada após observar o estado terminal. A cobertura foi adicionada após implementação da transação/lock; não se declara Red e não houve mudança no comportamento da aplicação.
- **Red do serviço unificado de transição:** `npm test -- --run tests/unit/queue-domain-service.test.js` — 2 testes falharam porque o stub de contrato não tinha o comportamento `transitionEntry`. É falha comportamental, não de sintaxe/dependência.
- **Green e integração da persistência:** o mesmo comando unitário passou 2 testes após criar `createQueueDomainService`; `npm test -- --run tests/integration/queue-repository.test.js` passou 13 após direcionar por esse serviço os casos de transição persistida. A transação carrega a entrada com lock e a política atual da fila, solicita a decisão ao serviço de domínio e confirma status/ordem/auditoria em conjunto. Transições inválidas não persistiram status nem auditoria; não houve outbox nem operação Twitch.
- **Refatoração/reteste:** verificações paralelas iniciais encontraram exportação stub duplicada e tipo JSDoc incompleto; não foram aceitos como Red. Após corrigir, `npm run typecheck && npm run lint` passou, e as duas suites focadas passaram novamente. A revisão do diff confirmou `createQueueDomainService.transitionEntry` como caminho de decisão usado pelos chamadores.
- A revisão manual cobriu a decisão/serviço de transição, validadores de UID/chaves, parser, autorização, limites transacionais do repositório PostgreSQL, constraints da migration e assertions de integração. Nenhum defeito adicional foi encontrado. O dispatch runtime de chat/EventSub pertence às stories posteriores de integração.

### Notas de conclusão

Implementados decisões/fotografias de políticas de transição, validação de UID e chaves, parser puro e autorização, criação de fila/inclusão manual/ordenação/privacidade de UID PostgreSQL e transições auditadas pelo único `createQueueDomainService`. A integração PostgreSQL real e isolada passou 13 testes e cobre corridas de inclusão, participação em filas diferentes, integridade origem/ID de resgate, unicidade/rollback de chaves, reordenação e decisões terminais concorrentes, limpeza de UID, auditoria e regras de inclusão manual. O serviço registra intenção financeira local; não declara outbox nem confirmação remota. FND-2 permanece InProgress até a revisão formal @architect/@data-engineer. Handlers de chat/EventSub e importação de resgates pertencem a FND-4/FND-5; execução financeira pertence a FND-3.

Última verificação Linux: `npm test` passou 22 arquivos/142 testes; `npm run test:integration` passou 5 arquivos/28 testes, incluindo a suite PostgreSQL real; passaram também `npm run lint`, `npm run typecheck`, `npm run review:static` (19 arquivos JavaScript, 0 achados), `npm run validate:version`, `docker compose config --quiet` e `git diff --check`. Sign-offs formais dos revisores AIOX continuam desmarcados.

### Lista de arquivos

- `apps/api/src/domain/entry-transitions.mjs`
- `tests/unit/entry-transitions.test.js`
- `apps/api/src/domain/uid.mjs`
- `tests/unit/uid.test.js`
- `apps/api/src/domain/queue-keys.mjs`
- `tests/unit/queue-keys.test.js`
- `apps/api/src/commands/parser.mjs`
- `tests/unit/command-parser.test.js`
- `apps/api/src/commands/authorization.mjs`
- `tests/unit/command-authorization.test.js`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/domain/queue-service.mjs`
- `tests/unit/queue-domain-service.test.js`
- `tests/integration/queue-repository.test.js`

## Resultados de QA

Revisão formal @architect/@data-engineer e QA pendente.
