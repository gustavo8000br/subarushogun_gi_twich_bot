# OPS-18 — Conta atual como único overlay de identidade do jogador

[English](../../../stories/OPS-18/story.md)

**Status:** Em andamento — comportamento aprovado pelo proprietário; implementação na `feat/ops-15-next-panel`.
**Tipo:** Comportamento de overlay/produto e persistência de estado de conta existente; sem migration de schema planejada.
**Relacionado:** OPS-11, ownership da conta atual; OPS-13, capacidade/polling do overlay.

## História

Como streamer que usa chamadas de fila para passar o jogo a um viewer,
quero que um único overlay `Conta atual` identifique a conta do jogador ativo,
para que a configuração do OBS tenha uma fonte clara, sem widgets separados de pessoa chamada/em atendimento.

## Critérios de aceite

1. `Conta atual` é a única fonte de widget para identidade de jogador/conta. A fonte distinta `Pessoa em atendimento` é removida da criação/edição de widgets Next e vanilla.
2. Uma chamada individual de fila troca o rótulo persistido da conta atual para o viewer chamado, independentemente do valor legado de `autoSwitchAccount` da fila. Permanecem o lock/audit existente de ownership da conta e o reset terminal vinculado ao owner; definir a conta manualmente continua funcionando.
3. Widgets salvos existentes com `in_service_viewer_display_name` continuam utilizáveis: sua projeção pública é normalizada para `account_label`, e a leitura por capability retorna o valor compartilhado da conta atual. Não é necessária regravação destrutiva nem migration de schema.
4. A API rejeita criar/atualizar uma nova fonte legacy `in_service_viewer_display_name`. O enum/check do banco pode manter o valor legado somente para leitura e migração segura de widgets antigos pela edição normal.
5. Remover a fonte duplicada não altera `called_viewer_display_name` nem `called_viewer_position`; continuam sendo informações do evento de chamada, não identidade de conta.
6. Testes cobrem chamadas com valores legado de auto-switch true/false, reset da conta após transição terminal do owner, polling da conta atual, projeção/normalização de widgets antigos e ausência da fonte aposentada nas duas interfaces.
7. Interface, changelog e story em inglês, espanhol e pt-BR permanecem equivalentes. Nenhum teste usa banco de produção ou operação Twitch.

## Coordenação de dados

Reutilizar o registro atual `settings.account_state`, o advisory lock PostgreSQL, a transação e o caminho existente de evento de auditoria. Não adicionar colunas/tabelas nem migrations. Manter intactos a coluna/dados existentes `queues.auto_switch_account` para compatibilidade, mas deixar de tratá-los como opção de comportamento controlada pelo usuário. Linhas antigas de widget mantêm sua capability e são projetadas como `account_label`; editar uma persiste a fonte normalizada pelo fluxo de atualização versionada já existente.

## Lista de arquivos

- `apps/api/src/persistence/queue-repository.mjs` — atribuição automática da conta atual e projeção compatível da fonte antiga.
- `apps/api/src/domain/overlay-widget-policy.mjs`, `apps/api/src/domain/overlay-projection-service.mjs`, `apps/api/src/http/overlay-routes.mjs` — rejeição de novas fontes antigas e normalização dos widgets salvos.
- `apps/frontend/features/queues/queue-settings.mjs`, `apps/frontend/features/queues/queue-settings-form.jsx`, `apps/web/queue-settings-version.mjs`, `apps/web/app.js` — remoção da opção por fila nas interfaces Next e vanilla.
- `apps/frontend/features/widgets/widget-management.mjs`, `apps/frontend/features/widgets/widgets-page-content.jsx`, `apps/web/overlay-widget-form.mjs` — exposição de apenas Conta atual como fonte de identidade do jogador.
- `apps/web/localization/catalogs/panel/{en,es,pt-BR}.tsv`, `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md` — remoção dos rótulos aposentados e registro do comportamento nos três idiomas do painel.
- `tests/integration/queue-repository.test.js`, `tests/unit/{overlay-widget-policy,overlay-projection-service,overlay-widget-form,overlay-routes,next-widgets-page,next-queue-settings-form,next-queue-settings,queue-settings-version}.test.{js,jsx}` — regressões de conta atual, compatibilidade e opções aposentadas.
- `docs/stories/OPS-18/story.md`, `docs/pt-BR/stories/OPS-18/story.md`, `docs/stories.md`, `docs/pt-BR/stories.md` e inventários/handoffs bilíngues do overlay OPS-15 — registros sincronizados do projeto.

## Histórico de alterações

| Data | Alteração | Autor |
| --- | --- | --- |
| 2026-10-19 | Proprietário aprovou um único overlay Conta atual como identidade do jogador e projeção automática da conta em chamadas individuais. | `$aiox-master` |
| 2026-10-19 | Implementados a fonte única, a projeção compatível dos widgets salvos e a remoção da opção antiga por fila; testes focados e gates de qualidade registrados no handoff. | `$aiox-dev` |
