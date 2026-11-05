# OPS-15 Next UI code audit

## Focused UX review — retry a called viewer notification (QRA-12, 2026-10-20)

- **User need/plan:** for an entry already marked called, place the resend action beside that entry and give clear feedback after the request is queued; distinguish queueing from actual chat delivery, retain the no-show deadline, and avoid adding a second-send interaction or new UI pattern.
- **Existing design review:** the current inline “Resend call” action remains adjacent to the called viewer. Its localized live-region feedback says the resend was queued and the deadline preserved. No layout, copy, endpoint, or application behavior was changed; this increment adds browser evidence only.
- **Validation:** Chromium E2E used intercepted same-origin API fixtures; it asserted one POST, CSRF/idempotency headers, `role="status"`, exact queued-not-delivered copy and the unchanged deadline in the rendered projection. No chat worker, Twitch, database, screenshot, axe or assistive-technology test was run.
- **Scoped UX score: 9.2/10** for the existing resend interaction/feedback contract only. Not an overall queue-page or OPS-15 score, and not independent QA.

## Focused UX review — success feedback after local queue archive (2026-10-20)

- **User need:** after explicitly choosing the two-step local-only archive for a queue whose Twitch reward state is uncertain, the streamer must receive confirmation even though the successful refresh removes that queue card from the active list.
- **Flow/design:** lifecycle success is retained in the shared panel provider and rendered as the existing page-level `role="status"` feedback pattern. It remains independent of the queue card and appears above both populated and empty queue states; no duplicate toast, blocking dialog, raw error, or claim of Twitch deletion is introduced. New lifecycle work clears the prior message.
- **Validation:** isolated Compose Chromium exercised the exact challenge and confirmation through Next/Fastify/PostgreSQL, observed the localized success after the card was removed, then reloaded to verify the card stayed absent. A component regression covers the empty-list case. No visual screenshot, axe scan, screen-reader test, or independent QA was run.
- **Scoped UX score: 9.2/10** for this archive-completion feedback state only: accessible status survives the underlying content removal and communicates only the confirmed local action. Not a score for the full queue page or OPS-15 overall.

## Focused UX plan/review — accepted manual queue admission with failed refresh (2026-10-20)

- **Problem/user need:** after the API accepts a viewer at a specific queue position but the follow-up list read fails, the streamer needs to see that entry and must not repeat the add because the stale list omitted it.
- **Flow:** project the accepted response into the current queue using its returned ID/status/position and the operator-entered login; announce that acceptance is known but the list refresh failed; provide a GET-only retry. After a successful projection read that contains the entry ID, change to the ordinary added notice. Never repeat the POST during recovery.
- **Accessibility/states:** feedback uses `role="status"` and safe, localized scalar placeholders; refresh button is named and busy/disabled while loading. E2E asserts the entry stays visible, no private error leaks, exact 201/request contract, CSRF/idempotency, read retry, and one POST only. No axe, screen-reader, or visual audit.
- **Validation and score:** scoped UX score **9.2/10** for this recovery/state/accessibility flow only; not independent QA, live backend acceptance, or OPS-15 overall score.

## Focused UX plan/review — accepted reward update with failed list refresh (2026-10-20)

- **Problem/user need:** a successful local 202 response means the Twitch reward update is pending, not remotely confirmed. If the follow-up list read fails, showing the old “synced” reward or leaving its editor available could invite a duplicate mutation and mislead the streamer.
- **Flow:** retain the accepted QueueDto locally, show its `pending_update` state, remove reward-edit controls while unresolved, announce a localized warning with a read-only “Refresh queue” action, then replace the warning with pending-sync guidance only after a successful projection read.
- **Accessibility/states:** warning is the existing `role="status"`; refresh action has a localized accessible name and busy/disabled state; test verifies no false remote success, stale projection, private server message, or duplicate PATCH. This was a code-only/Chromium fixture review; no axe, screen-reader, or visual-layout audit.
- **Validation and score:** scoped UX score **9.2/10** for this recovery/state/accessibility flow only. Not independent QA, real Twitch acceptance, visual audit, or OPS-15 overall score.

## Focused UX plan/review — uncertain queue creation response (2026-10-20)

- **Problem/user need:** when queue creation returns an ambiguous server failure and the follow-up list read finds no queue, the streamer needs clear uncertainty guidance, must not be told creation failed/ succeeded without proof, and must not accidentally submit a duplicate.
- **Flow:** keep the manual-first form draft; show the existing localized uncertain-result message and a separate safe diagnostic reference; link to queues for verification; disable another create submission until the operator checks the list. No new layout or interaction pattern is introduced.
- **Accessibility/states:** existing `role="status"` announces the result; message and reference remain distinct; the test asserts no private server details, no false success, and preserved field values. No axe, screen-reader, or visual-layout review was performed.
- **Validation and score:** Chromium browser-only E2E with all API routes intercepted, plus focused component test. Scoped UX score **9.2/10** for this copy/state/accessibility flow only; not a visual audit, independent QA, or overall OPS-15 score. The review is in-scope plan/code inspection, not a live-backend acceptance.

## Focused UX review — accepted queue settings with failed refresh (2026-10-20)

