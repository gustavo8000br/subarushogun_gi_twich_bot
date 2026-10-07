# OPS-9 — Unified command access rules without compatibility modes

[Português brasileiro](../../pt-BR/stories/OPS-9/story.md)

**Status:** Done
**Architecture:** `$aiox-architect` validated a single hierarchical threshold model for configurable commands and fixed minimum-role floors for protected commands.
**Priority:** Critical, before FND-9.

## Story

As a streamer,
I want every chat command to use one consistent permission model,
so I can understand each command's effective audience and avoid hidden differences between old and new settings.

## Scope and policy

The product role ladder is `everyone < follower < subscriber < vip < moderator < streamer`. This is a product policy, not a Twitch-defined rank. Configurable commands use one minimum role and inherit access upward. The streamer always has access by broadcaster ID. VIP remains subject to the existing toggle; follower status remains verified through the approved Twitch scope and fails closed when unknown.

Queue-management commands and `!queue ping` have a fixed `moderator` minimum. `!conta <nome>` and `!conta reset` have a fixed `streamer` minimum. These floors cannot be weakened by panel input or stored settings. Other commands retain per-command configurable minimum roles.

No runtime support for explicit role allowlists, `legacy_exact`, or prior permission schema versions remains. The database migration resets only the stored command-permission setting to the new defaults and advances its revision. Queues, entries, OAuth credentials, other settings, Docker volumes, and installation secrets are preserved.

## Acceptance criteria

1. Every catalog entry declares one normalized access contract: either a configurable minimum-role rule or a fixed minimum-role floor. No command depends on a separate role-array authorization path.
2. All access decisions use the same resolver in chat handling, chat help, panel catalog, and API projections. Role evidence continues to come from broadcaster identity, trusted current-channel badges, and the existing follower verification.
3. Configurable thresholds include Everyone, Followers, Subscribers, VIPs, and Moderators. Higher-ranked groups inherit access. The panel shows the full effective audience; “Everyone” explicitly lists the included ranks.
4. Management commands stay fixed at Moderator; current-account mutations stay fixed at Streamer. Attempts to write policies for fixed commands fail without side effects.
5. Command-help responses remain filtered to the caller's verified roles and do not accept a caller-supplied role or target identity.
6. New persisted command settings use one current schema and one `minimumRole` value per configurable command. Runtime code contains no explicit-list policy mode or old-schema parser/branch.
7. A real PostgreSQL migration resets only the command-permission setting, increments its revision, writes a sanitized audit record, and is idempotent. Integration tests verify unrelated settings are unchanged; the migration statement writes only to settings and audit tables, leaving product records untouched.
8. Tests cover all command categories, inheritance boundaries, VIP toggle, follower unknown/failure, fixed floors, help filtering, malformed policies, stale revisions, concurrent updates, OAuth-staged follower updates, migration and absence of unauthorized effects.
9. English and pt-BR story/docs/changelogs remain equivalent. Unit and integration guarantees pass; PostgreSQL tests use actual migrations in an isolated database.

## Tasks / Subtasks

- [x] Define the uniform catalog and policy contract (AC 1–5).
- [x] Add Red tests for resolver, persistence, and migration before the corresponding implementation (AC 1–8).
- [x] Implement the new policy model across chat, API, persistence, and panel; remove old runtime branches (AC 1–6).
- [x] Add and validate the PostgreSQL migration; preserve unrelated records (AC 7–8).
- [x] Update both-language story, roadmap, versioning, and changelogs (AC 9).
- [x] Run project quality gates and receive independent `$aiox-qa` PASS.

## Dev Notes

- Existing role evidence and product hierarchy are documented in OPS-7. The prior OPS-7 compatibility requirement is superseded by this owner-approved story because no streamer uses the product.
- Fixed boundaries are currently represented by command metadata in `apps/api/src/commands/catalog.mjs`; persistence is in `apps/api/src/persistence/queue-repository.mjs`; panel projection is in `apps/web/command-catalog-view.mjs` and `apps/web/app.js`.
- Do not remove or recreate the active Docker volumes. Migration tests must use the existing isolated PostgreSQL integration harness or another disposable PostgreSQL instance.
- TDD is mandatory for every behavior and migration change. Record exact commands and observed Red/Green results below before claiming completion.

## Testing / Quality Gate Plan

