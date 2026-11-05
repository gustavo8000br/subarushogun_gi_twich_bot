# OPS-24: Next panel JSX typecheck backlog

**Context.** `tsconfig.web.json` listed `apps/frontend/**/*.jsx` since the WIP checkpoint commit `96d60e5`, but that part of the `typecheck:web` gate never passed, and the root `npm run typecheck` has never covered JSX (it includes only `.js`/`.mjs`). On 2026-10-29, while merging `origin/main` into the OPS-15 branch, `npm run typecheck:web` reported 59 errors in 14 files. The JSX include was removed from `tsconfig.web.json` (the `apps/web` and `apps/shared/panel` includes remain), so the Next panel JSX is not under a green typecheck gate today. It must enter the typecheck within OPS-24, together with the TypeScript/Biome conversion, and this table is the starting backlog.

| File | Errors | TS codes |
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