- **Problem/user need:** after the local settings PATCH is accepted, the follow-up list read can fail. The streamer must know the save was accepted without being told that the list is current or encouraged to repeat a successful mutation.
- **Proposed flow:** keep the values from the accepted versioned DTO in the existing form, show the existing localized warning that asks the operator to reload and verify current values, and do not replace it with a success notice. No new UI or copy was introduced.
- **Accessibility/states:** the warning is exposed through the existing `role="status"`; saving temporarily disables form controls, accepted fields remain present, and the private server failure text is not exposed. The E2E verifies these states in Chromium but does not run axe or screen-reader testing.
- **Review/method:** code-only review of the existing flow plus browser-only Chromium E2E with every API route intercepted. **Scoped UX score: 9.2/10** for the accepted-save/failed-refresh feedback contract only; not a visual audit, independent QA, route-wide score, or OPS-15 completion score. Overall UX baseline remains 8.8/10.

## Browser UX re-review — local queue settings and activation (2026-10-20)

- **Problem/user need:** let a streamer create a disconnected manual queue, adjust its call behavior, and activate it without implying a Twitch reward exists or is synchronized.
- **Flow reviewed:** existing creation success link → queue card → grouped settings disclosure → edit/save call timeout and message → accessible saved status → activate local queue → updated queue projection. No UI or copy change was made in this increment.
- **Method and evidence:** Chromium against isolated production-like Compose at 390×844; locators use accessible names/roles; test asserts no horizontal document overflow, exact local settings/open-state requests, success feedback and persisted read-back. No active preview/database or Twitch call was used. No axe, screen-reader, keyboard-only or screenshot-based visual audit was performed.
- **Scoped UX score: 9.2/10** for this disconnected queue create/configure/activate path; established grouping, clear dirty/saved status, colocated actions, and explicit local-only state meet the requested 9+/10 threshold. This score is scoped to the tested viewport/path, not the full queue page, independent QA, or overall OPS-15 score. Overall UX baseline remains 8.8/10.

## Browser UX re-review — local queue settings and activation (2026-10-20)

- **Problem/user need:** let a streamer create a disconnected manual queue, adjust its call behavior, and activate it without implying a Twitch reward exists or is synchronized.
- **Flow reviewed:** existing creation success link → queue card → grouped settings disclosure → edit/save call timeout and message → accessible saved status → activate local queue → updated queue projection. No UI or copy change was made in this increment.
- **Method and evidence:** Chromium against isolated production-like Compose at 390×844; locators use accessible names/roles; test asserts no horizontal document overflow, exact local settings/open-state requests, success feedback and persisted read-back. No active preview/database or Twitch call was used. No axe, screen-reader, keyboard-only or screenshot-based visual audit was performed.
- **Scoped UX score: 9.2/10** for this disconnected queue create/configure/activate path; established grouping, clear dirty/saved status, colocated actions, and explicit local-only state meet the requested 9+/10 threshold. This score is scoped to the tested viewport/path, not the full queue page, independent QA, or overall OPS-15 score. Overall UX baseline remains 8.8/10.

## Browser UX re-review — session/origin and disconnected New Queue (2026-10-20)

- Reviewer: `$aiox-ux-design-expert` (Uma), scoped to the prior cold-session/origin findings in Operations and Widgets and the disconnected New Queue setup path.
- Method: read-only Chromium against the active HTTPS Next preview in pt-BR at 390×844, 768×900 and 1440×900. The instance health endpoint reported Twitch integration degraded; no credentials/OAuth were entered. No form submit, API mutation, Twitch call, or database write was performed.
- Results: New Queue displayed the manual-entry mode with the nearby Twitch setup note and `/connection/` link. Direct Operations and Widgets entry completed session/snapshot initialization without a transient alert. All three routes had a visible heading and no horizontal document overflow at the sampled widths; no page JavaScript errors occurred.
- **Focused UX gate: PASS; no new numeric score assigned.** The historic 8.0 route scores remain historical rather than being silently replaced by an incomplete re-score. The overall eight-route UX baseline remains **8.8/10** pending a whole-surface reassessment. This is not independent QA and does not validate populated DB states, live Twitch, API persistence, or OPS-15 completion.

## Focused UX review — uncertain queue clear and failed refresh (2026-10-19)

- UX review found that the prior uncertain-result message said the queue was refreshed even when the follow-up projection read failed. The clear action could also be retried against stale local data.
- The updated flow uses a distinct localized inline alert with the safe diagnostic reference, closes the stale confirmation, and exposes a keyboard-accessible “Refresh queue” action. Clear preview and confirmation stay blocked until the queue projection refresh succeeds. Progress is announced with `aria-busy`; success asks the operator to review the refreshed queue without moving focus.
- Focused component tests cover refresh failure followed by successful recovery. No browser, screen-reader, or axe review was run. **No score assigned;** overall UX baseline remains **8.8/10**. Independent scoped QA is recorded separately and is not overall OPS-15 QA.

## UX review — Twitch reconciliation feedback parity (2026-10-15)

- Reviewed the existing Connection feedback against Operations and the vanilla handler. Keep the direct reconciliation action and current localized notice hierarchy; this response-validation fix needs no new confirmation or layout change.
- Connection now distinguishes failed/partial reconciliation from complete success and rejects malformed responses through its existing safe failure notice. The actual `partial` reconciler result remains visible as an issue count. Numbers retain locale formatting and plural rules.
- This was a focused copy/state review, not a browser or accessibility audit. **No score assigned;** the overall UX baseline remains **8.8/10**. Independent QA found the valid `partial` state and empty-issues failure response were initially mishandled; both were corrected and the final scoped QA re-review passed **26/26** page tests. This is not OPS-15 overall QA.

