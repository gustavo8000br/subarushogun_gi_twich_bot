# Research Index

[Português brasileiro](pt-BR/research-index.md)

- Maintainer: `@analyst` (Atlas). Created: 2026-10-22. Built from the notes already in the repo; no new web research was done for this index.
- Labels used inside the notes: **VERIFIED** (official source or repository code), **PARTIAL** (incomplete or secondary source), **UNVERIFIED** (inference, not confirmed).

## Owner golden rule (2026-10-22)

If the `@analyst` has already researched a topic and judged that no more research is needed, nobody spends tokens researching it again. This index makes the rule usable.

## How to use

1. Before dispatching research, the agent or the coordinator checks this index.
2. Research is requested **only** for a **GAP**, or for a **REFRESH IF** whose trigger has fired. Name the row and the trigger in the request.
3. When a row is **SUFFICIENT**, consumers read the note (and its pt-BR copy) and cite it. They do not ask for new research.
4. Agents without web tools (`@po`, `@data-engineer`, `@dev`, `@qa`, `@ux-design-expert`) read the notes instead of asking for new research. If a note cannot answer their question, they escalate to the coordinator with the exact question. The coordinator then decides whether it is a real GAP.
5. The `@analyst` updates this index (en and pt-BR) every time a research note is created, refreshed or retired.
6. A note is desk research. It never replaces a test in the project environment (PostgreSQL, browser, real Twitch, OBS/CEF). A GAP that only a live test can close goes to `@qa`/`@dev` as a test task, not as web research.

## Verdicts

- **SUFFICIENT**: no new research needed.
- **REFRESH IF**: valid until an explicit trigger fires.
- **GAP**: UNVERIFIED items still block a decision.

## Registry

