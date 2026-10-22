# OPS-20 — Test plan (refund eligibility)

[Português brasileiro](../../pt-BR/stories/OPS-20/test-plan.md)

**Author:** `@qa` (Quinn), 2026-10-21. **Story:** [story.md](story.md) (17 ACs, owner decisions 1–8), issue [#76](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/76).
**Inputs:** [research.md](research.md) (incl. round 2), [data-model.md](data-model.md) (tests 1–32), [architecture.md](architecture.md) (three slices, F1–F14), [ux-plan.md](ux-plan.md) (tests 1–26, M1–M7), [ux-research.md](ux-research.md), [test-research.md](test-research.md).
**Nature:** planning gate only. No product code, test, migration, Docker command, test suite or Twitch call was written or run. Repository patterns below come from a read-only reading of `tests/unit`, `tests/integration/{queue-repository,qra-postgres-fixtures,compose-runtime}.test.js`, `tests/helpers/isolated-postgres-cleanup.mjs`, `tests/e2e/*-browser-only.mjs` and `package.json` on `feat/ops-15-next-panel`.

## 0. Gate result

**Verdict: CONCERNS** (approve the plan for implementation start, with the observations in section 13). **Plan quality score: 9.0/10** (the plan, not the product). Nothing here is evidence that the feature works.

## 1. Reused repository patterns

| Pattern | Where it exists today | OPS-20 use |
|---|---|---|
| Vitest runner, `tests/unit/*.test.js(x)`, RTL for `.jsx` | `next-queue-settings-form.test.jsx`, `queue-confirmation-copy.test.js` | evaluator, adapter mapping, status mapper, copy, RTL components |
| Disposable PostgreSQL container + volume, real `prisma migrate deploy` (twice), verified cleanup | `tests/integration/queue-repository.test.js`, `tests/helpers/isolated-postgres-cleanup.mjs` | all API + PostgreSQL and worker tests |
| Real Fastify routes + test-only Twitch adapter + disposable PostgreSQL | `tests/integration/qra-postgres-fixtures.test.js`, `tests/helpers/ops15/qra-postgres-fixtures.mjs` | override/bulk/settings/clear routes, CSRF/session |
| Golden outbox assertions on `financial:{redemption_id}` | `queue-repository.test.js` (~l.331–467) | default-preservation guard (section 9) |
| `playwright-core` scripts with mocked API | `tests/e2e/*-browser-only.mjs`, `tests/e2e/fixtures/qra-api-fixtures.mjs` | browser-only E2E (section 7) |
| Isolated Compose + Chrome | `tests/integration/compose-runtime.test.js`, `isolated-compose-cleanup.mjs` | Compose Chromium smoke (section 7) |
| Fake timers `vi.useFakeTimers({ now })` | `next-call-deadline.test.jsx` | worker scheduling (injected clock) |
| Worker unit tests | `financial-outbox-worker.test.js`, `outbox-loop.test.js`, `twitch-adapter.test.js` | eligibility worker, adapter |

New files proposed (names are suggestions for `@dev`): `tests/fakes/subscriber-status-provider.mjs`, `tests/unit/refund-eligibility-policy.test.js`, `tests/unit/subscriber-status-adapter.test.js`, `tests/unit/eligibility-worker.test.js`, `tests/unit/refund-decision-status.test.js`, `tests/integration/refund-eligibility-repository.test.js`, `tests/integration/refund-eligibility-migration.test.js`, `tests/integration/refund-eligibility-worker.test.js`, `tests/integration/refund-override-routes.test.js`, `tests/e2e/refund-eligibility-browser-only.mjs`.

## 2. Layers and what each does NOT prove

| Code | Layer | Proves | Does NOT prove |
|---|---|---|---|
| U | Unit (Node/RTL, no DB) | evaluator rules, adapter mapping of documented responses, chunking, scheduling math, copy/plurals, component semantics | DB constraints, races, Twitch, real browser |
| P | API + PostgreSQL (disposable PG 18, real migrations, ≥ 2 real connections for races) | defaults preserved, CHECKs, one intent per redemption, guarded writes, audit, route DTOs | Helix behavior, UI rendering |
| W | Worker with fakes on real PostgreSQL | lease, retry, 429/back-off, idempotency **against our model of Twitch** | real rate limits, latency, Twurple under load |
| B | Browser-only (`playwright-core`, mocked API) | DOM roles, focus, live-region text, keyboard, viewport, axe rules (if adopted) | real API, AT announcements, OBS/CEF |
| C | Compose Chromium (isolated Compose, fake Twitch boundary) | integrated panel + API + DB + worker | real Twitch, assistive technology |
| M | Manual AT (NVDA, VoiceOver) and manual reading/visual checks | announcements and usability for the tested build | anything outside the checklist |
| T | Real Twitch | — | **Documented blocker** (section 12) |

Evidence of one layer is never reported as evidence of another. Every story evidence entry must name its layer code, command, commit and date.

## 3. Traceability matrix (AC → tests → layer)

IDs: `DM-n` = data-model §7 test n; `UX-n` = ux-plan §10 test n; `EV`, `AD`, `WK`, `RC`, `E2E`, `AT` = this plan.

| AC | Tests | Layers |
|---|---|---|
| 1 Rule values, default everyone | DM-1, DM-2, DM-3, DM-26; EV-1..EV-3; REG-1..REG-4 | U, P |
| 2 Audiences broadcaster/mods/VIPs, defaults off, gift note | DM-7, DM-31; EV-4..EV-8, EV-P3; UX-1, UX-2, UX-10; E2E-1, E2E-2 | U, P, B |
| 3 Subscriber definition (gifted; min tier out of MVP) | DM-5, DM-6; EV-9, EV-10, EV-P6; AD-3 | U, P |
| 4 Rule applies to all six triggers; switches keep "when" | DM-3, DM-4, DM-15, DM-20; EV-11 (switch off → no row); P-T1..P-T6 (one per trigger × rule) | U, P |
| 5 Decided once, persisted before outbox, valid shape only | DM-10, DM-11, DM-27, DM-32; AD-5, AD-6; RC-4 | U, P, W |
| 6 Audit content, no gifter/UID/text in logs | DM-6, DM-9, DM-16; AD-10 (log capture); WK-10 | U, P, W |
| 7 Unknown never guessed, stays pending, panel asks | DM-8, DM-9; AD-1..AD-9; WK-3..WK-6; UX-3, UX-4; E2E-4 | U, P, W, B |
| 8 Manual override refund/deny, reason, idempotent | DM-12, DM-13, DM-22, DM-23, DM-24, DM-28; RC-2, RC-3, RC-5; UX-9, UX-15, UX-16; E2E-5, E2E-6 | U, P, B |
| 9 Optional subscriptions scope, re-consent, non-affiliate hidden, "zero subs" ≠ not subscriber | AD-7, AD-8; DM-8; WK-7 (re-arm after re-consent); UX-2, UX-12, UX-19; E2E-8, E2E-9 | U, P, W, B |
| 10 Optional mod/VIP scopes, broadcaster without API call | EV-4, EV-P5; DM-31; AD-7; WK-8 | U, P, W |
| 11 Clear batching ≤ 100, 429 back-off, per-redemption result, 404 ≠ refund | DM-14; AD-2, AD-3, AD-11; WK-1, WK-2, WK-9; RC-1 | U, P, W |
| 12 Clear copy by outcome, "requested/pending" only | UX-6, UX-18; CP-1..CP-3; E2E-7 | U, B |
| 13 Non-eligible handling keep/auto per trigger, truthful copy | DM-20, DM-21, DM-25; P-T1..P-T6 × handling; UX-3, UX-11; E2E-3 | U, P, B |
| 14 Durable outbox rules, unknown never cancel/no-op silently | DM-10, DM-27, DM-28, DM-30; RC-1..RC-6; WK-1..WK-6 | P, W |
| 15 Settings form copy en/es/pt-BR, manual-only hidden, UX ≥ 9.0 | UX-1, UX-2, UX-7, UX-8, UX-10..UX-12; E2E-1..E2E-3, E2E-10; AT-1..AT-9 | U, B, M |
| 16 Migration, defaults, no data change, snapshot/rollback | DM-1, DM-2, DM-18, DM-19, DM-29; MG-1..MG-4 | P |
| 17 Real isolated PostgreSQL; fakes at Twitch; evidence separated | whole P/W suite; section 2; section 11 | P, W |

Per-trigger rows `P-T1..P-T6` (P): `removed_waiting`, `removed_while_called`, `viewer_left_called`, `no_show`, `queue_cleared`, `queue_deleted`, each × rule (`everyone`, `nobody`, `subscribers` with fake answer sub/non-sub/unknown) × handling (`keep_unfulfilled`, `auto_fulfill`) × per-trigger switch (on/off where it exists). Assert decision row, resolution, outbox rows by key, `redemptions.expected_status`, audit event.

CP-1..CP-3 (U): clear preview per rule × handling; result lines omit zero outcomes; never "returned/confirmed" before Twitch confirms.

## 4. Data-engineer PostgreSQL tests (DM-1..DM-32) mapping

All run in layer P (DM-27..DM-30 also exercise W), disposable PostgreSQL 18.6 with real migrations, no SQLite, no Prisma mocks.

| DM | Topic | AC | Slice | Concurrency |
|---|---|---|---|---|
| 1 | migration on populated data (all queue modes) | 1, 16 | 1 | — |
| 2 | rule CHECK + NOT NULL | 1, 16 | 1 | — |
| 3 | golden default preservation all triggers | 1, 4 | 1 | — |
| 4 | `nobody` every trigger | 4 | 1 | — |
| 5 | subscriber tiers/gift stored, outbox same TX | 3, 5 | 2 | — |
| 6 | gifted excluded | 3 | 2 | — |
| 7 | broadcaster/mod/VIP flags | 2 | 2 | — |
| 8 | unknown per reason code, no outbox | 7 | 2 | — |
| 9 | CHECK matrix §2.2 | 6, 7 | 1 | — |
| 10 | double decision same redemption | 5, 14 | 1 | 2+ connections |
| 11 | re-check unknown → known once | 5 | 2 | — |
| 12 | override refund, second/stale rejected | 8 | 3 | — |
| 13 | mark served on pending_check | 8 | 3 | — |
| 14 | clear of 230, shared batch, partial 429 | 11 | 2 | — |
| 15 | converted-queue delete via rule + gating | 4 | 1 | — |
| 16 | no override text/UID/gifter/token in safe_detail and logs | 6 | 1 (extend 2, 3) | — |
| 17 | FK RESTRICT | 16 | 1 | — |
| 18 | rollback migration on disposable copy | 16 | 1 | — |
| 19 | handling CHECK + default | 13, 16 | 1 | — |
| 20 | non-sub keep vs auto | 13 | 2 | — |
| 21 | CHECK rules 6–8 | 13 | 1 | — |
| 22 | UNFULFILLED guard | 8 | 3 | — |
| 23 | refund override vs mark served | 8, 14 | 3 | 2+ connections |
| 24 | bulk 120 rows, replay | 8 | 3 | — (plus RC-5 concurrent replay) |
| 25 | delete gated by pending rows | 4, 13 | 3 | — |
| 26 | everyone never produces awaiting/fulfill | 1 | 1 | — |
| 27 | D1 check_pending + check task, attempts | 5, 14 | 2 | — |
| 28 | worker vs override race | 8, 14 | 2/3 | 2+ connections |
| 29 | D2 next_check_at lifecycle + CHECK | 7 | 2 | — |
| 30 | D3 check task out of financial counters/claim | 14 | 2 | — |
| 31 | OD-1 additive audiences | 2, 10 | 2 | — |
| 32 | Q5 immutability | 5 | 1 | — |

DM-18 and DM-1 need "migrations up to N-1": copy the migration subset into a run-scoped directory **inside the project** (for example under the repo's ignored test workspace), never `/tmp` (owner rule), and remove it in `afterAll`.

## 5. Pure evaluator (`RefundEligibilityPolicy.evaluate`)

### 5.1 Table-driven (`it.each`, layer U)

Domain: rule {everyone, subscribers, nobody} × isBroadcaster {t,f} × flags {broadcaster, mods, VIPs} (8 combos) × countGiftedSubs {t,f} × subscription {none, t1000, t2000, t3000, gift, unknown(reason)} × moderator {yes, no, unknown, not asked} × VIP {yes, no, unknown, not asked}. Expected columns: `decision`, `statusSource`, `audienceMatch`, `subscriberStatus`, `tier`, `isGift`, `unknownReason`, `lookups[]`.

- EV-1 `everyone` → eligible, `not_required`, no lookups, for every other input.
- EV-2 `nobody` → not_eligible, `not_required`, no lookups.
- EV-3 rule outside domain → throws (programming error), never a decision.
- EV-4 broadcaster: `broadcaster_self`, no lookup ever, eligible iff `includeBroadcaster`.
- EV-5 subscriber, flags off → eligible, `audienceMatch` null (owner decision 7).
- EV-6 non-subscriber moderator, mods on → eligible, `moderator`; mods off → not_eligible.
- EV-7 VIP likewise.
- EV-8 without `statuses` under `subscribers` → `needs_lookup` with only `subscription`; `moderator`/`vip` only when flag on (OD-1).
- EV-9 gifted + `countGiftedSubs=false` → not_eligible, `isGift=true`, tier kept.
- EV-10 tier stored for every tier; no min-tier input accepted (out of MVP).
- EV-11 called from a trigger whose switch is off → evaluator not called (tested at domain level: no decision row).
- EV-12 short-circuit: subscription eligible + moderator unknown → eligible; subscription unknown + moderator flag on and moderator yes → eligible; subscription not_sub + required moderator unknown → unknown with that reason.
- EV-13 "zero subscribers" (`ok` with empty `byUserId`) → not_subscriber only for an `ok` status; `unknown` batch → unknown.

### 5.2 Properties (layer U)

Use fast-check **if adopted** (section 14); otherwise a seeded exhaustive loop over the finite domain above (same guarantee here, no new dependency).

- EV-P1 determinism and purity: same input → deep-equal output; no clock/network access (spy on `Date.now`, `fetch`).
- EV-P2 `everyone` never needs a lookup; `nobody` always not_eligible.
- EV-P3 monotonic audiences: turning any flag on never turns eligible into not_eligible or unknown.
- EV-P4 any required-and-relevant unknown never yields `not_eligible`; it yields `unknown` unless another known source makes the viewer eligible.
- EV-P5 broadcaster never produces a lookup.
- EV-P6 gifted subscriber eligible iff `countGiftedSubs`.
- EV-P7 output always satisfies the DB CHECKs of data-model §2.2 (`decision`/`unknownReason`, `subscriber` ⇔ tier+gift, `not_required` ⇒ `not_checked`): a shared validator is applied to every generated output, linking U to P.

## 6. Twitch adapter contract tests and worker

### 6.1 Adapter (`TwitchSubscriberStatusAdapter`, layer U)

Primary: HTTP-level fake behind the **real** Twurple 8.2.0 client (undici `MockAgent` with `disableNetConnect`, or `fetchOptions` injection; choice is a `@dev` decision). Secondary: port-level fake for everything above the adapter.

| ID | Case | Expected |
|---|---|---|
| AD-1 | 429 with `Ratelimit-Remaining: 0` and `Ratelimit-Reset` = now+N (fake clock) | document observed behavior: Twurple sleeps and retries (VERIFIED in source, test-research §0); assert one final result, total wait bounded by `lookupTimeoutMs`, no double wait with our back-off |
| AD-2 | 429 with `Remaining > 0`, or no reset header | `{status:'unknown', reason:'rate_limited', retryAt}`; fallback `retryAt` bounded when header missing |
| AD-3 | 99/100 ids → one request; 101 → two; 230 → three (100/100/30); query string has each `user_id` once | Twurple does not chunk (F10) |
| AD-4 | 400 for one malformed id in a chunk | whole chunk `unknown` (`lookup_error`), never 99 × not_subscriber; ids validated `^\d{1,32}$` before the call |
| AD-5 | absent user in `data` with 200 + valid shape | `not_subscriber` |
| AD-6 | malformed body, missing `tier`, `is_gift` not boolean, partial `data`, extra unknown tier | `malformed_response`, never partial ok |
| AD-7 | scope pre-check: `channel:read:subscriptions` missing (also `moderation:read`, `channel:read:vips` for flags) | `scope_missing`, **no HTTP request** made |
| AD-8 | channel not affiliate/partner (`getChannelEligibility`) and 403 "not a partner or affiliate" | `channel_ineligible`; 403 other → `forbidden` |
| AD-9 | 401 → Twurple refresh path → still 401 | `unauthorized`; with refresh success, retried request succeeds once (token refresh case) |
| AD-10 | 5xx, network error, timeout | `server_error` / `lookup_error` / `timeout` |
| AD-11 | classification by status only: same status with different message text → same reason | F6 |
| AD-12 | logs and errors contain no user ids, logins, gifter fields, tokens | structured-logger capture |
| AD-13 | moderators/VIPs endpoints: same 100-id batching and mapping | F5 |
| AD-14 | `updateRedemptionStatusByIds` stays one id per task in MVP (`financial.redemptionUpdateBatchMax=1`); config above 50 rejected | F3 |

### 6.2 Eligibility worker (layer U with fake repository + layer W on PostgreSQL)

Clock injected into worker and repository; PostgreSQL tests set explicit past/future timestamps instead of sleeping (fake timers do not move PostgreSQL `now()`).

| ID | Case |
|---|---|
| WK-1 | claim ≤ batchMax rows of **one** queue; two workers on two connections claim disjoint sets (`SKIP LOCKED`), repeated 20–50 times with a barrier |
| WK-2 | 429 → whole chunk keeps `pending_check`, `next_check_at` = reset + bounded jitter, worker pauses; one counted attempt per reset |
| WK-3 | 5xx/timeout → exponential back-off, stops at `maxAttempts` (5) or `maxAgeMinutes` (60) and moves to "awaiting you" grouping |
| WK-4 | `malformed_response` → one retry, then stop |
| WK-5 | `scope_missing`, `unauthorized`, `forbidden`, `channel_ineligible` → no automatic retry |
| WK-6 | no DB transaction open during the provider call (assert via a fake provider that checks an "in transaction" probe, plus PostgreSQL `pg_stat_activity` showing no `idle in transaction` from the worker during a held fake call) |
| WK-7 | re-consent grants scope → `scope_missing` rows re-armed once (new round `eligibility:{id}:{round+1}`) |
| WK-8 | mods/VIPs lookups only for non-subscribers with flag on |
| WK-9 | evaluator uses the row's `rule_snapshot`, not the live queue rule (change rule between trigger and check, R7) |
| WK-10 | worker logs: reason codes, counts, batch ids only |
| WK-11 | not claimed before `next_check_at`; claimed at/after; reset in the past → minimum delay |
| WK-12 | lease expiry mid-call: a late answer from an expired lease must not overwrite a newer round or a resolved row |

### 6.3 Race and idempotency (layer P/W, ≥ 2 real `pg`/Prisma connections, barrier, 20–50 repetitions, assert table state)

- RC-1 **double refund**: N parallel transitions/decisions on one redemption → exactly one decision row and one `financial:{id}` outbox row.
- RC-2 **double mark served**: two parallel single overrides `mark_served` on one redemption → one `redemption.fulfill`, one `override_applied`, one `override_rejected` (or `stale_version`).
- RC-3 **override vs worker** (DM-28 both orders): override first → worker guarded update changes 0 rows; worker first → override rejected `already_has_financial_intent`.
- RC-4 two workers on the same `check_batch_id` → each row completed once, `check_attempts` incremented once per executed attempt.
- RC-5 double bulk with the same `resolutionBatchId`, sent concurrently → one execution, both responses equal the stored result.
- RC-6 double clear confirmation (chat + panel) → one clear, one batch, no second decision rows.

## 7. E2E and browser flows (UX plan)

Browser-only (B) with mocked API via the `qra-api-fixtures` style; Compose Chromium (C) only for E2E-C1..C3. Each B scenario at 1280 × 800 and 390 × 844, keyboard-only variant included.

| ID | Flow | Layer | UX ref |
|---|---|---|---|
| E2E-1 | Settings: choose "Only subscribers" → blocks C/D/F appear after the group; focus stays on radio; hint "More options appear below" present; manual-only queue and non-affiliate channel hide the section; converted manual queue shows read-only summary | B | UX-1, UX-2, UX-10 |
| E2E-2 | Conditional fields: switching subscribers → everyone → subscribers keeps flag values; payload sends hidden values unchanged | B | UX-1 |
| E2E-3 | Irreversible warning on **Save** (not on radio change): keep → auto opens S1, default focus "Keep pending", Escape keeps draft and returns focus to Save, accept submits once | B | UX-11 |
| E2E-4 | "Needs your decision" list: summary count, badge opens and focuses heading, two groups by reason, rendered also for `deleting` queue, hidden at 0 | B | UX-13, UX-14 |
| E2E-5 | Manual override R1/M1: alertdialog labelled/described, reason mandatory (empty → focus, `aria-invalid`, `role="alert"` error), 280 limit, preset stored; R1 non-eligible and cancels-check lines | B | UX-9, UX-15 |
| E2E-6 | Bulk mark served: mixed header checkbox, cap 100, prune on refresh with pruned count, one reason per batch, **partial result** lines done/skipped/rejected, stale 409 re-fetch | B | UX-5, UX-16 |
| E2E-7 | Clear/delete copy per rule × handling: everyone/subscribers-keep/subscribers-auto/nobody-keep/nobody-auto, plural 1 and n, verb buttons, result lines omit zero, delete waiting line + jump button | B | UX-18 |
| E2E-8 | Re-consent notice: block E warning, dirty form shows "save first", three entry points call one action, connection card rows only when needed | B | UX-12, UX-19 |
| E2E-9 | Permission round trip with fake OAuth: granted with count / none / denied | C | UX-21 |
| E2E-10 | 390 × 844: no horizontal scroll, targets ≥ 44 × 44, dialogs fit, destructive button last; 200% zoom reflow | B | UX-24 |
| E2E-11 | Chat fake: rule-aware messages never include a viewer name together with subscriber status | U + C | UX-26 |
| E2E-C1 | Configure subscribers + keep, clear, fake worker answers move rows checking → waiting, return one, bulk the rest | C | UX-20 |
| E2E-C2 | Delete blocked by pending decisions, resolve, delete continues; reward delete only after resolution | C | UX-22 |
| E2E-C3 | Default queue (everyone) end to end unchanged: clear and remove produce today's outbox and copy | C | REG |
| E2E-A | axe scan of settings, decision section and dialogs in target state (if adopted): zero serious/critical; `incomplete` items go to manual review | B | UX-25 |

OD-UX-1: "subscribers"/"nobody" are exposed in the panel only with slice 3, so E2E-1..E2E-8 run in slice 3; slices 1–2 get a B test proving the options are **not** exposed.

## 8. Manual assistive-technology checklist (layer M)

Record tool + version, browser + version, OS, build commit, tester, date. axe has no live-region rule and finds about 57 % of WCAG issues, so these are mandatory before release.

- AT-1 NVDA + Firefox/Chrome (Windows): rule group name and options announced; arrows change selection.
- AT-2 Conditional audience checkboxes reachable and understood after "More options appear below".
- AT-3 Scope-missing warning and "Allow on Twitch" reachable and announced.
- AT-4 S1/R1/M1/B1/C1/D1: title then description read on open, focus inside, Escape returns to invoker or fallback heading.
- AT-5 Result live region announced once per outcome; polling changes not announced (except focused-row-removed line).
- AT-6 Decision rows: repeated buttons distinguishable by viewer name; mixed checkbox state announced.
- AT-7 VoiceOver + Safari (macOS) repeat AT-1..AT-6.
- AT-8 VoiceOver + iOS Safari at 390 × 844 (M3); TalkBack optional (M4).
- AT-9 200% zoom and keyboard-only pass with no focus loss to `body`.
- Non-AT manual: M5 reading test (pt-BR streamer + es speaker), M6 Twitch dashboard labels, M7 contrast of `.is-warning`/`button-danger`.

## 9. Regression guard: default preservation

- REG-1 Migration on populated data (DM-1): every existing row gets `everyone`/`false`/`false`/`false`/`true`/`keep_unfulfilled`; all old columns byte-equal (compare full row JSON before/after).
- REG-2 Golden outbox (DM-3): for `everyone` and each of the six triggers × existing switch combinations, outbox rows (type, key, status), `expected_status` and audit `financialDecision` equal the pre-OPS-20 output. The golden fixture is recorded **before** slice 1 code changes (Red evidence) and committed as test data.
- REG-3 No `awaiting_streamer`/`fulfill_requested` under `everyone` (DM-26); no Helix subscriptions call under `everyone`/`nobody` (fake provider asserts zero calls).
- REG-4 Existing suites stay green unchanged: `queue-repository.test.js`, `financial-outbox-worker.test.js`, `queue-domain-service.test.js`, `queue-confirmation-copy.test.js`, `clear-confirmation.test.js`, `next-queue-clear*.test.js`. Any expected-value edit in these files needs a written reason in the story (copy changes from OD-UX-2 only).
- REG-5 Chat/panel copy under `everyone` keeps today's meaning (golden text test, U1.2), with the new term "return the points".
- REG-6 OAuth: required scopes unchanged; existing connection without new scopes still passes health and existing flows (AC 9).

## 10. Slice entry/exit criteria

Red-first evidence for every slice: for each new behavior, the failing test run (command, commit, failing test names, failure reason that matches the missing behavior, not a syntax error) is recorded in the story **before** the implementation commit, then the green run. Refactor-only commits keep the suite green.

| Slice | Entry | Exit (all required) |
|---|---|---|
| **1** migration, evaluator, everyone/nobody, forced paths through the rule | OPS-15 migration finished; this plan PASS/CONCERNS; golden fixture (REG-2) recorded on current code; data-engineer migration reviewed | EV-1..EV-13, EV-P1..EV-P7; DM-1..4, 9, 10, 15..19, 21, 26, 32; REG-1..REG-6; MG-1..MG-4; B test: subscribers/nobody not exposed; terminology guard UX-8; quality gates green |
| **2** port, adapter, worker, batching, 429, scopes, re-consent, subscribers rule | slice 1 exit; OD-1 answered (done, decision 7); dependency decisions of section 14 taken; F11 Twurple 429 read in source and AD-1 written Red | AD-1..AD-14; WK-1..WK-12; RC-1, RC-4; DM-5..8, 11, 14, 20, 27, 29..31; UX-3, UX-4 status mapper; REG suite still green |
| **3** override, bulk, lists, gating, copy | slice 2 exit; UX ≥ 9.0 static on final strings; OD-UX-2/3 applied | DM-12, 13, 22..25, 28; RC-2, RC-3, RC-5, RC-6; UX-1..UX-19; E2E-1..E2E-11, E2E-C1..C3, E2E-A (if adopted); AT/M checklist run or listed pending with owner acknowledgement; final UX review; real Twitch blocker restated |

Quality gates at every slice exit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static`.

### Migration checks (MG, layer P)

- MG-1 drift gate: after `migrate deploy` on an empty disposable DB, `prisma migrate diff ... --exit-code` returns 0. **Flags must be confirmed against Prisma 6.19.3 `--help`** (current docs describe v7); record the exact command used.
- MG-2 expand-only SQL review: only ADD COLUMN / CREATE TABLE / CHECK / INDEX; starts with `SET LOCAL lock_timeout`.
- MG-3 `migrate deploy` re-run is a no-op (existing pattern).
- MG-4 rollback migration on a disposable copy (DM-18); previous code tests pass against it.

## 11. Test-data safety

- Only disposable PostgreSQL containers/volumes created per run with unique names and labels; cleanup through `isolated-postgres-cleanup.mjs`/`isolated-compose-cleanup.mjs`, verifying ownership labels before removal. Never touch active developer volumes, images or containers.
- No test reads `DATABASE_URL` of the developer environment; connection strings come from the container started by the test.
- No writes to `/tmp` or outside the project (owner rule); run-scoped migration copies and artifacts live in ignored project paths and are removed in `afterAll`.
- Twitch: fakes only; `disableNetConnect` (or equivalent) so no test can reach `api.twitch.tv`; fake ids match `^\d{1,32}$` and are synthetic.
- Fixtures contain no real logins, tokens or gifter data; override reasons in fixtures are synthetic.
- Each test creates its own queue/slug (`randomUUID`) so parallel files cannot collide.

## 12. Real Twitch: documented blocker (layer T)

Not runnable in this plan. Requires an affiliate test channel, at least one paid, one gifted and one Prime subscriber, a moderator and a VIP, the optional scopes and a re-consent. Open questions that only T can answer: Prime representation (F2), broadcaster in own subscription list, real 429 budget and Twurple behavior under load (F7, F11), pending UNFULFILLED expiry/cap (F8), latency, Twitch dashboard labels (M6). No release note or story evidence may claim any of these.

## 13. Risks, concerns and unrun checks

| # | Item | Effect on gate |
|---|---|---|
| C1 | Nothing in this plan was run; all counts and behaviors are planned. | inherent |
| C2 | Dependencies (axe, fast-check, HTTP fake) not decided; plan has non-dependency fallbacks (seeded exhaustive loop, axe injected via `page.addScriptTag` only if adopted, `fetchOptions` injection). | CONCERNS |
| C3 | Twurple internal 429 retry (VERIFIED in source) may absorb waits beyond `lookupTimeoutMs`; AD-1 must define the expected combined behavior before slice 2 code. | CONCERNS |
| C4 | Prisma 6.19.3 `migrate diff` flags unverified (docs show v7). | CONCERNS (MG-1) |
| C5 | Streamer vs moderator actor (architecture A2) unverified; tests for `resolved_by = moderator` depend on roles existing. | CONCERNS |
| C6 | Story gate line for `@architect` still says "OD-1 pending" while owner decision 7 resolved it; `@po` should align wording. | docs |
| C7 | Chat catalog plural support unverified (OPS-14, #65); E2E-11 checks privacy only. | follow-up |
| C8 | Race tests are probabilistic; 20–50 repetitions reduce but do not eliminate false passes; failures must never be retried silently. | inherent |
| C9 | Real Twitch, AT and visual checks are pending by nature. | blocker/manual |

Unrun checks: every test in this plan; `npm run review:static` and other gates were not run (no code changed).

## 14. Dependencies to add (decisions for `@dev`/`@architect`, with official-doc research)

| Candidate | Purpose | Fallback without it |
|---|---|---|
| `fast-check` (+ optional `@fast-check/vitest`) | EV-P properties with shrinking | seeded exhaustive loop over the finite domain |
| `@axe-core/playwright` or `axe-core` injected | E2E-A automated WCAG scan | Playwright role/focus assertions + manual AT only |
| undici `MockAgent` (Node built-in undici exposure to be verified) or `msw` | AD HTTP-level fake behind real Twurple | port-level fake + `fetchOptions` injection |
| `testcontainers` | — | not recommended; keep repo disposable-container pattern |

## 15. Verdict and score

**Verdict: CONCERNS.** Reasons: complete AC → test → layer traceability for all 17 ACs; all 32 data-engineer tests mapped by AC and slice; evaluator, adapter (429 variants, 4xx batch → unknown, scope, non-affiliate, 100-id batching, refresh), worker and race coverage with ≥ 2 real connections; per-slice Red-first entry/exit; regression guard; evidence separation and data safety defined. Concerns C2–C5 are decisions or verifications that must close before or during slice 2, not plan defects.

**Plan quality score: 9.0/10.** Not higher because: dependency choices are open (C2), the Twurple 429 interplay is specified as "observe then fix expectation" (C3), the Prisma 6.19 drift command is not pinned (C4), and actor-role tests depend on an unverified assumption (C5).
