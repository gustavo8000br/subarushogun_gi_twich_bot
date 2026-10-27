# OPS-23 — Real-time panel updates (SSE) and shared panel state

[Português (pt-BR)](../../pt-BR/stories/OPS-23/story.md)

**Status:** Ready (`@po` GO 2026-10-27, see [po-validation.md](po-validation.md)). Implementation only after `@po` GO, the planning gates below (including `@ux-design-expert` at 9.0 or more and the `@analyst` SSE note), an issue created by `@devops`, and the OPS-15 sequence. **Issue:** #81 (created by `@devops`; no issue comments).
**Source:** Live battery defect D-7 ("pages do not update dynamically"; [live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md)); `@architect` review, sections 1 and 3 and slices S-C, S-E, S-G ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md)); owner decisions of 2026-10-27 (below). SSE research by `@analyst` (2026-10-27): [sse-research.md](../OPS-15/sse-research.md) (GAP closed; its findings are folded into the ACs below as design inputs).
**Related:** OPS-15 (Next panel migration — this story is a dependency of the cutover; its slice FT-23 depends on the shared state delivered here); OPS-21 (session recovery in the Next client touches the same client code); OPS-22 (independent).
**Coordination required:** `$aiox-po`, `$aiox-architect` (event model, process boundary, proxy and auth), `$aiox-analyst` (SSE note), `$aiox-ux-design-expert` (score ≥ 9.0/10, recorded here before implementation), `$aiox-data-engineer` (only if a database-level change notification is chosen), independent `$aiox-qa`, `$aiox-devops` (issue).

## Problem

The Next panel does not refresh on its own and does not feel like a Next application (D-7):

- **Lost parity (VERIFIED):** the vanilla panel refreshed everything every 5 s on every page, plus catalogs every 30 s. The Next panel loads its snapshot once on mount; polling exists only on Overview (5 s) and Operations (its own 5 s timer). Queues, New queue, Widgets, Commands, Settings and Connection never refresh by themselves, so redemptions, chat commands and worker results from outside the panel only appear after a manual reload. The operator's own mutations do refresh the projection afterwards.
- **No shared state (VERIFIED):** navigation uses plain `<a href>`, and `PanelProvider` is mounted inside each page, not in `(panel)/layout.jsx`. Every click is a full document load that discards state and reloads the snapshot; there is nothing shared to keep fresh.
- **No push channel (VERIFIED):** the API has no `text/event-stream`/WebSocket. The overlay itself polls every 1 s and is out of scope.
- **Story conflict to reconcile (VERIFIED):** the OPS-15 story requires parity of the existing polling cadence and says the story does not introduce a panel WebSocket (AC 7, line 44). Server-Sent Events are not a WebSocket, but the owner has now chosen a push channel, so `@po` must reconcile that OPS-15 wording (this story does not edit OPS-15).

## Owner decisions (2026-10-27)

1. Update the panel dynamically with **SSE now**, not polling: its own story with a **new backend**.
2. Polling at 5 s (visible tab) and 2 s (while something is pending) stays **only as a fallback if the SSE connection drops**. Confirmed in the design below (architect scheduler, section 3): same cadence, used only while the stream is unavailable.
3. Two separate stories, both dependencies of the OPS-15 cutover: OPS-22 and this one (real-time plus shared panel state). The navigation and message slice (D-3/D-4, FT-23) stays in OPS-15 and depends on the shared state delivered here.

## Story

As the streamer operating the panel while the stream is live,
I want every page to show changes made outside the panel (redemptions, chat commands, worker results) as soon as they happen, to keep my place and my typing while that happens, and to keep working with ordinary polling if the live connection drops,
so that I can trust what the screen shows without reloading it.

## Scope

**In (three slices):**

- Slice 1 — SSE backend: an authenticated panel event stream in the API that announces state changes.
- Slice 2 — Shared panel state: lift `PanelProvider`/`PanelShell` into `app/(panel)/layout.jsx`, `activePage` from `usePathname()`, `<Link>` for sidebar and inline navigation, overlay route group untouched.
- Slice 3 — Client live refresh: SSE consumer, resynchronization, polling fallback, and removal of the private timers.

**Out of scope:**

- The post-action message, redirect and focus after creating or deleting a queue (OPS-15 slice FT-23); this story only supplies the shared provider it needs.
- Financial recovery and queue deletion (OPS-22).
- A WebSocket, a new data-fetching dependency (SWR/TanStack Query) and any change to the overlay's own 1 s polling.
- New user-facing features beyond what `@ux-design-expert` approves in the plan (for example a "live/updated n s ago" indicator is a UX decision, not a given).
- Vanilla panel behavior (it keeps its own polling until its authorized removal), version bump, commit, push, release, cutover.

