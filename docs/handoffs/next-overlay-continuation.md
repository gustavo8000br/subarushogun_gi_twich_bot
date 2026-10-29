# Next.js Overlay Continuation Handoff

### Latest continuation — QRA-04 reward-settings runtime (2026-10-20)

The real Fastify route against disposable PostgreSQL returns the exact 202 DTO with `operationStatus: pending`, persists version-2 `pending_update`, previous settings in the idempotent `reward.update` outbox and panel actor audit. A stale expected version returns exact `STALE_QUEUE_VERSION` and does not duplicate the task; the protected list read matches the accepted DTO. Focused QRA fixture passed 6/6; full serial suite passed 153 files/1,463 tests. All nine browser-only E2Es passed, overlay parity in 1,041 ms; lint/typecheck/localization/version/denylist/diff/OpenGrep passed. No Twitch worker/adapter or remote mutation/confirmation. Keep the active preview and data; no bump/commit/push/cutover/vanilla removal.

### Latest continuation — QRA-02 Channel Points create (2026-10-20)

Real Fastify + disposable PostgreSQL coverage now asserts the exact Channel Points operator DTO (including normalized aliases), persisted settings, pending `reward.create` outbox intent, actor audit and matching protected list projection. It found/fixed the create response returning `aliases: []`; no Twitch adapter/call is used. New Chromium E2E `queue-creation-accepted-browser-only.mjs` passes for exact request, accessible pending-not-confirmed feedback and projection refresh with intercepted APIs. Focused route/PostgreSQL tests: 170/170; full suite: 153 files / 1,462 tests. All nine browser-only E2Es pass; lint/typecheck/localization/version/denylist/diff/OpenGrep pass. Preview `/health` and six migrated routes are 200; Twitch integration reports `degraded`. Preserve preview/data; no bump/commit/push/cutover/vanilla removal. Live Twitch creation and OBS/CEF/platform gates remain open.

### Latest continuation — QRA-10 accepted manual admission recovery (2026-10-20)

`tests/e2e/queue-manual-entry-recovery-browser-only.mjs` passes: accepted 201 plus failed list GET keeps the known `{id,status,position}` entry visible; localized accessible feedback and a GET-only retry reconcile it without another POST. Added matching placeholder allowlists for server-side discovery and browser interpolation. All API responses are intercepted; no live API/DB/Twitch evidence. Run full post-QRA-10 quality gates; preserve preview/data and keep no bump/commit/push/cutover/vanilla removal.

### Latest continuation — QRA-04 accepted reward settings recovery (2026-10-20)

After an accepted 202/pending reward-settings PATCH followed by a failed queue-list GET, the prior provider retained a stale `synced` projection. The provider now displays the accepted `pending_update` DTO, removes reward editing until Twitch is confirmed, exposes an accessible localized warning and GET-only refresh, then changes to ordinary pending-sync feedback after a successful retry. `tests/e2e/queue-reward-settings-recovery-browser-only.mjs` passes with intercepted API fixtures; it asserts exact body, CSRF/idempotency, no duplicate PATCH, no false Twitch confirmation. Full suite passed 153/1,461; focused reward/lifecycle 39/39; all seven browser-only E2Es; lint/type/localization/version/denylist/diff/OpenGrep gates passed. UX code-only scope 9.2/10. Preserve preview/data; no bump/commit/push/cutover/vanilla removal.

### Latest continuation — QRA-02 uncertain queue creation (2026-10-20)

The browser-only Chromium test `tests/e2e/queue-creation-uncertain-browser-only.mjs` verifies manual-first disconnected setup, exact POST DTO, ambiguous 503/reconciliation, accessible localized uncertainty feedback, safe reference, retained draft, and submit lockout. It found/fixed passing `{id}` into a catalog message without that interpolation. Focused unit tests passed 11/11; full suite passed 153 files / 1,461 tests, including Compose; lint/typecheck/localization/version/port-denylist/diff checks passed; OpenGrep found 0 issues in 149 analyzed files. All six browser-only E2Es passed, including QRA-02/03 and overlay source/bundle checks. API responses are intercepted, so this is not live persistence/Twitch evidence. Keep OPS-15 In Progress and preserve preview/data; no bump, commit, push, cutover, or vanilla removal.

**Date:** 2026-10-19
**Repository:** SubaruShogun Twitch Queue Bot
**Branch:** `feat/ops-15-next-panel`
**Starting checkpoint:** `b3eeb9a`
**Story:** OPS-15 — **In Progress**
**Audience:** GitHub Copilot and Claude Code

## Read first

1. `AGENTS.md`
2. `docs/session-handoff.md` and `docs/pt-BR/session-handoff.md`
3. `docs/stories/OPS-15/story.md` and `docs/pt-BR/stories/OPS-15/story.md`
4. This handoff and `docs/decisoes_humanas/em_revisao/HD-02-contrato-compatibilidade-overlay.md`

Before editing, report `pwd`, `git rev-parse --show-toplevel`, `git branch --show-current`, and `git rev-parse --short HEAD`. Keep this checkout on `feat/ops-15-next-panel`; preserve every existing local modification and untracked artifact. Do not switch to `main`, discard/reset work, create a PR, or merge. Do not run status or greeting generators. Never stage `.env.product.local`, secrets, build output, or `.aiox/project-status-43a81ec8.yaml`.

