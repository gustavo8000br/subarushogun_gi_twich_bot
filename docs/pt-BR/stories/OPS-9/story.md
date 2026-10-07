# OPS-9 — Regras unificadas de acesso a comandos sem modos de compatibilidade

[English](../../../stories/OPS-9/story.md)

**Status:** Done
**Arquitetura:** `$aiox-architect` validou um único modelo hierárquico para comandos configuráveis e limites fixos de cargo para comandos protegidos.
**Prioridade:** Crítica, antes da FND-9.

## História

Como streamer,
quero que todos os comandos do chat usem um modelo coerente de permissões,
para entender o público efetivo de cada comando sem diferenças escondidas entre configurações antigas e novas.

## Escopo e política

A hierarquia de cargos do produto é `everyone < follower < subscriber < vip < moderator < streamer`. Essa hierarquia é uma política do produto, não uma classificação definida pela Twitch. Comandos configuráveis usam um cargo mínimo e herdam acesso para os níveis superiores. O streamer sempre tem acesso pelo ID de broadcaster. VIP continua sujeito ao toggle atual; seguidores continuam verificados pelo escopo Twitch aprovado e falham fechados quando o status é desconhecido.

Comandos de gestão da fila e `!queue ping` têm mínimo fixo de `moderator`. `!conta <nome>` e `!conta reset` têm mínimo fixo de `streamer`. O painel e configurações salvas não podem enfraquecer esses limites. Os demais comandos mantêm níveis mínimos configuráveis individualmente.

Não haverá suporte runtime a listas explícitas de cargos, modo `legacy_exact` ou versões anteriores do schema de permissões. A migration do banco redefine somente a configuração salva de permissões de comandos para os novos padrões e avança sua revisão. Filas, entradas, credenciais OAuth, outras configurações, volumes Docker e segredos da instalação são preservados.

## Critérios de aceite

1. Cada item do catálogo declara um contrato de acesso normalizado: nível mínimo configurável ou limite mínimo fixo. Nenhum comando depende de um caminho de autorização por listas de cargos.
2. Autorização no chat, ajuda do chat, catálogo do painel e projeções da API usam o mesmo resolver. Evidências continuam vindo da identidade do broadcaster, badges confiáveis da mensagem do canal atual e verificação existente de seguidores.
3. Níveis configuráveis incluem Todos, Seguidores, Inscritos, VIPs e Moderadores. Cargos superiores herdam acesso. O painel mostra a audiência efetiva completa; “Todos” enumera os cargos incluídos.
4. Comandos de gestão continuam fixos em Moderador; alterações da conta atual continuam fixas em Streamer. Tentativas de salvar políticas para comandos fixos falham sem efeitos colaterais.
5. Respostas de ajuda continuam filtradas pelos cargos verificados de quem chamou e não aceitam cargo ou identidade de destino fornecidos por quem envia o comando.
6. Novas configurações persistidas usam um schema atual único e um `minimumRole` por comando configurável. O runtime não contém modo de política por lista explícita nem parser/desvio para schema antigo.
7. Uma migration PostgreSQL real redefine somente a configuração de permissões, incrementa sua revisão, registra auditoria sanitizada e é idempotente. Testes de integração verificam settings não relacionados; o SQL escreve somente em settings e auditoria, sem tocar nos registros do produto.
8. Testes cobrem categorias de comandos, limites da herança, toggle de VIP, follower desconhecido/falha, limites fixos, filtragem da ajuda, políticas malformadas, revisão desatualizada, atualizações concorrentes, atualizações OAuth transacionais de follower, migration e ausência de efeitos não autorizados.
9. Story, documentação e changelogs em inglês e pt-BR permanecem equivalentes. Garantias unitárias e de integração passam; testes PostgreSQL usam migrations reais em banco isolado.

## Tarefas

- [x] Definir o catálogo uniforme e o contrato das políticas (AC 1–5).
- [x] Escrever testes Red para resolver, persistência e migration antes das implementações correspondentes (AC 1–8).
- [x] Implementar o modelo em chat, API, persistência e painel; remover caminhos runtime antigos (AC 1–6).
- [x] Adicionar e validar a migration PostgreSQL; preservar registros não relacionados (AC 7–8).
- [x] Atualizar story, roadmap, versionamento e changelogs nos dois idiomas (AC 9).
- [x] Executar gates do projeto e receber PASS da revisão independente do `$aiox-qa`.

## Notas de desenvolvimento

- As evidências e a hierarquia de cargos existentes estão documentadas na OPS-7. O requisito anterior de compatibilidade da OPS-7 é substituído por esta story autorizada pelo proprietário porque nenhum streamer usa o produto.
- Limites fixos aparecem atualmente nos metadados de `apps/api/src/commands/catalog.mjs`; persistência em `apps/api/src/persistence/queue-repository.mjs`; projeção do painel em `apps/web/command-catalog-view.mjs` e `apps/web/app.js`.
- Não remova nem recrie os volumes Docker ativos. Testes de migration devem usar o harness PostgreSQL isolado já existente ou outra instância PostgreSQL descartável.
- TDD é obrigatório para cada mudança de comportamento e migration. Registre comandos e resultados Red/Green realmente observados antes de declarar conclusão.

## Plano de testes e qualidade

