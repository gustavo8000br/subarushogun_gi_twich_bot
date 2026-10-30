# OPS-20 — Test research (input for the `@qa` test-plan gate)

[Português brasileiro](../../pt-BR/stories/OPS-20/test-research.md)

**Author:** `@analyst` (Atlas), 2026-10-21. **Nature:** research only; no code, migration, Docker or Twitch call was run. Inputs: [story.md](story.md), [architecture.md](architecture.md), [data-model.md](data-model.md), [ux-plan.md](ux-plan.md).
**Labels:** VERIFIED = read in official docs or installed source on 2026-10-21; PARTIAL = official source confirms part, the rest is inference or community; UNVERIFIED = not confirmed.

## 0. Repository baseline (read-only, 2026-10-21)

| Fact | Status |
|---|---|
| Runner is Vitest 5.0.3 (`npm test`, `test:unit`, `test:integration`); fake timers already used (`tests/unit/next-call-deadline.test.jsx`). | VERIFIED |
| PostgreSQL integration uses a disposable `docker` container + named volume, removed by `tests/helpers/isolated-postgres-cleanup.mjs`, and runs real `prisma migrate deploy` twice (`tests/integration/queue-repository.test.js` ~l.674). | VERIFIED |
| `FOR UPDATE SKIP LOCKED` already exists in `apps/api/src/persistence/queue-repository.mjs`. | VERIFIED |
| Browser tests use `playwright-core` scripts (`tests/e2e/*-browser-only.mjs`). `@axe-core/playwright`, `fast-check`, `msw`, `nock`, `testcontainers` are **not** dependencies. | VERIFIED |
| Prisma 6.19.3, Twurple 8.2.0. | VERIFIED |
| **New:** Twurple `HelixRateLimiter.needsToRetryAfter` (installed 8.2.0 source) retries internally on 429 **when `Ratelimit-Remaining` is absent or 0**, waiting `Ratelimit-Reset*1000 - Date.now()`. A 429 with `Remaining > 0` reaches the caller. This resolves part of architecture F11/R4. | VERIFIED (source), behavior under load UNVERIFIED |

Adding any dependency (axe, fast-check, MSW) is a `@dev`/`@architect` decision with official-doc research; this note only lists options.

## 1. Twitch Helix client: fakes and contract tests

| Option | What it proves | Limits | Status |
|---|---|---|---|
| **Port-level fake** (`tests/fakes/subscriber-status-provider.mjs`, planned) | Worker/domain behavior for ok, 429+reset, 5xx, malformed, scope missing, timeout | Says nothing about Twurple/HTTP mapping | Recommended primary (architecture §2) |
| **HTTP-level fake** (undici `MockAgent` or MSW `setupServer`) behind the real Twurple client | Adapter mapping: query string with ≤100 `user_id`, absent user = not subscribed, `tier`, `is_gift`, 401/403/429/5xx classification, Twurple internal 429 retry | Fakes match our reading of docs, not Twitch | Recommended for the adapter only |
| **Twitch CLI `twitch mock-api`** | Smoke against a third-party approximation | Open beta; "may get out of sync with the production API"; endpoint list not published; no rate-limit/429 documented; VIPs not mentioned | Optional, not evidence of Twitch |
| Twurple testing utilities | — | No official testing utility found; `ApiClient` accepts `fetchOptions` (installed `.d.ts`) | UNVERIFIED (none found) |

Cases the plan should require (table-driven):
1. 429 with `Ratelimit-Remaining: 0` and `Ratelimit-Reset` = now+N: assert whether Twurple absorbs it (sleeps then retries) — with a fake clock — and that the worker never holds a DB transaction during that wait.
2. 429 with `Remaining > 0` or no reset header (Twitch says some endpoints return 429 "for reasons unrelated to the general rate limit bucket"): adapter maps to `rate_limited`, whole chunk stays `pending_check`, `next_check_at` = reset + jitter or bounded fallback.
3. Batch of 100 ids: one request; 101 ids: two chunks (Twurple does not chunk, F10). 400 for a malformed id must not mark the other 99 as non-eligible: whole chunk `unknown`.
4. 401 → `authorization_required`; 403/scope missing pre-check → `scope_missing`, no retry until re-consent.
5. Malformed body, timeout, partial `data` → `unknown`, never `not_eligible`.
6. Classification by status code only, never message string (F6).

