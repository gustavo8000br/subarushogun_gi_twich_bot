# Spec: Automatic Twitch recovery after network interruptions

> **Story ID:** OPS-8
> **Complexity:** COMPLEX (19/25)
> **Generated:** 2026-10-07
> **Status:** Approved for implementation planning
> **Issue:** [#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)

[Português brasileiro](../../../pt-BR/stories/OPS-8/spec/spec.md)

## 1. Overview

The local bot must distinguish temporary Twitch/network unavailability from authorization that really needs the streamer. Existing FND-4 token handling and reconciliation remain the foundation; OPS-8 supervises recoverable startup and connection failures and resumes that foundation when Twitch returns.

### Goals

- Recover the Twitch integration after network loss, sleep, shutdown, restart, or initial Twitch unavailability using saved credentials.
- Preserve a clear boundary between retryable service/network failures and confirmed authorization/scope failures.
- Keep local panel, PostgreSQL state, and durable work available while Twitch is offline.

### Non-goals

- Changing OAuth scopes or consent flow.
- Replacing Twurple EventSub connection management or adding a competing WebSocket client.
- Changing queue, redemption, refund, fulfillment, or outbox business intent.
- Claiming live Twitch validation from fakes.

## 2. Requirement mapping

| Requirement | Spec behavior |
| --- | --- |
| FR-1 / FR-2 | Typed failure classification plus cancellable bounded retry supervision around startup validation and initialization. |
| FR-3 / FR-4 | Reuse saved auth; restore integration and reconcile after real dropped EventSub session. |
| FR-5 | Leave durable outbox records intact and resume worker processing when a Twitch adapter is available. |
| FR-6 / NFR-4 | Project transient recovery distinctly through existing health/setup/panel state; never block local service. |
| FR-7 | One supervisor at a time; stop cancels retry/validation/reconcile timers and prevents post-shutdown starts. |
| FR-8 / NFR-1..3 | Fake Twitch boundaries and controlled clock cover retry/error matrix, idempotency, privacy, and persistence. |

## 3. Behavior contract

### Error classification

- A 401 for the saved access token first triggers refresh using the saved refresh token. A successful refresh must be persisted and then validated for the expected app, broadcaster, and required scopes before use.
- Definitive reconnection-required evidence is an unusable/revoked refresh token (for example, a confirmed authorization failure from the refresh endpoint), identity mismatch, or required scopes absent from a valid refreshed token. These stop authorized Twitch actions.
- A 401 from token validation alone is not enough to request user consent when the refresh token may still restore the session.
- Transport errors, timeouts, HTTP 429, and Twitch 5xx are transient. They retain saved credentials and produce `degraded`/`retrying` state.
- Unknown errors fail closed for Twitch actions but remain retryable unless typed evidence proves invalid authorization. Do not classify by exception message text.
- Persisted token refresh data changes only after a successful refresh event. Refresh token rotation is saved atomically by the existing repository path.

### Recovery supervisor

- There is one cancellable supervisor per integration. It coalesces overlapping starts/recovery triggers and uses capped exponential backoff with jitter. Each retry is one attempt, not an unbounded tight loop.
- Startup remains non-blocking for the local HTTP app even when Twitch is offline. Saved credentials are retained; no OAuth prompt is created automatically.
- A retry rebuilds the minimum failed integration stage from durable credentials: validate token → create auth provider → check eligibility → initialize adapters/reconciliation/EventSub.
- On successful Twitch restoration, resume the existing durable workers without changing outbox rows or their expected remote state.
- Shutdown cancels timers and prevents new attempts; a retry already in flight is observed safely and cannot install a runtime after shutdown.

### EventSub and reconciliation

- Twurple 8.2.0 owns the Twitch `session_reconnect` handoff and reconnects an already-established socket according to its library behavior. Do not start a second socket during this protocol.
- A fresh session after an actual unexpected disconnect marks integration recovery and invokes existing paginated reconciliation. The status returns to connected only when reconciliation succeeds.
- New-session EventSub notifications may overlap with reconciliation; existing redemption-ID deduplication and terminal-state rules remain authoritative.
- Initial connection exhaustion must be supervised at application level if Twurple's configured initial retry limit stops before a session becomes ready.

### Status contract

Reuse existing safe values where they remain expressive: `not_configured`, `connecting`, `reconciling`, `degraded`, `reconnect_required`, `connected`, `ineligible`, and `stopped`. The UI/API must communicate retrying versus user action required through current state plus a safe recovery indicator/next retry time if needed. Do not expose exception messages or credentials.

## 4. Acceptance coverage

1. Transient startup validation does not mark credentials reconnect-required; a controlled retry later succeeds without OAuth.
2. HTTP 401/InvalidTokenError, client or broadcaster mismatch, and missing required scopes block Twitch actions and show reconnect-required.
3. Transient eligibility probe failure retries from saved auth and restores EventSub/API adapter.
4. Process restart with saved credentials and Twitch initially unavailable eventually restores service.
5. Genuine WebSocket disconnect followed by ready triggers exactly one reconciliation; Twitch session_reconnect is delegated to Twurple and does not create a parallel socket.
6. Duplicate recovery triggers coalesce; concurrent retries and reconciliations do not overlap.
7. Outbox rows and financial intent survive unavailable Twitch, restart, and recovery; workers resume only with an adapter and do not report success without Twitch confirmation.
8. Shutdown during backoff or an in-flight initialization prevents timer leaks and late listener startup.
9. Health/setup projections distinguish transient recovery from reconnect required and contain no token/error detail.
10. Full focused unit and PostgreSQL integration suites pass; no real Twitch operation is claimed unless separately performed.

## 5. Implementation boundaries

Expected changes are in `apps/api/src/twitch/auth-runtime.mjs`, `integration.mjs`, `eventsub-runtime.mjs`, runtime/health projections only if needed, and new focused unit/integration tests. No schema migration is expected. Keep network calls outside PostgreSQL transactions. Existing credential and queue repositories remain the persistence source of truth.

## 6. Risks and safeguards

| Risk | Safeguard |
| --- | --- |
| A transient timeout incorrectly requests OAuth again | Typed error classification; explicit transient versus definitive-auth tests. |
| Retry storm during broad outage | Exponential cap, jitter, single-flight supervisor, cancellation, and no logging of raw errors. |
| Duplicate EventSub listener/subscriptions | One owned runtime instance; Twurple handles session handoff; lifecycle tests assert one active listener. |
| Lost finance intent or falsely confirmed refund | PostgreSQL restart tests; preserve outbox identity/state; remote confirmation semantics unchanged. |
| Status says connected before safe recovery | Only publish connected after auth/eligibility setup and required reconciliation finish. |

## 7. Official sources and version boundary

Research checked 2026-10-07. See `research.json` and `docs/integrations.md` for official Twitch OAuth/EventSub references and the installed Twurple 8.2.0 implementation details. This plan adds no dependency and no Twitch scope.

## 8. Open questions

None. Requirements and architectural boundaries are resolved by issue #41, FND-4/FND-5, the installed SDK, and the official references.
