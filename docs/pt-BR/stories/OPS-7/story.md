# OPS-7 — Permissões hierárquicas de comandos e cargos da audiência

[English](../../../stories/OPS-7/story.md)

**Estado:** Done — QA independente aprovado com 10/10 em 2026-10-07.
**Planejamento:** Spec Pipeline aprovado (crítica 4,85/5); implementação TDD em andamento.
**Issue:** [#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39)

## História

Como streamer, quero definir um nível mínimo da audiência para comandos configuráveis, para que grupos superiores herdem acesso de forma previsível e painel, ajuda no chat e autorização mostrem a mesma regra.

Como streamer, quero distinguir inscritos da Twitch de seguidores, para liberar acesso com base em badges atuais do chat ou relação atual de seguidor verificada.

## Critérios de aceite

- A hierarquia é `everyone < follower < subscriber < VIP < moderator < streamer`; isso é política do produto, não hierarquia definida pela Twitch. IDs de cargo são distintos e rótulos localizados.
- Comandos configuráveis usam um cargo mínimo (`everyone`, `follower`, `subscriber`, VIP ou moderator), mostram a audiência herdada antes de salvar e preservam acesso do broadcaster por identidade. Evidência VIP só conta com o toggle VIP existente ligado.
- Gestão de fila e `!queue ping` permanecem bloqueados para streamer/moderador. `!conta <nome>` e `!conta reset` são exclusivos do streamer pelo ID do broadcaster.
- Evidência de moderador/VIP/inscrito vem somente dos badges da mensagem atual do canal de destino. Seguidor é consultado pelo endpoint Helix documentado, usando ID do usuário do evento e escopo opcional `moderator:read:followers`.
- Estado de follower desconhecido falha fechado sem efeitos de comando, fila, conta, resgate, outbox ou mensagem de sucesso. Comandos que não dependem da verificação continuam funcionando.
- Escopo opcional de follower só é solicitado quando necessário e por OAuth vinculado à sessão. Consentimento negado/falho preserva credenciais utilizáveis e política anteriores.
- Listas explícitas existentes permanecem `legacy_exact` até o streamer revisar e salvar a conversão de cada comando; inicialização não amplia/restringe nem regrava políticas.
- Ajuda no chat, catálogo protegido, painel, API e autorização usam o mesmo resolvedor canônico; conteúdo de fila escrito pelo usuário permanece intacto.
- Testes cobrem herança, permissões fixas, follower tri-state/falhas de rate, escopo OAuth, ajuda/cooldown, migração, segurança API/painel e ausência de efeitos não autorizados. Garantias PostgreSQL usam migrations reais em instância PostgreSQL isolada.
- Cada incremento registra evidência real Red → Green → Refactor. QA independente da implementação deve dar 10/10 antes de Done. Não alegar teste Twitch real sem executá-lo.

## Artefatos de planejamento

- `spec/spec.md`, `spec/requirements.json`, `spec/research.json`, `spec/complexity.json`, `spec/critique.json`, `spec/plan.json`.
- Artefatos equivalentes ficam em `docs/pt-BR/stories/OPS-7/`.
- Registros Red → Green → Refactor realmente executados: `tdd-log.md` e seu par em inglês.

## Lista de arquivos da implementação

- API/domínio: `apps/api/src/commands/catalog.mjs`, `apps/api/src/commands/authorization.mjs`, `apps/api/src/commands/chat-handler.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/server.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/persistence/twitch-credential-repository.mjs`, `apps/api/src/twitch/oauth.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/twitch/helix-adapter.mjs`, `apps/shared/localization/discover-catalog-module.mjs`.
- Painel/catálogo/localização: `apps/web/app.js`, `apps/web/command-catalog-view.mjs`, `apps/web/localization/catalogs/panel/en.tsv`, `apps/web/localization/catalogs/panel/pt-BR.tsv`, `apps/web/localization/catalogs/panel/es.tsv`, `apps/web/localization/catalogs/chat/en.tsv`, `apps/web/localization/catalogs/chat/pt-BR.tsv`, `apps/web/localization/catalogs/chat/es.tsv`.
- Testes: `tests/unit/hierarchical-command-policy.test.js`, `tests/unit/command-authorization.test.js`, `tests/unit/command-catalog.test.js`, `tests/unit/command-catalog-view.test.js`, `tests/unit/chat-command-handler.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/twitch-oauth.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/integration/command-policy-persistence.test.js`, `tests/integration/queue-repository.test.js`, `tests/integration/panel-localization-contract.test.js`.
- Documentação/evidências: `docs/integrations.md`, `docs/pt-BR/integrations.md`, `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, `docs/stories/OPS-7/`, `docs/pt-BR/stories/OPS-7/`.

As evidências das execuções correspondentes estão em `tdd-log.md` e `docs/stories/OPS-7/tdd-log.md`. Os gates de implementação passaram; a decisão QA será registrada na revisão antes de marcar a story como concluída.
## Resultados QA

**Veredito:** PASSOU — **10/10**. A revisão independente aprovou todas as áreas de aceite documentadas. Gates automatizados: 87 arquivos de teste / 704 testes aprovados; lint, typecheck, OpenGrep, validação de localização, validação de versão, configuração Compose e verificação do diff passaram. A regressão PostgreSQL falhou quando o método transacional foi removido e passou após sua restauração. A cronologia do protótipo inicial do helper continua explícita no log TDD; a remediação test-first posterior em PostgreSQL também está registrada. Não foi realizada nem alegada consulta de seguidores ou autorização OAuth Twitch ao vivo. Evidências completas: [relatório QA](qa/qa-report.md).

## Histórico de alterações

- 2026-10-07: Passou de Em revisão para Done após aprovação QA independente com 10/10.