## Design gate — edit Twitch reward settings

- **Task and hierarchy:** let an operator edit the existing queue reward's name, point cost, viewer-facing description, UID collection mode, per-stream/per-viewer limits, and global cooldown. Keep a single “Edit reward” action beside queue lifecycle actions, followed by a native dialog with grouped identity, viewer input/privacy, and Twitch limits fields. Place the synchronization caveat and submit/cancel actions at the end.
- **States:** open with values from the current queue projection; preserve unsaved edits on validation/API failure; disable fields/actions while saving; on accepted `202`, say Twitch synchronization is pending (never confirmed), refresh the queue projection, and keep the accepted result visible if refresh fails. Respect existing eligibility: only linked, synchronized Twitch-managed rewards are editable.
- **Responsive/keyboard/accessibility:** one labeled dialog heading, associated native labels, visible focus, Escape/cancel, 44 px actions, scrollable dialog within short viewports, no horizontal overflow. If switching UID to hidden, warn that existing locally stored UID values are removed, matching the existing UI/backend contract.
- **Localization/security:** reuse existing `panel.reward_settings.*` strings in `en`, `es`, and `pt-BR`; render API failures as safe localized copy/reference ID only. Submit only the existing `/api/queues/:queueId/reward-settings` contract; no direct Twitch call from the browser.
- **Review gate:** this specification is recorded before implementing the visible form. Browser UX review and score will be recorded after implementation; it will not stand in for independent QA.

### Browser re-review — mocked reward settings form (2026-10-15)

- The first pass showed an ungrouped seven-field form that filled nearly the full viewport. The form was revised into three fieldsets (reward details, viewer input/privacy, Twitch limits), with two columns for identity and three for limits on wider screens. The actions footer now stays visible while the narrow dialog scrolls.
- Brave review at 390×900, 768×900 and 1440×900 used fully mocked queue/catalog/API responses. No horizontal document overflow or browser errors occurred. At 390 px the dialog was 362×872 px with internal scroll; actions stayed inside the viewport. At 768/1440 px it was 540×707 px. Buttons and single-line inputs measured 44 px; the textarea measured 82 px. The UID removal/call-notification warning appeared beside the selector only when changing visible to hidden.
- Keyboard review: initial focus on Close, Tab reached the first form field, Escape closed the dialog. A mocked `202` test submitted the exact versioned existing API contract, closed the dialog and showed “pending until Twitch confirmation” copy. The request and follow-up queue projection were intercepted; no real mutation occurred.
- **No score assigned; axe not run.** Overall UX baseline remains **8.8/10**. Independent `$aiox-qa` separately found and re-reviewed a stale-version concurrency issue, returned a scoped **PASS** with no remaining findings after its correction, and did not assess OPS-15 overall. UX review and QA remain separate.

## Focused UX review — manual association of an uncertain reward (2026-10-15)

- `$aiox-ux-design-expert` reviewed the new Next queue reward-resolution dialog using mocked queue/candidate responses at 390×900, 768×900, and 1440×900 in Brave. The POST resolution route was aborted; no API mutation, database write, or Twitch call was made.
- The dialog fit all three viewports without document horizontal overflow. At 390 px it measured 362×518 px; at 768/1440 px it measured 540×396 px. All four dialog buttons, including Close, measured 44 px. Initial focus landed on Close, Tab moved to the refresh action, and Escape closed the dialog. Candidate reward IDs did not appear in visible text; no browser errors occurred.
- The empty-candidate state and local-only caveat were inspected in an earlier mocked review. The text now explains that manual association is stored locally and does not confirm Twitch's original creation response. A first visual pass exposed cramped warning copy and a displaced close button; CSS/layout were corrected and re-reviewed. axe was not run.
- **No new score is assigned.** Overall UX remains at its **8.8/10 baseline**. This focused UX review is not independent QA; QA for this increment remains **not evaluated**.
- Limit: the review covered the dialog and mocked candidate/empty states only. It does not establish persisted behavior, Twitch behavior, complete queue parity, or OPS-15 acceptance.

## Queue lifecycle UX follow-up — mocked populated states (2026-10-15)

- **Reviewer:** `$aiox-ux-design-expert` (Uma), scoped to the new Next delete, cancel-delete, manual-mode, unarchive, and uncertain-Twitch local-archive controls. The overall UX baseline remains **8.8/10**; this focused review does not change it or score OPS-15 completion.
- **Method:** Chromium 156, pt-BR, mocked queue projections at 390×900, 768×900, and 1440×900. Reviewed normal local-delete copy, both local-only archive confirmations, pending-delete recovery, and archived visibility. The archive challenge response was intercepted; the final destructive confirmation was cancelled. No product DB/Twitch mutation occurred.
- **Findings and corrections:** The first browser pass showed the safe fallback “Texto do produto indisponível.” for the local-only archive confirmation because the shared translator was given unused title/count interpolation values. The Next component now supplies interpolation only to catalog keys that declare those values. Re-review showed the full localized copy, including that the Twitch reward is not deleted and may remain active. Closing the dialog clears the short-lived challenge from component state.
- **Interaction/accessibility observations:** No horizontal overflow at the three widths; one visible page `<h1>`; no browser page errors. At 390 px the modal fit within the viewport (362×211 px for ordinary local delete; 362×391 px for the longer final archive copy). Both action buttons measured 44 px. Modal focus began on Cancel, Tab reached Confirm, and Escape closed the dialog. axe was not run; this is a scoped UX review, not independent QA.
- **Evidence:** The mocked first and final archive messages were read in Chromium; the challenge POST was intercepted, the final-confirm button was not activated, and no database/Twitch write was made. Independent QA remains **not evaluated** for this correction.