- Unit: canonical command policy and authorization matrix, help filtering, safe audience display.
- PostgreSQL integration: actual Prisma migration, settings reset scope, audit row, revision and concurrent update guarantees.
- Static gates: `npm run lint`, `npm run typecheck`, `npm run review:static`, `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, `git diff --check`.
- Reviewers: `$aiox-architect` for the access model; `$aiox-qa` for behavior, consistency, test evidence, and concision; `$aiox-dev` implements.

## TDD Evidence

- **Catalog/resolver behavior:** `npm test -- --run tests/unit/command-catalog.test.js -t 'one configurable or fixed minimum-role contract|configurable threshold through inherited role rank'` — Red, 2 failed because catalog entries had no normalized `access` contract and the resolver ignored the supplied minimum role. Green: the same focused command passed after catalog and resolver implementation. Refactor: `npm test -- --run tests/unit/command-catalog.test.js tests/unit/hierarchical-command-policy.test.js tests/unit/command-catalog-view.test.js tests/unit/command-authorization.test.js tests/unit/chat-command-handler.test.js tests/unit/queue-routes.test.js tests/unit/twitch-integration.test.js tests/integration/command-policy-persistence.test.js tests/integration/command-policy-v3-migration.test.js` — 9 files / 106 tests passed after migrating all consumers to the shared resolver.
- **PostgreSQL migration behavior:** the test was added before the migration. With the migration SQL temporarily empty, `npm test -- --run tests/integration/command-policy-v3-migration.test.js` failed because the old stored setting remained invalid under schema v3. With the SQL implemented, the same isolated PostgreSQL migration suite passed 2/2, including revision advance, unrelated setting preservation, audit event, and idempotence. A preliminary attempt that removed the migration file produced Prisma P3015 before behavioral tests; that run is explicitly excluded as environment/configuration evidence.
- **Panel audience projection:** `npm test -- --run tests/unit/command-catalog-view.test.js -t 'projects the complete inherited audience'` — Red, failed because `projectMinimumRoleAudience` was missing. Green/refactor: the new shared projection is used by API-facing panel projection and audience labels; `npm test -- --run tests/unit/command-catalog-view.test.js tests/integration/panel-localization-contract.test.js` passed 25/25, with lint/typecheck/diff check passing afterward.
- **Panel/localization contract:** `npm test -- --run tests/integration/panel-localization-contract.test.js tests/unit/command-catalog.test.js tests/unit/command-catalog-view.test.js tests/integration/command-policy-v3-migration.test.js` passed 4 files / 30 tests before the final audience-projection refactor. Final full suite: `npm test` — 88 files / 723 tests passed. Final gates: `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), `npm run validate:localization`, `npm run validate:version`, `docker compose config --quiet`, and `git diff --check` passed. These commands ran locally; no live Twitch authorization or chat write was performed.
- **Operator runtime smoke (2026-10-07):** the owner ran `docker compose up -d --build` against the existing installation and retained its volumes. `/health` returned `{"status":"ok","product_version":"v0.12.0-0000000-alpha","dependencies":{"database":"connected","twitch_api":"ineligible","twitch_api_ping_ms":195}}`. The HTTPS panel subsequently showed database connected, Twitch channel ineligible in localized Portuguese, and 195 ms latency. The migration ran through Compose; no reward or chat write was tested.

## File List

- `apps/api/src/commands/catalog.mjs`, `authorization.mjs`, `chat-handler.mjs`, `help.mjs`
- `apps/api/src/http/queue-routes.mjs`, `persistence/queue-repository.mjs`, `twitch/integration.mjs`
- `apps/api/prisma/migrations/20261007120000_unified_command_policy/migration.sql`
- `apps/web/app.js`, `command-catalog-view.mjs`, and `localization/catalogs/panel/{en,es,pt-BR}.tsv`
- `apps/shared/localization/discover-catalog-module.mjs`
- Unit and PostgreSQL integration coverage under `tests/unit/` and `tests/integration/`
- `docs/integrations.md` and `docs/pt-BR/integrations.md`
- Bilingual OPS-9 story, story indexes, roadmap, versioning docs, changelogs, `package.json`, `package-lock.json`, and `VERSION`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-10-07 | 0.12.0 | Create owner-approved unified permission scope; replace compatibility requirement with one hierarchical contract. | @sm |
| 2026-10-07 | 0.12.0 | Implement schema v3, shared access resolver, fixed command floors, isolated PostgreSQL reset migration, panel projection, and bilingual release notes. | @dev |
| 2026-10-07 | 0.12.0 | QA Gate PASS — Status: InReview → Done | @qa |

## QA Results

### Review Date: 2026-10-07

### Reviewed By: Quinn (Test Architect)

Validated the nine acceptance criteria against the catalog, shared authorization path, protected API/persistence writes, bilingual panel projection, real isolated PostgreSQL migration, and recorded test evidence. The complete suite passed 88 files / 723 tests; lint, typecheck, OpenGrep, localization/version validation, Compose config, and diff checks passed. No high-severity finding remains. Live Twitch authorization, chat delivery, and point writes were not performed.

### Gate Status

Gate: PASS → docs/qa/gates/OPS-9-unified-command-access.yml