## Acceptance criteria

Evidence classes are separate: fixtures/mocks, unit tests, isolated PostgreSQL, real browser through the real Next server, Docker/Compose. Every behavior starts with a failing test (Red-first). Numeric targets, fixed by `@sm` from the SSE note and the architect review before FT-29 (values marked [PROPOSAL] stay pending owner/`@architect` confirmation, decision OD-23-2): keep-alive **15 s** (below the 30 s proxy idle timeout; SSE note, Q2); coalescing window **100 to 250 ms** (SSE note, Q4); **live path** an external change is visible on every panel page within **2 s** (p95) of the commit [PROPOSAL: the note gives no end-to-end figure; 2 s is the coalescing window plus one single-flight refetch with margin]; **fallback path** within **6 s** (binding today); **2 s polling window** of **60 s** [PROPOSAL: "e.g. 60 s" in the architect review, section 3, and "about 60 s" in AC 14].

### Slice 1 — SSE backend

1. **Given** an operator with a valid local session, **when** the panel opens the event stream, **then** the API answers `text/event-stream` and keeps the connection open; **given** no session, a bad Host or a bad Origin, **then** it is refused with the same status and enumerated `code` convention as the other panel routes (OPS-21).
2. **Given** a state change committed by any producer (panel mutation, chat command, EventSub redemption, outbox worker, reconciliation), **when** it is committed, **then** the stream emits a change notification for the affected topic (queues, entries, operations, health/integration, settings/widgets as the design lists). [AUTO-DECISION] notifications are invalidation signals that carry a topic and a version/time but no chat body, redemption body, UID, user id/login, token or header → the client refetches through the existing sanitized endpoints (reason: one source of truth for DTOs and for the project's observability and privacy rules; `@architect` confirms).
3. **Given** producers that may run outside the API process, **when** the design is closed, **then** `@architect`/`@data-engineer` record how a notification from a worker reaches the stream (same process vs a cross-process mechanism); the chosen mechanism is proven on isolated PostgreSQL if the database is involved.
4. **Given** idle connections, **when** time passes, **then** the server sends keep-alive frames at an interval shorter than the 30 s idle timeout of the Next proxy (the note suggests 15 s) so the stream is not cut; **given** a client disconnect or API shutdown, **then** the server releases the connection and shutdown closes all streams in the runtime composition order (tested).
5. **Given** many open tabs or reconnects, **when** the connection cap is reached, **then** the behavior is bounded and defined (cap, refusal code, no resource growth), and an unauthenticated caller cannot grow server state.
6. **Given** the stream passes through the Next rewrite/proxy and the Compose stack, **when** a browser opens it, **then** events arrive unbuffered and uncompressed (the response carries `Cache-Control: no-cache, no-transform`) in a real browser through the real Next server, in development and in the production custom server, including a stream idle for more than 30 s; a unit test cannot claim this.
7. **Given** logs and metrics of the stream, **when** events are produced, **then** they contain at most the topic, counts and the route pattern, never keys, cookies, bodies, tokens or secrets.

### Slice 2 — Shared panel state

8. **Given** the operator navigates with the sidebar or the inline links, **when** the page changes, **then** the document is not reloaded (a window marker survives; `<Link>` client transitions) and the provider state, including the polling/stream connection, persists.
9. **Given** a panel page, **when** it renders, **then** it renders only its content inside the shared layout, `activePage` comes from `usePathname()`, and the fallback catalog loading moves from each `page.jsx` to the layout.
10. **Given** the overlay route group, **when** it is requested, **then** it does not inherit the panel provider (the separate `(overlay)` layout stays).
11. **Given** the existing E2E that assumed a full reload on navigation, **when** this slice lands, **then** they are updated explicitly to the new behavior, never loosened.

### Slice 3 — Client live refresh and fallback

12. **Given** a change notification, **when** the provider receives it, **then** it refreshes the affected data with a single-flight request (the existing `refreshInFlight`) and coalesces bursts; an external change (new queue entry, redemption, worker result) appears on every panel page without a reload, within 2 s (p95) of the commit on the live path [PROPOSAL, OD-23-2].
13. **Given** the stream connects or reconnects, **when** it is established, **then** the provider does a full resynchronization so missed notifications cannot leave stale data; a new server instance identifier means a full refetch.
14. **Given** the SSE connection is unavailable or drops, **when** the provider detects it, **then** it falls back to polling: 5 s while the tab is visible, 2 s for a bounded window of **60 s** [PROPOSAL, OD-23-2; architect review, section 3] while a pending state exists (`pending_create`, `deleting`, `pending_*` or unresolved operations), then 5 s; consecutive failures back off 5 → 10 → 30 s and return to 5 s on success; and it returns to SSE automatically (with the resync of AC 13) when the stream is back. In fallback an external change appears within 6 s.
15. **Given** a hidden tab that becomes visible or focused, **when** that happens, **then** an immediate refresh runs.
16. **Given** a mutation is `saving` or a confirmation dialog is open, **when** updates arrive, **then** refresh is paused or deferred; **given** a focused field or a draft form, **then** an update never overwrites the draft, moves focus or resets scroll (forms keep local draft state; projections feed only read-only parts).
17. **Given** Overview and Operations own timers today, **when** this slice lands, **then** both use the shared channel and no private timer remains, and no duplicated requests are issued.
18. **Given** the OPS-21 session recovery (one transparent re-init), **when** the API restarts, **then** the client reconnect loop (an `EventSource` closes permanently on any non-200) backs off, renews the session, reopens the stream and resynchronizes, and does not loop on a refused session.
19. **Given** UX approves it, **when** the plan is implemented, **then** any live/fallback indicator, "updated n s ago" text and screen-reader announcement policy match the approved plan, and live updates do not flood assistive technology or steal focus.

## Dependencies

- **Depends on:** `@po` GO and issue; `@analyst` SSE note; `@architect` design; UX plan ≥ 9.0; for slice 1, a decision on how worker events reach the API process.
- **Is a dependency of:** OPS-15 cutover; FT-23 (needs slice 2); the pending reconciliation of outcomes ("pending → synced" messages) which is delivered with FT-23 on top of this state.
- **Write-set clash:** slice 2 and 3 touch `panel-shell.jsx`, `panel-provider.jsx`, every `page.jsx`, `panel-root.jsx`, `operations-page-content.jsx` and `app/(panel)/layout.jsx`, the same area as the OPS-15 page polish (FT-01); do not run them in parallel — `@architect` fixes the order (the shared provider should land before or together with the polish, not under it). OPS-21 slice 3 changes the Next API client; coordinate.

## Risks

- **Proxy buffering/compression** through the Next rewrite or Docker/Compose breaks the stream (AC 6). Only a real browser through the real server proves it.
- **Browser connection limit:** HTTP/1.1 allows 6 connections per origin, so several tabs plus normal requests can stall the panel (AC 5); mitigation is one stream per tab and, if needed later, a shared stream across tabs ([sse-research.md](../OPS-15/sse-research.md), Q2).
- **Cross-process events:** if workers run apart from the API, a notification path is new infrastructure (AC 3).
- **Draft loss/focus theft** while updating (AC 16); duplicated requests if a private timer survives (AC 17).
- **Bad reconnect loops** after an API restart or a revoked session (AC 18).
- **OPS-15 wording conflict** (AC 7, "no panel WebSocket"): needs a `@po` decision recorded in OPS-15's own change log.
- **Stale E2E** that relied on full reloads (AC 11).
- **Authentication of an `EventSource`:** it cannot add custom headers; the design must rely on the same-origin session cookie and the Host/Origin checks (per the SSE note: same-origin GET, cookie sent, no CSRF needed for a read-only GET; confirm `Origin`/`Host` in a real browser).

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 5, integration 3, infrastructure 3, knowledge 4, risk 3 = **18 → COMPLEX (GG)**. Priority **P1** (parity regression and cutover dependency). Difficulty **GG** overall; slice 1 **G**, slice 2 **M**, slice 3 **M**.

## Business value

The operator sees redemptions, commands and worker results as they happen, without reloading, and keeps context while navigating; the Next panel stops being worse than the vanilla one in the most visible way (D-7).

## Test plan (test-first)

1. **Unit (Vitest):** SSE route (headers, session/Host/Origin refusal, keep-alive, release on disconnect, connection cap) over a real HTTP listener, since `inject` cannot stream (AC 1, 4, 5); event emission per producer (AC 2); client scheduler with fake timers and a fake `EventSource` (coalescing, single-flight, resync, fallback cadence 5 s / 2 s window, backoff, pause while saving, visibility refresh; AC 12-16).
2. **PostgreSQL (disposable, real migrations):** only if a database-level notification is chosen (AC 3).
3. **Browser-only E2E (Chromium, fixtures, through the real Next server):** external entry appears without reload (AC 12); stream blocked → polling fallback shows it within 6 s and returns to SSE (AC 14); sidebar navigation keeps a window marker (AC 8); typing in Settings is not overwritten by an update (AC 16); events are not buffered through the proxy (AC 6); stream reconnect after an API restart (AC 18).
4. **Docker/Compose:** proxy path verified with the real stack, recorded as a separate class.
5. **Gates before closing:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist`, `npm run review:static` (OpenGrep only). `@qa` runs the final independent gates and issues the verdict before `@devops` commits.

## Planning gates before implementation

- [x] `@architect` review and design options ([panel-defects-architecture-review.md](../OPS-15/panel-defects-architecture-review.md), 2026-10-26; SSE listed as optional slice S-G, now promoted by the owner).
- [x] Owner decisions recorded (2026-10-27).
- [x] `@analyst` SSE note: [sse-research.md](../OPS-15/sse-research.md) (2026-10-27). Findings used: Next 16.4.1 rewrites stream but have a 30 s idle proxy timeout, so the heartbeat must be below 30 s (the note suggests 15 s); gzip buffers SSE unless the response carries `Cache-Control: no-transform`; HTTP/1.1 allows 6 connections per origin; an `EventSource` closes for good on any non-200, so the client needs its own reconnect loop that renews `/api/session`; the note's slower 15-30 s polling fallback differs from the owner's 5 s / 2 s, and **the owner decision prevails**. The environment checks it lists (six items) remain for `@qa`.
- [x] `@po` validation (10 points) and GO (9.0/10, 2026-10-27); the reconciliation of the OPS-15 wording stays pending owner approval (OD-23-1) and is a closing condition.
- [ ] `@architect` design: event model, process boundary, proxy/auth, connection cap, latency targets, fallback window, order against FT-01 and OPS-21 slice 3.
- [ ] `@ux-design-expert` plan and review, **score ≥ 9.0/10**, recorded in this story (static review distinct from browser, visual and assistive-technology validation): live/fallback indicator, "updated n s ago", announcements, focus rules.
- [ ] `@data-engineer` only if the design adds a database mechanism.
- [ ] `@qa` test plan (evidence separation, real browser through the real server).
- [x] `@devops` creates the GitHub issue: parent issue #81 exists (parent issue of this story; native dependency of the OPS-15 cutover; slices as sub-issues just-in-time); no issue comments.

## Owner decisions pending

- **OD-23-1:** approve the OPS-15 wording that reconciles AC 7 with this story (exact text in [po-validation.md](po-validation.md)); recommended. The OPS-15 story is not edited until the owner approves.
- **OD-23-2:** confirm the numeric targets marked [PROPOSAL] in "Acceptance criteria" (live path within 2 s p95, 2 s polling window of 60 s) or give other values. Must be closed before FT-29 (required correction 1 of the `@po` validation). `@architect`/`@qa` confirm that they are testable.

## Definition of Done

- ACs 1-19 have recorded Red-first evidence by class; the browser and Compose proxy evidence is real, not inferred.
- UX score recorded; all quality gates green; `@qa` verdict recorded; File List and checklists updated in English and pt-BR.
- OPS-15 wording reconciled by `@po`.

## SM draft validation (story-draft-checklist, 2026-10-27)

1. Goal and context: clear (D-7, owner decisions, fallback confirmed). PASS.
2. Technical guidance: files, current behavior and constraints named; the event model deliberately left to `@architect`. PASS with the SSE note pending.
3. References: specific sections of the architect review; `sse-research.md` referenced but not created. PASS.
4. Self-containment: edge cases (reconnect, drafts, restart, caps) stated. PASS.
5. Testing: classes separated; real-browser proof required for the proxy. PASS.
6. Static analysis recorded. PASS.
- Result: ready for `@po`. Items beyond the owner decisions (event as invalidation signal, connection cap, keep-alive) are marked as design inputs for `@architect`; nothing was invented as final.

## File List

- `docs/stories/OPS-23/story.md` (new)
- `docs/pt-BR/stories/OPS-23/story.md` (new)
- `docs/stories.md` (index entry)
- `docs/pt-BR/stories.md` (index entry)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-10-27 — `@sm` (River): story drafted from D-7, the `@architect` review and the owner decisions of 2026-10-27 (SSE now, polling only as fallback). Status Draft.
- 2026-10-27 — `@po` (Pax): `*validate-story-draft` 10 points = 9.0/10, **GO**. Issue #81 registered. Status Draft → Ready. Implementation still waits for the `@architect` design and the `@ux-design-expert` plan (≥ 9.0); OPS-15 AC 7 wording reconciliation proposed to the owner in [po-validation.md](po-validation.md).
- 2026-10-27 — `@sm` (River): numeric targets fixed in the text before FT-29 (keep-alive 15 s, coalescing 100-250 ms, live path 2 s p95 [PROPOSAL], fallback 6 s, 2 s polling window 60 s [PROPOSAL]); AC 12 and AC 14 completed with those values; planning-gate boxes for `@po` GO and issue #81 ticked; OD-23-1 and OD-23-2 recorded as owner decisions pending. No title or scope changed.
