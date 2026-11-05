# OPS-15 — Architecture review of panel defects D-1..D-7 (live battery 2026-10-26)

[Português (pt-BR)](../../pt-BR/stories/OPS-15/panel-defects-architecture-review.md)

- **Author:** @architect (Aria), 2026-10-26. Read-only code analysis; no code, test or config changed; no server, Docker, test, GitHub or Twitch operation.
- **Inputs:** `live-battery-2026-10-26-results.md`, `story.md`, the code cited below, Next.js 16 docs (Linking and Navigating).
- **Research index:** no existing note covers panel data refresh/navigation (GAP). One official doc was consulted (below). D-5/D-6 remote causes stay with @analyst.
- **Labels:** VERIFIED = read in code/docs; PARTIAL = code read but runtime not reproduced; UNVERIFIED = inference to prove by test.

## 1. D-7 — "pages do not update dynamically"

### Findings

| # | Finding | Evidence | Label |
|---|---|---|---|
| F1 | No static export, no Server Actions, no `fetch` cache/`revalidate`. The Next config only sets rewrites/`trailingSlash`. All panel data is fetched **on the client** through `apiClient.request`. | `apps/frontend/next.config.mjs:1-3`, `apps/frontend/scripts/next-runtime-config.mjs:3-20`, `features/panel-shell/panel-provider.jsx:45-67` | VERIFIED |
| F2 | The whole snapshot (`/api/state`, `/api/setup`, `/api/queues`, `/health`) is loaded **once** on mount. | `panel-provider.jsx:45-67`, `load-panel-snapshot.mjs:2-24` | VERIFIED |
| F3 | Polling exists **only** on Overview (5 s, visible tab) and on Operations (own 5 s loop). Queues, New queue, Widgets, Commands, Settings and Connection never refresh by themselves. | `panel-shell.jsx:44-57` (`if (activePage !== 'overview' …) return`), `operations/operations-page-content.jsx:111-124` | VERIFIED |
| F4 | The vanilla panel refreshed **everything every 5 s** on every page, plus catalogs every 30 s. | `apps/web/app.js:1169`, `refresh()` at `apps/web/app.js:759` | VERIFIED |
| F5 | The OPS-15 story requires parity of "existing polling cadence/semantics" and states "bounded polling … remain in effect; this story does not introduce a panel WebSocket". | `docs/stories/OPS-15/story.md:44`, `:105` (AC 7) | VERIFIED |
| F6 | Navigation uses plain `<a href>` (sidebar, "Open queues", "Cancel"), and `PanelProvider` is mounted **inside each page** (`page.jsx → PanelRoot → PanelShell → PanelProvider`), not in `(panel)/layout.jsx`. Every navigation is a full document load that discards state and reloads the snapshot. Next docs: `<Link>` does client-side transitions that keep shared layouts; `<a>` triggers a full page load. | `panel-shell.jsx:62-76`, `new-queue-form.jsx:114,120`, `app/(panel)/queues/page.jsx:1-13`, `app/(panel)/layout.jsx:1-12` | VERIFIED |
| F7 | There is no SSE/WebSocket in the API. The overlay itself polls every 1 s. | no `text/event-stream`/`WebSocket` in `apps/api/src`; `apps/shared/panel/overlay-renderer.mjs:122,176` | VERIFIED |
| F8 | Mutations do refresh the queue projection afterwards (`loadQueueProjection` after each action), so the operator's own action is reflected; what is missing is **external** change (redemptions, chat, workers). | `panel-provider.jsx:144,263,308,341,367,451` | VERIFIED |

### Root cause

What is real: the Next panel lost the vanilla **global 5 s polling** (F3/F4) — a parity regression against AC 7. What is not real: nothing "turned off Next.js" (no static export, no data cache; F1). The "Next feeling" is also missing because navigation is `<a>` + per-page provider (F6), so each click is a full reload and there is no shared client state to keep fresh. There is no push channel to reuse (F7); the story explicitly excludes a panel WebSocket.

## 2. D-3 / D-4 — navigation and messages after delete/create

### D-4 (create)

- `createQueue` stores feedback in `queueCreation` and returns a boolean; it never navigates. `panel-provider.jsx:446-471`. VERIFIED.
- Feedback mapping already distinguishes `created_local` / `created_remote` / `pending` (`pending_create`) / `review` / `recovered` / `refresh_failed` / `uncertain`. `features/queues/queue-creation.mjs:120-131`. VERIFIED.
- The form renders the feedback and a plain `<a href="/queues/">` "Open queues". `new-queue-form.jsx:117-120`. VERIFIED.
- There is **no per-queue route**: `/queues` lists all queues; each card has id `queue-title-<id>` (`queue-list.jsx:342`). A "go to the created queue" target therefore needs a decision: anchor/`?queue=<id>` on `/queues` (no new route) vs a new `/queues/[id]` route. VERIFIED (absence).