## General UX audit — every implemented panel route and user guidance (2026-10-15)

- **Reviewer:** `$aiox-ux-design-expert` (Uma). **Overall UX score: 8.8/10** for the eight operator routes, equally weighted. This is a current route/first-use audit score, not an OPS-15 completion score or independent QA verdict.
- **Scope:** `/` Overview; `/queues/`; `/new-queue/`; `/operations/`; `/settings/`; `/widgets/`; `/commands/`; `/connection/`; shared navigation/language picker; and the separate transparent overlay entry. Reviewed first-run setup guidance, queue creation and privacy instructions, queue/attendance entry points, Twitch synchronization versus viewer-point refunds and redemption confirmation, account labels, command audience roles, OBS setup/link guidance, and disconnected/empty/error copy.
- **Method:** read-only Chromium 156 review of the active Next preview at 390×900, 768×900, and 1440×900; primary UI language pt-BR. A settled scan with `prefers-reduced-motion: reduce` covered eight routes × three widths (24 route/viewport states). No application mutation, Twitch call, credential entry, OAuth authorization, or database seed was performed. First-use session timing was separately captured with network timestamps. Earlier scoped browser reviews of populated Operations, Settings, Widgets and Commands states remain linked below; the isolated DB currently has no queue/operation/widget records.

| Route | User task and instruction review | Score | Coverage limit |
| --- | --- | ---: | --- |
| Overview `/` | Read local health, next action, queue/review counts and refresh guidance. | 9.2/10 | Rechecked disconnected first-run and shared shell; previous score remains scoped to overview/navigation. |
| Queues `/queues/` | Find queues and enter queue operations or create the first queue. | 9.0/10 | Current isolated DB showed the helpful empty state; populated queue/card lifecycle was not available in this pass. |
| New queue `/new-queue/` | Choose reward or manual entry, name the queue/command, set reward limits, UID privacy and call timeout. | 9.0/10 | Historical first-run form review only; no create submission. The disconnected-state default and nearby setup link were corrected afterward; post-fix browser re-review remains pending. |
| Operations `/operations/` | Reconcile Twitch synchronization, viewer-point refunds and redemption fulfillment. | 8.0/10 | Historical score from before the cold-session fix. Direct-entry state now waits for session initialization and the first snapshot; post-fix browser re-review remains pending. Populated dialogs/states were reviewed in the prior scoped mocked audit below. |
| Settings `/settings/` | Edit current and default account labels with separate dirty/save/cancel feedback. | 9.3/10 | Rechecked current clean state; prior review covered dirty/saved states. |
| OBS Widgets `/widgets/` | Follow local OBS HTTPS instructions and manage widget links. | 8.0/10 | Historical score from before the cold-session fix. Direct-entry state now waits for session initialization and the first snapshot; post-fix browser re-review remains pending. Prior scoped review covered populated inventory and editor. |
| Chat Commands `/commands/` | Understand audience thresholds, follower default and fixed moderator/streamer access. | 9.1/10 | Catalog loaded; no permission save or Twitch scope authorization was attempted. |
| Twitch Connection `/connection/` | Follow credential/callback setup and understand disconnected chat/reward statuses. | 8.8/10 | Disconnected state reviewed; no credentials were entered and OAuth was not run. |

The equal-weight mean of the eight displayed route scores is **8.8/10**. Scores for data-dependent routes are limited to the state observed or explicitly identify earlier mocked-state evidence; the overlay is excluded from the operator-page mean because it is a separate transparent output, not a control page. Without a valid capability it intentionally displays no widget content; populated rendering and native OBS/CEF remain separate acceptance checks.

### Findings

1. **Resolved in code; post-fix browser re-review pending — cold-entry session race on Operations and Widgets.** The recorded browser audit observed protected reads before session readiness and transient **401** responses. The current shell waits for the local session and first snapshot before mounting these direct routes. Original route scores remain historical until a post-fix browser review.
2. **Resolved in code; post-fix browser re-review pending — first-use reward prerequisite on queue creation.** The recorded review observed Channel Points selected while Twitch was disconnected and no nearby setup link. The current Next form defaults to manual mode while Twitch is disconnected and provides a nearby `/connection/` link. Original route score remains historical until a post-fix browser review.

### Instructions to the operator

- **Clear and helpful:** the Overview directs an unconfigured operator to connect the channel; the queues empty state offers “Create first queue”; New Queue explains the reward/manual modes, optional Twitch limits, hidden UID mode and call timeout; Operations names Twitch synchronization, points refunds and redemption confirmation separately; Widgets tells the operator to use a local HTTPS Browser source, set Page Permissions to `None`, and never bypass certificate errors or switch to HTTP; Connection shows the exact callback and states credentials must be validated/saved before channel authorization; Settings explains current versus default account labels; Commands explains the follower minimum and fixed elevated roles.
- **Needs attention:** the post-fix browser re-review for Operations, Widgets and disconnected New Queue is pending. No instruction should describe a pending Twitch action as confirmed.

### Evidence and limits

