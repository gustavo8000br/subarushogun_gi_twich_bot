# OPS-21 — Harden the panel API contract: idempotency, session recovery, error codes

[Português brasileiro](../../pt-BR/stories/OPS-21/story.md)

**Status:** Ready (`@po` GO 2026-10-22, 9/10) — remaining planning gates pending (`@data-engineer`, `@ux-design-expert` for slices 3 and 6, `@qa`). Implementation by `@dev` only after the gates, an issue created by `@devops`, and when the OPS-15 panel migration state allows it; slices 1–2 may go first. **Issue:** pending `@devops` (to be created before implementation; no issue comments).
**Source:** Structural review findings S-04, S-05, S-06 and S-14 ([structural-review.md](../OPS-15/structural-review.md)); research by `@analyst` ([api-contract-research.md](../OPS-15/api-contract-research.md)); architect decision ([api-contract-decision.md](../OPS-15/api-contract-decision.md), D4.1–D4.9 and D5.1–D5.4, 7 slices in §9, complexity 17 COMPLEX in §10, questions for `@data-engineer` in §7, owner decisions in §8).
**Related:** OPS-15 (Next panel migration; the vanilla panel removal is reserved and needs explicit owner authorization); FND-3 (durable outbox); FND-9 (queue/reward lifecycle).
**Coordination required:** `$aiox-po` (validation), `$aiox-data-engineer` (migration and §7 answers), `$aiox-ux-design-expert` (score ≥ 9.0/10 for slices 3 and 6), independent `$aiox-qa`, `$aiox-devops` (issue), `$aiox-architect` (consulted on per-route promotion).

## Problem

The panel API contract has four linked weaknesses (decision document, §0–§4):

- **S-04 Idempotency.** A 5xx leaves the record in `processing` forever (the `onSend` hook returns early at `>= 500`), including deliberate route 503s such as "Twitch unavailable". A crash between the domain commit and `completePanelOperation` also leaves `processing` with work already committed. The key is scoped to the in-memory session id, so an API restart changes the scope, and the Next client creates a new UUID per call, so replay never covers the case it exists for.
- **S-05 Session.** Sessions are an in-memory `Map`; an API restart invalidates every cookie, the client caches the CSRF token and never re-initializes, and 401/403 carry no `code`, so the operator needs a full reload without knowing why.
- **S-06 Error codes.** About 90 response sites send pt-BR text without `code`, so the clients collapse them to `REQUEST_FAILED`. `userError()` also drops the domain code it already knows.
- **S-14 Path matching.** The `/api/session` and `/callback` exemptions compare the exact `request.url`, so a query string breaks them (three places).

The session id is also written at rest (`processed_operations.operation_key`, `audit_logs.actor_id`), which is harmless today only because sessions die with the process.

## Story

As the operator of the local queue panel,
I want the API to answer every failure with a stable error code, to recover on its own when the API restarts, and to never leave an operation stuck or run it twice when I retry,
so that I can trust a retry after an uncertain outcome and understand what happened without reloading or guessing.

## Acceptance criteria (refined)

Each AC traces to the decision document. Evidence follows the project rules: unit and fixtures are separated from isolated PostgreSQL (real migrations, disposable instance), real browser and OBS/CEF.

### Slice 1 — Session and idempotency codes, path helper (S-06 partial, S-14)

1. The `onRequest` hooks answer 401 `LOCAL_SESSION_REQUIRED`, 403 `CSRF_INVALID`, 403 `ORIGIN_INVALID` and 403 `HOST_INVALID`, with the same HTTP statuses as today. `tests/unit/local-session.test.js` gains `code` assertions (D5.1).
2. The idempotency points send `code`: missing or invalid key 400 `IDEMPOTENCY_KEY_REQUIRED`; repository unavailable 503 `IDEMPOTENCY_STORE_UNAVAILABLE`; payload mismatch `IDEMPOTENCY_KEY_REUSED` (status stays 409 until slice 4); in progress 409 `PANEL_OPERATION_ALREADY_IN_PROGRESS` (research §3 code list, decision N6 and owner decision 3).
3. `userError()` sends the domain code it already maps (for example `DUPLICATE_QUEUE_KEY`, `RESERVED_QUEUE_KEY`) as `code`, keeping `error` (decision §3).
4. The body of every changed site keeps `error` during this story. Assertions that use `toEqual({ error })` are updated explicitly to `toEqual({ code, error })`, never loosened to `toMatchObject`. Fixtures that already carry `code` stay (decision §3, step 1).
5. A single shared helper compares the pathname without the query string in the three places: session bypass and `/callback` CSRF exemption in `local-session.mjs`, and idempotency bypass in `queue-routes.mjs`. Tests: `/api/session?x=1` is exempt; `/api/session/`, `/api/sessionx`, `/api//session` and `/api/%73ession` are not exempt; `/callback?code=..` is exempt from CSRF only for GET as today (D14.1).
6. Optional hardening in the same slice (D5.4): mutations whose `Sec-Fetch-Site` is present and not `same-origin` are rejected; the Origin check stays as fallback; the header is never required (CEF/OBS may omit it). Tested with and without the header. Whether it ships is recorded in this story; if it ships, both tests are mandatory.
7. Red-first: failing unit tests for the `code` of each site and for the S-14 path matrix. No behavior change other than body fields and the query-string exemption.