### D-3 (delete)

- The delete notice is `useState` **inside `QueueLifecycleActions`**, rendered per queue card (`queue-lifecycle-actions.jsx:53`, `queue-list.jsx:356`). After a `deleted` result the provider refreshes the projection (`panel-provider.jsx:307-311`), the queue disappears, the card **unmounts** and the "deleted" notice is destroyed with it. No navigation happens. VERIFIED (code); runtime observation matches the battery. PARTIAL for the exact render order.
- `delete` returns `pending` or `deleted` (`queue-lifecycle.mjs:70-71`). For `pending` the card stays (`lifecycleStatus: 'deleting'`) and the warning is shown, but it never updates afterwards because of D-7. VERIFIED.

### What is missing

1. A **page-level (provider-level) outcome message** that survives unmount and navigation, in a persistent `role="status"` live region (not per card).
2. **Post-action routing** with `router.replace`/`router.push` from `next/navigation`, decided by the outcome:
   - create `confirmed`/`pending`/`review` → go to `/queues` focusing the created queue; message must say "pending Twitch confirmation" when not `synced` (never promise remote success).
   - create `uncertain`/`refresh_failed` → stay, keep the current recovery copy.
   - delete `deleted` → "deleted" message; go to `/queues` or `/new-queue` when no non-archived queue remains.
   - delete `pending` → stay on the queue, "deletion pending" (not "deleted"), and let polling turn it into "deleted" (or into the blocked state of D-6) when the worker finishes.

## 3. Proposed single design (D-3 + D-4 + D-7)

**One shared client data layer + one outcome channel + Next navigation.** No new dependency; no WebSocket (respects `story.md:44`).

1. **Lift `PanelProvider` (and `PanelShell`) into `app/(panel)/layout.jsx`** (via a client component), pages render only content; replace sidebar/inline `<a>` with `next/link` `<Link>`. Result: state and polling survive navigation (Next "client-side transitions", VERIFIED doc). Risk: `activePage` must come from `usePathname()`; the fallback catalog loading in each `page.jsx` moves to the layout.
2. **One polling scheduler in the provider** (`usePanelLiveRefresh`): runs `loadPanelRuntimeSnapshot` on every panel page, 5 s while visible (vanilla parity, F4), immediate refresh on `visibilitychange`/`focus`, single-flight (`refreshInFlight` already exists), backoff on consecutive failures (5→10→30 s, back to 5 s on success), paused while a mutation is `saving` or a confirmation dialog is open, and **never overwriting focused form inputs** (forms keep local draft state; projections only feed read-only parts). Overview's and Operations' private timers are removed and Operations subscribes to the same tick (or keeps its endpoint but uses the shared scheduler).
3. **Faster cadence while something is pending**: if the projection contains `pending_create`/`deleting`/`pending_*` statuses or unresolved operations, poll at 2 s for a bounded window (e.g. 60 s) then fall back to 5 s. This is how "pending → synced" and "deletion pending → deleted" appear without reload.
4. **Mutation outcome channel**: provider-level `panelOutcome` `{ kind, status, key, values, referenceId, target }` rendered once by the shell in a persistent live region (`role="status"`, `aria-live="polite"`; errors `role="alert"`), cleared on next action or timeout. Card-local notices remain for inline context but the authoritative message lives here.
5. **Post-action router**: a pure function `resolvePostActionRoute(outcome, projection)` (unit-testable) returning `{ href, focusId } | null`; the provider/page calls `router.replace` and moves focus to the target heading (`queue-title-<id>` or the page `h1`).
6. **Pending reconciliation of outcomes**: when polling sees that a `pending` queue became `synced`, or a `deleting` queue left the projection, update `panelOutcome` ("Twitch confirmed" / "deleted"), mirroring the existing `refreshQueueProjection` reconciliation pattern (`panel-provider.jsx:221-234`).

Trade-offs: (A) this design — low risk, parity with vanilla, no backend change, ~12 requests/min per open tab (same as vanilla); (B) SSE from Fastify — real-time, but new endpoint, session/CSRF/proxy rewrite review, explicitly out of OPS-15 scope; (C) add SWR/TanStack Query — mature dedup/focus revalidation, but new dependency and refactor of every hook. Recommendation: **A now**, keep B as a later story if the owner wants sub-second updates.

Files to touch (A): `app/(panel)/layout.jsx`, `app/(panel)/*/page.jsx`, `app/(panel)/panel-root.jsx`, `features/panel-shell/panel-shell.jsx`, `features/panel-shell/panel-provider.jsx` (+ new `live-refresh.mjs`, `post-action-route.mjs`), `features/operations/operations-page-content.jsx`, `features/queues/new-queue-form.jsx`, `new-queue-page-content.jsx`, `queue-lifecycle-actions.jsx`, `queue-list.jsx`, localization catalogs (en/pt-BR/es) for new keys.

