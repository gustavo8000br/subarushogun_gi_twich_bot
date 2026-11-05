# OPS-15 / FT-23 — Navigation and messages after creating or deleting a queue (D-3/D-4)

[Português (pt-BR)](../../pt-BR/stories/OPS-15/ft-23-navigation-and-messages.md)

**Status:** InReview (`@dev` completed checkpoint CP-4 on 2026-11-04; was Ready, `@po` GO 9.1/10, 2026-11-04, issue #103). The single `@qa` gate of the OPS-22 cycle is next; the conditions of "Definition of done" apply there.
**Type:** OPS-15 slice (Next panel, user-facing). Inventory row FT-23 in the [backlog inventory](../../process/backlog-inventory.md).
**Issue:** [#103](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/103), sub-issue of [#69](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/69) (OPS-15). The OPS-15 [story](story.md) stays the parent; this file only holds the slice.
**Cycle:** travels in the single OPS-22 cycle (FT-25 #98 + FT-26 #99 + FT-36 #100), as checkpoint CP-4, after FT-36 is green (owner, 2026-10-30; [architect review](../OPS-22/architect-review-ft36.md), section 3). It keeps its own card and issue.
**Sources:** owner decisions of 2026-10-27 (defects D-3 and D-4 of the [live battery](live-battery-2026-10-26-results.md)); slice S-D of the [panel defects architecture review](panel-defects-architecture-review.md); decision D-23-1 of the [architect review of FT-36](../OPS-22/architect-review-ft36.md) (section 4) and the `@po` re-validation of 2026-10-30 ([po-validation](../OPS-22/po-validation.md)). No requirement below is new: each one comes from those sources.

## Story

As a streamer using the Next panel,
I want the panel to take me to the right page and tell me clearly what happened after I create or delete a queue,
so that I never lose the result message when the page changes and never read "success" while Twitch has not confirmed the change.

## Context

Defect D-3: after deleting a queue, the notice lives in the card's local state (`queue-lifecycle-actions.jsx`) and disappears when the card unmounts. Defect D-4: creating a queue does not lead to the created queue. The `PanelProvider` is mounted per page and navigation uses plain links, so a shared provider does not exist yet (that is FT-28, OPS-23).

The `@architect` decision D-23-1 **decouples FT-23 from FT-28**: FT-23 ships now with the existing per-page provider, and FT-28 later swaps one navigation function. The inventory dependency "FT-23 -> FT-28" is therefore **soft**.

## Design (from the `@architect`, not decided here)

1. **Same-page outcomes** (delete with the states deleted / deletion pending / deletion blocked, and cancel deletion, all on `/queues`): the message moves from the card state to a page-level `panelOutcome` in the existing `PanelProvider`. `PanelShell` renders it once in a persistent `role="status"` region (`role="alert"` for errors).
2. **Cross-page outcomes** (create: `/new-queue` to `/queues`; delete the last queue: `/queues` to `/new-queue`): the message travels in the URL as a **code from a fixed list** plus the **queue UUID**. The destination page reads `window.location.search` in an effect, validates the code against the list and the UUID against a UUID pattern, sets `panelOutcome`, moves focus, and removes both parameters with `history.replaceState`.
3. **One navigation function** `navigateTo(href)`. Today it calls `window.location.assign(href)` (a full document load, as the panel already does with plain links). FT-28 later replaces only its body with the Next router.
4. **Pure function** `resolvePostActionRoute(outcome, projection)` returns `{ href, focusId, outcome }` or `null`, and is unit tested.
5. **No Next navigation hook** (`useSearchParams`, `useRouter`) is used: there is no research note on them (research gap deferred to the FT-28 planning gate).

The inventory row used the form `/queues?queue=<id>` for create; the architect design above (`?outcome=<code>&queue=<uuid>`) supersedes it.

## Acceptance criteria

Each criterion is testable. The exact visible texts, the member names of the code list and the focus targets come from the shared UX plan; this story fixes the behavior, not the wording.

1. **Persistent outcome region.** Given a delete or cancel-deletion on `/queues`, when the action returns, then the message appears in one persistent outcome region rendered by `PanelShell` and it stays visible after the queue card unmounts. The region is **one container that exists once per page and holds two live elements that are always mounted, even when empty**: one with `role="status"` for success and pending outcomes, and one with `role="alert"` for refusals and errors. The `role` of an element that already has text is never switched (a role change on a populated element is not announced reliably); the message is written into the element that matches its kind. Both elements are present before any message is set, and a message is removed only by a new outcome, a dismiss or a page change. (Wording refined by `@po` on 2026-11-04 to accept requirement R4 of the UX plan; the criterion "one `role="status"` region" is met by this container.)
2. **Create goes to the created queue.** Given a queue is created from `/new-queue`, when the API confirms the creation, then the panel navigates to `/queues`, the created queue is identifiable by its UUID, focus moves to that queue's title (fallback: the page `h1` when the queue is not on the page), and the status message does **not** promise that Twitch succeeded.
3. **Delete shows the real state.** Given a delete, when the result is `deleted`, then the message says it was deleted; when it is `pending`, the message says "deletion pending" (never a success wording); when it is `blocked`, the message says it is blocked and links to Operations. The three states are the ones of OPS-22 AC 15.
4. **Deleting the last queue.** Given a delete that leaves no queue, when it finishes, then the panel navigates to `/new-queue` and shows the outcome message there. Given a delete that leaves at least one queue, the panel stays on (or returns to) `/queues` with the persistent message.
5. **Cancel deletion uses the same channel.** Given a cancel of a pending or blocked deletion (FT-36), then its success and each refusal message use the same persistent region, with one message per `code`/`reason` of the FT-36 contract, taken from the shared UX plan.
6. **URL contract.** The only data in the URL are one outcome code from a closed list and one queue UUID. An unknown code or a malformed UUID is **ignored** (no message, no error shown, never reflected on the page). After a valid outcome is applied, both parameters are removed with `history.replaceState`, so a reload does not replay the message. The API and the logs never receive the parameters.
7. **Single navigation seam.** Every post-action navigation goes through `navigateTo(href)`; no component calls `window.location` for this purpose directly. The behavior is a full document load until FT-28.
8. **Pure routing function.** `resolvePostActionRoute` has no side effects and covers: create, deleted, pending, blocked, cancel outcomes, deletion of the last queue (to `/new-queue`), and an unknown outcome (returns `null`).
9. **Pending is not live.** The change from "deletion pending" to "deleted" or "blocked" appears on the **next projection load** (page load or the existing refresh), not live. Live update and navigation without a document reload stay with OPS-23 (FT-28/FT-29).
10. **Localization.** No new visible text exists without entries in the en, es and pt-BR catalogs in `apps/shared/localization/catalogs/`; `npm run validate:localization` passes with the new keys.
11. **Accessibility.** The region is announced politely (`status`) or assertively (`alert`) as defined, focus after navigation lands on the element of criterion 2 or on the `h1`, and the plan records which of these were checked by static review and which by a real browser or assistive technology (they are not the same evidence).
12. **No regression of the delete and cancel flows** of OPS-22: the API contract, the audit and the states are unchanged; FT-23 only changes where the result is shown and where the panel navigates.

## Scope

**IN:** `panelOutcome` in the existing provider; the persistent region in `PanelShell`; the URL outcome parser; `resolvePostActionRoute`; `navigateTo`; focus handling; the catalog keys (en/es/pt-BR) of the messages; the tests below.
**OUT:** the shared provider in the layout and `<Link>` navigation (FT-28); live pending-to-deleted update and SSE (FT-27, FT-29); any API, schema or worker change; the OPS-22 states and cancel mechanism themselves (FT-25/FT-36); visible text not approved in the UX plan.

Expected write set (from the architect): `panel-provider.jsx`, `panel-shell.jsx`, `new-queue-form.jsx`, `queue-lifecycle-actions.jsx`, `queue-list.jsx`, a new `post-action-route.mjs`, and the three catalogs. FT-23 goes **before** FT-28 (same files); FT-28 rebases and swaps the seam; the `panelOutcome` and URL contracts carry over unchanged.

## Dependencies and gates

| Gate | Owner | State |
| --- | --- | --- |
| Single UX plan for FT-23 + FT-36 (messages, live region, focus, confirmation text), score **>= 9.0**, recorded in the story | `@ux-design-expert` | **PLAN DELIVERED 2026-11-04: 9.1/10, static review only** ([ux-plan-ft23-ft36.md](../OPS-22/ux-plan-ft23-ft36.md)). Scope reviewed: text, structure and code/catalog reading. Visual, real-browser and assistive-technology validation were **NOT done** and are not implied by the score. Conditions R1-R8 of the plan apply to the implementation; `@po` acknowledges R4 (AC 1 and 11 wording). |
| `@qa` test plan (this story's test classes, including the mutation proof) | `@qa` | **CLOSED 2026-11-04** ([qa-test-plan.md](../OPS-22/qa-test-plan.md): single package plan, FT-23 = G4, tests U23/K23/L23/C23/E23 with 3 Chromium runs) |
| `@po` validation (Draft -> Ready) | `@po` | **CLOSED 2026-11-04: GO 9.1/10** ([po-validation](../OPS-22/po-validation.md), addendum 2026-11-04) |
| FT-36 green (CP-3) | `@dev` | Required before CP-4 |
| Issue | `@devops` | Exists: [#103](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/103) |
| FT-28 (shared provider) | OPS-23 | **Soft**: not required; FT-28 swaps the seam later |
| FT-26 deletion states | OPS-22 | Merged into FT-25 (single cycle); the projection `deletionState`/`blockReason` is needed for criterion 3 |

If the UX plan is late, the architect fallback applies: the API and worker slices may take the `@qa` gate without FT-23, which then follows in the next window (a gate split that needs the orchestrator's decision).

## Tests by class

Red first. Evidence classes stay separate; none replaces another.

| Class | What it proves |
| --- | --- |
| Unit (Vitest) | `resolvePostActionRoute` for every outcome and for the last queue; the URL parser (closed code list, UUID pattern, unknown value ignored, parameters removed); `navigateTo` is the single caller. |
| Component (Vitest + DOM) | The `role="status"`/`role="alert"` region is rendered once by `PanelShell`, exists before the message, and keeps the message after a card unmounts; focus target and fallback. |
| Localization | `npm run validate:localization` and the parity tests pass for the new keys in en, es and pt-BR. |
| Browser-only E2E (Chromium, fixtures, no Twitch), only with approved text | create then `/queues` with focus and a non-promising status; delete with the persistent status; delete the last queue then `/new-queue` with the message; deletion pending and blocked (with the Operations link); cancel deletion messages; a reload after arriving does not replay the message. |
| Mutation proof (`@qa`) | Render the raw `outcome` parameter: the URL parser unit test must fail (then revert). |
| Not covered here | Live Twitch (OPS-22 AC 19, OW-16), PostgreSQL and Compose (no API, schema or proxy change), native OBS/CEF, assistive technology unless a separate validation is recorded. |

## Risks

- **Full reload until FT-28.** The page reloads on navigation; the pending-to-deleted update is not live until OPS-23 (criterion 9).
- **URL injection.** Reflecting a free parameter would be an XSS or spoofing risk; mitigated by the closed list, the UUID pattern and "unknown is ignored" (criterion 6), proven by the mutation test.
- **Misleading success wording** while Twitch has not confirmed (financial/user-trust risk); mitigated by criteria 2 and 3 and by the UX plan.
- **Write-set collision with FT-28** (same files); mitigated by the order FT-23 then FT-28 and by keeping the contracts stable.
- **Unresearched Next navigation API.** Avoided on purpose; becomes a real gap only when FT-28 swaps the seam, and then `@analyst` checks the official Next 16 documentation before that planning gate.
- **Entries are not restored after a cancelled deletion** (OPS-22 I3): the confirmation text must say so; it belongs to the shared UX plan.

## Definition of done

Criteria 1-12 met with the evidence classes above; the UX conditions below pass at the `@qa` gate; UX plan >= 9.0 recorded; `@qa` verdict issued with a score; `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` green; story checklist and File List updated; en and pt-BR in parity.

### UX conditions of the plan (conditions of the `@qa` gate, `@po` 2026-11-04)

The score 9.1/10 of [ux-plan-ft23-ft36.md](../OPS-22/ux-plan-ft23-ft36.md) (section 8) is valid only if **R1, R2, R3, R5 and R6 pass at the `@qa` gate**; R4, R7 and R8 are also checked there. No AC above changes; these are conditions on how they are met.

- **R1 (texts by queue type):** the delete messages for Channel Points queues never say that the reward "remains paused" or "untouched"; the type-specific catalog keys of the plan are used instead of the generic `panel.queue.delete.done` / `.pending`.
- **R2 (cancel button from the server):** the "Cancel deletion" action is shown from the server fields `canCancelDeletion` and `cancellationInProgress`, not from the `remoteSyncStatus` heuristic.
- **R3 (focus):** `tabindex="-1"` on the queue title heading and on both page `h1`, so the focus targets of criteria 2 and 11 can receive focus.
- **R4 (region):** the container with two always-mounted live elements (`status` and `alert`) described in criterion 1.
- **R5 (specific dialog):** delete and cancel-deletion use a dialog with a specific title and the buttons "Back" and the action verb ("Cancel deletion" for the second), with no double negation; the generic "Confirm action" dialog is not used.
- **R6 (already deleted):** the `already_deleted` outcome is mapped from the 409 `QUEUE_DELETION_ALREADY_COMPLETED` code (the 200 branch is dead per the architect).
- **R7 (plural):** counts of entries and of blocked operations use plural catalog forms in the three languages.
- **R8 (legibility):** the outcome region text is at least 14 px and its contrast ratio is at least 4.5:1, **measured** (not assumed) before the UI ships.

**Evidence limit (unchanged):** the 9.1 is a static review. Visual, real-browser, human-readability and assistive-technology validation were **NOT done**; they remain an owner action (A-05) and are not claimed by any gate of this story.

## File list

Checkpoint CP-4, `@dev` 2026-11-04 (cumulative patch `.local/ops22/cp-4.patch`, slice-only `.local/ops22/cp-4-ft23-only.patch`):

- `apps/frontend/features/panel-shell/post-action-route.mjs` (new): `OUTCOME_CODES` (closed list of 8), `resolvePostActionRoute`, `getOutcomeFromCode`, `navigateTo` (the single navigation seam)
- `apps/frontend/features/panel-shell/outcome-url.mjs` (new): `readOutcomeFromLocation` (closed list + UUID, always removes both parameters with `history.replaceState`)
- `apps/frontend/features/panel-shell/outcome-region.jsx` (new): one container, two always-mounted live elements (`status`, `alert`), controls outside them
- `apps/frontend/features/panel-shell/panel-provider.jsx`, `panel-shell.jsx`: `panelOutcome`, URL arrival effect, focus request, `reportQueueOutcome`, `dismissPanelOutcome`, `refreshFromOutcome`, navigation after a confirmed creation; the region is the first child of `<main>`
- `apps/frontend/features/queues/queue-lifecycle.mjs`: `getQueueLifecycleOutcome` (pure mapper), `getQueueDeletionView` (R2), the three FT-36 409 codes, delete failure feedback
- `apps/frontend/features/queues/queue-lifecycle-actions.jsx`: specific dialog (R5), plural counts (R7), card lines (cancelling, blocked), results through `onOutcome`
- `apps/frontend/features/queues/queue-list.jsx`, `queues-page-content.jsx`, `new-queue-page-content.jsx`, `new-queue-form.jsx`: `tabindex="-1"` on the queue title and both `h1` (R3), `onOutcome` wiring, uncertain create in the `alert` element, form locked while navigating
- `apps/frontend/features/operations/operations-page-content.jsx`: shows `attempts_exhausted`, `blocks_deletion` (queue title from the projection) and `manual_contradicted` (E23-08)
- `apps/frontend/styles/panel.css`: `.outcome-*`, `.queue-deletion-line`, `scroll-margin-top` on the focus targets (15 px text, no animation)
- `apps/shared/localization/catalogs/panel/{en,es,pt-BR}.tsv`, `apps/shared/panel/panel-catalog.mjs`, `apps/shared/localization/discover-catalog-module.mjs`: texts of the UX plan sections 4.1 and 4.2, `{title}` and `{count}` registered
- `apps/web/app.js` (legacy panel, one call site): the delete confirmation uses the plural forms so it does not break
- `package.json`: script `test:e2e:queue-outcome:browser-only`
- Tests (new): `tests/unit/post-action-route.test.js`, `next-outcome-url.test.js`, `next-outcome-region.test.jsx`, `next-outcome-catalogs.test.js`, `next-outcome-css-contract.test.js`, `tests/e2e/queue-outcome-browser-only.mjs`
- Tests (extended or adapted): `tests/unit/next-queue-lifecycle.test.js`, `next-queue-lifecycle-actions.test.jsx`, `next-operations-page.test.jsx`, `next-queue-creation-form.test.js`, `next-queue-list.test.js`, `panel-confirmation-contract.test.js`, `next-locale-picker.test.jsx`, `next-overview-panel.test.jsx`, `tests/e2e/queue-lifecycle-browser-only.mjs`, `queue-creation-accepted-browser-only.mjs`, `queue-creation-uncertain-browser-only.mjs`, `tests/integration/compose-runtime.test.js`
- `CHANGELOG-beta.md`, `docs/pt-BR/CHANGELOG-beta.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`, this story and the FT-23 story (en and pt-BR)

## Dev notes

Red and Green by group, mutations, decisions and findings are in [OPS-22, Slice 5 — FT-23](../OPS-22/story.md). Evidence per acceptance criterion and per UX condition:

| AC | Evidence (automatic) | Only a human / visual / assistive check proves |
| --- | --- | --- |
| 1 persistent region | K23-01 (3 statuses, two empty live elements), K23-02, region test (same two nodes survive every outcome), E23-02 | whether a screen reader announces text written into an element that was empty at load |
| 2 create goes to the queue | `post-action-route` create rows, K23-03, E23-01 (URL, focus on the title, neutral text, parameters removed) | pixels, scroll position |
| 3 delete shows the real state | `post-action-route` delete rows, K23-08, E23-02, E23-04 | wording comprehension |
| 4 last queue | U23-02, K23-02 (one `navigateTo` call), E23-03 | none beyond the automatic proof |
| 5 cancel, one message per code/reason | U23-05 (13 error rows + 7 reason rows), E23-05 (13 refusals, 2 elements), E23-06 | wording comprehension |
| 6 URL contract | `next-outcome-url` (8 ignored shapes, kept params, no history API), M10a/M10b, E23-01/E23-03 reload | none |
| 7 single seam | static scan in `post-action-route.test.js`, K23-02 (mocked `navigateTo`) | none |
| 8 pure function | `post-action-route.test.js` (frozen inputs, no `location` access, unknown -> `null`) | none |
| 9 pending is not live | E23-04 (the message stays until "Refresh queues" or a new load) | none |
| 10 localization | `next-outcome-catalogs`, `validate:localization`, parity and placeholder tests | es/pt-BR phrasing review |
| 11 accessibility | roles, `tabindex`, focus, dialog ids by component and E2E tests | screen reader, announcement order, visual focus ring, sticky position, 320 px |
| 12 no regression | API files untouched; `compose-runtime` 7/7; delete/cancel unit and E2E suites | live Twitch (OW-16) |

| R | Automatic evidence | Human / visual |
| --- | --- | --- |
| R1 | M20, K23-08, E23-02 | wording understood |
| R2 | M21, K23-04 | none |
| R3 | M-UX2, K23-06, E23-01/E23-02 focus | focus ring look |
| R4 | MUX1, K23-01, region node-identity test | assistive-technology announcement |
| R5 | MUX4, K23-05, E23-05 (dialog texts) | none |
| R6 | M22, U23-08, E23-05 | none |
| R7 | K23-09, L23-01 plural rendering, dialog plural tests | none |
| R8 | MUX5, C23-02: 15 px; status 12.45:1, alert 10.90:1, controls 11.95:1 (arithmetic on declared CSS) | measurement on real pixels and the real background |

Evidence limit (unchanged): the 9.1 is a static review; visual, real-browser, human-readability and assistive-technology validation were NOT done.

## Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-11-04 | Created the FT-23 slice story (Draft) from the inventory row, the owner decisions of 2026-10-27 and the `@architect` design D-23-1 (decoupled from FT-28). No requirement was invented; wording and code names are left to the shared UX plan. | `@sm` |
| 2026-11-04 | `@po` (Pax): `*validate-story-draft` = **GO 9.1/10**, status Draft -> **Ready** (issue #103; `@architect`, `@data-engineer`, UX 9.1 and `@qa` test plan gates closed). Criterion 1 rewritten to accept R4 (one persistent container with two always-mounted live elements, `status` and `alert`; changing the `role` of a populated element is not announced reliably). UX conditions R1-R8 added to the Definition of done as conditions of the `@qa` gate (score valid only if R1, R2, R3, R5, R6 pass). Static review only; visual/human/assistive validation not done (owner action A-05). No other AC changed. | `@po` |
| 2026-11-04 | 0.2.1 — Development completed (YOLO mode) — Status: Ready → InReview. `@dev` (Dex): FT-23 implemented test-first at checkpoint CP-4 (12 criteria and R1-R8 with the evidence above); no AC, scope or title changed; no server file touched. | `@dev` |