### Slice 2 — Remaining S-06 sites, catalogs, guard test

8. Every remaining non-2xx site listed in decision §3 (command catalog and follower authorization, operations, reconciliation, setup, queue creation, queue/entry/priority, reward association, transitions, call, clear, lifecycle, account labels, and `overlay-routes.mjs`) sends a `code` from an enumerated list, with `error` kept. The list is published in `endpoint-catalog-inventory.md`.
9. Every new code has a catalog key in en, es and pt-BR and an entry in `ERROR_KEYS`; unknown codes fall back to `panel.error.generic`. `panel-error-presentation.test.js` gains one row per code; `npm run validate:localization` passes (D6.3). The clients never render server prose. The new catalog copy is user-facing, so it passes `@ux-design-expert` review (≥ 9.0, project rule) before slice 2 merges; until then new codes may map to `panel.error.generic`.
10. A guard test (route scan or exercise of each failure path) fails if any `reply.code(>=400).send(...)` lacks an enumerated `code`. Red-first: it fails first and lists the code-less sites (D6.4).
11. QRA fixtures: QRA-05/06/07 gain `QUEUE_NOT_FOUND`, `ENTRY_NOT_WAITING`/`INVALID_QUEUE_POSITION` and `ENTRY_NOT_WAITING` as in decision §3, step 1.

### Slice 3 — Session recovery in the Next client (S-05, option C)

12. On `LOCAL_SESSION_REQUIRED` or `CSRF_INVALID` the Next client performs **one** transparent session re-init, with a single-flight shared promise for concurrent callers, then **one** retry of the same request with the **same** idempotency key. GETs are always eligible; mutations are eligible because these 401/403 come from `onRequest`, before the idempotency preHandler and the handler (hook order pinned by a test) (D5.2, owner decision 4).
13. No retry on `ORIGIN_INVALID`, `HOST_INVALID`, `SESSION_INITIALIZATION_FAILED` or a second session failure. The panel then shows the catalog message "session restarted — reload the panel". A Twitch OAuth flow interrupted by an API restart is not recovered by re-init; the operator restarts the connection (decision N5).
14. The in-memory session store is capped or reuses sessions, so unauthenticated `GET /api/session` calls cannot grow it without bound (decision §6).
15. Red-first: unit tests for single-flight, one retry, same key and no retry on ORIGIN/HOST in `tests/unit/next-api-client.test.js`; an API-restart integration test that fails today; a real-browser e2e for re-init. Copy and flow (including whether any indicator is shown during silent re-init) pass `@ux-design-expert` ≥ 9.0 before implementation.
16. Option A (persistent signed/encrypted cookie) is **not** implemented. It stays deferred and blocked until: (a) `audit_logs.actor_id` and every other at-rest use stop storing the raw session id; (b) a durable secret story exists (generation, file permissions, rotation with two keys); (c) OAuth state binding is re-checked (D5.3, owner decision 4).

### Slice 4 — Idempotency server state machine (S-04 server)

