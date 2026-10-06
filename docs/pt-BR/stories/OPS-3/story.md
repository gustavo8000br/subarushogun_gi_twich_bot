# Story OPS-3: Catálogo de comandos e permissões por cargo

[English](../../../stories/OPS-3/story.md)

**Complexidade:** COMPLEXA. **Executor:** @dev. **Portão de qualidade:** @qa. **Issue GitHub:** [#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17).

## Status

**Done** — implementação, QA independente (PASS, 9,2/10), inspeção visual completa da página no Chrome e gates automatizados passaram. Publicação e merge do PR pertencem ao @devops.

## História

**Como** streamer que opera o bot de filas local,
**quero** consultar todos os comandos do chat no painel e controlar os comandos configuráveis por listas explícitas de cargos,
**para que** viewers saibam quais ações estão disponíveis e somente os cargos pretendidos possam executá-las.

## Critérios de aceite

1. O painel lista cada comando global e de fila implementado, sua sintaxe, finalidade, cargos efetivos e se a regra é fixa ou configurável.
2. O streamer pode editar listas explícitas entre moderador, VIP, inscrito e todos. O acesso do streamer é baseado na identidade; VIP continua sujeito ao toggle atual; qualquer cargo elegível da lista concede acesso, sem herança hierárquica.
3. A política inicial preserva permissões atuais, exceto `!conta <nome>` e `!conta reset`, que são exclusivos e imutáveis para o streamer.
4. Catálogo, ajuda no chat e autorização do backend usam a mesma política persistida; mudanças e auditoria sobrevivem a reinícios.
5. `!queue comandos` lista comandos globais e por fila disponíveis ao emissor; `!<fila> comandos` continua específico daquela fila. O streamer é direcionado ao painel; segue cooldown e limite de 500 caracteres.
6. A autorização usa somente a identidade do canal e badges atuais do evento Twitch. Não mantém cache de cargos antigos, não adiciona escopo de seguidores e não herda privilégios da origem do Shared Chat.
7. Comando negado não consulta entradas da fila, conta, usuário na Twitch, nem causa mutação ou efeito de outbox.
8. Rotas de política mantêm sessão, CSRF, validação, idempotência e controle otimista de versão; HTTP não consegue ampliar comandos imutáveis.
9. Cada comportamento segue Red → Green → Refactor. Garantias PostgreSQL usam banco isolado real e migrations; evidências são registradas aqui e no índice bilíngue.
10. Documentação em inglês e pt-BR permanece equivalente. Planejamento FND-7 e ativação de UX seguem adiados até a implementação desta story terminar.
11. `!queue ping` é imutável para streamer/moderador, informa `Pong 🏓`, versão em execução e latência Twitch em cache sem consultar Twitch a cada mensagem; `queue` é reservado e não pode ser chave de fila.

## Evidências TDD

- **Regressão dos cabeçalhos de release:** `npm test -- --run tests/unit/documentation-contract.test.js -t 'shipping changelog version'` Red — 1 falhou porque as novas notas técnicas `v0.4.0-alpha` apareciam depois do cabeçalho antigo `v0.3.0-alpha`. Green — o mesmo teste passou após mover cada cabeçalho `v0.4.0-alpha` para cima de suas notas e restaurar `v0.3.0-alpha` antes das notas antigas nos dois idiomas.

### Catálogo, parser, autorização e ajuda

- **Red:** `npm test -- --run tests/unit/command-catalog.test.js tests/unit/command-parser.test.js tests/unit/command-authorization.test.js` falhou pelo módulo de catálogo ausente, `!abismo comandos` não reconhecido e acesso de moderador a `!conta reset`.
- **Green:** mesmo comando passou 32/32 após adicionar o registro canônico, parser e autorização. Uma regressão VIP mostrou cargo apesar do toggle desligado; a extração foi ajustada e a suíte passou novamente.
- **Red de comandos globais:** `npm test -- --run tests/unit/command-parser.test.js tests/unit/command-authorization.test.js tests/unit/command-catalog.test.js tests/unit/queue-keys.test.js` relatou 6 falhas/56 sucessos por ausência de `!queue`, autorização de ping e aceitação de `queue` como slug. **Green/Refactor:** 62 testes focados passaram com atualização de parser/registro/autorização/reserva e consolidação no registro canônico.
- **Red/Green de política inválida:** `npm test -- --run tests/unit/command-catalog.test.js` encontrou política que não era array caindo em defaults permissivos; o tratamento fail-closed fez passar.
- **Red/Green de ajuda/ping:** `npm test -- --run tests/unit/command-help.test.js tests/unit/chat-command-handler.test.js` falhou por falta de ajuda e ping em cache; após handler e textos pt-BR, os testes afetados passaram (52 testes). Uma expectativa foi corrigida para o template `!<fila>`.
- **Refatoração focada:** registro, ajuda, handler, parser, autorização e chaves passaram 79 testes.

### Persistência PostgreSQL e API protegida

- **Red:** `npm test -- --run tests/integration/command-policy-persistence.test.js` iniciou PostgreSQL 18.6 descartável e aplicou `prisma migrate deploy` real; então 3 contratos falharam porque os métodos de persistência não existiam.
- **Green:** mesmo comando passou 3/3 após gravar listas na linha JSON de `Setting` e auditar transacionalmente. Refatoração removeu dependência desnecessária de receiver; persistência e testes de comandos/ajuda passaram 26.
- **Red:** `npm test -- --run tests/unit/queue-routes.test.js -t 'catalog|command policies'` encontrou rota de mutação ausente (404). **Green:** mesmo comando passou 2 testes de rota (30 ignorados), cobrindo catálogo com sessão, CSRF e ator. Middleware garante idempotência; schema rejeita comando imutável/cargo inválido.

### Painel e cache de health

- **Red:** `npm test -- --run tests/unit/panel-navigation.test.js tests/unit/health-route.test.js` teve 2 falhas: navegação `commands` voltava para overview e rota de health não expunha snapshot Twitch em cache.
- **Green:** após adicionar página/navegação Comandos e getter do cache `getTwitchHealth()`, os mesmos testes passaram.
- **Red/Green (caixa):** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'case-insensitive global command discovery'` falhou pois `!queue PING` não respondia. Normalizar a ação global fez passar. **Refatoração:** `npm test -- --run tests/unit/command-catalog-view.test.js tests/unit/panel-navigation.test.js tests/unit/health-route.test.js tests/unit/chat-command-handler.test.js tests/unit/command-help.test.js tests/unit/queue-routes.test.js -t 'command catalog|command policies|catalog|ping|health|navigation|role-aware|global command'` passou 20 testes; 40 não relacionados foram ignorados pelo filtro.
- **Regressão Red:** `npm test -- --run tests/unit/command-catalog-view.test.js -t 'keeps the panel catalog projection'` falhou porque a resposta da atualização de política não traz `commands` e a UI não conseguia aplicá-la ao catálogo carregado. **Green/Refatoração:** `npm test -- --run tests/unit/command-catalog-view.test.js` passou 3 testes após adicionar `mergeCommandPolicyState`; a página preserva linhas e cargos fixos após salvar.

### Regressão de QA: formato dos badges Twurple

- **Red:** `npm test -- --run tests/unit/eventsub-runtime.test.js -t 'Twurple badge objects'` reproduziu ponta a ponta a falha encontrada pelo QA. O evento de chat EventSub do Twurple fornece `badges` como mapa (`{ moderator: '1', subscriber: '12' }`), repassado sem alteração à autorização e classificado como `viewer`, negando `!fila proximo`.
- **Green:** a autorização agora aceita o mapa de objetos do Twurple e também arrays usados por eventos normalizados/fakes existentes. `npm test -- --run tests/unit/eventsub-runtime.test.js tests/unit/command-authorization.test.js tests/unit/chat-command-handler.test.js` passou 26 testes.

### Gates completos de qualidade

- `npm test -- --run tests/unit/command-catalog.test.js tests/unit/command-catalog-view.test.js tests/unit/command-parser.test.js tests/unit/command-authorization.test.js tests/unit/command-help.test.js tests/unit/chat-command-handler.test.js tests/unit/health-route.test.js tests/unit/queue-keys.test.js tests/unit/queue-routes.test.js tests/integration/command-policy-persistence.test.js` — 124 testes passaram em 10 arquivos antes da inclusão da regressão final de merge.
- Execução final de `npm run lint`, `npm run typecheck`, `npm test` — passou; **412 testes em 56 arquivos**.
- `npm run review:static` — OpenGrep analisou 48 arquivos JavaScript; 0 achados.
- Lint/typecheck separados de API, infra e web — passaram. `npm run validate:version` — `v0.4.0-0000000-alpha`; `docker compose config --quiet` e `git diff --check` — passaram.
- Reexecução focada após a correção do merge: `npm test -- --run tests/integration/command-policy-persistence.test.js tests/unit/command-catalog-view.test.js tests/unit/chat-command-handler.test.js tests/unit/health-route.test.js` — 25 testes passaram em 4 arquivos.
- Nenhuma mensagem real foi enviada ao chat nem recompensa foi alterada. O navegador do usuário aberto está conectado a uma conta Twitch e não foi usado. A verificação do painel no navegador continua pendente. A imagem Compose isolada foi buildada e iniciada conforme registrado abaixo.
- Aceite Compose limpo nesta worktree da feature: `APP_PORT=3217 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-clean-certs docker compose -p queuebot-ops3-clean up --build -d` concluiu bootstrap → PostgreSQL saudável → migrations → bot saudável. `/health` retornou `status=ok`, produto `v0.4.0-0000000-alpha`, banco `connected`, Twitch `not_configured`; contêiner executou como `10001:10001`. As cinco migrations estavam no banco novo.
- Smoke da API protegida nessa instalação isolada criou sessão local, carregou as 19 linhas do catálogo, enviou alteração protegida por CSRF/idempotência/versão e confirmou `queue:add=subscriber` na releitura. A escrita atingiu somente o banco de teste criado para esta tarefa, sem alterar a instância do usuário ou Twitch. Em seguida, o projeto temporário foi removido com `docker compose -p queuebot-ops3-clean down -v` e recriado pela imagem buildada; a instância atual é uma instalação limpa de primeira execução, sem linhas em `settings` e sem configuração Twitch.
- Após a correção encontrada pelo QA, o mesmo projeto isolado foi rebuildado com `APP_PORT=3217 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-clean-certs docker compose -p queuebot-ops3-clean up --build -d`. A primeira chamada HTTPS imediata correu antes da inicialização; a tentativa seguinte passou após a prontidão. O Compose reporta bot e PostgreSQL saudáveis; `/health` retornou banco `connected`, Twitch `not_configured` e produto `v0.4.0-0000000-alpha`. O banco limpo continua sem linhas em `settings`.

O QA independente inicialmente retornou FAIL (7/10) pela incompatibilidade de formato de badges do Twurple. Após a correção test-first, a revalidação foi PASS (9,2/10); o catálogo inteiro foi inspecionado visualmente no Chrome, sem alterar permissões salvas. A story está Done localmente. Publicação e merge do PR pertencem ao @devops. A pesquisa FND-7 e `$aiox-ux-design-expert` ainda não começaram.

## Tarefas

- [x] Implementar registro compartilhado de comandos e resolução pura por cargo.
- [x] Adicionar parser/ajuda filtrada por cargo, limitada e sem efeitos após negação.
- [x] Persistir políticas/auditoria com testes de PostgreSQL real e migrations.
- [x] Adicionar rotas protegidas de catálogo/políticas com CSRF, validação, idempotência e versão.
- [x] Adicionar página Comandos ao painel local com projeção segura.
- [x] Sincronizar documentos, concluir aceite e qualidade e obter revisão QA independente.

## Arquivos

### Notas de conclusão

- Adicionados catálogo de comandos por cargo no painel/chat, ajuda global e ping restrito, política PostgreSQL persistida/auditada, reserva da chave `queue` e leitura compartilhada do health Twitch em cache.
- Não foi necessária migration ou dependência runtime nova; política usa o registro JSON `Setting` existente e advisory lock transacional PostgreSQL.
- QA independente aprovado com 9,2/10; os 19 comandos e seleções de permissão foram inspecionados visualmente por toda a página no Chrome. Nenhuma configuração do painel foi alterada durante a revisão. Branch pronta para publicação e merge de PR pelo @devops.

### Modelo do agente

Codex GPT-6, atuando como orquestrador AIOX Master e executor da story.

#### Integração do patch de segurança e build Compose limpo

- Após integrar o patch de segurança a esta branch, `npm ci` resolveu `deepmerge-ts@8.0.2` pelo override restrito do Prisma Config; CLI/client/adapter Prisma permaneceram em 6.19.3. `npm audit --audit-level=high` informou 0 vulnerabilidades.
- `IMAGE_TAG=ops3-pr-final-20261006 APP_PORT=3222 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-pr-certs docker compose -p queuebot-ops3-pr-final build --no-cache` — as três imagens do app foram construídas; Prisma Client 6.19.3 foi gerado.
- `IMAGE_TAG=ops3-pr-final-20261006 APP_PORT=3222 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-pr-certs docker compose -p queuebot-ops3-pr-final up -d` — bootstrap concluiu, PostgreSQL ficou saudável, migrations terminaram com sucesso e healthcheck do bot ficou saudável. `curl -k https://localhost:3222/health` retornou `status: ok`, produto `v0.4.0-0000000-alpha`, banco `connected`, Twitch `not_configured`. Esta instalação isolada vazia permanece disponível na porta 3222; os projetos Compose existentes do streamer não foram tocados.

## Lista de arquivos

- `apps/api/src/commands/catalog.mjs`, `help.mjs`, `authorization.mjs`, `parser.mjs`, `chat-handler.mjs`
- `apps/api/src/domain/queue-keys.mjs`, `health-route.mjs`, `server.mjs`
- `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`
- `apps/web/index.html`, `app.js`, `panel-navigation.mjs`, `command-catalog-view.mjs`, `styles.css`
- `tests/unit/command-catalog.test.js`, `command-catalog-view.test.js`, `command-help.test.js`, `command-parser.test.js`, `command-authorization.test.js`, `chat-command-handler.test.js`, `health-route.test.js`, `queue-keys.test.js`, `queue-routes.test.js`
- `tests/integration/command-policy-persistence.test.js`; `tests/unit/documentation-contract.test.js`
- `tests/unit/eventsub-runtime.test.js`
- `README.md`, `README.pt-BR.md`, `docs/integrations.md`, `docs/pt-BR/integrations.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`, stories OPS-3 pareadas/spec e JSON de planejamento em `docs/stories/OPS-3/` e `docs/pt-BR/stories/OPS-3/`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `package.json`, `package-lock.json`, `VERSION`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/qa/gates/OPS-3-command-catalog.yml` e o par em pt-BR registram o gate independente aprovado.

## QA

 - **Revisão independente inicial:** FAIL, 7/10. Achado alto: o Twurple envia badges de chat como mapa de objetos, mas a autorização reconhecia somente arrays. Reprodução ponta a ponta: moderador classificado como viewer e `!fila proximo` negado.
 - **Revalidação:** PASS, 9,2/10 após teste de regressão e correção test-first. Revisor confirmou formatos de badge array/objeto, identidade do streamer, política de moderador, toggle/allowlist de VIP, allowlist de inscrito, `!conta reset` exclusivo do streamer e rejeição de privilégios de Shared Chat externo. Suíte focada: 37/37; OpenGrep: 0 achados; lint, typecheck e diff-check passaram. Revisor não editou código.
 - Gates completos após correção: `npm run lint`, `npm run typecheck`, `npm test` (56 arquivos, 413 testes) e `npm run review:static` (48 arquivos JS, 0 achados) passaram. Rebuild Compose limpo e smoke da API protegida estão registrados acima.

## Registro de alterações

| Data | Versão | Mudança | Agente |
| --- | --- | --- | --- |
| 2026-10-06 | 0.4.0 | Implementação e gates do desenvolvedor concluídos; status alterado para InReview. | @dev |
| 2026-10-06 | 0.4.0 | QA retornou FAIL (7/10); incompatibilidade de badge do Twurple reproduzida e corrigida com teste de regressão. Aguardando revalidação independente. | @dev |
| 2026-10-06 | 0.4.0 | Revalidação QA independente PASS (9,2/10); página inteira de comandos inspecionada visualmente no Chrome; story marcada Done e pronta para PR do @devops. | @qa |
