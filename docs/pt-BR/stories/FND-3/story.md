# Story FND-3: Outbox Financeira Durável e Recuperação

[English](../../../stories/FND-3/story.md)

**Status:** Done<br>
**Executor:** @dev<br>
**Quality gates:** @architect, @data-engineer, @qa<br>
**Complexidade:** COMPLEX<br>
**Fonte:** `docs/pt-BR/stories.md` FND-3; `docs/pt-BR/architecture/financial-outbox-contract.md`; `docs/pt-BR/architecture/persistence-contract.md`; especificação do produto §8–§10 e §17.

## História

Como streamer que opera um bot local de filas da Twitch,<br>
quero que cada operação de pontos sobreviva a falhas de processo e rede e permaneça auditável,<br>
para nunca anunciar reembolso ou consumo confirmado sem confirmação da Twitch e exigir uma decisão explícita do operador quando o resultado não puder ser conhecido.

## Escopo e estado atual

A outbox PostgreSQL, intenção terminal atômica, idempotência de intenção, recuperação de lease, worker de retry, recuperação de resgates rejeitados e comparação com estado remoto já existem. Esta story fecha os critérios restantes e executa a auditoria completa da matriz de falhas. Entrega de chat permanece um efeito separado e não altera a intenção financeira.

Inclui: persistência e worker financeiro da outbox, recuperação/reconciliação de solicitações incertas, retry/reconexão, projeções seguras de operações, reconhecimento explícito pelo operador de resultado irrecuperavelmente desconhecido e evidência de integração PostgreSQL. Exclui: ciclo de vida das recompensas Twitch (FND-4), redesign do painel (FND-6), garantias de execução exatamente uma vez na rede e confirmação real da Twitch sem credenciais autorizadas.

## Critérios de aceite

1. Transição terminal local, fotografia da política, auditoria e uma intenção financeira estável por resgate são confirmadas atomicamente antes de I/O remoto. Entradas manuais nunca criam operações financeiras.
2. Workers obtêm lease sem manter transação aberta durante chamadas externas; leases vencidos são recuperáveis; somente o detentor do lease atual pode finalizar; retries usam backoff/jitter limitado e respeitam limites 429 aplicáveis.
3. Respostas perdidas são reconciliadas com a Twitch antes de retry. Estado final correspondente confirma; estado final oposto gera conflito; 401/revogação pausa tentativas automáticas; 404/histórico indisponível permanece desconhecido.
4. Resgates rejeitados sem entradas guardam dados seguros suficientes para retomar cancelamento após reinício. Eventos EventSub/reconciliação repetidos ou fora de ordem não repetem efeitos locais nem regridem estado terminal.
5. Operações pendentes, em retry, em execução, confirmadas, em conflito, falhas, desconhecidas e resolvidas manualmente continuam visíveis e auditáveis. Falha no envio de chat é independente.
6. Para resultado irrecuperavelmente desconhecido, o operador pode reconhecer explicitamente a incerteza. A auditoria registra ator, origem, estado anterior/seguinte da operação e motivo seguro fixo; a operação passa a `resolved_manual`. A ação não altera a intenção financeira nem o estado remoto, não declara confirmação Twitch e impede retry automático daquela intenção.
7. Testes de integração usam PostgreSQL isolado e migrations reais para atomicidade transacional, intenção única, claims concorrentes, fencing/recuperação de lease, resolução de desconhecido e recuperação de resgate rejeitado. Fakes limitam-se à fronteira Twitch.
8. Cada mudança de comportamento segue Red → Green → Refactor e registra evidência exata observada nesta story e na equivalente em inglês. Todos os gates passam antes de concluir.

## Tarefas

- [x] 1. Persistir intenção financeira terminal atomicamente com transição/auditoria local; verificar em PostgreSQL.
- [x] 2. Implementar claims, recuperação de lease, retry limitado e classificação de resultados; cobrir falhas com fakes Twitch.
- [x] 3. Recuperar cancelamento de resgate rejeitado e aplicar estado terminal remoto observado sem repetir efeitos.
- [x] 4. Adicionar reconhecimento explícito e auditável de resultado financeiro irrecuperavelmente desconhecido sem alterar a verdade remota ou a intenção.
  - [x] 4.1 Escrever primeiro teste de integração PostgreSQL para status permitido, ator/motivo de auditoria, intenção preservada e ausência de falsa confirmação.
  - [x] 4.2 Adicionar operação na API e controle no painel com revisão/confirmação clara; requisições inválidas/não autorizadas não alteram o banco.
  - [x] 4.3 Verificar que operação resolvida manualmente não é reclamada nem repetida pelo worker após reinício.
- [x] 5. Executar matriz completa de falhas e revisar atomicidade/fencing de lease; atualizar lista de arquivos e evidência bilíngue.

## Estratégia de testes e propriedades de segurança