- Across the settled 24 route/viewport states: every operator page had one visible `<h1>` and one `<main>`; no page overflowed horizontally; no page errors were reported; no unlabeled visible form controls were found; axe reported **zero WCAG 2.1 A/AA violations** with reduced motion. No sampled button target was smaller than 40×40 px. The active mobile navigation remained horizontally scrollable.
- The first cold-entry run intentionally used fresh browser contexts and exposed the 401 race; its error-state screenshots are evidence of that defect, not the warmed-state axe score. A transient contrast warning during the health-card entrance animation did not reproduce in the settled/reduced-motion scan.
- No real Twitch integration, callback, point refund, reward deletion/fulfillment, operation resolution, queue save, permission save, widget create/revoke/delete, or database write was exercised. Populated queue lifecycle and native OBS/CEF behavior remain unreviewed here. This UX audit is not independent QA and does not close OPS-15.

## Review

- Reviewer: `$aiox-ux-design-expert` (Uma)
- Scope: all implemented Next routes, page compositions, shared shell/provider and language picker, queue and overview modules, API/i18n helpers, panel/overlay styles, and current overlay entry.
- References: FND-6 UX research, OPS-6 UX research, FND-7 UX refinement, and OPS-15 parity criteria.
- Method: static source/design-system review. No files were changed by the reviewer. Browser contrast, responsive rendering, and keyboard walkthrough remain pending.
- UX score before this refinement: **6/10**.

## Findings and disposition

### Implementation status after audit

- Cold-session race: fixed at the shared shell boundary; regression and browser re-review pending.
- New Queue reward-mode setup cue: implemented with a disconnected manual default and localized connection link; UX re-review pending.
- The audit scores below remain the original findings baseline until the affected routes are re-reviewed.

1. Nested `<main>` landmarks and no skip link. Fixed by retaining the single shell main landmark and adding a localized skip link.
2. New Queue lacked form hierarchy, mode explanation, optional-limit distinction, cancel action, and nearby feedback. Refined into identity, entry method, reward, and privacy/attendance sections; added mode/alias/command guidance, title-derived editable command, and a persistent action/feedback area.
3. Queue settings mixed attendance, UID privacy, and points policies and gave no dirty-state signal. Grouped controls by purpose; added dirty/no-change status and cancel/reset behavior. Saved result feedback remains on the form.
4. Live queue controls and statuses were too small. Increased text size and interactive targets, and allowed entry rows/actions to wrap.
5. Overview next step was static and migration copy was visible despite live data. It now directs an empty installation to queue creation and a configured installation to live queues; while data loads it gives a localized loading message.
6. Overlay's minimal OBS-focused presentation was approved for preservation; do not apply the panel theme to streamer-controlled transparent output.

## Reusable design gate for future UI

Before creating a route, feature module, or shared UI component, record its task, content/action hierarchy, loading/empty/error/pending/confirmed/stale states, narrow-screen and keyboard behavior, localized labels, and applicable accessibility criteria. Reuse shared page heading, section/card, form field/hint/error, status badge, empty state, action bar, and confirmation summary patterns. Keep functional text at readable sizes, statuses understandable without color, purple accents restrained, and green reserved for confirmed outcomes. Retain FND-7 WCAG AA scope for overlay editor controls/chrome.

## Browser re-review and current score

- Uma rechecked all four routes at 390×844, 768×900, and 1440×900 after the first browser pass found three issues: the New Queue action bar covered reward fields at tablet/desktop widths; the brand link's redundant accessible name failed axe; and the overlay rendered two `<main>` landmarks.
- Corrections: the action bar now stays in normal document flow at every width; the brand link uses its visible text as its accessible name; the overlay page wrapper is a `<div>` and the widget retains the single `<main>` landmark.
- **UX score: 10/10 for the reviewed corrections and default/empty states across the requested viewports.** axe found zero WCAG 2.1 A/AA violations on all four routes. Titles and one main landmark were present; there was no horizontal overflow or page error. The first Tab exposed the skip link, and keyboard focus remained visible while traversing fields and actions.
- Independent QA re-review: **10/10 PASS** for the three final corrections (action bar flow, brand accessible name, and single overlay main) and their focused tests. This is a separate, scoped QA score.
- Scope limits: the populated queue/settings state was not browser-rendered because the isolated development database is empty; populated overlay content was not rendered because no widget reference/capability was available. No data was seeded and no Twitch calls were made. This is not a score for full OPS-15 parity.
- Automated evidence: focused shell/overlay/New Queue tests **8/8 passed**; full suite excluding `tests/integration/next-static-export.test.js` passed **125 files / 1,101 tests** while the active Next server owns `.next`. `npm run lint`, `npm run typecheck`, localization, version, port-denylist, and `git diff --check` passed.

## Operations populated-state re-review

- Uma reviewed the UX-approved `/operations/` surface with mock data and a catch-all API interceptor that answered every expected method/path and aborted every unknown request. No real API/DB/Twitch requests occurred during the final review.
- Viewports: 390×844, 768×900, and 1440×900. The mobile shell scrolls the active navigation item into view (390 px review: `scrollLeft=284`); no horizontal overflow appeared. Operation groups/statuses remained readable.
- Dialog behavior: manual resolution and continue deletion passed axe WCAG 2.1 A/AA with zero violations. Dialogs fit each viewport; Cancel and Escape close; keyboard focus starts at Cancel, Tab reaches the destructive confirmation, and Enter invokes only the intercepted mutation. The result message explicitly states that Twitch has not confirmed it.
- Reconciliation and state feedback were reviewed with intercepted results. No browser errors or unmocked API requests occurred.
- **UX score: 10/10** for the populated Operations route, mobile shell, dialogs, and mock operation states only. This score does not represent full OPS-15 parity.
- Independent QA final review: **10/10 PASS**, no remaining findings in the scoped Operations slice. Focused tests passed 85/85 in the QA run; the local final focused rerun passed 87/87. The complete suite is separately recorded in the active handoff.
- A prior keyboard audit attempt sent one POST using synthetic ID `r` past its incomplete mock. It did not contact Twitch; the required outbox ID is UUID-typed, and the route resolves that ID before writing. No HTTP status/log was captured for that attempt. All final browser runs used catch-all interception/abort and did not repeat it.