Risks: focus/draft loss during polling (mitigated by item 2); duplicated requests if Operations keeps its own timer; overlay route group must not inherit the panel provider (separate `(overlay)` layout already exists — keep it); E2E tests that assumed full reloads.

Tests: unit (Vitest) for `resolvePostActionRoute` (all create/delete outcomes, last-queue → `/new-queue`), scheduler (visibility, backoff, pause while saving, pending fast-cadence window) with fake timers; browser-only E2E (Chromium fixtures): create manual → lands on `/queues` with focus and status; create Channel Points pending → "pending" message then "confirmed" after fixture flips status without reload; delete → "deleted" + redirect; delete last → `/new-queue`; delete pending → stays, then updates; external new entry appears within ≤ 6 s; navigation via sidebar does not reload the document (assert `performance.navigation`/a window marker survives); typing in settings is not overwritten by a poll.

UX (@ux-design-expert, ≥ 9.0 before implementing): message copy for each outcome, live-region placement, focus target after redirect, whether to auto-redirect vs offer action, "pending" vs "deleted" wording, refresh indicator ("updated n s ago") on all pages.

## 4. D-1 and D-2

### D-1 — `!<queue> limpar CONFIRMAR`

- Parser accepts the localized confirm label case/accent-insensitively (`apps/api/src/commands/parser.mjs:22-24,35,86`). Handler compares `args[0] === 'confirmar'` literally (`apps/api/src/commands/chat-handler.mjs:266`). Any other casing, and **every** non-pt-BR locale (`en` label is not `confirmar`), falls back to `request()` and repeats the preview. VERIFIED.
- Minimal fix: since the parser already guarantees that `limpar` has 0 args or exactly the confirm label, the handler should decide by `args.length === 1` — or, cleaner, the parser returns `confirm: true` and the handler uses it. No literal comparison in the handler.
- Tests first (must fail today): parser+handler for `CONFIRMAR`, `Confirmar`, `confirmár`, and `en` locale `!q clear confirm` → `clearConfirmation.confirm` called once; lowercase still works; any other word is still `INVALID_SYNTAX`.

### D-2 — `(posição ?)`

- `claimNextChatNotification` returns `callPosition` **at task level** (`apps/api/src/persistence/queue-repository.mjs:1017`), but the worker reads `entry.callPosition` (`apps/api/src/outbox/chat-worker.mjs:29`) → always `undefined` → `'?'`. VERIFIED.
- Second cause: even `task.callPosition` would be `null`, because calling sets `position: null` (`queue-repository.mjs:1108`); the original position lives only in the audit `safeDetail.previousPosition` (`:1110`) and in the transition result (`previousPosition`, `:1112,1143`). VERIFIED.
- Also: the chat path pre-renders `messageText` and passes `message` to `enqueueCallNotification`, which ignores it (`chat-handler.mjs:207-208`, `queue-repository.mjs:942-949`); the worker re-renders. Dead code, not a bug. VERIFIED.
- Minimal fix (no DDL): store `{ previousPosition }` in the existing outbox `payload` at enqueue time (callers at `http/queue-routes.mjs:613,619` and `chat-handler.mjs:208` have it), return it from the claim, and have the worker read the task value; for legacy rows fall back to the audit lookup pattern already used at `queue-repository.mjs:387-391`. Confirm with @data-engineer that `outbox.payload` JSON is the right place (no migration expected).
- Tests first: worker unit test with a claimed task carrying the position → message contains `1`; PostgreSQL integration: call a waiting entry at position 1 from panel and from chat → claimed task has position 1; legacy row with `payload: {}` → audit fallback.

## 5. Financial state machine (D-5/D-6 design only)

### Current design

- `financial-worker.mjs` verifies remote state before and after `setRedemptionStatus`; `unknown` is set on 404, on unrecognised status, and after the post-write read is not conclusive (`:59-61,85-88,111-113,134-141`). VERIFIED. **"Unknown never becomes confirmation" holds.** VERIFIED.
- `claimNext` only claims `pending`/`retry` (and expired leases) (`queue-repository.mjs:2123-2129`). `unknown` is **terminal**: no retry, no backoff, no periodic re-check. VERIFIED.
- Queue deletion (`outbox/reward-worker.mjs:288-300`) turns any blocker/conflict into `unknown('queue_deletion_financial_conflict')`, so one `unknown` redemption blocks the deletion forever. VERIFIED.
- Reconciliation re-reads unresolved redemptions but only imports/marks; on 404 it also marks unknown (`twitch/reconciliation.mjs:122-140,155-176`). It does not re-arm outbox tasks. VERIFIED.
- A manual path exists: `POST /api/operations/:operationId/resolve-unknown` → `resolveUnknownFinancialOperation` (`http/queue-routes.mjs:274-276`, `queue-repository.mjs:2246+`). PARTIAL (outcome semantics not fully read).
- Why Twitch returns 404/non-conclusive for `redemption.fulfill` is UNVERIFIED and with @analyst.