17. Additive migration owned by `@data-engineer` on `processed_operations` (state, lease, update time and kind columns, and indexes as answered in §7), with no table rewrite, forward-reversible, and non-panel rows (chat cooldown/message, `queue.local_archive.challenge`) needing no change in their writers (D4.9, §7 Q1–Q6).
18. The operation key becomes `panel:v2:<key>`, without the session id; the current key regex is kept and keys must have at least 32 characters. Old `panel:<session>:<key>` rows can never match; they are deleted or reaped as decided in §7 Q2 (D4.6, owner decision 3).
19. `processing` rows carry a 60 s lease. A request with the same key and fingerprint after expiry takes over with **one conditional statement** (`UPDATE ... WHERE operation_key = $1 AND state = 'processing' AND lease_until < now() RETURNING ...`); zero rows means someone else owns it. Never read-then-write. Under concurrency, exactly one request wins (D4.2).
20. 5xx policy (hybrid): each route is `reexecutable` or `terminal_unknown` and **starts as `terminal_unknown`**. On 5xx, `terminal_unknown` completes the row with a stored `503 { code: 'OPERATION_OUTCOME_UNKNOWN' }`; `reexecutable` marks it `failed_retryable` with no body and the same key and fingerprint run again. Lease takeover follows the route class: `terminal_unknown` yields the stored `OPERATION_OUTCOME_UNKNOWN`, without re-execution (D4.1, D4.2, owner decision 2). This includes deliberate route 503s (decision N3).
21. Payload mismatch answers **422** `IDEMPOTENCY_KEY_REUSED` (was 409). A test pins that both panels map by `code` and do not branch on 409 vs 422 (D4.3, owner decision 3).
22. In progress (valid lease) answers 409 `PANEL_OPERATION_ALREADY_IN_PROGRESS` with `Retry-After: 2`; no new code is created (D4.4, owner decision 3).
23. Replay keeps `idempotency-replayed: true`; the one-time overlay secret special case stays; replays never re-send `set-cookie` or other stored headers (D4.8).
24. Retention is 24 h. A reaper, running at API startup and on an interval in the API process (not the worker), deletes `kind = 'panel_mutation'` rows in `completed` or `failed_retryable` older than 24 h, and `processing` rows whose lease expired more than 24 h ago. It never touches non-panel rows. The policy is published in `endpoint-catalog-inventory.md` (D4.5, owner decision 2).
25. Explicit timeouts (proposed ≤ 15 s) exist on every Twitch call inside request paths, verified per route **before** the lease ships; today only the OAuth token fetch has one (D4.2, decision N8).
26. Logs of new codes and lease events never contain keys, tokens, cookies or bodies; at most `code`, route pattern and a truncated hash of the key (decision §6).
27. Red-first on isolated PostgreSQL with real migrations (no SQLite, no Prisma mocks): stuck after 5xx, expired-lease takeover, concurrent takeover (exactly one winner), mismatch 422, replay, in-progress 409 with `Retry-After`, and reaper keeping non-panel rows. Existing tests are updated explicitly: fake `beginPanelOperation` (lease/failed state), 409 to 422, 5xx paths, `tests/integration/queue-repository.test.js`, QRA PostgreSQL fixtures and `postgres-foundation`.
28. Slice 4 is not bundled with UI work (decision §10).

### Slice 5 — Per-route promotion to `reexecutable`

29. A route moves from `terminal_unknown` to `reexecutable` **only** with a PostgreSQL test proving its domain guard (version check, outbox `idempotencyKey @unique` or state precondition) against duplicate execution, including a failure after the domain commit and before `completePanelOperation` (decision N7). Per route: a duplicate-execution test that fails first or proves the guard.
30. The route table documents each route's class with a reference to its test. Routes without evidence stay `terminal_unknown`; there is no bulk promotion (owner decision 2). Whether `completePanelOperation` runs inside the domain transaction (§7 Q5) is recorded as an input for this slice.

### Slice 6 — Per-intent keys in the Next client (S-04 client)

31. An intent (click "call next", submit "create queue", confirm "clear", etc.) creates a key once, kept in component state (`useRef`), never in `localStorage`. The same key is reused only on the uncertain path (`status 0`, 5xx with `failed_retryable`, 409 in progress, and the single re-init retry of AC 12). The key is dropped when the outcome is known (2xx, 4xx, `OPERATION_OUTCOME_UNKNOWN`). A payload change creates a new intent. No automatic mutation retry loops (D4.7).
32. The vanilla panel keeps per-call UUIDs, unchanged (D4.7).
33. UX copy and flow (`OPERATION_OUTCOME_UNKNOWN` "check the current state before repeating", "operation in progress — try again in a moment", which actions expose "retry the same action") pass `@ux-design-expert` ≥ 9.0 before implementation. Static review and real browser/OBS validation are scored separately.
34. Red-first: unit suites (`next-queue-clear`, `next-queue-creation`, `next-queue-lifecycle`, `next-queue-entry-actions`, `next-locale-picker`) and the browser recovery e2e (creation-uncertain, manual-entry-recovery, reward-settings-recovery, settings-recovery, lifecycle, reward-resolution, call-resend) fail on a new key per retry; the same key is observed on retry in a real browser.

