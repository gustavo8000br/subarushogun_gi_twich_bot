# OPS-15 — API contract research (S-04, S-05, S-06, S-14)

- Date: 2026-10-22 · Author: @analyst (Atlas) · Type: research only (no code, no issue changes)
- Input: `docs/stories/OPS-15/structural-review.md` (S-04, S-05, S-06, S-14), code at the current `feat/ops-15-next-panel` HEAD.
- Evidence labels: **VERIFIED** (read in the official source or in the repository code), **PARTIAL** (source is incomplete or a secondary one), **UNVERIFIED** (inference, not yet tested in this project).
- Limit: this is desk research. Nothing here was run against PostgreSQL, a browser or a restarted API. Every recommendation needs the tests listed in §6 before anyone claims it works.

## 1. Code facts confirmed (VERIFIED, repository)

| # | Fact | Location |
|---|------|----------|
| C1 | The idempotency `preHandler` only runs for `/api/*` mutations and skips `request.url === '/api/session'` (exact string compare, query string included). | `apps/api/src/http/queue-routes.mjs:100-101` |
| C2 | Missing or invalid key → 400; repository unavailable → 503; different fingerprint → 409; `in_progress` → 409. Every one of these is pt-BR text with **no `code`**. | `queue-routes.mjs:104-136` |
| C3 | `operationKey = panel:${localSession.id}:${key}`, so **the key is scoped to the in-memory session id**. | `queue-routes.mjs:127` |
| C4 | `onSend` returns early when `reply.statusCode >= 500`, so `completePanelOperation` never runs and the row stays `state: 'processing'` with no lease or expiry. | `queue-routes.mjs:139-150`; `apps/api/src/persistence/queue-repository.mjs:285-305` |
| C5 | `processed_operations` has only `operation_key` (PK), `result Json` and `created_at`: no `updated_at`, no expiry column, no index for pruning. The state machine lives inside the JSON. | `apps/api/prisma/schema.prisma:175-180`; migration `202610020001_foundation` |
| C6 | Sessions are a module-level `Map`; the cookie `queuebot_session` is `HttpOnly; SameSite=Lax; Secure` with no `Max-Age`. 401/403 replies are pt-BR text with no `code`. `/api/session` and the 401 bypass also compare `request.url` exactly. | `apps/api/src/http/local-session.mjs:6,40-58,62-74` |
| C7 | The Next client caches `csrfToken` for the page lifetime, creates a **new UUID per call** unless the caller passes `idempotencyKey`, maps a transport failure to `REQUEST_FAILED/status 0`, and keeps only `payload.code` (otherwise `REQUEST_FAILED`). | `apps/frontend/lib/api/client.mjs:1-50` |
| C8 | The vanilla panel does the same (new UUID per call, CSRF fetched once at boot). | `apps/web/app.js:25,47-48,848` |

New finding from C3 + C6 (not in the structural review): **S-04 and S-05 are coupled.** Even if the client reused a key, an API restart creates a new session id, so the same client key maps to a different `operationKey` and the earlier outcome can never be replayed. Fixing S-04 alone does not cover "the API crashed mid-request and came back".

## 2. External research

### 2.1 Idempotency-Key header (IETF)

- `draft-ietf-httpapi-idempotency-key-header-07` (2025-10-15) is **Expired** in the datatracker (last update 2026-04-18), no RFC intended. **VERIFIED** — <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>. Use it as vocabulary and as good practice, not as a standard you must comply with.
- Semantics (**VERIFIED**, <https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-07.html>):
  - §2.2 the key "MUST be unique and MUST NOT be reused with another request with a different request payload"; §2.4 the server MAY use a fingerprint.
  - §2.3 expiry: the resource MAY expire keys and "SHOULD define such expiration policy and publish it".
  - §2.6 for a retry after completion, the server "SHOULD respond with the result of the previously completed operation, success or an error". For a concurrent request it should answer with a conflict.
  - §2.7: missing key → **400**; same key with a different payload → **422**; still in flight → **409**. For other 4xx/5xx the client follows the resource's documentation. The draft says nothing normative about how to store or release a 5xx outcome (**gap**).
- Gap against the current code: a different fingerprint returns **409** today; the draft says **422**.

### 2.2 Providers