## Ownership and product decisions

- Master coordinates; Dev implements; QA independently validates; DevOps handles remote repository operations. Do not claim a persona review or QA score without actually executing that workflow.
- Next.js owns the public panel and `/overlay.html` document in development and production. Fastify remains the API and source of truth; Next proxies the overlay and panel API requests to Fastify on the same public origin. Keep Fastify private/loopback in production and preserve the existing public port.
- The OBS overlay is live and dynamic: it polls the bot API once per second, refreshes when the page becomes visible, disables itself on revoked capability, and must continue updating when account/queue/content changes. Preserve existing capability URL, read-only contract, revocation, and cache behavior unless HD-02 is explicitly revised.
- Keep the vanilla panel as fallback until story parity, legacy test audit, QA/architecture/UX review, native OBS/CEF validation, and rollback rehearsal are evidenced. Do not delete legacy files or close FND-9.
- Do not bump the product version until the fixes are complete. Public changelogs must remain concise and classify each version under translated `Added`/`Changed`/`Fixed` (PT-BR: `Adicionado`/`Alterado`/`Corrigido`) sections. Update EN and pt-BR together before any commit.
- Do not modify `apps/frontend/.next` while a Next preview may be using it. Check process ownership and stop only a preview you own before rebuilding.

## Current implementation snapshot

The in-progress working tree adds a dynamic Next production server and app supervisor, production API rewrites to private Fastify, same-origin overlay document routing, a public-panel/private-API port split, and Docker image/Compose wiring. Next runtime is no longer a static export. Legacy panel routes still have compatibility fallbacks. Related unit/integration tests, OPS-15 documentation, and categorized beta changelogs are modified. This is uncommitted work; inspect `git status` and the diff before proceeding.

The public beta version remains `v0.2.0-beta`. Do not call OPS-15 complete. Existing overall QA baseline remains **CONCERNS 8.0/10**; the new server/runtime slice has **not** had independent QA. Native OBS/CEF, full browser parity, installer acceptance, rollback rehearsal, the complete legacy test audit, and final cutover gates are still open.

## Validation state in this checkout

- `npm run build` passed after fixing a Dockerfile omission for `apps/web/queue-confirmation-copy.mjs`. The Next production build, Prisma client generation, and final Docker image export all completed.
- Runtime smoke exposed `/health` returning Next `308` because production had `trailingSlash: true`. Production now leaves trailing slash canonicalization off, and `/overlay.html` rewrites directly to `/overlay`. The full Compose runtime test later passed migration, Next/Fastify health, TLS, and graceful-restart/persistence acceptance.
- Focused routing/build/config/release-notes tests passed **6 files / 31 tests**. `npm test` passed **145 files / 1,362 tests**, with **20 POSIX shell installer execution tests skipped** on Windows. Those shell scenarios are exercised on POSIX CI; static package checks still run on Windows. The Windows native installer harness passed.
- `npm run lint`, `npm run typecheck`, `npm run validate:localization`, `npm run validate:port-denylist` (1,024 files / 0 findings), `npm run validate:version`, `npm run review:static` / OpenGrep (146 JS files / 0 findings), and `git diff --check` passed. OpenGrep 1.31.0 was installed to the user's profile from the official Windows installer; Cosign signature validation was skipped because Cosign is not installed.
- No independent QA was performed for the current Next production-server/Compose slice. A disposable production Compose HTTP smoke now verifies `GET /overlay.html` returns the Next document (`200`) and same-origin `GET /overlay/api/widget` is forwarded to Fastify and returns its expected no-capability `401` with no-store headers. Native OBS/CEF acceptance, rollback rehearsal, and final legacy-test audit remain pending.
- Docker Desktop and a project database container were observed running. Do not stop or remove the user’s active database or volumes. Check labels/project ownership before cleaning only clearly disposable test containers.

## Recommended next steps

1. Re-read both handoffs and the OPS-15 story; verify worktree state and inspect the full diff. Preserve all existing user work.
2. Activate independent AIOX QA for this slice and follow the UX expert skill for any user-visible interaction/copy/layout change. Obtain architecture review where needed. Keep scoped score separate from overall OPS-15 score; never change the 8.0/10 baseline without fresh independent evidence.
3. Continue the ordered remaining story items. Record bilingual story checklist/file lists, handoffs, inventories, and public changelogs in the same increment. Keep all non-code gates visibly pending.
4. Complete native OBS/CEF, rollback rehearsal, and the full legacy-test audit before cutover or removal of the vanilla panel. Keep FND-9 open.
5. Before committing, update both changelogs as the final implementation step. AIOX pre-push gate requires passing lint/typecheck/test/build/denylist/static analysis and story `Ready for Review` or `Done`; do not bypass it. Do not mark OPS-15 Ready/Done while parity, OBS/CEF, legacy audit, or rollback criteria remain open.

## Handoff maintenance

Keep this file synchronized with `docs/pt-BR/handoffs/next-overlay-continuation.md`. Add dated evidence, commands, outcomes, and the precise next action. The session handoffs remain the authoritative current worktree record.