### Slice 7 — Remove `error` (only with vanilla removal)

35. The `error` field is removed only together with the owner-authorized removal of the vanilla panel; assertions change to `{ code }` only. Optional: RFC 9457 field names (`type: urn:queuebot:error:<code>`, `status`, `title`), with `code` kept as an extension member (D6.1, D6.2, owner decision 4).

## Decisions (owner, 2026-10-22)

1. **Separate story.** The work is this story, OPS-21, with an issue created by `@devops`.
2. **Hybrid 5xx policy.** Each route starts as `terminal_unknown`; promotion to `reexecutable` is per route and only with PostgreSQL evidence. The lease is 60 s with atomic takeover; retention is 24 h (D4.1, D4.2, D4.5).
3. **Key and codes.** Key scope is `panel:v2:<key>` without the session id (D4.6); the current key regex is kept, with at least 32 characters; payload mismatch changes from 409 to 422 `IDEMPOTENCY_KEY_REUSED` (D4.3); the existing code `PANEL_OPERATION_ALREADY_IN_PROGRESS` (plus `Retry-After`) is reused for in-progress instead of creating a new one (D4.4).
4. **Session recovery option C.** One transparent re-init with single-flight and exactly one retry with the SAME idempotency key (D5.2). The persistent cookie is deferred and blocked until the raw session id stops reaching `audit_logs` and `operation_key` (D5.3). The `error` field is removed only together with the vanilla removal (D6.1).

## Out of scope

- Option A (persistent signed/encrypted session cookie, session table) — deferred and blocked (AC 16).
- Removal of the vanilla panel and any cutover (needs explicit owner authorization); `error` removal and RFC 9457 content type until then.
- Automatic mutation retry loops; a new idempotency code for "in progress".
- Changing the Twitch OAuth flow or recovering an OAuth flow interrupted by an API restart.
- Edits to code, migrations or issues in this planning step; version bump, commit, push, release.
- Live Twitch, OBS/CEF or browser validation claims before those suites run.

## Planning gates before implementation

- [x] `@analyst` research: idempotency, sessions/CSRF, error envelope, path matching ([api-contract-research.md](../OPS-15/api-contract-research.md), 2026-10-22; desk review only).
- [x] `@architect` decision: D4.1–D4.9, D5.1–D5.4, D6.1–D6.4, D14.1, slices and complexity 17 COMPLEX ([api-contract-decision.md](../OPS-15/api-contract-decision.md), 2026-10-22; GO for planning, NO-GO for implementation until the items below).
- [x] Owner decisions 1–4 recorded (2026-10-22).
- [x] `@po` validation of this story (10-point checklist; 2026-10-22, 9/10, GO; see PO validation).
- [x] `@data-engineer` answers to decision §7 (Q1–Q6) and migration design, required before slice 4 ([data-model.md](data-model.md), 2026-10-22; planning GO with conditions in §13; design only, nothing executed).
- [ ] `@ux-design-expert` plan and review, score ≥ 9.0/10, required for slices 3 and 6, recorded in this story (static review distinct from visual, browser and assistive-technology validation).
- [ ] `@qa` test plan: PostgreSQL isolated, evidence separation, Red-first per slice.
- [ ] `@devops` creates the GitHub issue (and links this story); no issue comments.

### Slice entry criteria (decision §9)

| Slice | Entry criteria |
|-------|----------------|
| 1 | Owner decision 3; story and issue by `@devops` |
| 2 | Slice 1 merged; UX review of the new catalog copy before merge (AC 9) |
| 3 | UX ≥ 9.0; owner decision 4 |
| 4 | `@data-engineer` answers to §7; owner decisions 2 and 3 |
| 5 | Slice 4 |
| 6 | Slices 3–5; UX copy ≥ 9.0 |
| 7 | Vanilla removal authorized by the owner |

## Dependencies and risks