| # | Topic | File (en / pt-BR) | Date / author | Evidence headline | Answers | Verdict |
|---|---|---|---|---|---|---|
| 1 | FND-0 foundation stack (Node, Docker, base deps) | `docs/stories/FND-0/spec/research.json` (en only, JSON) | 2026-10-02 / @aiox-master | Dependencies marked `verified` with official sources | Runtime/base image versions and core dependencies | **REFRESH IF** Node 24.20.0 or the Docker base image changes |
| 2 | FND-6 operator panel UX brief | `docs/stories/FND-6/ux-research.md` / `docs/pt-BR/stories/FND-6/ux-research.md` | 2026-10-03 / UX desk research | Desk research of official docs; proto-persona is a hypothesis | Operator context, panel interaction brief | **SUFFICIENT** (hypotheses are validated by UX reviews, not by more research) |
| 3 | FND-7 OBS Browser Source / overlay | `docs/stories/FND-7/spec/research.json` | 2026-10-06 / @analyst | Official sources checked 2026-10-06 | OBS Browser Source (CEF) constraints for the overlay | **REFRESH IF** the targeted OBS/CEF version changes |
| 4 | FND-8 localization (ECMA-402 Intl) | `docs/stories/FND-8/spec/research.json` | 2026-10-06 / @aiox-master with @pm and @architect | Official spec references | Intl formatting, locale handling | **SUFFICIENT** |
| 5 | FND-9 Channel Points / custom rewards | `docs/stories/FND-9/spec/research.json` | 2026-10-07 / spec pipeline | Twitch Help Center and API reference | Custom reward behavior and requirements FR-1/FR-5 | **REFRESH IF** Twitch changes the Custom Rewards API |
| 6 | OPS-3 EventSub `channel.chat.message` | `docs/stories/OPS-3/spec/research.json` | 2026-10-06 / @analyst | Official docs, `verified: true` | Chat ingestion via EventSub v1 | **REFRESH IF** the subscription version or Twurple major changes |
| 7 | OPS-5 CI matrix / packaging | `docs/stories/OPS-5/spec/research.json` | 2026-10-07 / @aiox-master | Planning draft, official GitHub Actions docs | OS matrix jobs, artifacts | **REFRESH IF** OPS-5 leaves draft and the packaging target is chosen |
| 8 | OPS-6 panel clarity heuristics | `docs/stories/OPS-6/ux-research.md` / `docs/pt-BR/stories/OPS-6/ux-research.md` | 2026-10-07 / UX heuristic review | Heuristic review of the local panel; not a usability study | Panel clarity and operational guidance | **SUFFICIENT** |
| 9 | OPS-7 chat send/receive with Twurple | `docs/stories/OPS-7/spec/research.json` | 2026-10-07 / @analyst | Twurple 8.2.0 pinned, official Twitch chat docs | Sending chat messages, limits | **REFRESH IF** `@twurple/*` leaves 8.2.0 |
| 10 | OPS-8 OAuth token validation/refresh | `docs/stories/OPS-8/spec/research.json` | 2026-10-07 / @analyst with @architect | Official Twitch OAuth docs, `verified: true` | Validate/refresh flow, hourly validation | **REFRESH IF** Twitch auth docs or Twurple auth major change |
| 11 | OPS-15 S-03 module relocation, S-12 cleanup | `docs/stories/OPS-15/refactor-research.md` / `docs/pt-BR/stories/OPS-15/refactor-research.md` | 2026-10-21 / @analyst | Mostly VERIFIED (repo + Next.js docs); 3 UNVERIFIED inferences to prove by tests | Turbopack root, no re-export shims, Docker COPY order, ESLint globals | **SUFFICIENT** (already applied in `f440c16`); **REFRESH IF** the Next.js major changes |
| 12 | OPS-15 one-time widget link dialog | `docs/stories/OPS-15/dialog-research.md` / `docs/pt-BR/stories/OPS-15/dialog-research.md` | 2026-10-22 / @analyst | Mix of VERIFIED/PARTIAL; 5 UNVERIFIED browser items (Escape `preventDefault`, React 19 `autoFocus`, clipboard permission) | Native `<dialog>`, close watcher, Clipboard API, masking, E2E cases | **SUFFICIENT** for design; the UNVERIFIED items are closed by the browser E2E (`tests/e2e/widget-link-dialog-browser-only.mjs`), not by research |
| 13 | OPS-15 API contract S-04/S-05/S-06/S-14 | `docs/stories/OPS-15/api-contract-research.md` / `docs/pt-BR/stories/OPS-15/api-contract-research.md` | 2026-10-22 / @analyst | IETF idempotency draft and Fastify sources VERIFIED; vendor practice PARTIAL; 6 UNVERIFIED (repo behavior) | Idempotency status codes (400/409/422), retry on 5xx, session, pathname matching | **SUFFICIENT**; **REFRESH IF** the IETF Idempotency-Key draft becomes an RFC |
| 14 | OPS-15 API contract decision (research section) | `docs/stories/OPS-15/api-contract-decision.md` / `docs/pt-BR/stories/OPS-15/api-contract-decision.md` | 2026-10-22 / @architect | Decision built on #13; 4 UNVERIFIED items need project tests (N7 commit gap, N8 timeouts) | Decisions D-series for S-04/S-05/S-06/S-14 | **SUFFICIENT** (open items are PostgreSQL/API tests, not research) |
| 15 | OPS-20 refund eligibility by subscriber status | `docs/stories/OPS-20/research.md` / `docs/pt-BR/stories/OPS-20/research.md` | 2026-10-21 / @analyst | Get Broadcaster Subscriptions VERIFIED; Prime PARTIAL; 2 UNVERIFIED | Scope `channel:read:subscriptions`, re-consent, lookup, redemption status update | **GAP** (see below) |
| 16 | OPS-20 UX for eligibility, override, re-consent | `docs/stories/OPS-20/ux-research.md` / `docs/pt-BR/stories/OPS-20/ux-research.md` | 2026-10-21 / @analyst | 7 UNVERIFIED (mostly competitor tools with no docs) | Patterns from Twitch dashboard and third-party bots, copy constraints | **SUFFICIENT** (competitor gaps do not block; copy must not promise expiry behavior) |
| 17 | OPS-20 test strategy | `docs/stories/OPS-20/test-research.md` / `docs/pt-BR/stories/OPS-20/test-research.md` | 2026-10-21 / @analyst | Twurple 8.2.0 rate-limiter source VERIFIED; fast-check VERIFIED; 5 UNVERIFIED | 429 handling, fakes vs Twitch CLI mock, property tests, disposable PostgreSQL | **SUFFICIENT**; **REFRESH IF** `@twurple/api` leaves 8.2.0 |
| 18 | Disposable Docker PostgreSQL in Vitest integration tests (image pull, cleanup, contention) | `docs/stories/OPS-15/docker-test-cleanup-research.md` / `docs/pt-BR/stories/OPS-15/docker-test-cleanup-research.md` | 2026-10-23 / @analyst | Docker CLI/Engine API docs, docker/cli and moby sources, installed Vitest 5.0.3 source VERIFIED; retry pattern PARTIAL; root cause of the 2026-10-22 parallel cleanup failure UNVERIFIED (stderr not recorded) | Pre-pull + `--pull never`, `Created` orphans and `--rm`, idempotent `rm -f`, unconditional `afterAll`, removal polling, Testcontainers (not now) | **SUFFICIENT**; the UNVERIFIED root cause is closed by the helper's improved error message and a full parallel `npm test` by @qa, not by research. **REFRESH IF** Testcontainers is proposed or Vitest leaves 5.x |

## Open GAPs (block a decision)

All three are from OPS-20 (#15). More web research is unlikely to close them: the notes report that no official or community statement was found. They need a **live Twitch test** on an affiliate test channel (already listed as a documented blocker in `test-research.md`), or an explicit owner rule that avoids depending on them.

1. **Pending UNFULFILLED redemptions:** whether Twitch expires or caps them in the request queue. This decides whether a non-eligible redemption may be left UNFULFILLED.
2. **Prime subscribers:** how Get Broadcaster Subscriptions represents Prime subs (official docs only partly confirm this). This decides whether Prime counts as eligible.
3. **Broadcaster in their own subscription list:** this is unknown. The current recommendation is to handle the broadcaster with an explicit rule.