- **Stripe** (API v1) saves status and body "after endpoint execution begins", **including 500s**. Validation failures and requests that conflict with one already running are **not** saved and can be retried. Keys can be pruned after 24 hours. Parameters are compared, and a mismatch is an error. Use V4 UUIDs and no personal data in keys. In API v2, Stripe retries failed work to completion instead of replaying the error. **VERIFIED** — <https://docs.stripe.com/api/idempotent_requests> (fetched 2026-10-22).
- **Adyen**: keys live 7–14 days. A duplicate that arrives while the first is in flight gets 422/409 with error code 704. A `transient-error: true` response header means "retry later with the same key". A 503 with code 703 means the idempotency store is unavailable. **VERIFIED** — <https://docs.adyen.com/development-resources/api-idempotency/>. Whether transient results are stored: **UNVERIFIED** (the docs don't say).
- **PayPal** (`PayPal-Request-Id`): retry with the same id after timeouts and **5xx**. The retry returns the current state of the earlier request. Retention depends on the API, and simultaneous duplicates may fail. **PARTIAL** — <https://developer.paypal.com/api/rest/reference/idempotency/>.
- **Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres"** (2017-10-27): a `locked_at` **lease** (a new request taking a lock older than the timeout takes it over; otherwise 409); recovery points for each atomic phase; on an unexpected 500 the **lock is released** so a retry can run; external permanent failures store a final response, and transient ones answer 503 with the key still retryable; keys are reaped after 24–72 h. **VERIFIED** (secondary but authoritative) — <https://brandur.org/idempotency-keys>.

