# Story OPS-3: Command catalog and role permissions

[Português brasileiro](../../pt-BR/stories/OPS-3/story.md)

**Complexity:** COMPLEX. **Executor:** @dev. **Quality gate:** @architect. **GitHub issue:** [#17](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/17).

## Status

**Done and merged** — implementation, independent QA (PASS, 9.2/10), complete Chrome page inspection, automated quality gates, and PR #24 merge passed.

## Quality Gate Plan

- **Primary type:** API, frontend, database, security, cross-cutting authorization.
- **Specialist review:** @architect for policy design; @qa for acceptance and test review; @data-engineer for migration/persistence review if the schema changes; @devops owns any PR publication.
- **Checks:** focused tests per increment; real isolated PostgreSQL with actual migrations; full `npm test`, `npm run lint`, `npm run typecheck`, all per-app checks, `npm run review:static`, `npm run validate:version`, `docker compose config --quiet`, documentation parity, and `git diff --check`.
- OpenGrep findings block completion and are fixed test-first. Human/specialist review remains separate from scanner output.

## Story

**As a** streamer operating the local queue bot,
**I want** to see the complete chat command catalog in the panel and control eligible commands by explicit role allowlists,
**so that** viewers know which actions are available and only intended roles can execute them.

## Acceptance Criteria

1. Panel lists every implemented global and queue chat command, syntax, purpose, effective roles, and immutable/configurable status.
2. Streamer can edit explicit allowlists among moderator, VIP, subscriber, and everyone. Streamer access remains identity-based; VIP requires the existing toggle; any matching eligible role grants access without hierarchy inheritance.
3. Initial policy preserves current permissions except `!conta <nome>` and `!conta reset`, which are immutable streamer-only.
4. Catalog, chat help, and backend authorization consume the same persisted policy; it survives API restart and updates are audited transactionally.
5. `!queue comandos` lists all global and per-queue commands available to the sender; `!<fila> comandos` remains queue-specific. Streamer is sent to the panel; response follows cooldown and 500-character limit.
6. Authorization uses current broadcaster identity/current Twitch EventSub message badges only. No historical role cache, follower scope, or Shared Chat source privilege is used.
7. Denied mutations cause no queue entry lookup, account lookup, external Twitch lookup, mutation or outbox effect.
8. Session, CSRF, schema, idempotency and optimistic-version protections cover policy routes; immutable commands cannot be relaxed from HTTP.
9. Every behavior follows Red → Green → Refactor. Relevant PostgreSQL guarantees use real isolated PostgreSQL and migrations; evidence is recorded here and in the bilingual story index.
10. English and pt-BR story/docs/changelogs remain equivalent. FND-7 planning and UX expert remain deferred until this story implementation is complete.
11. `!queue ping` is immutable to streamer/moderator, reports `Pong 🏓`, running version and cached Twitch API latency without probing Twitch on each command; `queue` is reserved from queue keys.

## TDD Evidence

- **Release-heading regression:** `npm test -- --run tests/unit/documentation-contract.test.js -t 'shipping changelog version'` Red — 1 failed because the new `v0.4.0-alpha` internal notes followed the older `v0.3.0-alpha` heading. Green — the same test passed after moving each `v0.4.0-alpha` heading above its entries and restoring the `v0.3.0-alpha` heading before the earlier notes in both languages.

### Command catalog, parser, authorization and help

- **Red:** `npm test -- --run tests/unit/command-catalog.test.js tests/unit/command-parser.test.js tests/unit/command-authorization.test.js` failed on missing catalog module, unrecognized `!abismo comandos`, and moderator access to `!conta reset`.
- **Green:** same focused command passed 32/32 after adding the canonical registry, parser integration and role authorization. A VIP regression exposed role classification despite the toggle being off; role extraction was corrected and the suite passed again.
- **Global command Red:** `npm test -- --run tests/unit/command-parser.test.js tests/unit/command-authorization.test.js tests/unit/command-catalog.test.js tests/unit/queue-keys.test.js` reported 6 failures/56 passes for absent `!queue` actions, missing ping authorization and accepting `queue` as slug. **Green/Refactor:** 62 focused tests passed after parser/registry/auth/key reservation were updated and authorization was consolidated on the registry.
- **Malformed policy Red/Green:** `npm test -- --run tests/unit/command-catalog.test.js` exposed non-array persisted policy falling back to permissive defaults; fail-closed parsing made it pass.
- **Help/ping Red/Green:** `npm test -- --run tests/unit/command-help.test.js tests/unit/chat-command-handler.test.js` first failed for missing help behavior and cache-backed ping; after help/ping handlers and Portuguese copy, affected focused tests passed 52 tests. A test expectation was corrected from a concrete queue to the documented `!<fila>` template.
- **Focused Refactor:** command registry, help, handler, parser, authorization and key tests passed 79 tests.

### PostgreSQL policy persistence and protected API

- **Red:** `npm test -- --run tests/integration/command-policy-persistence.test.js` ran disposable PostgreSQL 18.6 and real `prisma migrate deploy`, then failed 3 contracts because repository read/write methods were absent.
- **Green:** same command passed 3/3 after transactionally storing allowlists in the existing `Setting` JSON row and auditing changes. A later refactor removed a needless receiver dependency; persistence + command/help tests passed 26.
- **Red:** `npm test -- --run tests/unit/queue-routes.test.js -t 'catalog|command policies'` observed the missing mutation route (404). **Green:** same command passed 2 route tests (30 skipped), covering local-session catalog, CSRF and actor-attributed policy changes. Existing middleware enforces operation idempotency; route schema rejects immutable/invalid policies.

### Panel and health cache

- **Red:** `npm test -- --run tests/unit/panel-navigation.test.js tests/unit/health-route.test.js` had 2 behavior failures: `commands` navigation fell back to overview and health route returned no cached Twitch snapshot.
- **Green:** after adding the Commands panel page/navigation and `getTwitchHealth()` cache reader, the same tests passed.
- **Red/Green (case handling):** `npm test -- --run tests/unit/chat-command-handler.test.js -t 'case-insensitive global command discovery'` failed because `!queue PING` produced no reply. Lowercasing the parsed global action made it pass. **Refactor:** `npm test -- --run tests/unit/command-catalog-view.test.js tests/unit/panel-navigation.test.js tests/unit/health-route.test.js tests/unit/chat-command-handler.test.js tests/unit/command-help.test.js tests/unit/queue-routes.test.js -t 'command catalog|command policies|catalog|ping|health|navigation|role-aware|global command'` passed 20 tests; 40 unrelated tests were skipped by the filter.
- **Regression Red:** `npm test -- --run tests/unit/command-catalog-view.test.js -t 'keeps the panel catalog projection'` failed because the policy update response has no `commands` field and the UI could not merge it into the loaded catalog. **Green/Refactor:** `npm test -- --run tests/unit/command-catalog-view.test.js` passed 3 tests after adding `mergeCommandPolicyState`; the panel preserves all rows and fixed roles after a policy save.

### QA regression: Twurple badge shape

- **Red:** `npm test -- --run tests/unit/eventsub-runtime.test.js -t 'Twurple badge objects'` reproduced the independent QA finding end to end. Twurple EventSub's chat event supplies `badges` as an object map (`{ moderator: '1', subscriber: '12' }`), which reached authorization unchanged and was classified as `viewer`, denying `!fila proximo`.
- **Green:** authorization now accepts the Twurple object map as well as the array form used by existing normalized/fake events. `npm test -- --run tests/unit/eventsub-runtime.test.js tests/unit/command-authorization.test.js tests/unit/chat-command-handler.test.js` passed 26 tests.

### Full quality gates

- `npm test -- --run tests/unit/command-catalog.test.js tests/unit/command-catalog-view.test.js tests/unit/command-parser.test.js tests/unit/command-authorization.test.js tests/unit/command-help.test.js tests/unit/chat-command-handler.test.js tests/unit/health-route.test.js tests/unit/queue-keys.test.js tests/unit/queue-routes.test.js tests/integration/command-policy-persistence.test.js` — 124 tests passed across 10 files before the final response-merge regression was added.
- Final `npm run lint`, `npm run typecheck`, `npm test` — passed; **416 tests in 57 files**.
- `npm run review:static` — OpenGrep scanned 48 JavaScript files; 0 findings.
- Per-area lint/typecheck for API, infra and web — passed. `npm run validate:version` — `v0.4.0-0000000-alpha`; `docker compose config --quiet` and `git diff --check` — passed.
- Final focused rerun after the response-merge fix: `npm test -- --run tests/integration/command-policy-persistence.test.js tests/unit/command-catalog-view.test.js tests/unit/chat-command-handler.test.js tests/unit/health-route.test.js` — 25 tests passed across 4 files.
- No Twitch chat message or reward mutation was performed. The currently open user browser uses a connected Twitch account; it was not used. Browser-level panel verification remains pending. The isolated Compose image was built and started as recorded below.
- Clean Compose acceptance on this feature worktree: `APP_PORT=3217 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-clean-certs docker compose -p queuebot-ops3-clean up --build -d` completed bootstrap → PostgreSQL healthy → migrations success → bot healthy. `/health` returned `status=ok`, product `v0.4.0-0000000-alpha`, database `connected`, Twitch `not_configured`; container ran as `10001:10001`. All five migrations were present in the fresh database.
- Protected API smoke on that isolated installation opened a local session, loaded all 19 catalog rows, submitted a CSRF/idempotency/version-protected policy update, then read back the persisted `queue:add=subscriber` result. This wrote only to the test database created for this task, not the user's running instance or Twitch. The temporary test project was then removed with `docker compose -p queuebot-ops3-clean down -v` and recreated from the built image; the currently running instance is a clean first-run install with zero settings rows and no Twitch configuration.
- After the QA fix, rebuilt the same isolated project with `APP_PORT=3217 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-clean-certs docker compose -p queuebot-ops3-clean up --build -d`. First immediate HTTPS request raced startup; the follow-up succeeded after readiness. Compose reports bot and PostgreSQL healthy; `/health` returned database `connected`, Twitch `not_configured`, and product `v0.4.0-0000000-alpha`. The clean database still has zero settings rows.

Independent QA initially returned FAIL (7/10) for the Twurple badge-object mismatch. After the test-first fix, QA revalidated and returned PASS (9.2/10); the full command catalog was visually inspected in Chrome across the entire page without changing saved policies. The story is Done locally. PR publication and merge remain with @devops. FND-7 research and `$aiox-ux-design-expert` have not begun.

## Tasks / Subtasks

- [x] Implement shared command definitions and pure policy resolution.
- [x] Add parser/help command with role-filtered bounded output and no effects on denials.
- [x] Persist policy with transactionally recorded audit and migration-backed PostgreSQL coverage.
- [x] Add protected catalog/policy routes with CSRF, validation, idempotency and version checks.
- [x] Add the Comandos page to the local panel and render only safe projections.
- [x] Synchronize docs, run acceptance/quality checks, and complete QA review.

## Dev Notes

- Source requirements, research, architecture and files are in the paired spec directory.
- Canonical entrypoints: `apps/api/src/commands/parser.mjs`, `authorization.mjs`, `chat-handler.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/web/index.html`, `apps/web/app.js`, and `apps/web/panel-navigation.mjs`.
- Preserve user changes outside this story. Product tests do not use Twitch credentials; persistence tests must use a dedicated PostgreSQL test instance.

## Testing

Each increment starts with its focused failing Vitest contract. Run relevant unit/route tests and migration-backed PostgreSQL tests after changes. Before story completion, run all story quality gates listed above and verify every AC.

### Security patch integration and clean Compose build

- After merging the security patch into this feature branch, `npm ci` resolved `deepmerge-ts@8.0.2` through the scoped Prisma config override; Prisma CLI/client/adapter remained at 6.19.3. `npm audit --audit-level=high` reported 0 vulnerabilities.
- `IMAGE_TAG=ops3-pr-final-20261006 APP_PORT=3222 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-pr-certs docker compose -p queuebot-ops3-pr-final build --no-cache` — all three app images built; Prisma 6.19.3 client generated.
- `IMAGE_TAG=ops3-pr-final-20261006 APP_PORT=3222 LOCAL_CERT_DIRECTORY=/tmp/queuebot-ops3-pr-certs docker compose -p queuebot-ops3-pr-final up -d` — bootstrap completed, PostgreSQL healthy, migrations exited successfully, and bot healthcheck became healthy. `curl -k https://localhost:3222/health` returned `status: ok`, product `v0.4.0-0000000-alpha`, database `connected`, Twitch `not_configured`. This isolated empty installation remains available on port 3222; the streamer's existing Compose projects were untouched.

## File List

### Completion Notes

- Added role-configurable panel/chat command catalog, global help and restricted ping, durable audited PostgreSQL policy, `queue` key reservation, and shared cached Twitch health measurement.
- No schema migration or new runtime dependency was needed; policy uses the existing JSON `Setting` record and PostgreSQL advisory transaction lock.
- Independent QA passed at 9.2/10; all 19 command rows and permission selections were visually inspected in Chrome. No panel setting changed during review. The branch is ready for @devops PR publication and merge.

### Agent Model Used

Codex GPT-6, operating as the AIOX Master orchestrator and story executor.

### File List

- `apps/api/src/commands/catalog.mjs`, `help.mjs`, `authorization.mjs`, `parser.mjs`, `chat-handler.mjs`
- `apps/api/src/domain/queue-keys.mjs`, `health-route.mjs`, `server.mjs`
- `apps/api/src/http/queue-routes.mjs`, `apps/api/src/persistence/queue-repository.mjs`
- `apps/web/index.html`, `app.js`, `panel-navigation.mjs`, `command-catalog-view.mjs`, `styles.css`
- `tests/unit/command-catalog.test.js`, `command-catalog-view.test.js`, `command-help.test.js`, `command-parser.test.js`, `command-authorization.test.js`, `chat-command-handler.test.js`, `health-route.test.js`, `queue-keys.test.js`, `queue-routes.test.js`
- `tests/integration/command-policy-persistence.test.js`; `tests/unit/documentation-contract.test.js`
- `tests/unit/eventsub-runtime.test.js`
- `README.md`, `README.pt-BR.md`, `docs/integrations.md`, `docs/pt-BR/integrations.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`, paired OPS-3 story/spec documents and planning JSON under `docs/stories/OPS-3/` and `docs/pt-BR/stories/OPS-3/`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `package.json`, `package-lock.json`, `VERSION`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/qa/gates/OPS-3-command-catalog.yml` and its pt-BR pair record the independent PASS gate.

## QA Results

 - **Initial independent review:** FAIL, 7/10. High finding: Twurple provides chat badges as an object map, but authorization recognized arrays only. Reproduced end to end: moderator was classified as viewer and `!fila proximo` was denied.
 - **Revalidation:** PASS, 9.2/10 after a test-first regression and fix. Reviewer confirmed array/object badge formats, streamer identity, moderator policy, VIP toggle and allowlist, subscriber allowlist, streamer-only `!conta reset`, and rejection of external Shared Chat privileges. Focused suite: 37/37; OpenGrep: 0 findings; lint, typecheck and diff-check passed. Reviewer made no code edits.
 - Full quality gates after fix: `npm run lint`, `npm run typecheck`, `npm test` (57 files, 416 tests), and `npm run review:static` (48 JS files, 0 findings) passed. Clean Compose rebuild and protected API smoke are recorded above.

## Change Log

| Date | Version | Change | Agent |
| --- | --- | --- | --- |
| 2026-10-06 | 0.4.0 | Validated GO (9/10) — Status: Draft → Ready; Spec Pipeline and owner clarifications recorded | @po |
| 2026-10-06 | 0.4.0 | Implementation and developer gates complete; status moved to InReview. | @dev |
| 2026-10-06 | 0.4.0 | QA returned FAIL (7/10); reproduced and fixed Twurple object-map badge authorization with a regression test. Awaiting independent revalidation. | @dev |
| 2026-10-06 | 0.4.0 | Independent QA revalidation PASS (9.2/10); full command page visually reviewed in Chrome; story marked Done and ready for @devops PR. | @qa |
