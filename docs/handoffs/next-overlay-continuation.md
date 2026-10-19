# Next.js Overlay Continuation Handoff

**Date:** 2026-10-19  
**Repository:** SubaruShogun Twitch Queue Bot  
**Branch:** `feat/ops-15-next-panel`  
**Starting checkpoint:** `38cc55e`  
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
