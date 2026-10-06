# Product repository audit — 2026-10-06

[Português brasileiro](../pt-BR/audits/product-audit.md)

## Scope and method

Reviewed 571 repository files outside `node_modules/`, `.aiox-core/`, Git metadata, and local operational data. The review covered `apps/api`, `apps/web`, `apps/infra`, tests, PostgreSQL schema/migrations, Docker/Compose, shell and Windows helpers, GitHub Actions, package/version files, and user and technical documentation. The review used source inspection, existing tests, `npm audit --audit-level=low`, OpenGrep, Prisma schema validation, Compose configuration validation, and project quality commands. A clean finding from a scanner is not proof that every code path is secure.

## Security and reliability findings

- `npm audit --audit-level=low`: 0 reported vulnerabilities at audit time.
- OpenGrep: 0 findings across 56 application JavaScript files.
- Prisma schema validation and `docker compose config --quiet`: pass.
- No new exploitable application vulnerability was confirmed in this review. The widget URL is a bearer capability by design; users must keep it private and revoke/regenerate it if exposed.
- The real-PostgreSQL widget test exposed a test-infrastructure cleanup defect: Docker's `--rm` removed the test container before `docker inspect`, which returned `no such object`; the old cleanup ignored command failures and could leave the named test volume. A test-first fix now removes and verifies the container before removing and verifying its volume. The focused rerun passed 13 tests (11 real-PostgreSQL integration + 2 cleanup unit tests), and no test-owned container or named volume remained.
- OBS native acceptance currently covers only Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120. Windows and macOS certificate trust remain unverified.
- Chrome widget create/edit, one-time link copy, regeneration, revocation, deletion, and queue-source selection against a temporary local PostgreSQL fixture were verified after the operator trusted the current certificate. Native OBS stop/restart recovery, stale display recovery, source reload, and capability rotation pass on Ubuntu/OBS/CEF 32.2.2. Independent QA re-review remains the FND-7 status gate; Twitch synchronization was not exercised.
- No live Twitch reward, point, chat, or EventSub write behavior was exercised in this audit.

## Ten product improvements to consider

1. **Close FND-7 status** — native OBS recovery/link rotation and local queue-source selection have passed; record the final independent QA verdict at 9/10 or higher before marking the story Done.
2. **Complete product-wide i18n planning (FND-8)** — define one safe translation resource per product module, language selection during installation, English/pt-BR/Spanish fallback rules, API-error-to-message mapping, command grammar, and a contribution/template workflow for community translations.
3. **Plan manual admissions for ineligible channels (FND-9)** — preserve app-owned Custom Rewards for eligible channels; use streamer/moderator manual chat admission for ineligible channels without pretending points were spent or refunded.
4. **Validate native certificate trust on Windows and macOS** — provide only tested trust/removal instructions, account for browser and OBS CEF trust stores, and make CA rotation/recovery clear after secrets-volume reset.
5. **Add automated dependency monitoring** — run a pinned, non-mutating dependency vulnerability audit in CI and define a reviewed update cadence; keep exact versions and lockfile integrity.
6. **Reduce CI duplication** — the workflow installs dependencies in multiple jobs and runs project-wide lint/typecheck alongside per-app lint/typecheck. Measure CI time, then combine jobs or cache only where it preserves clear failure ownership.
7. **Add a repository consistency gate** — validate Prisma schema, Compose, runtime version, paired EN/pt-BR document links, and story task-ID parity in CI so documentation drift is caught before merge.
8. **Retest Windows operations after the startup-helper fix** — the earlier manual Windows report found an input-redirection message. Linux contract coverage is not evidence that the batch file behaves correctly in native Windows.
9. **Standardize operator utilities for localization (FND-8 planning)** — select the generic install/update/uninstall entrypoint names and a shared dependency-check/update/removal interface; preserve paths with spaces and data-retention confirmation on all supported shells.
10. **Improve recovery diagnostics and export planning** — show actionable local status for database, Twitch probe age/latency, EventSub, and pending financial work; separately plan a user-controlled backup/restore capability with confidentiality and recovery tests before implementation.

## Disposition

FND-7 acceptance gaps are tracked in its current story and issue #7. FND-8 and FND-9 already have planning issues; use their planning cycles for recommendations 2, 3, and 9. Recommendation 8 remains in FND-1 acceptance. Recommendations 4–7 and 10 are proposals, not approved product scope. No new GitHub issues were created in this audit; GitHub issue operations remain with `@devops`.

## Final gates on this worktree

- `npm run lint`, `npm run typecheck`: pass.
- `npm test`: 472 passed across 69 files.
- `npm run review:static`: 0 findings across 56 application JavaScript files.
- `npm run validate:version`: valid `v0.5.0-0000000-alpha`.
- Prisma schema validation (synthetic local `DATABASE_URL`), `docker compose config --quiet`, `npm audit --audit-level=low` (0 vulnerabilities), and `git diff --check`: pass.
- Rebuilt isolated Compose stack and verified `/health`: version `v0.5.0-0000000-alpha`, database connected, Twitch not configured. The stack remains available on local port 3437.
