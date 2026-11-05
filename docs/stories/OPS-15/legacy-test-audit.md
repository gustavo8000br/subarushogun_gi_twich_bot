# OPS-15 — Legacy (vanilla) test audit and independent reviews, preliminary

[Português brasileiro](../../pt-BR/stories/OPS-15/legacy-test-audit.md)

**Status:** Preliminary, 2026-10-21. Run before full parity at the owner's request, so it is **not** the final gate: the legacy-test classification, the QA review and the architecture review must be repeated on the complete migration. Classes: **1** behavioral contract to preserve until an equivalent Next test passes; **2** vanilla-implementation-specific assertion already covered by Next; **3** obsolete after removal.

## Independent reviews (not final acceptance)

| Review | Verdict | Score | Main findings |
|---|---|---|---|
| `@qa` (Quinn) | CONCERNS | 5.5/10 (would be FAIL as a final gate) | Lint, typecheck, 133 unit files / 1,199 tests, OpenGrep (149 files / 0 findings) and localization passed. Findings: stale “Pending” cells in the route/action inventory contradict the closed addenda; QRA-08/09/10 browser evidence is intercepted fixtures only; INV-02/04/07/08/09 lack route/action detail; AC 10 builds (`build:frontend`, `npm run build`, `docker compose config`) have no recorded run this cycle; no axe or screen-reader run (UX baseline 8.8/10); E2E copy is asserted only in the `en` catalog; API `error` strings are fixed pt-BR (clients must map `code`); negative runtime branches (no-show, remove, move/priority conflicts, clock expiry) are component/route-mock only; QRA-13 batch audit omits `actorId`; QRA-02 Channel Points skips `callTimeoutMin` validation. |
| `@architect` (Aria) | CONCERNS | 7.5/10 | Sound: Fastify stays the authority; proxy targets validated (loopback, explicit port, no credentials); origin/CSRF; overlay capability headers; two-process production runtime. Concerns: **high** — 13 relative imports from `apps/frontend` into `apps/web/*.mjs` (including the overlay renderer) and a `process.cwd()`-based catalog path; **medium** — dev and production differ at `/`, and a second vanilla overlay is still served by Fastify; **low** — dead static-export leftovers (`create-overlay-alias.mjs`, a stale `/connection/:path*` filter). |

### Recommended order to remove the vanilla panel (architecture)

1. Move the shared modules and catalogs to a neutral package (for example `apps/shared/browser/`), resolving paths via `import.meta.url`.
2. Port the class-1 tests that have no Next equivalent (table below).
3. Retire `POST /api/queues/:queueId/archive` (owner decision) with its route test and, if unused, `repository.archiveQueue`; first confirm it is not a public contract in the HTTP-surface docs.
4. Remove the `/`, `/styles.css`, `/app.js` rules, the static `registerWebRoutes`, the vanilla overlay files and `apps/web` panel assets.
5. Update `compose-runtime` and `next-dev-proxy` assertions in the same change. Rollback is reverting that change; data is unaffected.

## Vanilla-bound test classification