- Unitários: políticas canônicas, matriz de autorização, filtragem da ajuda e exibição segura de cargos.
- Integração PostgreSQL: migration Prisma real, escopo da redefinição de settings, auditoria, revisão e concorrência.
- Gates estáticos: `npm run lint`, `npm run typecheck`, `npm run review:static`, `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, `git diff --check`.
- Revisores: `$aiox-architect` valida o modelo; `$aiox-qa` verifica comportamento, coerência, evidências e concisão; `$aiox-dev` implementa.

## Evidências TDD

- **Catálogo/resolver:** `npm test -- --run tests/unit/command-catalog.test.js -t 'one configurable or fixed minimum-role contract|configurable threshold through inherited role rank'` — Red, 2 falhas porque os comandos não tinham contrato `access` normalizado e o resolver ignorava o cargo mínimo informado. Green: o mesmo comando focado passou após implementar catálogo e resolver. Refactor: `npm test -- --run tests/unit/command-catalog.test.js tests/unit/hierarchical-command-policy.test.js tests/unit/command-catalog-view.test.js tests/unit/command-authorization.test.js tests/unit/chat-command-handler.test.js tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js tests/integration/command-policy-persistence.test.js tests/integration/command-policy-v3-migration.test.js` — 9 arquivos / 106 testes passaram após todos os consumidores adotarem o resolver compartilhado.
- **Comportamento da migration PostgreSQL:** o teste foi escrito antes da migration. Com o SQL temporariamente vazio, `npm test -- --run tests/integration/command-policy-v3-migration.test.js` falhou porque a configuração antiga continuou inválida no schema v3. Com o SQL implementado, a mesma suíte PostgreSQL isolada passou 2/2, cobrindo avanço da revisão, preservação de setting não relacionado, auditoria e idempotência. A tentativa preliminar de remover o arquivo produziu Prisma P3015 antes dos testes de comportamento; ela está explicitamente excluída como evidência de comportamento.
- **Projeção de audiência do painel:** `npm test -- --run tests/unit/command-catalog-view.test.js -t 'projects the complete inherited audience'` — Red, falhou porque `projectMinimumRoleAudience` não existia. Green/refactor: a projeção compartilhada agora alimenta a projeção do catálogo e os rótulos da audiência; `npm test -- --run tests/unit/command-catalog-view.test.js tests/integration/panel-localization-contract.test.js` passou 25/25, com lint/typecheck/diff passando depois.
- **Contrato do painel/localização:** `npm test -- --run tests/integration/panel-localization-contract.test.js tests/unit/command-catalog.test.js tests/unit/command-catalog-view.test.js tests/integration/command-policy-v3-migration.test.js` passou 4 arquivos / 30 testes antes do último refactor de audiência. Suíte completa final: `npm test` — 88 arquivos / 723 testes. Gates finais: `npm run lint`, `npm run typecheck`, `npm run review:static` (0 achados), `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet` e `git diff --check` passaram. Execução local; não houve autorização Twitch real nem envio de mensagem real.
- **Smoke test da instalação (2026-10-07):** o proprietário executou `docker compose up -d --build` na instalação existente e manteve seus volumes. `/health` retornou `{"status":"ok","product_version":"v0.12.0-0000000-alpha","dependencies":{"database":"connected","twitch_api":"ineligible","twitch_api_ping_ms":195}}`. Depois, o painel HTTPS mostrou o banco conectado, canal Twitch inelegível em português localizado e latência de 195 ms. A migration rodou pelo Compose; nenhuma recompensa ou mensagem de chat foi enviada.

## Lista de arquivos

- `apps/api/src/commands/catalog.mjs`, `authorization.mjs`, `chat-handler.mjs`, `help.mjs`
- `apps/api/src/http/queue-routes.mjs`, `persistence/queue-repository.mjs`, `twitch/integration.mjs`
- `apps/api/prisma/migrations/20261007120000_unified_command_policy/migration.sql`
- `apps/web/app.js`, `command-catalog-view.mjs` e `localization/catalogs/panel/{en,es,pt-BR}.tsv`
- `apps/shared/localization/discover-catalog-module.mjs`
- Cobertura unitária e de integração PostgreSQL em `tests/unit/` e `tests/integration/`
- `docs/integrations.md` e `docs/pt-BR/integrations.md`
- Story OPS-9 bilíngue, índices de stories, roadmap, documentação de versão, changelogs, `package.json`, `package-lock.json` e `VERSION`

## Histórico

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-10-07 | 0.12.0 | Cria escopo unificado de permissões autorizado pelo proprietário; substitui o requisito de compatibilidade por um único contrato hierárquico. | @sm |
| 2026-10-07 | 0.12.0 | Implementa schema v3, resolver compartilhado, pisos fixos, migration PostgreSQL isolada, projeção do painel e changelogs bilíngues. | @dev |
| 2026-10-07 | 0.12.0 | QA Gate PASS — Status: InReview → Done | @qa |

## Resultados de QA

### Data da revisão: 2026-10-07

### Revisado por: Quinn (Arquiteto de Testes)

Os nove critérios de aceite foram verificados contra o catálogo, o caminho compartilhado de autorização, as gravações protegidas da API/persistência, a projeção bilíngue do painel, a migration PostgreSQL real e isolada e as evidências de teste. A suíte completa passou 88 arquivos / 723 testes; lint, typecheck, OpenGrep, validadores de localização/versão, configuração Compose e diff passaram. Não há achado de alta severidade. Não foram executados autorização Twitch real, entrega de chat nem operações reais de pontos.

### Estado do gate

Gate: PASS → docs/qa/gates/OPS-9-unified-command-access.yml