Sources: Twitch API guide, rate limits — https://dev.twitch.tv/docs/api/guide/ (VERIFIED: token bucket, per client ID per user per minute, `Ratelimit-Reset` epoch, 429 for unrelated reasons). Twitch CLI mock-api — https://dev.twitch.tv/docs/cli/mock-api-command/ (VERIFIED limits). undici MockAgent — https://github.com/nodejs/undici/blob/main/docs/docs/api/MockAgent.md (VERIFIED `disableNetConnect`, `assertNoPendingInterceptors`; reply headers and Node built-in `fetch` coverage PARTIAL). MSW Node — https://mswjs.io/docs/integrations/node (PARTIAL). Twurple — installed `node_modules/@twurple/api/lib/utils/HelixRateLimiter.js`.

## 2. Durable outbox, lease, retry and idempotency on real PostgreSQL

- **Keep the repo pattern** (disposable container, real migrations, verified cleanup) instead of adding Testcontainers. Testcontainers (`@testcontainers/postgresql`, `snapshot()/restoreSnapshot()`) is an equivalent alternative but a new dependency and still needs Docker. PARTIAL (docs: https://node.testcontainers.org/modules/postgresql/).
- PostgreSQL docs: `SKIP LOCKED` "provides an inconsistent view of the data… can be used to avoid lock contention with multiple consumers accessing a queue-like table". VERIFIED — https://www.postgresql.org/docs/current/sql-select.html. Tests must therefore prove correctness with **two or more real connections**, not a single client.
- Concurrency recipes (inference from docs, community-standard): open two `pg` clients; client A `BEGIN` + claim; client B claims in parallel → disjoint sets; kill A without commit → lease expiry makes rows claimable again; replay the same idempotency key → one row.
- Race tests the plan should list: (a) two workers claim the same `check_batch_id`; (b) worker completes a check while a manual override arrives (one wins, the other gets `already_has_financial_intent` or a guarded no-op); (c) double clear / double `mark-served` with the same `resolutionBatchId` returns the stored result; (d) **double refund**: N parallel transitions on one redemption produce exactly one `redemption.cancel` outbox row (unique key + count assertion); (e) lease expiry mid-Helix call: late completion must not overwrite a newer round (`eligibility:{id}:{round}`).
- Use barriers (promises released together) and repeat each race 20–50 times; assert on table state, not logs. Advisory locks (`pg_advisory_xact_lock`) only if the design uses them; tests should then assert they are transaction-scoped. PARTIAL.

## 3. Prisma migration testing

- `prisma migrate deploy` applies pending migrations, does not use a shadow DB, does not detect drift. VERIFIED — https://www.prisma.io/docs/orm/reference/prisma-cli-reference.
- `prisma migrate diff --exit-code` returns 0 empty / 1 error / 2 changes. VERIFIED. Note: the current doc page is for Prisma 7 (`--shadow-database-url` removed, `--from-config-datasource`); the repo pins 6.19.3, so flags must be checked against 6.19 help output. PARTIAL.
- Recommended checks: (1) **drift gate**: after `migrate deploy` on an empty disposable DB, `migrate diff --from-config-datasource/--from-url … --to-schema schema.prisma --exit-code` must exit 0; (2) **default preservation**: deploy migrations up to the pre-OPS-20 one, insert queues with the three current Boolean combinations, deploy OPS-20, assert `refund_eligibility = 'everyone'` and every new column equals its documented default, and old columns unchanged; (3) **expand-only**: SQL review that the migration adds columns/table/CHECK only (no DROP/RENAME/type change); (4) idempotent re-run of `migrate deploy` (already in repo); (5) CHECK constraints rejecting invalid rows (`next_check_at` on resolved row, data-model test 29).
- Expand/contract as a pattern: community evidence (Prisma "expand and contract" guide, https://www.prisma.io/docs/guides/data-migration). PARTIAL.

## 4. Accessibility automation (Playwright + axe)

- `@axe-core/playwright` `AxeBuilder({page}).include().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()`; scan after the UI reaches the target state (dialog open, radio changed, live text updated). Playwright: "Automated testing cannot detect all types of WCAG violations." VERIFIED — https://playwright.dev/docs/accessibility-testing. axe README: finds "on average 57% of WCAG issues"; returns `incomplete` for manual review. VERIFIED — https://github.com/dequelabs/axe-core. Relevant rules: `aria-dialog-name`, `aria-required-children`, `label`; no live-region rule. VERIFIED — rule-descriptions.md.
- The repo uses `playwright-core` scripts, not `@playwright/test`; axe-core can be injected with `page.addScriptTag` + `axe.run()` without the test runner. PARTIAL (design choice for `@dev`).
- **Assert with Playwright, not axe:** radio group via `getByRole('radiogroup', {name})` and `getByRole('radio', {checked})`, arrow keys move selection; dialog focus moves inside on open and returns to the trigger on close, Escape closes; live region exists **before** the text changes and has `aria-live="polite"`/`role="status"`; text changes once per outcome.
- **Automation cannot prove:** that NVDA/VoiceOver actually announce the live text, announcement order and verbosity, comprehension of copy (en/es/pt-BR), contrast in real OBS/CEF, or that the dialog is not confusing.
- Manual checklist (record tool + version + browser): NVDA + Firefox/Chrome on Windows and VoiceOver + Safari on macOS: (1) Tab to the rule radiogroup, name and options announced, arrow changes selection; (2) conditional audience checkboxes announced when they appear; (3) scope-missing warning and reconnect button reachable and announced; (4) clear dialog: title + description read on open, focus trapped, Escape returns focus; (5) outcome counts (eligible/not eligible/pending) announced once via live region; (6) "needs your decision" list: row actions have unique names; (7) 200% zoom and keyboard-only pass. Evidence stays "manual AT", separate from axe.

## 5. Pure eligibility evaluator: table-driven + property-based

- Table-driven (`it.each`) over the full matrix: rule × isBroadcaster × flags (broadcaster/mods/VIPs) × status (sub/gift/tier/none/unknown). It is small (≈3 × 2 × 8 × 5) and directly documents owner decisions 1–7.
- Property-based (fast-check, `fc.assert(fc.property(...))`, shrinking to minimal counterexample; VERIFIED — https://fast-check.dev/docs/introduction/getting-started/). Invariants: `everyone` never needs lookup; `nobody` always `not_eligible`; any `unknown` input that matters never yields `eligible`/`not_eligible`; audience flags are monotonic (turning a flag on never removes eligibility, owner decision 7); broadcaster never triggers a lookup; gifted sub eligible iff `countGiftedSubs`; output is deterministic and has no I/O. Seed replay and `@fast-check/vitest` integration: UNVERIFIED on the fetched page. If fast-check is not adopted, a seeded exhaustive loop over the finite domain gives the same guarantee here.

## 6. Fake clock for `next_check_at` rechecks

- Vitest `vi.useFakeTimers({ now })`, `vi.setSystemTime`, `vi.advanceTimersByTimeAsync` for the worker loop and the Twurple wait (it uses `Date.now()`). Official guide page fetched did not document all APIs; repo already uses `useFakeTimers({ now })`. PARTIAL — https://vitest.dev/guide/mocking/timers.
- Fake timers do **not** change PostgreSQL `now()`. Recommendation: inject a clock into worker/repository and pass timestamps as parameters for `next_check_at`/lease comparisons; in PostgreSQL tests set rows with explicit past/future timestamps instead of sleeping. Cases: recheck not claimed before `next_check_at`; claimed at/after; jitter bounded; reset in the past → immediate retry with minimum delay; one counted attempt per reset.

## 7. Recommended test pyramid

1. **Unit (most):** evaluator table + properties; adapter mapping with HTTP fake; copy/count formatting; fake-clock scheduling.
2. **API + PostgreSQL (many):** migrations, defaults, CHECKs, decision persistence before outbox, idempotency, races, overrides, audit.
3. **Worker with fakes (some):** eligibility worker + financial worker on real PostgreSQL with the port fake (429, 5xx, scope missing, lease expiry).
4. **Browser-only (few):** Playwright with mocked API: form, radiogroup, dialog, live region, axe scan.
5. **Compose Chromium (fewer):** full stack in disposable Compose, panel flows end to end with fake Twitch boundary.
6. **Manual AT (checklist)** and **real Twitch (blocked)**.

## 8. Evidence separation matrix

| Layer | Can claim | Cannot claim |
|---|---|---|
| Unit | Evaluator rules, adapter mapping of documented responses, scheduling math | DB constraints, Twitch behavior |
| API + PostgreSQL (disposable, real migrations) | Defaults preserved, constraints, one intent per redemption, race safety | Helix behavior, UI |
| Worker with fakes | Retry/lease/429 handling against **our model** of Twitch | Real limits, latency, Twurple behavior under load |
| Browser-only | DOM roles, focus, live-region text, axe rules | Real API, AT announcements, OBS/CEF |
| Compose Chromium | Integrated panel + API + DB with fake Twitch | Real Twitch, assistive tech |
| Manual NVDA/VoiceOver | Announcements and usability for the tested build | Coverage beyond the checklist |
| **Real Twitch** | — | **Documented blocker:** needs an affiliate test channel, subscribers (incl. gifted), optional scopes and re-consent; Prime, broadcaster-in-list, real 429 budget and latency remain UNVERIFIED |

Limitations: docs were fetched once on 2026-10-21; Prisma page reflects v7, not the pinned 6.19.3; no community race-test source was deep-read; none of this replaces running the tests in the project.