## Pre-creation design review — account settings

- **User task and hierarchy:** let the streamer edit the current live account label and the default label used when automatic account switching is off or reset. Present them as two clearly titled, separate form sections under one page heading; show the current projected value and a concise explanation of when the default applies.
- **States:** values load from the existing `/api/state` account projection; preserve the panel's global loading/unavailable states. Each form has clean, dirty, saving, saved, safe validation/error, and accepted-but-refresh-failed feedback. Cancel restores that form's last API-confirmed value. Do not imply Twitch synchronization.
- **Responsive and keyboard behavior:** forms stack at narrow widths, retain visible labels and hints, and use native inputs/buttons with visible focus. Save and Cancel remain next to the corresponding field; all account actions disable during a save to prevent overlapping writes.
- **Localization and reuse:** use existing page heading, panel/card, form hint, and action button patterns. New user-facing copy must be present in English, Spanish, and pt-BR runtime catalogs. The field limit follows the existing API contract (60 characters).
- **Accessibility/security criteria:** one page `<h1>` within the shell's single `<main>`; labels are programmatically associated; status feedback uses `role="status"` and failures `role="alert"`; never surface raw API errors. Mutations use only existing same-origin `/api/account` and `/api/account/default` contracts.
- **Scope guard:** command permission editing remains a separate route/slice; preserve follower as the configurable minimum and streamer/moderator-only commands as fixed.
- **Review:** `$aiox-ux-design-expert` reviewed the existing vanilla account controls, catalog copy, API contract, and shared Next patterns before route/component creation. This is a pre-creation specification; browser review and UX score for the new route are pending implementation.

## Pre-creation design review — command permissions

- **User task and hierarchy:** let the streamer inspect chat commands and change the minimum audience role only for commands marked configurable by the API. Group the page into configurable audience commands and fixed-access commands; each row presents localized command name, syntax, access type, and the applicable control.
- **Role rule:** each configurable command defaults to **followers**. A changed threshold applies to all callers of that command, and higher roles inherit it. Commands whose API access is fixed to streamer/moderator (and any other fixed role) remain read-only. Do not grant a viewer-facing command broader access through a UI control.
- **States:** catalog loading, valid catalog, empty/unavailable/error, unchanged, dirty, saving, saved, revision conflict/reload, and follower-scope missing/authorization redirect. Save sends only changed configurable policies with the current catalog version; a follower selection uses the existing Twitch authorization endpoint when its scope is absent. Never imply a policy is persisted before API confirmation.
- **Scope-only recovery:** when Twitch follower scope is missing, the separate authorization action requests only that OAuth scope with an empty policy payload. It never saves implicit follower defaults or changes policy revision/audit. Saving a changed follower threshold continues through the staged policy-authorization path and commits only after a valid callback. The copy explains this distinction before the streamer leaves for Twitch.
- **Responsive and keyboard behavior:** command cards stack into one column at narrow widths; names and syntax wrap safely. Native selects and buttons retain visible labels/focus. The fixed-access rows are announced as fixed and contain no enabled selector.
- **Localization and accessibility:** new copy remains equivalent in English, Spanish, and pt-BR; reuse shared headings/cards/status/actions. One page `<h1>` within the shell's single `<main>`, labelled controls, status/live-region feedback, and safe generic error text. No raw API exception or Twitch credentials are exposed.
- **Review:** `$aiox-ux-design-expert` inspected the existing command catalog UI, role-copy inventory, API contracts, and Next patterns before route/component creation. Browser review/score for the new route remains pending.

## Pre-creation design review — OBS widgets