### Proposed recovery policy

1. **Split `unknown` into retryable vs terminal reasons.** `remote_state_unavailable` from a transient read (5xx, timeout, non-conclusive status) → `retry` with the existing exponential backoff + jitter, capped (e.g. 8 attempts / 24 h); only after the cap → `unknown` (needs review). 404 on a redemption that the reconciler cannot see either → `unknown` immediately. 401 stays `blocked_auth` and is re-armed automatically after a successful re-authorization.
2. **Periodic re-verification of `unknown`** in the reconciler (e.g. every 15 min, bounded batch): read-only `getRedemptionStatus`; if remote equals expected → confirm; if `UNFULFILLED` → re-arm to `pending` (write again); if opposite → `conflict`. Never confirm without a positive remote read.
3. **Ordering for queue deletion:** (a) pause reward, (b) cancel/fulfil every open redemption and wait for confirmation, (c) only then delete the reward; `unknown` items block (b) but are re-verified by step 2 instead of freezing the queue, and the queue shows `deletion blocked: N operations need review` with a link to Operations.
4. **Clear manual path:** Operations lists the blocking items with three explicit operator decisions — "retry now", "I verified on Twitch: refunded/fulfilled" (audited, actor + timestamp, never automatic), "cancel deletion". The panel must explain that deletion continues after resolution.
5. **Observability:** log per attempt `{ operationType, outboxId, attempt, httpStatus, twitchErrorCode(≤64), nextAttemptAt }` — no redemption body, user id/login, tokens, headers. Health `twitch_rewards: degraded` only while retryable items exist; `needs_review` while terminal ones exist.

### Data engineer

@data-engineer must assess whether persisting `unknownSince`, a retry cap counter, and a distinct reason/class needs a migration or fits `attempts`/`lastError`/`nextAttemptAt`/`payload` already on `outbox`. Architect does not design DDL here.

## 6. Slices (priority / difficulty)

| Slice | Content | Priority | Difficulty | Depends on | Owners |
|---|---|---|---|---|---|
| S-A | D-1 confirmation normalization | P1 | XS | — | @dev, @qa |
| S-B | D-2 call position via outbox payload + fallback | P1 | S | @data-engineer OK (no DDL expected) | @dev, @data-engineer, @qa (PostgreSQL) |
| S-C | Shared layout provider + `<Link>` + global polling scheduler (D-7) | P1 | M | UX plan ≥ 9.0 | @ux-design-expert, @dev, @qa (browser) |
| S-D | Outcome channel + post-action routing (D-3/D-4) | P1 | M | S-C | @ux-design-expert, @dev, @qa |
| S-E | Pending fast-cadence and outcome reconciliation | P2 | S | S-C, S-D | @dev, @qa |
| S-F | Financial recovery policy (retryable unknown, re-verification, deletion ordering, manual path, logs) | P1 (blocks deletion) | L | @analyst D-5/D-6 note, @data-engineer, UX for manual path | @architect, @data-engineer, @dev, @qa |
| S-G (optional) | SSE push channel | P3 | L | owner decision; outside OPS-15 scope | — |

Each slice needs a GitHub issue created by @devops before implementation. @qa runs the final gates (`lint`, `typecheck`, `test`, localization, version, port denylist, `review:static`) and the browser E2E; @devops commits only what @qa released.

## 7. Owner decisions

1. Accept polling (vanilla parity, 5 s / 2 s while pending) instead of SSE/WebSocket for OPS-15? (Recommended: yes.)
2. "Go to the created queue": anchor/`?queue=<id>` on `/queues` (recommended) or a new `/queues/[id]` route?
3. After delete: automatic redirect (recommended, with persistent status message) vs a "go to list" button.
4. Financial recovery: retry cap/window for `unknown` and whether the operator may declare a manual resolution ("verified on Twitch").
5. Should S-F be inside OPS-15 or a separate story (it changes worker semantics)?

## Sources

- Next.js docs, Linking and Navigating (client-side transitions vs `<a>`): https://nextjs.org/docs/app/getting-started/linking-and-navigating (VERIFIED, lastUpdated 2026-09-09).
- Repository code and story as cited (VERIFIED). Runtime behavior beyond the battery report not reproduced (PARTIAL/UNVERIFIED as marked).
