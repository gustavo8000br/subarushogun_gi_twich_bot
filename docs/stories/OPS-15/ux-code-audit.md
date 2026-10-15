# OPS-15 Next UI code audit

## Review

- Reviewer: `$aiox-ux-design-expert` (Uma)
- Scope: all implemented Next routes, page compositions, shared shell/provider and language picker, queue and overview modules, API/i18n helpers, panel/overlay styles, and current overlay entry.
- References: FND-6 UX research, OPS-6 UX research, FND-7 UX refinement, and OPS-15 parity criteria.
- Method: static source/design-system review. No files were changed by the reviewer. Browser contrast, responsive rendering, and keyboard walkthrough remain pending.
- UX score before this refinement: **6/10**.

## Findings and disposition

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
