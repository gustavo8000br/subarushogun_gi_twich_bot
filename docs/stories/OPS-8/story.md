# Story OPS-8: Automatic Twitch recovery after network interruptions

[Português brasileiro](../../pt-BR/stories/OPS-8/story.md)

**Issue:** [#41](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/41)
**Complexity:** COMPLEX (19/25)
**Status:** Done
**Executor:** @dev
**Quality gate:** @qa
**Epic/capability:** Twitch resilience and integration recovery

## Story

**As a** streamer using the local chatbot,
**I want** saved Twitch credentials to reconnect automatically after a temporary network outage, sleep, shutdown, or restart,
**so that** I do not need to repeat OAuth while my authorization remains recoverable.

## Acceptance Criteria

1. [x] Startup does not wait for Twitch network availability before serving the local panel and health route.
2. [x] A transient timeout, network error, HTTP 429, or server error during validation/initialization preserves saved credentials and retries with capped exponential backoff and jitter (initial delay 5 seconds; maximum delay 300 seconds).
3. [x] A 401 from an expired/invalid access token first attempts refresh using the saved Authorization Code refresh token; successful refresh is persisted and identity/scopes are revalidated without a new OAuth flow.
4. [x] Confirmed unusable/revoked refresh authorization, wrong app/broadcaster identity, or missing required scopes enters `reconnect_required` and stops Twitch-authorized work safely.
5. [x] Transient eligibility/API initialization failure is retried automatically; recovery restores one adapter/listener and publishes `connected` only after required reconciliation succeeds.
6. [x] A genuine EventSub socket loss followed by a fresh ready session triggers one existing reconciliation. Twitch `session_reconnect` is handled by Twurple 8.2.0 without a competing socket.
7. [x] Recovery triggers and reconciliation are single-flight; duplicate/reordered notifications retain current redemption deduplication and terminal-state guarantees.
8. [x] Financial, reward, chat, and call outbox intentions persist unchanged during outage/restart and resume only when the Twitch adapter is available; no remote operation is falsely confirmed.
9. [x] `/health` and the setup panel distinguish transient retrying/degraded status from confirmed reconnection-required status, in all supported product languages, without raw errors/secrets.
10. [x] SIGTERM/SIGINT cancels pending retries and prevents late initialization/listener installation; existing graceful shutdown remains intact.
11. [x] Tests use controlled clocks and Twitch/EventSub fakes for the failure matrix plus isolated PostgreSQL migrations for restart/outbox persistence. Live Twitch behavior is claimed only if separately executed with authorized access.
12. [x] English and pt-BR story, integration guide, changelogs, and central indexes are synchronized; tests and quality gates pass.

## Planning Record

- Spec Pipeline completed as COMPLEX (19/25); research and two-pass critique recorded under `spec/`.
- Pass 1 found and corrected four gaps: expired access token may still refresh; the local server awaited remote validation; seamless Twitch session migration must not be treated as dropped events; Twurple's initial socket connection has a bounded retry phase.
- Pass 2 approved the revised spec at 10/10. Scope is an extension of FND-4 startup/lifecycle handling, reusing FND-4 OAuth/reconciliation and FND-5 outbox behavior.
- See [spec](spec/spec.md), [research](spec/research.json), [complexity](spec/complexity.json), [critique](spec/critique.json), and [implementation plan](spec/plan.json).

## TDD Evidence

P1–P13 Red/Green evidence is recorded in [`tdd-log.md`](tdd-log.md). The focused auth/integration/adapter run passed 44 tests across three files; the final suite passed 87 files / 728 tests.

## File List

Planning artifacts are tracked in the English and pt-BR `spec/` folders. Implementation files: `apps/api/src/twitch/auth-runtime.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/twitch/eventsub-runtime.mjs`, `apps/api/src/twitch/helix-adapter.mjs`, `apps/api/src/health-route.mjs`, `apps/web/health-status.mjs`, `apps/web/setup-messages.mjs`, panel/setup locale catalogs, and focused tests in `tests/unit/twitch-auth-runtime.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/eventsub-runtime.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/unit/health-route.test.js`, `tests/unit/health-status.test.js`, and `tests/unit/setup-messages.test.js`. Bilingual integration and TDD documents are updated alongside the code.

## Implementation Checklist

- [x] Compare scope against FND-4 and FND-5; document overlap and uncovered behavior.
- [x] Complete Spec Pipeline requirements, complexity, Twitch/Twurple research, two critique passes, and implementation plan.
- [x] Auth failure classification and saved refresh-token recovery, test-first.
- [x] Non-blocking integration supervisor with bounded retry/cancellation, test-first.
- [x] EventSub startup exhaustion and genuine disconnect recovery, test-first.
- [x] Localized retry state in health/setup projections, test-first.
- [x] Verify PostgreSQL outbox persistence/lease recovery with the real isolated PostgreSQL integration tests; verify a new Compose build/restart against the connected installation while retaining its data and secrets volumes.
- [x] Update bilingual integration/story docs and user/internal changelogs.
- [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, version validation, Compose checks, and `git diff --check` pass.
- [x] Independent QA story review and gate recorded.
- [ ] PR merged and linked issue body/status updated by @devops; no issue comments unless a decision/blocker requires one.
- [ ] Keep `.release-stage` unchanged; beta promotion waits for OPS-8, FND-9, and DOC-2 completion.

## Change Log

| Date | Version | Change | Owner |
| --- | --- | --- | --- |
| 2026-10-07 | 0.11.0 | QA Gate PASS (9.5/10) — Status: InReview → Done. | @qa |

## QA Results

**Gate: PASS (9.5/10)** — [OPS-8 quality gate](../../qa/gates/OPS-8-automatic-twitch-recovery.yml). All 12 acceptance criteria are supported by automated tests, PostgreSQL integration coverage, or Compose acceptance as applicable. The active Twitch account was verified only through the existing read-only health probe; no live outage simulation or Twitch write operation was performed. Host-wide certificate trust still references an older local CA, while both current instances pass HTTPS checks when given their exported CA certificate.