- **Depends on:** the OPS-15 panel migration state allowing the work (slices 1–2 may go first); `@data-engineer` answers for slice 4; UX score for slices 3 and 6; existing FND-3 outbox guards for slice 5.
- **OPS-20 interplay:** OPS-20 (refund eligibility, issue #76) adds panel routes and a manual refund override in `queue-routes.mjs` and touches the FND-3 financial outbox. Its new non-2xx sites must carry enumerated codes (AC 10 guard), its mutations start as `terminal_unknown` (AC 20) and are promoted only with the slice 5 proof, and the outbox key `financial:{redemption_id}` is a guard to cite, not to change. Whichever story merges second rebases on the other; neither changes the other's scope.
- **Idempotency table:** `processed_operations` is shared with chat cooldown/message and `queue.local_archive.challenge` rows; the worker does not own panel rows (AC 17, AC 24).
- **Complexity:** 17 → COMPLEX (scope 4, integration 3, infrastructure 3, knowledge 3, risk 4). Run as slices with a revision cycle.
- **Double execution:** a 5xx after a committed domain change (N7) can re-run a Twitch or financial operation if a route is wrongly promoted. Mitigation: default `terminal_unknown`, promotion with PostgreSQL proof only.
- **Lease shorter than a real request:** unbounded Twitch calls (N8). Mitigation: explicit timeouts before the lease ships (AC 25).
- **Replay across sessions:** without the session id in the key, a stored response is replayable by any session on this machine that knows the 122-bit key. Accepted by the owner for a single-operator loopback app.
- **Credential at rest:** the raw session id in `audit_logs.actor_id` blocks option A.
- **Retry storms:** no automatic mutation loops; one re-init; `Retry-After` is a hint only.
- **Test churn:** many `{ error }` assertions; explicit `toEqual` updates, no loosening.
- **Unverified (desk review):** `routeOptions.url` behavior in `onRequest` (the pathname is used instead), per-route guard behavior, and the absence of timeouts beyond the OAuth fetch (grep only). The IETF Idempotency-Key draft is Expired; it is used as vocabulary, not as a standard.

## Test and data safety

Tests first (Red). PostgreSQL guarantees require integration on an isolated, disposable PostgreSQL instance with real migrations; never SQLite or Prisma mocks; do not touch active volumes. Keep fixtures/mocks, unit tests, PostgreSQL, real browser and OBS/CEF evidence separated. Unexpected API failures return a generic localized text with `referenceId` and never internal data. No version bump, push or release without explicit owner authorization. Gates before closing: `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (OpenGrep only).

## Definition of Done

- Slices 1–6 meet their ACs and the exit criteria of decision §9, each with its Red-first evidence recorded by evidence class.
- All quality gates above are green; `@qa` gate recorded; File List and checklists updated in en and pt-BR.
- Slice 7 stays blocked on the owner-authorized vanilla removal; whether the story closes with slice 7 still open or slice 7 moves to a follow-up is an owner decision.

## PO validation (2026-10-22)

- **Validator:** `@po` (Pax). **Checklist:** 10 points (`story-lifecycle.md`) plus `story-draft-checklist.md`. **Score: 9/10 — GO** (status Draft → Ready). Implementation is still blocked by the pending gates and slice entry criteria.
- **Traceability:** all 35 ACs trace to D4.1–D4.9, D5.1–D5.4, D6.1–D6.4, D14.1, findings N3–N8, decision §3/§6/§10 or owner decisions 1–4. No invention found. AC 2 codes come from research §3; the in-progress code follows owner decision 3.
- **Size:** 35 ACs are acceptable because they are grouped by slice and each slice is independently testable; no trimming. Recommendation: one sub-issue per slice so each slice has its own PR and gate.
- **Fixes applied:** (1) UX review for the user-facing slice 2 catalog copy (AC 9, slice 2 entry); (2) OPS-20 interplay and the shared `processed_operations` table recorded in dependencies; (3) AC 6 made testable (record ship/no-ship); (4) Definition of Done added.
- **What blocks 10:** pending `@data-engineer` §7 answers, UX ≥ 9.0 for slices 2, 3 and 6, `@qa` test plan and the `@devops` issue; the timeout value in AC 25 is still "proposed ≤ 15 s"; story closure with slice 7 pending needs an owner decision.

## File List

- `docs/stories/OPS-21/story.md` (new)
- `docs/pt-BR/stories/OPS-21/story.md` (new)
- `docs/stories.md` (index entry)
- `docs/pt-BR/stories.md` (index entry)

Implementation files will be listed here by `@dev` after the gates.