- **User task and hierarchy:** help the streamer identify each OBS source, choose one display value, configure its appearance, add its local HTTPS link to OBS, and manage that link. The page order is heading/brief local-connection guidance and primary Create action; the API-ordered widget list with source, queue when applicable, safe preview, dimensions, short ID, and link state; then the create/edit form with data source, conditional fields, fallback, appearance and preview. Preserve the current API list order; no new sorting or naming rule is introduced.
- **States and actions:** loading with an announced list status; retryable localized load error; empty state with Create first widget and OBS setup guidance; inline validation for queue selection and the existing 240 Unicode code-point limit; saving with duplicate actions disabled; saved edit feedback without link rotation; create/regenerate opens one-time link disclosure; copy success/fallback remains available while the dialog is open; revoked remains visible and can be regenerated or deleted; `409` retains the draft and offers refresh/review; other API errors retain form data and use safe localized copy. Revoke and delete require a clear confirmation that explains their OBS effect.
- **One-time secret:** only POST create or regenerate responses may populate the disclosure dialog. The widget list and GET/PATCH/revoke/delete responses never render or retain the capability secret. Closing the dialog clears the URL; recovery requires generating a replacement, which invalidates the prior link. The streamer can retry copying while the dialog stays open. Prevent accidental dismissal by requiring an explicit close action that states the link will be lost.
- **Responsive and keyboard behavior:** use two columns for editor and preview on wide screens; stack preview before the form on narrow screens. Cards and action groups wrap without horizontal scrolling. Native controls have visible labels, units and limits; focus remains visible. Dialogs have an accessible title, predictable initial and restored focus, keyboard cancellation, and visible Cancel/confirm actions. Status is communicated in text through `role="status"`/`role="alert"`, not color alone.
- **Localization and accessibility:** reuse the Next page heading, card, form, notice and dialog patterns; new copy must exist in runtime catalogs in English, Spanish and pt-BR. Apply FND-7 WCAG AA to widget editor controls/chrome. The preview may identify a contrast concern but must never silently change streamer-selected styles. Render queue and streamer-provided text as text, never HTML.
- **Existing contracts:** use only `GET /api/overlay-widgets`, `POST /api/overlay-widgets`, `PATCH /api/overlay-widgets/:id`, `POST /api/overlay-widgets/:id/regenerate`, `POST /api/overlay-widgets/:id/revoke`, and `DELETE /api/overlay-widgets/:id`, with existing `expectedVersion` and one-time capability semantics. Use `overlay-widget-form.mjs` and `overlay-widget-policy.mjs` as validation/source-of-truth, and the already loaded queue projection for selectable queues.
- **Pre-creation review:** `$aiox-ux-design-expert` reviewed the OPS-15 story, this audit, vanilla widget UI, current API contracts, localization keys and FND-7 scope. Plan score: **10/10 approved for implementation**. This score covers the design brief only; the route still needs browser review and a separately scoped UX score.

## Visual re-review — Settings, OBS Widgets, and Chat Commands

- **Reviewer:** `$aiox-ux-design-expert` (Uma).
- **Baseline:** running local Next preview, pt-BR runtime catalog, Chromium at 1440×1000 and 390×844. The browser made read-only calls to the isolated local API; mutation requests were blocked. No DB data was seeded and no Twitch calls were made.
- **Initial score:** **5/10** for these three routes. This is a route-specific baseline, not the OPS-15 score.
- **Settings findings:** the account forms render without a visible card boundary or distinct action styling, so the two different account concepts read like loose text fields. Eyebrow and global language-picker text are 9–10 px and too small for routine operation.
- **OBS Widgets findings:** primary actions use the browser's gray default button appearance. The empty state has no layout styles, so its icon, title, explanation and action run together as one line. The management workspace needs a visible empty-state container and consistent action hierarchy.
- **Chat Commands findings:** all 21 commands render as full-height cards, including immutable role descriptions. The page is 2,755 px tall at 1440 px and 4,936 px at 390 px; fixed-access commands need a compact, scannable presentation while configurable policies retain clear controls and descriptions.
- **Shared finding:** `.button` variants used by these routes have no shared base/variant rules in the panel stylesheet, leaving primary, secondary and danger buttons with user-agent styling. This also weakens disabled-state and focus consistency.
- **Design direction for the correction:** add reusable button/card/status/empty-state treatments using existing tokens; preserve the existing Next/API/domain boundaries and follower-minimum/fixed-role policy. Keep command descriptions and syntax visible, make fixed access scan quickly, and maintain localized, keyboard-operable controls.
- **Final browser review:** Chromium at 390×844, 768×900 and 1440×900, with the live local API for read-only panel/catalog/command reads and a contract-shaped widget fixture for empty/populated states. No mutations were submitted and no Twitch calls or database seeding occurred. Settings were reviewed saved and dirty; widget inventory was reviewed empty and populated, and its create editor was opened; chat permissions were reviewed at defaults, after a local draft change, and with fixed roles visible. The test scanned all three routes at all three widths plus the widget editor at 390/1440.
- **Final UX scores (page-scoped):** Settings **9.3/10**; OBS Widgets **9.2/10**; Chat Commands **9.1/10**. Each clears the requested **9/10** threshold. These are design-review scores, not independent QA scores and not the overall OPS-15 score.
- **Score rationale:** Settings separates current/default labels into named cards with specific guidance and per-form dirty/saved/cancel/save feedback; the cards stack cleanly on mobile. Widgets pairs local OBS setup guidance with a strong create action, distinct empty/populated states, a preview and accessible lifecycle actions; the editor is scrollable on small screens. Commands groups the audience-configurable policies separately from moderator/streamer/fixed roles, retains command syntax, and exposes a visible draft/save state; the page stays long because all 21 commands are visible. Remaining work on these routes is independent QA, not a UX finding that blocks the requested threshold.
- **Evidence:** axe WCAG 2.1 A/AA found zero violations for every scanned page/editor state; no horizontal overflow occurred; each page had exactly one `<h1>` and one `<main>`; keyboard focus had a visible outline; buttons in the reviewed states were at least 44 px high after the widget editor close control was corrected. The command page is intentionally longer because it exposes the full 21-command catalog, grouped by configurable audience and fixed roles.
- **Remaining OPS-15 gates:** independent QA for the affected routes, full migration parity, native OBS/CEF validation, legacy-test audit, rollback rehearsal, and final architecture/DevOps acceptance remain open. These page scores close only criterion 14's UX threshold.

## Overview health and mobile navigation re-review

