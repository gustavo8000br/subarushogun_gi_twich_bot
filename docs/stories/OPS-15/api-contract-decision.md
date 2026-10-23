# OPS-15 — API contract decision (S-04, S-05, S-06, S-14)

- Date: 2026-10-22 · Author: @architect (Aria) · Type: planning gate (no code, no migrations, no issue changes)
- Inputs: `api-contract-research.md` (@analyst), `structural-review.md` S-04/S-05/S-06/S-14, code at `feat/ops-15-next-panel` HEAD `4a44468`.
- Labels: **VERIFIED** (read in code or official source this session), **PARTIAL** (incomplete or secondary source), **UNVERIFIED** (inference; needs a test in this project).
- Limit: desk review only. Nothing here ran against PostgreSQL, a restarted API, a browser or OBS. Every "decision" below is a contract to be proven Red-first; it is not evidence that anything works.

## 0. Corrections and new findings against the research

| # | Finding | Label |
|---|---------|-------|
| N1 | Line numbers in the research are stale: the preHandler is `queue-routes.mjs:115-138`, the session-scoped key is **`:127`**, the 5xx early return is `:141`; session hooks are `local-session.mjs:36-62`. | VERIFIED |
| N2 | **Neither client reads the `error` text.** The vanilla `request()` keeps only `code`/`referenceId`/`status` (`apps/web/app.js:45-56`) and renders via `presentPanelError` (`apps/web/panel-error-presentation.mjs`), which never uses server prose. The Next client does the same (`apps/frontend/lib/api/client.mjs:41-45`). The research's "vanilla reads `error`" is wrong. `error` is pinned only by tests (73 matches in `tests/unit/queue-routes.test.js`). | VERIFIED |
| N3 | Route-level **deliberate 503s** (Twitch unavailable: `queue-routes.mjs:490,508,522,539`, etc.) also hit the `>= 500` early return, so a normal "Twitch is down" reply also leaves the key stuck in `processing`. S-04 is not only about crashes. | VERIFIED |
| N4 | **Credential at rest:** the session id is the cookie value. It is written into `processed_operations.operation_key` (`:127`) and into `audit_logs.actor_id` (`queue-repository.mjs:485,502,513,...`; `schema.prisma:140`). Harmless today only because sessions die with the process; it becomes a live credential leak if sessions are ever made persistent (S-05 option A). | VERIFIED |
| N5 | The session id also binds the Twitch OAuth flow (`queue-routes.mjs:228,305,318,323`). An API restart mid-OAuth breaks that flow regardless of S-05; re-init does not recover it (the user restarts the connection). | VERIFIED |
| N6 | The QRA fixture already models `LOCAL_SESSION_REQUIRED` for 401 (`tests/e2e/fixtures/qra-api-fixtures.mjs:68`), and the catalog already maps `PANEL_OPERATION_ALREADY_IN_PROGRESS` (`apps/web/panel-error-presentation.mjs:29`) though the server never sends it. Fixtures are ahead of the server. | VERIFIED |
| N7 | Completion is written in `onSend`, **outside** the domain transaction. A crash between the domain commit and `completePanelOperation` leaves `processing` with the work already committed. Any lease takeover can therefore re-execute a committed operation. | VERIFIED (code); consequence per route UNVERIFIED |
| N8 | Only the OAuth token fetch has an explicit timeout (`twitch/oauth.mjs:28`, 10 s). No Fastify `requestTimeout` and no timeout on other Twitch calls were found by grep, so "the longest route" is unbounded today. | PARTIAL (grep only) |
| N9 | `draft-ietf-httpapi-idempotency-key-header-07` is Expired, no RFC, no successor listed (re-checked 2026-10-22). RFC 9457 is Standards Track (July 2023), obsoletes 7807, extensions allowed and must be ignored if unknown, must not expose implementation details. | VERIFIED |

## 1. S-04 — Idempotency

### Decisions