- Migrations Prisma são aplicadas em containers PostgreSQL isolados; SQLite ou Prisma mock não comprovam transação/restrição.
- Chamadas Twitch usam fakes controláveis; nenhum teste alega reembolso ou consumo real.
- Verificar ausência de intenção duplicada, chamada externa antes do commit, falsa confirmação, retry após resolução manual, retry automático com autorização revogada e mutação por lease obsoleto.
- Gates necessários: `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, validação Prisma, `docker compose config --quiet` e `git diff --check`.

## Notas de arquitetura

- Banco é fonte de verdade para intenção local/auditoria; Twitch é fonte de verdade para estado remoto de pontos. Reconhecimento manual permanece visivelmente diferente de confirmação remota. [Fonte: `docs/architecture/financial-outbox-contract.md` §§1–5; especificação §8, §10]
- Nenhuma transação fica aberta durante I/O Twitch. Lease e idempotência persistem no PostgreSQL. [Fonte: `docs/architecture/persistence-contract.md`; `apps/api/prisma/schema.prisma` `Outbox`/`Redemption`]
- IDs e auditoria/logs técnicos continuam em inglês; texto de painel em pt-BR. Não persistir payload bruto de chat/resgate nem explicação livre do operador. [Fonte: especificação §2, §8, §15]

## Revisão de qualidade

- @architect: limites transacionais, máquina de estados e distinção entre reconhecimento manual e confirmação Twitch.
- @data-engineer: constraint de migration, idempotência e resolução concorrente de lease com PostgreSQL.
- @qa: rastreabilidade da matriz de falhas, efeitos negativos, reinício e não-retry do worker após resolução.
- Análise estática local: `npm run review:static` com `.opengrep/rules.yml`; achados bloqueiam conclusão.

## Evidências TDD

As evidências da implementação já existente estão resumidas em `docs/pt-BR/stories.md`, seção FND-3. Para resolução do operador, `npm test -- --run tests/integration/queue-repository.test.js -t 'operator resolution of unknown|outside unknown state'` primeiro falhou como esperado porque `resolveUnknownFinancialOperation` não existia (2 falhas). Após implementar, a execução PostgreSQL isolada passou nos dois casos: preservou `UNFULFILLED`/`CANCELED`, registrou `operator_resolved` e campos de auditoria seguros, e excluiu a operação de retry manual e de claims do worker; estado diferente de unknown permaneceu intacto. `npm test -- --run tests/unit/queue-routes.test.js tests/unit/web-route.test.js` passou 11 testes, incluindo negação/autorização CSRF, vínculo do ator, ação no painel e rótulo explícito de não confirmação. A refatoração manteve a operação em transação Prisma curta, usou `updateMany` condicional para um único vencedor e separou `resolved_manual` de estados confirmados pela Twitch. A migration PostgreSQL nova foi aplicada pelo harness de integração. A suíte completa primeiro encontrou uma asserção ampla demais (`claimNext() === null`), pois outros testes de integração deixam tarefas duráveis não relacionadas; restringimos a verificação ao ID resolvido e a suíte completa passou com 244 testes.

Para evento terminal Twitch recebido depois da resolução manual, `npm test -- --run tests/integration/queue-repository.test.js -t 'later Twitch terminal observation'` primeiro falhou porque a outbox permanecia `resolved_manual` apesar do evento autoritativo. Green inclui `resolved_manual` na reconciliação externa; a regressão PostgreSQL passou e agora atualiza a outbox para `confirmed`/`conflict` e registra o estado remoto real. A revisão de refatoração confirmou que a resolução manual encerra retries sem suprimir evidência Twitch posterior.

## Lista de arquivos

O contrato da política de ignore também falhou no Red porque `.gitignore` excluía todo arquivo SQL de migration. `tests/unit/local-ignore-policy.test.js` agora exige a exceção Prisma; após incluir `!apps/api/prisma/migrations/**/*.sql`, o teste focado passou (3 testes) e `git check-ignore -v` confirmou que os três SQLs de migrations ficam visíveis ao Git. Esse ajuste de gate permite entregar a nova migration de constraint e as migrations de schema existentes.

Alterados: `.gitignore`, `apps/api/prisma/migrations/202610020001_foundation/migration.sql`, `apps/api/prisma/migrations/202610030001_outbox_lease_token/migration.sql`, `apps/api/prisma/migrations/202610050001_manual_outbox_resolution/migration.sql`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/web/app.js`, `tests/integration/queue-repository.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/web-route.test.js`, `tests/unit/local-ignore-policy.test.js`, `docs/stories.md`, `docs/pt-BR/stories.md`, os dois documentos da FND-3 e os changelogs internos nos dois idiomas.

## Resultados de QA

PASS (2026-10-05). Revisão local de arquitetura verificou limites transacionais, fencing atômico de status e distinção entre reconhecimento manual e verdade Twitch; identificou e fechou a lacuna de observação EventSub posterior. Revisão de persistência verificou a migration versionada de check constraint aplicada em PostgreSQL isolado real, resolução condicional com um único vencedor, exclusão de retry e fencing de token de lease. QA rastreou a matriz FND-3 a fakes do worker e testes de integração PostgreSQL. Os gates completos finais após a correção da política de ignore estão registrados em `docs/pt-BR/stories.md`. Reembolso/consumo Twitch real não foi testado por falta de credenciais autorizadas; nenhum efeito remoto real é alegado.
