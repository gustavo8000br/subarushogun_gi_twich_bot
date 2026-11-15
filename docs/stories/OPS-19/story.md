# OPS-19 — Confirm Twitch reward when service starts

[Português brasileiro](../../pt-BR/stories/OPS-19/story.md)

**Status:** In Progress (InReview pending) — implemented and tested by `@dev`; `@qa` gate PASS 9.3 on 2026-11-14; NOT Done: there is no live Twitch observation of the fulfill at service start. **Issue:** [#78](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/78), created by `$aiox-devops`.
**Related:** FND-3 durable financial outbox; FND-9 local queue/reward lifecycle; OPS-15 panel parity (no OPS-15 scope expansion).
**Data coordination:** Reuse `Redemption.expectedStatus`, the existing one-intent-per-redemption outbox, worker leases/retries, and remote reconciliation. No schema migration or active-database operation.

## Story

As a streamer who runs queue service from the self-hosted panel,
I want Twitch to fulfill a Channel Points redemption as soon as I start serving its viewer,
so that the reward no longer remains pending in Twitch while service continues to be tracked in my panel.

## Acceptance criteria

1. A local `called → in_progress` transition for a redemption atomically records the existing durable `redemption.fulfill` intent and expected remote status `FULFILLED`; manual entries and externally observed transitions do not create a second intent.
2. The financial worker sends/reconciles the fulfillment using existing retry, lease, and truth-classification rules. The panel never reports remote confirmation until Twitch confirms or reconciliation observes `FULFILLED`; pending/unknown/conflict remains visible in existing operations/health projections.
3. An externally observed Twitch `FULFILLED` while the local entry is `in_progress` confirms the financial operation and redemption sync, but does not mark the service completed, remove the active entry, or reset its owner-bound current account. The streamer completes service separately.
4. A later local service completion reuses the existing financial intent and cannot create a duplicate or contradictory cancellation. Once service has started, removing the entry cannot replace the fulfillment intent with a refund/cancel intent.
5. The panel action and localized chat response for starting service distinguish “fulfillment requested/pending” from “Twitch confirmed”; they do not say the points were confirmed merely because the local transition succeeded.
6. Real isolated PostgreSQL with real migrations verifies atomic transition, expected status, one-intent idempotency, completion/removal behavior, and external fulfillment while in progress. Twitch-boundary tests use fakes; no live Twitch write is claimed.
7. English, Spanish, and pt-BR copy remains aligned. No database migration, version bump, or public API expansion is introduced.

## Test and data safety

- Write transition/processor/client regressions first (Red), then PostgreSQL integration against the existing disposable-container harness.
- Preserve the active developer PostgreSQL and `npm run dev`; tests must use their own tmpfs PostgreSQL container.
- Run lint, typecheck, localization validation, focused tests, and diff-check. Full-suite/independent QA remain separate gates until actually completed.

## UX plan and retrospective scoped review

- This record was added after the UI implementation, when the owner established the mandatory UX-first rule; it does not claim that this earlier implementation was planned under that rule.
- User need: the streamer must know that local service has started while Twitch fulfillment is still pending, without being told that Twitch confirmed it prematurely.
- Planned feedback: keep the result in the affected queue as an inline status (not only a transient toast); distinguish pending fulfillment from an accepted local action whose queue refresh failed; keep eventual Twitch truth in the existing operations projection. Use aligned EN/ES/pt-BR copy and expose status semantically without moving focus.
- Scoped AIOX UX review of the implementation: **9.4/10** (code-only). The reviewed Next queue feedback is inline with `role="status"`; the wording itself states pending/refresh failure, so color is not the sole signal. Copy is localized and avoids false confirmation. Browser, contrast, screen-reader, and user research checks were not performed; this score is not an overall OPS-19 or product score.
- Accessibility basis: W3C WCAG 2.1 SC 4.1.3 requires status messages to be programmatically determinable without requiring focus; the W3C `role=status` technique identifies one sufficient pattern. See [WCAG 2.1 SC 4.1.3](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-21/) and [WAI ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22). These sources informed the review, not a claim of complete conformance.

## Tasks

- [x] Atomic `redemption.fulfill` intent and expected status `FULFILLED` on `called → in_progress`; one intent per redemption (AC 1, 4) — `entry-transitions.mjs:35-37,53-54`, `queue-repository.mjs:1892-1895,2359-2380,2700-2735`; PostgreSQL tests in `tests/integration/queue-repository.test.js` (~1601, 1637, 1660, 1679, 1705).
- [x] External `FULFILLED` while `in_progress` confirms the redemption without completing service (AC 3) — `redemption-processor.mjs:14-33`; unit `twitch-event-processor`.
- [x] Truthful pending feedback in chat and in the Next panel (AC 5) — `chat-handler.mjs:226-228`, `queue-entry-actions.mjs:53-58`; unit `chat-command-handler`, `next-queue-entry-actions`.
- [x] EN/ES/pt-BR copy aligned, no migration, no version bump (AC 7) — `npm run validate:localization` green.
- [x] Evidence by `@dev`: 137 unit tests and 163 PostgreSQL integration tests green (isolated disposable PostgreSQL, real migrations), lint, typecheck.
- [x] Browser-only script for the inline `role="status"` feedback: `tests/e2e/queue-fulfillment-feedback-browser-only.mjs` (pending variant and refresh-failed variant, intercepted fixtures), added to `tests/e2e/browser-only-manifest.json` and `package.json`; passed through `tests/e2e/run-browser-scripts.mjs` on 2026-11-14.
- [x] Independent `@qa` gate and verdict: PASS 9.3/10 on 2026-11-14 (real PostgreSQL, browser-only 22/22, 7 production money mutations detected; ledger feature 23 = Y\* provisional, D-04). Report: `.local/audit-2026-11-14/ledger/qa-ops19.md`.
- [ ] Live Twitch observation of the fulfill at service start (not done; AC 2 and 6 claim no live Twitch write, only fakes).

## File list

- `apps/api/src/domain/entry-transitions.mjs` and `apps/api/src/persistence/queue-repository.mjs` — fulfillment intent on service start and single-intent protection through later transitions.
- `apps/api/src/twitch/redemption-processor.mjs` — record remote fulfillment for active service without ending the local service state.
- `apps/api/src/commands/chat-handler.mjs`, `apps/frontend/features/queues/queue-entry-actions.mjs` — truthful pending feedback for chat and the Next panel.
- `apps/shared/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`, `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md` — localized feedback and beta release notes.
- `tests/unit/{entry-transitions,twitch-event-processor,next-queue-entry-actions,chat-command-handler}.test.js`, `tests/integration/queue-repository.test.js` — behavior, external event, panel feedback, atomicity and one-intent regressions.
- `tests/e2e/queue-fulfillment-feedback-browser-only.mjs`, `tests/e2e/browser-only-manifest.json`, `package.json` — browser-only coverage of the inline fulfillment status.
- `tests/integration/compose-widgets-overlay-revoke.test.js` — cold-start tolerant first wait (unrelated flake fix, ledger criterion #23 package).
- `docs/stories/OPS-19/story.md`, `docs/pt-BR/stories/OPS-19/story.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, bilingual session handoffs.

## Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-19 | Owner requested automatic Twitch redemption fulfillment at service start while keeping local service status independent from Twitch's financial status. | `$aiox-master` |
| 2026-10-19 | Implemented atomic fulfillment intent on service start, remote-event synchronization without premature service completion, single-intent protection, and localized pending feedback. Focused evidence is recorded in the active handoff. | `$aiox-dev` |
| 2026-10-19 | Marked opposing remote redemption state as conflict instead of confirmed; added PostgreSQL and vanilla-panel feedback regressions. Research confirmed Twitch only updates `UNFULFILLED` redemptions and reports state changes through EventSub. | `$aiox-dev` |
| 2026-10-20 | Recorded the UX plan and scoped **9.4/10 code-only** review for queue/chat fulfillment feedback; browser and assistive-technology checks remain unverified. | `$aiox-ux-design-expert` |
| 2026-11-14 | Removed references to the removed vanilla panel (`apps/web/app.js`, `vanilla-fulfillment-feedback` test); mapped the current files; added the task checklist; added the browser-only script for the inline fulfillment status; status kept honest (no `@qa` verdict, no live Twitch observation). No production code changed. | `$aiox-dev` |