- **Reviewer:** `$aiox-ux-design-expert` (Uma). **Scope:** Next overview page plus shared mobile navigation, viewed in Chromium at 390×844, 768×900, and 1440×1000 against the running local development API. Reads only; no application mutations, Twitch requests, or DB seeding.
- **Initial findings:** at 390 px, the installation-health heading shared a row with reconciliation metadata and wrapped to two lines; the 11 px legend was small for quick scanning; mobile navigation allowed horizontal scrolling but gave no scrollbar cue.
- **Corrections:** below 620 px, the reconciliation metadata now stacks below the health title; legend type is 12 px; the mobile navigation has thin purple scrollbar styling while preserving touch scrolling and keyboard focus.
- **Final UX score: 9.2/10** for the overview/shared-navigation slice only. At all three sizes, there was no horizontal page overflow or browser error; each view had one `<h1>` and one `<main>`; the six health cards exposed expected semantic severities/colors; at mobile width the navigation is horizontally scrollable and reports `scrollbar-width: thin`; the first Tab reveals the skip link and focus outline. Legend text contrast measured **6.55:1**. This was a manual browser review; no automated axe scan or independent QA review is claimed.
- **QA wording follow-up:** independent review found that “partially available” omitted progress and unknown states from the yellow category. The yellow legend now explicitly reads “Partial, in progress, or unknown” (and localized equivalents); a catalog contract verifies all shipped locales.
- **QA result:** after the copy correction, independent QA re-review scored **10/10 PASS**, limited to this overview slice. Overview/projection/panel/shell/catalog tests passed **17/17**; localization validation, lint, typecheck, and `git diff --check` passed. This does not score the full OPS-15 story.

## Code-only re-review — queue, reward, widget, and operations recovery (2026-10-19)

- **Reviewer:** `$aiox-ux-design-expert` (Uma). **Scope:** queue call-message creation, reward association recovery, OBS widget conflict/one-time-link recovery, and Operations feedback. This was a source review only; no browser, axe, Twitch, or OBS/CEF session was run.
- **Queue creation:** adds the existing five supported call-message tokens, input validation, a localized sample preview, and local/manual entry guidance. UX score: **9.0/10**.
- **Reward association:** an accepted link closes the dialog even if projection refresh fails; the queue shows a safe reference and refresh action, and disables another link until refresh succeeds. UX score: **9.2/10**.
- **Widgets:** failed reads retain accepted-action feedback and prior projection; version conflicts show the fetched server value and require explicit draft replacement; removed widgets block another PATCH and offer “Close without saving”; one-time link is cleared by Close, Escape, or an outside click. UX score: **9.0/10**.
- **Operations:** first-load errors show one alert with reference/retry, quiet polling does not repeat empty-state alerts, and reconciliation does not claim a current projection after refresh failure. UX score: **9.1/10**.
- **Combined scoped code-only UX score: 9.1/10.** Independent scoped QA later passed **9.2/10**. The prior general UX baseline **8.8/10** remains unchanged. Full browser/responsive/AT review, Twitch traffic, and native OBS/CEF validation remain open with OPS-15.

## Code-only follow-up — New Queue reward draft and chat message (2026-10-19)

- **Reviewer:** `$aiox-ux-design-expert` (Uma). **Scope:** switching between Channel Points and manual entry, the untouched call-message default across locale changes, `{uid}` preview behavior, invalid template feedback, and accessible preview/field descriptions.
- Reward fields remain mounted but hidden and disabled in manual mode, so toggling back restores the draft and manual submission omits reward inputs. The untouched message default follows the selected locale; an edited template is preserved. The preview uses the existing call worker's default behavior: UID is blank unless both existing UID conditions are enabled. The localized note explains both conditions.
- Invalid control characters/unknown placeholders produce an associated localized inline error; submission focuses the message field and does not call the create action. The preview is a named group, while the textarea description contains instructions and only the conditional UID note.
- **Scoped code-only UX score: 9.4/10**, no remaining implementation findings. This review inspected source and tests only; no browser, axe, assistive-technology, Twitch, or OBS/CEF validation was run. The general UX baseline **8.8/10** and overall OPS-15 QA remain unchanged.

## Code-only follow-up — widget queue and linked reward selection (2026-10-19)

- **Reviewer:** UX code-only review following the `$aiox-ux-design-expert` workflow. **Scope:** choosing queue-backed widget data and selecting the specific queue/reward.
- **Observed gap:** the queue selector appeared only after choosing a queue-based source and was labeled only “Queue”. With no active queues it contained only its placeholder, so the streamer had no explanation or path forward. The current isolated development database has zero active queues.
- **Correction:** the source field now explains when a queue selection is needed. The selector explicitly names the linked reward and explains that it follows the selected queue. When no active queue exists, the form explains the empty state, opens the queue-creation route in a new tab to preserve the widget draft, disables the empty selector/save action, and guards submission against an invalid queue ID. The existing `queueId` API contract and data sources are unchanged.
- **Scoped code-only UX score: 9.2/10.** Native labels/selects, associated help, localized empty-state recovery, and no-options behavior are covered in English, Spanish, and pt-BR. No browser, axe, assistive-technology, Twitch, or OBS/CEF review was performed; independent QA for this slice remains pending. This does not change the previous widget browser score of 9.2/10, general UX baseline of 8.8/10, or overall OPS-15 QA.
- **Validation:** `tests/unit/next-widgets-page.test.jsx` passed **13/13**; lint, typecheck, localization validation, and diff-check passed. The live widget route and API health returned HTTP 200. The preview is using `.next`; do not modify its runtime output.
