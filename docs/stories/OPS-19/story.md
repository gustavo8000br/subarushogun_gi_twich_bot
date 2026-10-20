# OPS-19 — Confirm Twitch reward when service starts

[Português brasileiro](../../pt-BR/stories/OPS-19/story.md)

**Status:** In Progress — owner-requested behavior; implementation on `feat/ops-15-next-panel`.
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
- Scoped AIOX UX review of the implementation: **9.4/10** (code-only). The reviewed Next queue feedback is inline with `role="status"`; the vanilla toast is also a polite status and the wording itself states pending/refresh failure, so color is not the sole signal. Copy is localized and avoids false confirmation. Browser, contrast, screen-reader, and user research checks were not performed; this score is not an overall OPS-19 or product score.
- Accessibility basis: W3C WCAG 2.1 SC 4.1.3 requires status messages to be programmatically determinable without requiring focus; the W3C `role=status` technique identifies one sufficient pattern. See [WCAG 2.1 SC 4.1.3](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-21/) and [WAI ARIA22](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22). These sources informed the review, not a claim of complete conformance.

## File list

- `apps/api/src/domain/entry-transitions.mjs` and `apps/api/src/persistence/queue-repository.mjs` — fulfillment intent on service start and single-intent protection through later transitions.
- `apps/api/src/twitch/redemption-processor.mjs` — record remote fulfillment for active service without ending the local service state.
- `apps/api/src/commands/chat-handler.mjs`, `apps/frontend/features/queues/queue-entry-actions.mjs`, `apps/web/app.js` — truthful pending feedback for chat and both panel implementations.
- `apps/web/localization/catalogs/{panel,chat}/{en,es,pt-BR}.tsv`, `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md` — localized feedback and beta release notes.
- `tests/unit/{entry-transitions,twitch-event-processor,next-queue-entry-actions,chat-command-handler,vanilla-fulfillment-feedback}.test.js`, `tests/integration/queue-repository.test.js` — behavior, external event, both panel feedback paths, atomicity and one-intent regressions.
- `docs/stories/OPS-19/story.md`, `docs/pt-BR/stories/OPS-19/story.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, bilingual session handoffs.

## Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-19 | Owner requested automatic Twitch redemption fulfillment at service start while keeping local service status independent from Twitch's financial status. | `$aiox-master` |
| 2026-10-19 | Implemented atomic fulfillment intent on service start, remote-event synchronization without premature service completion, single-intent protection, and localized pending feedback. Focused evidence is recorded in the active handoff. | `$aiox-dev` |
| 2026-10-19 | Marked opposing remote redemption state as conflict instead of confirmed; added PostgreSQL and vanilla-panel feedback regressions. Research confirmed Twitch only updates `UNFULFILLED` redemptions and reports state changes through EventSub. | `$aiox-dev` |
| 2026-10-20 | Recorded the UX plan and scoped **9.4/10 code-only** review for queue/chat fulfillment feedback; browser and assistive-technology checks remain unverified. | `$aiox-ux-design-expert` |