| ID | Decision | Rationale / trade-off |
|----|----------|------------------------|
| D4.1 | **5xx = retryable failure, not a stored response**, but only for routes proven safe to re-execute. Every route gets a class: `reexecutable` (domain guard proven by a PostgreSQL test: version check, outbox `idempotencyKey @unique`, state precondition) or `terminal_unknown`. On 5xx: `reexecutable` → row becomes `failed_retryable` (no body), same key + same fingerprint runs again. `terminal_unknown` → row becomes `completed` with stored `503 { code: 'OPERATION_OUTCOME_UNKNOWN' }`, and the UI sends the operator to refresh state (the existing "uncertain" flows). | Pure Stripe-v1 "store the 5xx" is safe but leaves the operator stuck (the same problem S-04 reports). Pure "release" is only safe where re-execution is harmless (N7). The hybrid makes the unsafe case explicit instead of hoping. A route starts as `terminal_unknown` and is promoted only with evidence. |
| D4.2 | **Lease** on `processing`: `lease_until = now() + 60 s`. A request with the same key and same fingerprint after expiry takes over with one conditional statement (`UPDATE ... WHERE operation_key = $1 AND state = 'processing' AND lease_until < now() RETURNING ...`); zero rows = someone else owns it → 409. Never read-then-write. Takeover follows the route class from D4.1 (`terminal_unknown` → stored `OPERATION_OUTCOME_UNKNOWN`, no re-execution). | 60 s only makes sense if every outbound call inside a request has a timeout well below it (N8). **Precondition:** explicit timeouts (≤ 15 s proposed) on Twitch calls in request paths, verified per route before the lease ships. |
| D4.3 | **Payload mismatch → 422 `IDEMPOTENCY_KEY_REUSED`** (draft §2.7), replacing today's 409. | No client branches on 409 vs 422 (N2: both map by `code`), so the status change is safe for both panels. VERIFIED by reading both clients; must be pinned by a test. |
| D4.4 | **In flight (valid lease) → 409 `IDEMPOTENCY_IN_PROGRESS` + `Retry-After: 2`**. Rename or alias the existing catalog key `PANEL_OPERATION_ALREADY_IN_PROGRESS` (N6); one code only, chosen by the owner (see §8). | The client does not auto-loop on 409; the UI may offer a retry after the hint. |
| D4.5 | **Retention:** delete `panel_mutation` rows in `completed`/`failed_retryable` older than **24 h**, and `processing` rows whose lease expired more than 24 h ago. Reaper runs at API startup and on an interval in the API process (not the worker, which does not own this table's panel rows). Publish the policy in `endpoint-catalog-inventory.md` (draft §2.3). Only rows with `kind = 'panel_mutation'` are touched; chat cooldown/message and `queue.local_archive.challenge` rows (`queue-repository.mjs:405-423,598-664`) keep their own lifecycle. | 24 h covers any page lifetime in this product (keys live in component state). |
| D4.6 | **Key scope: remove the session id.** New key: `panel:v2:${idempotencyKey}`. The app has one local operator; the key is a client-generated UUID v4 (122 random bits). | Fixes the S-04/S-05 coupling (a restart no longer changes the scope) and removes the credential from `operation_key` (N4). Trade-off: a stored response is replayable by any session on this machine that knows the key. Same-machine, same-operator, loopback-only: accepted. The `v2` prefix keeps old rows from colliding; they are reaped by D4.5. The server must also tighten the key format to what the clients send (UUID, or keep the regex but require ≥ 32 chars) — owner choice in §8. |
| D4.7 | **Client: one key per user intent.** An intent (click "call next", submit "create queue", confirm "clear", etc.) creates a key once, held in component state (`useRef`), never in `localStorage`. The same key is reused only on the uncertain path (`status 0`, 5xx with `failed_retryable`, 409 in progress, and the S-05 single retry). The key is dropped when the outcome is known (2xx, 4xx, `OPERATION_OUTCOME_UNKNOWN`). Any change to the form payload creates a new intent (otherwise 422). No automatic mutation retry loops. | Matches the existing uncertain-outcome UX. Vanilla keeps per-call UUIDs (no change; it is being removed). |
| D4.8 | **Replay header** `idempotency-replayed: true` kept; the overlay one-time-secret special case (`queue-routes.mjs:142-146`) kept unchanged. Replays never re-send `set-cookie` or other stored headers. | |
| D4.9 | **Migration: yes, additive, owned by @data-engineer** (questions in §7). Storing state in `result Json` would work, but the atomic takeover and the reaper need indexed columns. | |

## 2. S-05 — Session and CSRF

| ID | Decision | Rationale / trade-off |
|----|----------|------------------------|
| D5.1 | Codes on the `onRequest` hook: 401 `LOCAL_SESSION_REQUIRED`, 403 `CSRF_INVALID`, 403 `ORIGIN_INVALID`, 403 `HOST_INVALID`. Same statuses as today. | `tests/unit/local-session.test.js` asserts status only (research §4), so it stays green; add `code` assertions. |
| D5.2 | **Option C now:** keep the in-memory store. Client does **one** transparent re-init (single-flight shared promise for concurrent callers) on `LOCAL_SESSION_REQUIRED` or `CSRF_INVALID`, then **one** retry of the same request with the **same idempotency key**. GETs: always eligible. Mutations: eligible because these 401/403 come from `onRequest`, before the idempotency preHandler and the handler, so nothing ran (VERIFIED by hook order in code; to be pinned by a test). Never retry on `ORIGIN_INVALID`/`HOST_INVALID`, `SESSION_INITIALIZATION_FAILED`, or a second session failure; then show the catalog message "session restarted — reload the panel". | This is narrower than "auto-replay mutations": only the request that was rejected before any work is retried, once, with the same key. Needs @ux-design-expert sign-off (≥ 9.0) because it changes what the operator sees. |
| D5.3 | **Option A (persistent signed/encrypted session cookie) is deferred**, and **blocked** until: (a) `audit_logs.actor_id` and every other at-rest use stop storing the raw session id (use a non-secret operator id or an HMAC of the id), (b) a durable secret story exists (generation, file permissions, rotation with 2 keys), (c) OAuth state binding is re-checked (N5). Revisit only if re-init proves noisy in real use. | A without (a) turns every audit row into a valid credential (N4). C has no new secret, no table, no migration. |
| D5.4 | Optional hardening, same slice as D5.1: reject mutations whose `Sec-Fetch-Site` is present and not `same-origin` (OWASP primary signal), keeping the Origin check as fallback. | Cheap; needs a test with and without the header (CEF/OBS may omit it — never require it). |

## 3. S-06 — Error envelope

- **Decision D6.1:** every non-2xx body is `{ code, referenceId? , error? }`. `code` is the contract (SCREAMING_SNAKE, enumerated). `referenceId` only on unexpected failures (already done by `safe-http-error-handler.mjs`). `error` stays as a **deprecated diagnostic field** while the existing tests pin it, then is removed. No client may render it (already true, N2).
- **D6.2:** keep `application/json`. Adopt RFC 9457 field names later (`type: urn:queuebot:error:<code>`, `status`, `title`) only after vanilla removal; `code` remains an extension member. Clients ignore unknown members (RFC 9457 §3.2).
- **D6.3:** localization only on the client: `ERROR_KEYS[code]` → catalog key in en/es/pt-BR; unknown → `panel.error.generic`. Catalog parity guarded by `validate:localization`.
- **D6.4:** guard test: scan route registrations (or exercise each failure path) and fail if any `reply.code(>=400).send(...)` lacks a `code` from the enumerated list.

### Sites still sending pt-BR text without `code` (VERIFIED by grep at HEAD)

| File | Lines | Area |
|------|-------|------|
| `apps/api/src/http/local-session.mjs` | 41, 46, 49, 56, 60 | host, origin, session, CSRF |
| `apps/api/src/http/queue-routes.mjs` | 121, 124, 130, 135, 136 | idempotency |
| `queue-routes.mjs` | 179, 199, 211, 219, 223, 224, 234, 236, 246, 253, 256, 263, 264, 265 | command catalog / follower authorization |
| `queue-routes.mjs` | 271, 277, 281, 283 | operations, reconciliation |
| `queue-routes.mjs` | 291, 293, 299, 306 | setup / Twitch app |
| `queue-routes.mjs` | 342, 345, 348, 373 (`userError`) | queue creation |
| `queue-routes.mjs` | 441, 456, 461, 462, 470, 474, 477, 478, 485, 486 | queue / entry / priority |
| `queue-routes.mjs` | 490, 508, 515, 517, 518, 522, 531, 536, 539 | reward association (some carry `referenceId` but no `code`) |
| `queue-routes.mjs` | 545, 546, 547, 565, 581, 589, 590, 611, 617, 631, 636, 642, 654, 663, 675, 694, 753, 761 | manual entry, transitions, call, clear, lifecycle |
| `queue-routes.mjs` | 797, 803, 804, 806 | account labels |
| `queue-routes.mjs` | 812-821 `userError()` | maps domain codes to pt-BR text but **drops the domain code** from the body |
| `apps/api/src/http/overlay-routes.mjs` | 34, 54, 68, 77, 90, 99, 111, 114, 117 | overlay widget admin and public widget |

`userError()` is the cheapest win: the domain code already exists (`DUPLICATE_QUEUE_KEY`, `RESERVED_QUEUE_KEY`, ...); send it as `code`.

### Staged plan that keeps tests green

1. **Additive:** add `code` next to the existing `error` at every site. Tests that use `toEqual({ error })` fail, so in the same change update them to `toEqual({ code, error })` (explicit, not loosened to `toMatchObject`). Fixtures that already carry `code` (QRA-01..04, 08) stay; QRA-05/06/07 gain `QUEUE_NOT_FOUND`, `ENTRY_NOT_WAITING`/`INVALID_QUEUE_POSITION`, `ENTRY_NOT_WAITING`.
2. **Catalog:** add keys for every new code in en/es/pt-BR and extend `ERROR_KEYS`; `panel-error-presentation.test.js` gains one row per code.
3. **Guard test** (D6.4) turns on after step 1 covers all sites.
4. **After vanilla removal (owner-authorized):** drop `error`, update assertions to `{ code }` only; optionally RFC 9457 names.

## 4. S-14 — Path matching

- **D14.1:** compare the pathname without query string in all three places: `local-session.mjs:55` (session bypass), `local-session.mjs:58` (`/callback` CSRF exemption) and `queue-routes.mjs:116` (idempotency bypass). One shared helper so they cannot drift. Use the parsed pathname, not `routeOptions.url` (undefined on 404 in `onRequest`; not re-verified in Fastify docs this round — UNVERIFIED).
- Security note: the change widens exemptions only to `?query` variants of the **same** path; it must not normalize `//api/session`, `%2F` or trailing slashes into a match. Tests: `/api/session?x=1` → exempt; `/api/session/`, `/api/sessionx`, `/api//session`, `/api/%73ession` → not exempt; `/callback?code=..` → exempt from CSRF only for GET as today.

## 5. Compatibility with existing tests and fixtures

| File | Impact |
|------|--------|
| `tests/unit/queue-routes.test.js` | Many `{ error }` `toEqual` assertions (S-06 step 1); fake `beginPanelOperation` without lease/failed state (`:81-85,:113`); 409 fingerprint → 422; 5xx paths now complete as `failed_retryable` / `OPERATION_OUTCOME_UNKNOWN`. |
| `tests/unit/local-session.test.js` | Status-only today: compatible; add codes and S-14 cases. |
| `tests/unit/overlay-routes.test.js` | One `error` assertion; add codes. |
| `tests/unit/next-api-client.test.js` | Pins key factory, `REQUEST_FAILED/0`, `SESSION_INITIALIZATION_FAILED`; add re-init single-flight, one retry, same key, no retry on ORIGIN/HOST. |
| `tests/unit/panel-error-presentation.test.js` | New code rows; possible rename of `PANEL_OPERATION_ALREADY_IN_PROGRESS`. |
| `tests/unit/next-queue-clear.test.js`, `next-queue-creation.test.js`, `next-queue-lifecycle.test.js`, `next-queue-entry-actions.test.js`, `next-locale-picker.test.jsx` | Per-intent key reuse on the uncertain path. |
| `tests/integration/queue-repository.test.js` (`:641,654` in-progress; `:1807,1868` archive challenge) | New lease/takeover/failed/replay/reaper cases; archive-challenge rows must be untouched by the reaper. |
| `tests/integration/qra-postgres-fixtures.test.js` (`:773-780`), `tests/helpers/ops15/qra-postgres-fixtures.mjs`, `tests/integration/postgres-foundation.test.js` (`:55-58`) | Schema shape changes if columns are added. |
| `tests/e2e/fixtures/qra-api-fixtures.mjs` and `tests/e2e/queue-*-browser-only.mjs` (creation-uncertain, manual-entry-recovery, reward-settings-recovery, settings-recovery, lifecycle, reward-resolution, call-resend) | Proof of same-key retry and session re-init in a real browser. |
| `tests/unit/aiox-static-review.test.js` | Not affected; no reviewer change. |

## 6. Security review (CSRF and session changes)

- **Threat model:** hostile page or extension in the same browser; other local processes. Remote attackers are blocked by loopback + Host check. VERIFIED (code), threat model is an owner-accepted assumption.
- **Re-init + retry (D5.2):** `/api/session` is a GET that sets the cookie and returns the CSRF token. A cross-site page cannot read that response (same-origin policy, no CORS headers found), and the Origin check rejects cross-origin mutations. The retry is issued by our own client after it reads the new token, so it does not weaken CSRF. Risk to test: a cross-site `<img src=/api/session>` can create sessions (memory growth) — today too; add a cap or reuse in the same slice (sessions `Map` grows unbounded — VERIFIED, `local-session.mjs:6,71`).
- **No CSRF token in a cookie, no naive double-submit** (OWASP). Option C keeps the synchronizer token.
- **Key scope without session (D4.6):** replay is limited to same-machine sessions that already know a 122-bit key. Accepted for a single-operator loopback app; recorded as an owner decision.
- **Credential at rest (N4):** removing the session id from `operation_key` reduces exposure now; `audit_logs.actor_id` remains a hard blocker for option A.
- **Logs:** new codes and lease events must not log keys, tokens, cookies or bodies (project rule). Log `code`, route pattern and a truncated hash of the operation key at most.
- **Error bodies:** codes only, no internal messages (RFC 9457 §5, project rule).

## 7. Questions for @data-engineer (schema owner)

1. Columns vs JSON: add `state text`, `lease_until timestamptz null`, `updated_at timestamptz`, `kind text` to `processed_operations`, or keep everything in `result` and use a JSON-path conditional `UPDATE`? Which gives a truly atomic takeover under PostgreSQL READ COMMITTED?
2. Backfill: existing `panel_mutation` rows stuck in `processing` (old `panel:<session>:<key>` format) — delete, or mark `failed_retryable`? They can never be matched after D4.6, so deletion looks safe; confirm.
3. Non-panel rows (chat cooldown/message, archive challenge): must columns be nullable / defaulted so those writers (`queue-repository.mjs:405-423,598-664`) need no change? Or should panel rows move to a separate table?
4. Indexes: partial index on `(updated_at) WHERE kind = 'panel_mutation'` and on `(lease_until) WHERE state = 'processing'` — worth it at expected volume (one operator, low hundreds of rows/day)?
5. Should `completePanelOperation` run inside the domain transaction (closes N7 for routes that use one) — is that feasible with the current repository shape, and what does it cost?
6. Migration safety: additive only, no table rewrite, reversible by a forward migration; confirm against the QRA PostgreSQL fixtures.

## 8. Decisions for the OWNER

1. Accept the hybrid 5xx policy D4.1 (default `terminal_unknown`, promotion per route with PostgreSQL evidence) instead of pure release or pure store.
2. Accept removing the session id from the key (D4.6) and its replay trade-off; choose the key format rule (UUID only vs current regex with ≥ 32 chars).
3. Accept the 409 → 422 status change for payload mismatch.
4. Pick one in-progress code: `IDEMPOTENCY_IN_PROGRESS` (new) or the existing `PANEL_OPERATION_ALREADY_IN_PROGRESS`.
5. Accept option C now and option A deferred/blocked (D5.3).
6. Approve the bounded single retry of a mutation rejected by `onRequest` (D5.2).
7. Retention 24 h.
8. Timing of removing `error` and of RFC 9457 names (tied to the already-reserved vanilla removal authorization).

**@ux-design-expert (≥ 9.0 before any user-facing slice):** copy and flow for "session restarted — reload", silent re-init (whether any indicator is shown), "operation in progress — try again in a moment", `OPERATION_OUTCOME_UNKNOWN` ("check the current state before repeating"), and which actions expose a "retry same action" button. Static review and real browser/OBS validation are separate scores.

## 9. Rollout in slices (Red-first)

| Slice | Scope | Entry criteria | Red-first evidence | Exit criteria |
|-------|-------|----------------|--------------------|---------------|
| 1 | S-06 codes for session + idempotency sites, S-14 helper, `userError` sends domain code | Owner items 3-4; story + issue by @devops | Failing unit tests asserting `code` on each site and the S-14 path matrix | All gates green; no behavior change besides body fields and query-string exemption |
| 2 | S-06 remaining sites + catalogs + guard test | Slice 1 merged | Guard test fails listing code-less sites | Guard green; `validate:localization` green; catalogs en/es/pt-BR |
| 3 | S-05 client re-init + one retry (Next only) | UX score ≥ 9.0; owner items 5-6 | Unit tests: single-flight, one retry, same key, no retry on ORIGIN/HOST; API-restart integration test fails today | Restart test passes; browser e2e for re-init |
| 4 | S-04 server: migration, lease, failed state, 422, 409+Retry-After, reaper, key scope v2, outbound timeouts | @data-engineer answers §7; owner items 1-2, 7 | PostgreSQL integration (real migrations, disposable DB) failing for: stuck after 5xx, expired-lease takeover, concurrent takeover (exactly one winner), mismatch 422, replay, reaper keeps non-panel rows | All green on isolated PostgreSQL; no SQLite or Prisma mocks |
| 5 | Per-route promotion to `reexecutable` | Slice 4 | Per route: duplicate-execution test fails or proves guard | Route table documents each class with test reference |
| 6 | S-04 client per-intent keys | Slices 3-5; UX copy | Unit + e2e recovery suites fail on new-key-per-retry | Same key observed on retry in browser e2e |
| 7 | Drop `error`; optional RFC 9457 | Vanilla removal authorized | Tests asserting `{ code }` only | Gates green |

## 10. Complexity (Spec Pipeline dimensions)

| Dimension | Score (1-5) | Why |
|-----------|-------------|-----|
| Scope | 4 | ~90 response sites, 2 HTTP modules, repository, schema, Next client, catalogs, many tests |
| Integration | 3 | Twitch calls inside request paths drive lease and re-execution safety |
| Infrastructure | 3 | Additive migration + reaper; no new service |
| Knowledge | 3 | Idempotency/lease patterns are known; per-route guard behaviour is unverified |
| Risk | 4 | Double execution of Twitch/financial operations if a route is wrongly promoted |
| **Total** | **17 → COMPLEX** | Run as separate stories/slices with revision cycle; do not bundle slice 4 with UI work |

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Re-execution after a committed-but-uncompleted operation (N7) | Default `terminal_unknown`; promotion only with PostgreSQL proof; consider completing inside the domain transaction (§7 Q5) |
| Lease shorter than a real request (N8) | Explicit outbound timeouts before the lease ships |
| Retry storms | No automatic mutation loops; single re-init; `Retry-After` hint only |
| Test churn hides behaviour changes | Explicit `toEqual` updates per site, no loosening to partial matchers |
| Unbounded session `Map` | Cap or reuse sessions in slice 3 |
| Option A later leaks credentials via audit logs (N4) | Hard blocker in D5.3 |

## 12. Sources

- IETF draft (Expired, re-checked 2026-10-22): <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>
- RFC 9457: <https://www.rfc-editor.org/rfc/rfc9457.html>
- Stripe idempotent requests: <https://docs.stripe.com/api/idempotent_requests>
- Brandur Leach, Stripe-like idempotency keys in Postgres: <https://brandur.org/idempotency-keys>
- OWASP CSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
- Community pitfalls (PARTIAL, secondary): atomic claim vs check-then-insert, crash-stuck keys without leases, store outcome in the same transaction — <https://www.techinterview.org/post/3233467855/lld-idempotency/>, <https://docs.gleap.io/documentation/s2s/errors-idempotency>, <https://oneuptime.com/blog/post/2026-01-30-idempotency-implementation/view>

## 13. Verdict

**GO for implementation planning** (stories, issues, @data-engineer and @ux-design-expert reviews). **NO-GO for implementation** until the owner decisions in §8, the @data-engineer answers in §7 (for slice 4) and the UX score ≥ 9.0 (for slices 3 and 6) are recorded. Slices 1-2 need only owner items 3-4 plus story/issue.
