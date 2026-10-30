# OPS-24: backlog de typecheck do JSX do painel Next

**Contexto.** O `tsconfig.web.json` listava `apps/frontend/**/*.jsx` desde o commit de checkpoint WIP `96d60e5`, mas essa parte do gate `typecheck:web` nunca passou, e o `npm run typecheck` da raiz nunca cobriu JSX (inclui só `.js`/`.mjs`). Em 2026-10-29, ao mesclar `origin/main` na branch da OPS-15, `npm run typecheck:web` reportou 59 erros em 14 arquivos. O include do JSX foi removido do `tsconfig.web.json` (os includes de `apps/web` e `apps/shared/panel` permanecem); portanto o JSX do painel Next não está hoje sob um gate de typecheck verde. Ele deve entrar no typecheck dentro da OPS-24, junto da conversão para TypeScript/Biome, e esta tabela é o backlog inicial.

| Arquivo | Erros | Códigos TS |
|---|---|---|
| `apps/frontend/features/queues/queue-list.jsx` | 21 | TS2339 (21) |
| `apps/frontend/features/connection/connection-page-content.jsx` | 15 | TS2339 (15) |
| `apps/frontend/features/widgets/widgets-page-content.jsx` | 6 | TS2339 (5), TS2322 (1) |
| `apps/frontend/features/panel-shell/panel-provider.jsx` | 3 | TS2339 (2), TS2345 (1) |
| `apps/frontend/features/panel-shell/panel-shell.jsx` | 3 | TS2322 (3) |
| `apps/frontend/features/queues/queue-settings-form.jsx` | 2 | TS2345 (2) |
| `apps/frontend/features/settings/account-settings-page-content.jsx` | 2 | TS2339 (2) |
| `apps/frontend/app/(overlay)/layout.jsx` | 1 | TS2882 (1) |
| `apps/frontend/app/(panel)/layout.jsx` | 1 | TS2882 (1) |
| `apps/frontend/app/(panel)/page.jsx` | 1 | TS2741 (1) |
| `apps/frontend/features/commands/command-permissions-page-content.jsx` | 1 | TS2741 (1) |
| `apps/frontend/features/queues/new-queue-form.jsx` | 1 | TS2339 (1) |
| `apps/frontend/features/queues/new-queue-page-content.jsx` | 1 | TS2322 (1) |
| `apps/frontend/features/queues/queues-page-content.jsx` | 1 | TS2322 (1) |
| **Total** | **59** | |