**Synthesis:** there are two valid policies for 5xx:
(a) *store and replay* the 5xx (Stripe v1). This is only safe when the 5xx means "nothing committed".
(b) *release* the key: either mark it `failed` and let a retry with the same fingerprint run again, or let the lease expire (Brandur, PayPal, Adyen's transient errors).
This repo's routes write PostgreSQL state and outbox rows inside domain transactions, so a 5xx raised after a commit (for example a serialization failure while building the reply) is possible. Option (b) is only safe when the domain guards (versions, outbox `idempotencyKey @unique`, `schema.prisma:116`) make re-execution harmless. That is **UNVERIFIED** for each route and must be confirmed per route, as S-04 already notes.

### 2.3 Sessions and CSRF

- **OWASP CSRF Prevention Cheat Sheet** (**VERIFIED**, <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>):
  - Stateful apps use the synchronizer token, and that token must not be sent in a cookie.
  - Stateless apps should use the *signed* double-submit cookie: an HMAC with a server secret, bound to the session id, plus randomness. Naive double-submit is discouraged.
  - `Sec-Fetch-Site` is the primary signal, and the Origin check is mandatory as the fallback.
  - SameSite is only defense in depth. A custom header (`X-CSRF-Token`) forces a CORS preflight on cross-origin requests.
- **`@fastify/secure-session`**: stateless sessions encrypted with libsodium inside the cookie. Keys can be rotated with an array (at most 2 recommended), and the default `expiry` is 1 day. **VERIFIED** — <https://github.com/fastify/fastify-secure-session>. Cookie size limits and maintenance cadence: **UNVERIFIED**.
- The app runs on loopback for a single local operator. The threat is a hostile page in the same browser, not a remote attacker. The Host and Origin checks already exist (C6).

### 2.4 Error contract

- **RFC 9457** (July 2023, obsoletes RFC 7807): `application/problem+json`. `type` is a URI and the primary identifier (default `about:blank`). `title` stays the same across occurrences "except for localization". `detail` describes this occurrence. Extension members are allowed and clients must ignore unknown ones. Do not expose internals. **VERIFIED** — <https://www.rfc-editor.org/rfc/rfc9457.html>.
- Practical reading: a stable extension member `code` (SCREAMING_SNAKE) is a valid RFC 9457 extension. The client localizes by `code` from the existing en/es/pt-BR catalogs. Server prose becomes optional and diagnostic only.

## 3. Recommended contracts

### S-04 — Idempotency state machine

1. **States** stored in `result` (or columns, see §5): `processing` (with `leaseUntil`), `completed` (status + body), `failed_retryable`.
2. **On 5xx**, `onSend`/`onError` sets the row to `failed_retryable` (no stored body). A retry with the **same key and fingerprint** runs again. A different fingerprint → **422 `IDEMPOTENCY_KEY_REUSED`** (draft §2.7).
3. **Lease**: `processing` older than `leaseUntil` (suggested 60 s, above the longest route timeout, including Twitch calls) counts as abandoned. The next same-fingerprint request takes it over **atomically** (a conditional `UPDATE … WHERE state='processing' AND lease_until < now()`), never read-then-write. This covers a process crash, where `onSend` never runs.
4. **In flight** (valid lease) → **409 `IDEMPOTENCY_IN_PROGRESS`** with `Retry-After: 2`.
5. **Replay**: keep `idempotency-replayed: true` for 2xx/4xx outcomes that were stored. Keep the special case for the one-time overlay secret (`queue-routes.mjs:142-146`).
6. **Scope**: change `operationKey` from `panel:${sessionId}:${key}` to `panel:${key}` (the key is a 122-bit random UUID, and the app has one operator), or to a durable operator scope. Otherwise the restart case from §1 is not covered. Trade-off: if keys are not tied to a session, a stolen key could replay a stored response to another session on the same machine. On a single-user loopback app this is acceptable, but it needs @architect sign-off.
7. **Retention**: delete `completed`/`failed` rows after 24 h (Stripe), using a reaper in the existing worker or at startup, and publish this in `endpoint-catalog-inventory.md` (draft §2.3).
8. **Client**: one key per **user intent** (`createIntent()` returns `{ key }`), reused only on the uncertain path (transport failure, `status 0`, 5xx retryable, 409 in progress). Drop the key when the outcome is known (2xx/4xx). The key lives in component state (`useRef`), not `localStorage`, so it never outlives the page. Mutations are **not** retried automatically: the user starts the retry, as the existing "uncertain" UX flows already assume.

Trade-offs: `failed_retryable` with re-execution moves correctness onto the domain guards, which must be verified per route (call, clear, create, delete, reward, settings). The alternative, storing the 5xx (Stripe v1), is simpler and safe against duplication, but it leaves the operator stuck until the key changes. That is today's problem in a different form.

### S-05 — Session persistence and restart recovery

Options ranked for a local single-user app:

| Option | Survives restart | Cost | Notes |
|---|---|---|---|
| A. Stateless signed/encrypted cookie (`@fastify/secure-session` or HMAC) + CSRF token = HMAC(secret, sessionId) | Yes, if the secret is persisted | Low, no table | Needs a durable secret (an env var or a generated file/row). Rotation means 2 keys. |
| B. Session table in PostgreSQL | Yes | Migration + cleanup | Same pattern as `processed_operations`, but more moving parts. Gives revocation. |
| C. Keep the in-memory store + transparent re-init | No, but it self-heals | Lowest | One extra round-trip after each restart. Combined with S-04 item 6, replay keeps working. |

**Recommendation: C now, A later if needed.** C solves the user-visible failure without new secrets or tables:

- Server: 401 `{ code: 'LOCAL_SESSION_REQUIRED' }`, 403 `{ code: 'CSRF_INVALID' }`, 403 `{ code: 'ORIGIN_INVALID' }` / `HOST_INVALID`.
- Client: on `LOCAL_SESSION_REQUIRED` or `CSRF_INVALID`, call `initializeSession()` again (single-flight, shared promise), then **retry once**. A GET is always retried. A mutation is retried only when it carries an idempotency key and the server **rejected it before the preHandler** (401/403 come from `onRequest`, so nothing ran). This is safe, and narrower than the review's "never auto-replay a mutation". It needs a UX decision (score ≥ 9.0) and @architect sign-off.
- `ORIGIN_INVALID`/`HOST_INVALID` are never retried; show a localized message.
- If the second attempt fails, show "Session restarted — reload the panel" from the catalog.

Option A makes the cookie survive restarts. The CSRF token is then derived instead of stored, which matches OWASP's signed double-submit pattern. Keep `X-CSRF-Token` + Origin checks, and add a `Sec-Fetch-Site` check as a cheap extra.

### S-06 — Error envelope

- Every non-2xx returns `{ code, referenceId? }` (and keeps `error` while the vanilla panel exists). Optionally send `application/problem+json` with `type: "urn:queuebot:error:<code>"`, `title`, `status`, `code`. Recommendation: **adopt the RFC 9457 field names, but `code` stays the contract** (the client already reads `code`). The content type change can wait until after vanilla removal, so the vanilla parser does not break.
- Initial code list (from C2/C6): `IDEMPOTENCY_KEY_REQUIRED` (400), `IDEMPOTENCY_KEY_REUSED` (422), `IDEMPOTENCY_IN_PROGRESS` (409), `IDEMPOTENCY_STORE_UNAVAILABLE` (503), `LOCAL_SESSION_REQUIRED` (401), `CSRF_INVALID` (403), `ORIGIN_INVALID` (403), `HOST_INVALID` (403), plus the operations, reconciliation and setup sites listed in S-06 (`queue-routes.mjs:271-306`).
- Client: map `code` → catalog key (`errors.<CODE>`) in en/es/pt-BR, falling back to the generic `REQUEST_FAILED`. Never render server prose.
- Guard: a route-table test asserting that every `reply.code(>=400).send` includes a `code` from an enumerated list, plus a catalog parity test (`validate:localization`).

### S-14 — Path matching

Compare the parsed pathname. In Fastify `onRequest`, `request.routeOptions.url` (the route pattern) is populated once routing has run, and is `undefined` for 404s. Using `new URL(request.url, 'http://local').pathname`, or `request.url.split('?')[0]`, is uniform for both hooks. Apply it in all three spots: `local-session.mjs:54,56` (the `/callback` compare) and `queue-routes.mjs:100`. Low risk. The official Fastify docs for `routeOptions` in `onRequest` were not fetched this round (**UNVERIFIED**), so the pathname approach is the safer choice.

## 4. Impact on existing tests and fixtures (tests that pin current behavior)

- `tests/unit/queue-routes.test.js` — in-memory `beginPanelOperation` fakes (`:81-85`, `:113`) model `processing`/`in_progress` without a lease; 409 for a fingerprint conflict; many `statusCode` 500/503 assertions (`:522,801,818,1297,1409`) whose rows would now become `failed_retryable`.
- `tests/integration/queue-repository.test.js:641,654` — pins `in_progress` for concurrent begin. Must add stuck/expired/failed/replay cases against real migrations.
- `tests/integration/postgres-foundation.test.js`, `tests/integration/qra-postgres-fixtures.test.js`, `tests/helpers/ops15/qra-postgres-fixtures.mjs` — touch `processed_operations`; must change if columns are added.
- `tests/unit/local-session.test.js` — asserts the 401/403 statuses only (no text), so it is compatible. Add `code` assertions plus query-string cases (S-14).
- `tests/unit/next-api-client.test.js:14,76,86,113` — pins the injected key factory, `REQUEST_FAILED/status 0` and `SESSION_INITIALIZATION_FAILED`. Re-init/retry and intent-key tests go here.
- `tests/unit/next-queue-clear.test.js`, `next-queue-creation.test.js`, `next-queue-lifecycle.test.js`, `next-queue-entry-actions.test.js`, `next-locale-picker.test.jsx`, `panel-error-presentation.test.js` — reference `REQUEST_FAILED`/idempotency; they need intent-key and code-mapping updates.
- E2E fixtures: `tests/e2e/fixtures/qra-api-fixtures.mjs` and the `*-uncertain/*-recovery-browser-only.mjs` suites (creation-uncertain, manual-entry-recovery, reward-settings-recovery, settings-recovery, call-resend) — encode the uncertain-outcome UX, which is the place to prove same-key retry.
- Vanilla: `apps/web/app.js` reads `error` text, so keep `error` until removal (`tests/unit/web-route.test.js` is unaffected).

## 5. Migration, compatibility, decisions

- **Does idempotency need a migration?** It is technically possible without one (store `leaseUntil` and `failed_retryable` inside `result Json`). Recommended: **yes, an additive migration** on `processed_operations`: `state text`, `lease_until timestamptz`, `updated_at timestamptz`, and an index on `(updated_at)` for the reaper. Reasons: an atomic conditional takeover in SQL and efficient pruning. Do not create a new table; the rows are shared with other `kind` values, so the change has to keep non-panel rows intact. **@data-engineer decision** (DDL, backfill of existing `processing` rows to `failed_retryable`, retention job).
- **@architect decisions**: 5xx policy (release vs store), key scope (drop the session id), lease length, session option C vs A, the auto-retry rule for pre-handler rejections, the RFC 9457 content type timing.
- **@ux-design-expert**: copy and flows for "session restarted", "operation in progress, retrying", and "uncertain outcome — retry same action" (≥ 9.0 before implementation).
- **Compatibility**: keep the `error` field and the 409 for in-flight. Moving the fingerprint conflict from 409 to 422 is a status change that the vanilla panel treats only as generic failure (**UNVERIFIED** — check `apps/web/app.js` handlers). Removing the session id from the key orphans old rows harmlessly; they get reaped.
- Evidence needed: PostgreSQL integration (real migrations) for replay, conflict, in-flight, stuck-lease takeover, failed retry and reaping; an API-restart test (restart the Fastify instance, check that the client re-inits and the keyed retry replays); browser e2e for the uncertain flows.

## 6. Prioritized implementation order

1. **S-06 codes for idempotency and session errors** (no behavior change, unblocks the client; low risk) + the route-table guard test.
2. **S-14 pathname matching** (trivial, same PR as 1).
3. **S-05 option C**: client single-flight re-init + one retry for GETs and pre-handler-rejected keyed mutations, plus the localized fallback (needs UX review).
4. **S-04 server**: @data-engineer migration, lease + `failed_retryable` + 422 + reaper, key scope without the session id; PostgreSQL integration tests.
5. **S-04 client**: per-intent keys on call, clear, create, delete, reward and settings uncertain paths; e2e recovery suites.
6. Remaining S-06 sites (operations, reconciliation, setup) and catalog keys; drop `error` and consider `application/problem+json` after vanilla removal.
7. Optional: S-05 option A (persistent signed session) if restart re-init proves noisy.