| File | Class | Next equivalent | Note |
|---|---|---|---|
| `tests/integration/panel-localization-contract.test.js` | 1 (mixed 1/2) | partial: panel catalogs, placeholders, locale picker, connection page, operations plural copy | No automated equivalent for the visible focus ring, mobile stacking of command policies, empty-state copy for queue/finance. Keep the catalog tests and repoint them. |
| `tests/unit/panel-confirmation-contract.test.js` | 1 (mixed) | queue list/lifecycle tests; `queue-lifecycle-browser-only` | Port: dialog fails closed when it cannot open or is already open; no native `confirm()`; removal of hide/archive wording from catalogs. |
| `tests/unit/reward-dialog-contract.test.js` | 1 | none | Port: close button must be `type="button"`; responsive dialog space. |
| `tests/unit/vanilla-fulfillment-feedback.test.js` | 3 after removal | `next-queue-entry-actions` fulfillment-pending tests | Covered. |
| `tests/unit/web-route.test.js` | mixed | shell, entry actions, settings form, queue list, locale picker | Keep API-only and shared-ESM serving cases (class 1); cases serving `/`, `/app.js`, `/styles.css` fall with the vanilla. |
| `tests/unit/web-application-setup.test.js` | 2 | `next-connection-page` | Before deleting, confirm Next never shows the raw Twitch message on credential validation failure. |
| `tests/unit/panel-error-presentation.test.js` | 2 | operations page and entry-action error tests | Covered. |
| `tests/unit/call-deadline-presentation.test.js` | **1** | **none** | Parity gap: do not start the countdown before Twitch confirms; mark expired without inventing a no-show. |
| `tests/unit/call-notification-actions.test.js` | 2 | entry-actions resend tests; `queue-call-resend-browser-only` | Covered. |
| `tests/unit/dom-localization.test.js` | 3 | panel catalogs | DOM translation is vanilla-only. |
| `tests/unit/health-status.test.js` | 2 | overview panel tests | Verify “does not invent a ping” and “automatic reconnection shown as retrying” exist in Next; otherwise class 1. |
| `tests/unit/locale-picker-state.test.js` | 2 | `next-locale-picker` | pt-BR fallback for an incomplete catalog is not explicit in Next. |
| `tests/unit/priority-labels.test.js` | 2 | queue list priority test | Ensure Next does not reflect arbitrary data. |
| `tests/unit/queue-onboarding-flow.test.js` | 1 | partial | “Open settings after creating, do not activate” and “activate only after sync” have no explicit Next test. |
| `tests/integration/compose-runtime.test.js` (case at `:372`) | 2 temporary | — | Asserts `/` is vanilla; invert at cutover. |
| `tests/unit/next-dev-proxy.test.js` (`:32-39`) | 2 temporary | — | Pins production `/`, `/styles.css`, `/app.js` rules; update at cutover. |

**Class-1 gaps blocking removal:** call-deadline countdown; post-creation onboarding; fail-closed dialog and no native `confirm()`; reward dialog close button; focus ring and mobile layout of command policies.

## Next actions (not done in this cycle)

Reconcile the inventory (separate “UI contract with fixture” from “real stack”); detail INV-02/04/07/08/09 by route/action; run `build:frontend`, `npm run build`, `docker compose config`, axe and `es`/`pt-BR` browser rendering; fix or formally record the QRA-13 `actorId` and QRA-02 `callTimeoutMin` findings; port the class-1 tests; then repeat the audit and both reviews on the complete migration.


## Class-1 gap closure — 2026-10-21

- **Call-deadline line** (`apps/frontend/features/queues/call-deadline.jsx`, wired in `queue-list.jsx`, styles in `panel.css`): reuses `getCallDeadlinePresentation`; empty on the server and first paint (no hydration mismatch), starts ticking only after Twitch-confirmed delivery (`callNotifiedAt`), stops at expiry, expiry only changes the text (no no-show transition), plain text without a live region. Scoped UX review **9.0/10** (static code/copy only; no visual, browser or assistive-technology validation). The expiry announcement suggested by the review was **not** added: the vanilla panel has none, so it needs owner approval. Tests: `tests/unit/next-call-deadline.test.jsx` (7) and a `next-queue-list` case.
- **Post-save onboarding** (`getQueueSettingsFeedback` in `queue-settings.mjs`, provider, `queue-list.jsx`, `queue-settings-form.jsx`): after saving a closed queue, guidance follows the same rule that enables the activate button (`getQueueActionState().canToggleIntake`, not the legacy predicate): `activate_next` and focus on the enabled button; `activate_waiting` only while the reward sync is pending; otherwise the generic saved message; a failed refresh wins. `reward_pending`/`reward_diverged` appear as a static notice in the settings form (as in the vanilla dialog). Never activates automatically. Scoped UX review **9.2/10** (static only; first pass 8.5, raised after three recorded decisions). Owner-approved deviation (2026-10-21): `create_failed` is not in the “waiting” set; it shows the generic saved message, and the settings form notice uses the new key `panel.queue.onboarding.reward_failed` (“Twitch could not create its reward”) instead of promising a confirmation.test.js`, `next-queue-onboarding.test.jsx`.
- **Ported class-1 contracts** (`tests/unit/next-panel-class1-parity.test.js`): no native `confirm()` in `apps/frontend/features`, reward dialog close/cancel are `type="button"`, no hide/archive wording in the catalogs.
- **Still open from the class-1 list:** visible focus ring and mobile stacking of the command policies (needs browser validation).
