# Backend migration study (cost of rewriting the backend vs hardening it)

[Português brasileiro](../pt-BR/process/backend-migration-study.md)

**Date:** 2026-10-27. **Author:** `@architect` (Aria). **Branch:** `feat/ops-15-next-panel`. **Mode:** read-only analysis + web research. No code, config, test or story was changed. No server, Docker or test was run (a dev instance was in use).

**Owner question (2026-10-27):** "Compare the costs of migrating the whole backend to a more efficient one that fits the working model we need."

**Short answer:** do **not** migrate the language now. The defects that motivated the question (a Twurple property that does not exist, `statusCode` vs `status`, fakes that do not match the library) are **type-boundary defects that the repository's own type checker is configured not to catch** (`tsconfig.json` has `"strict": false` and the adapter parameters carry no JSDoc types). Any target language would still need typed bindings to Twitch, and none of them has a Twitch library as complete as Twurple 8.2.0. A rewrite costs an estimated **10 to 24 person-weeks with agents** (Go/Rust/.NET) and freezes OPS-15/OPS-20/OPS-21; hardening the current Node backend costs **2.5 to 5 person-weeks**, can be sliced, and does not freeze delivery. The CI/test time is a **process** cost (Docker PostgreSQL, `next build`, Compose), which a language change does not remove.

## 1. Working-model assumptions used

Sources: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*.md`, `docs/process/backlog-inventory.md`, `docs/stories/OPS-15/*` (test-suite audit, redemption-sync research, panel-defects review).

| # | Assumption | Source |
|---|---|---|
| A1 | Local product installed on the streamer's PC: Docker Compose + per-platform installer (Ubuntu validated, Windows planned, macOS not validated) | AGENTS.md, `apps/infra/installer` |
| A2 | One owner + AI agents; `@dev` test-first, `@qa` independent final gate, `@devops` commits | CLAUDE.md, agent-authority rule |
| A3 | CLI First, JavaScript ESM with JSDoc, Node 24.20.0 pinned | Constitution, `package.json` |
| A4 | PostgreSQL guarantees only via disposable PostgreSQL with real migrations, never SQLite/mocks | CLAUDE.md |
| A5 | Errors: localized generic text + `referenceId`; logs without chat body, UID, tokens, headers | CLAUDE.md |
| A6 | `unknown` outcomes from Twitch stay in the outbox in a safe state; missing response is never a confirmation | CLAUDE.md |
| A7 | Real-time panel update via SSE (owner decision 2026-10-27, per the request) | spawn request; panel-defects review F7 |
| A8 | `legacy` is not a rollback target; no cutover without owner authorization | CLAUDE.md |
| A9 | Bilingual docs, stories and changelogs | CLAUDE.md |

## 2. Measurements (static, read-only; `wc -l`, `grep`, `find`)

| Item | Value | Evidence level |
|---|---|---|
| Backend source `apps/api/src` | **7,524 lines in 45 files** (`.mjs`) | Measured |
| By module | persistence 2,679 (of which `queue-repository.mjs` alone 2,460); twitch 1,332 (11 files); http 1,118 (6); outbox 755 (5); commands 709 (5); domain 458 (8); server/runtime/health/web/config 391; observability 82 | Measured |
| Shared code `apps/shared` | 1,300 lines (localization 511, panel 705, browser 84); used by the Next panel and overlay too | Measured |
| Other apps (not backend) | `apps/frontend` 4,905, `apps/web` (vanilla, to be removed) 1,430, `apps/infra` 728 | Measured |
| HTTP routes | **48** route registrations (≈40 distinct `/api/*` paths + `/health`, `/callback`, overlay) | Measured (grep) |
| Workers / loops | 5 (`financial-worker`, `reward-worker`, `chat-worker`, `loop`, `timeout-loop`) | Measured |
| Chat command modules | 5 (parser, catalog, authorization, help, chat-handler) | Measured |
| Prisma | 11 models, 207-line schema, **14 migrations** | Measured |
| Critical external deps | `fastify` 5.12.5, `@fastify/static`, `@prisma/client`/`prisma` 6.19.3 + `@prisma/adapter-pg` + `pg`, `@twurple/api`/`auth`/`eventsub-ws` 8.2.0 | Measured (`package.json`, imports) |
| Imports of third-party libs in backend | only 9 import sites (Twurple 4, Prisma/pg 3, Fastify 2) | Measured: coupling to libraries is **narrow** |
| Tests | unit 143 files / 946 `it|test` sites (1,286 at runtime per audit); integration 21 files / 250 sites; e2e 15 browser scripts | Measured; runtime count from test-suite audit |
| Tests touching the backend | ≈63 unit files and 8 integration files reference `apps/api`/twitch/outbox | Measured (grep, approximate) |
| Type checking | `tsc --noEmit` with `allowJs`, `checkJs`, **`strict: false`**; TypeScript 7.0.2; JSDoc tags in backend: 92 (≈1 per 80 lines); 0 `@ts-` directives | Measured |
| Bug class example | `redemptionStatus(value)` has an untyped `value`, so `value?.status` compiles although `HelixCustomRewardRedemption` has no `status` getter; `error.status` checked where Twurple throws `HttpStatusCodeError.statusCode` | VERIFIED (`helix-adapter.mjs:15-19`, note #20) |
| Suite time | full `npm test` 105 s parallel / 240 s serial; time sits in 7 files starting PostgreSQL containers + `migrate deploy`, Compose stack, and a full `next build` | From `test-suite-audit-2026-10-23.md` (measured there under load) |
| Backend CPU/memory on the streamer's PC | **Not measured**. No profile, no incident, no story reports CPU/RAM pressure. Workload is one channel: a few events per minute, polling every 1–5 s | UNVERIFIED (gap) |

### 2.1 Runtime vs process inefficiency

- **Process (measured):** suite and CI time are dominated by Docker PostgreSQL per file, Compose, `next build` and Vitest worker start (test-suite audit). Rewriting the backend in Go/Rust keeps PostgreSQL integration (A4), the Next build and the Compose stack, so it removes almost none of that time; it also adds a second toolchain in CI.
- **Runtime (not measured, low expected):** a Node 24 + Fastify + Prisma process idles in the order of tens of MB to ~100+ MB RSS, while a Go binary idles in single-digit to tens of MB (UNVERIFIED for this app: general knowledge, no project measurement). On a streamer PC that already runs Docker Desktop/PostgreSQL and OBS, the backend process is not the dominant consumer; PostgreSQL and Docker are, and they stay in every option.
- **Conclusion:** ≈ all observed "inefficiency" is process. The only runtime argument with real weight is **distribution** (single binary vs Node + Docker), not CPU.

## 3. Alternatives and ecosystem (2026 research)

Existing notes reused (not repeated): #1 FND-0 stack, #5 FND-9, #6 OPS-3, #9 OPS-7, #10 OPS-8, #13/#14 API contract, #17 OPS-20 test strategy, #20 redemption sync.

| Topic | Finding | Level | Source (checked 2026-10-27) |
|---|---|---|---|
| Go Twitch client | `nicklaw5/helix` is Helix-only, "best effort"; last push seen 2025-03-24; no EventSub WebSocket transport found; fork `litui/helix/v3` 3.0.1 (2025-01-08) has EventSub constants only | PARTIAL | [README](https://github.com/nicklaw5/helix/blob/main/README.md), [ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2Fnicklaw5%2Fhelix), [pkg.go.dev litui](https://pkg.go.dev/github.com/litui/helix/v3) |
| Rust Twitch client | `twitch_api` (twitch-rs) 0.8.0 on docs.rs: Helix + EventSub types; WebSocket client is assembled by the app (examples), no managed listener like Twurple | PARTIAL | [docs.rs](https://docs.rs/crate/twitch_api/latest), [GitHub](https://github.com/twitch-rs/twitch_api) |
| .NET Twitch client | `TwitchLib.EventSub.Websockets` stable 0.7.0 (2025-09-19), many previews; pre-1.0 | PARTIAL | [NuGet](https://packages.nuget.org/packages/TwitchLib.EventSub.Websockets/0.6.0-preview-dbc970c) |
| Twurple baseline | 8.2.0 pinned: auth provider with refresh, Helix, `EventSubWsListener`, typed `.d.ts`, rate limiter | VERIFIED | notes #9, #10, #17, #20 (installed source) |
| SSE on Fastify | `@fastify/sse` in the fastify org (route `sse: true`, `Last-Event-ID` replay, heartbeat), README 0.4.0; raw `reply.raw` writes also work | PARTIAL (version/maturity not confirmed) | [README mirror](https://cdn.jsdelivr.net/npm/@fastify/sse@0.4.0/README.md) |
| Node type stripping | Reported stable in Node 24.12 LTS; erasable syntax only, no type check | PARTIAL (third-party; official page not confirmed) | [blog](https://x-cmd.com/blog/251218), [Node docs (nightly)](https://nodejs.org/download/nightly/v24.0.0-nightly20250421e773e09c3f/docs/api/typescript.html) |

**Key observation:** in every other language the project would write or adopt a **less mature** Twitch layer than Twurple, and the 1,332 lines of `apps/api/src/twitch` (OAuth, refresh, EventSub, Helix, reconciliation, rewards) are exactly the code already validated live. A rewrite moves the highest-risk area to the least mature library.

### 3.1 Alternatives

- **(a) Stay on Node and harden (baseline):** strict type checking of JSDoc (or `.ts` via type stripping later), typed adapters over real Twurple classes, error mapping, contract tests against real Twurple instances, SSE in Fastify.
- **(b) Node + NestJS:** same runtime and libs (Twurple/Prisma usable), adds DI/modules/decorators. Does not by itself fix the bug class (types still lie at `any` boundaries); rewrites routing, wiring and most tests; TypeScript decorators conflict with the JSDoc/ESM rule.
- **(c) Go:** single binary, low memory, strong compiler feedback, good SSE (`net/http` flushing) and PostgreSQL (`pgx`, `sqlc`, `goose`/`atlas`). Twitch layer must be largely hand-written (EventSub WS session, reconnect/keepalive, refresh). Good agent ergonomics.
- **(d) Rust:** strongest guarantees, `twitch_api` + `sqlx`; highest effort, slowest compile feedback, hardest for agent-generated code review by a single owner.
- **(e) .NET:** cross-platform single-file publish, EF Core migrations, TwitchLib pre-1.0. Python/FastAPI rejected: weaker typing than TS strict, no distribution gain.

## 4. Comparison matrix

Scores 1–5 (5 best). Weights: risk 30%, cost 25%, agent ergonomics 15%, adherence to project rules 15%, distribution 10%, performance 5%.

| Criterion (weight) | (a) Node hardened | (b) NestJS | (c) Go | (d) Rust | (e) .NET |
|---|---|---|---|---|---|
| Risk (30) | 5 | 3 | 2 | 1 | 2 |
| Cost (25) | 5 | 3 | 2 | 1 | 2 |
| Agent ergonomics (15) | 4 | 3 | 5 | 3 | 4 |
| Rule adherence (15) | 5 | 2 | 1 | 1 | 1 |
| Distribution (10) | 2 | 2 | 5 | 5 | 4 |
| Performance (5) | 3 | 3 | 5 | 5 | 4 |
| **Weighted total** | **4.50** | **2.75** | **2.75** | **2.10** | **2.40** |

Rule adherence: any non-JS backend breaks "JavaScript ESM with JSDoc", Node pinning, the shared `apps/shared` code (localization and panel projections used by the frontend) and the existing `@dev`/`@qa` tooling; it needs an owner rule change.

## 5. Cost of migrating (ranges, person-weeks of agent-assisted work, owner review included)

| Item | (b) NestJS | (c) Go | (d) Rust | (e) .NET |
|---|---|---|---|---|
| Modules to rewrite | 45 files restructured, logic mostly portable | 45 files / 7.5k lines + Twitch client layer | same + Twitch WS layer | same |
| Twitch layer (OAuth, refresh, EventSub WS, Helix, reconciliation) | reuse Twurple | 2–4 | 3–5 | 2–3 |
| Persistence (2.7k lines, 11 models, 14 migrations; Prisma → sqlc/pgx+goose, sqlx, EF Core) | 0.5–1 | 2–3 | 3–4 | 2–3 |
| HTTP (48 routes, safe error handler, session, CSRF, overlay) + SSE | 1–2 | 1.5–2.5 | 2–3 | 1.5–2.5 |
| Outbox workers + commands + domain | 1–2 | 2–3 | 3–4 | 2–3 |
| Tests: ≈63 unit + 8 integration backend files rewritten; E2E kept (HTTP contract) | 2–3 | 3–4 | 3–5 | 3–4 |
| CI/CD, Dockerfile, installer, multi-OS build, docs bilingual | 0.5 | 1–2 | 1–2 | 1–2 |
| Live re-validation with Twitch (rewards, refunds, chat) | 0.5–1 | 1–2 | 1–2 | 1–2 |
| **Total** | **6–10** | **12–18** | **16–24** | **12–18** |

Common costs and risks of any rewrite:
- **Delivery freeze:** OPS-15 cutover, OPS-20 refunds, OPS-21 and the redemption-sync fixes stop or must be done twice. With one owner reviewing, realistically 3–5 calendar months.
- **Data migration:** the PostgreSQL schema can stay (data is not moved), but migration history must be re-baselined in the new tool; `_prisma_migrations` would have to be reconciled on installed copies. Risk to financial outbox rows in `unknown` state (A6).
- **Regression risk:** every live-validated Twitch behavior is re-learned; this is where the recent bugs came from.
- **Security:** new OAuth/token storage, session/CSRF and log redaction code must be re-reviewed; OpenGrep rules are JS-oriented and need new rulesets.
- **`legacy` rule:** there is no rollback to the old backend; a failed rewrite would have to roll forward.

## 6. Cost of NOT migrating and of the intermediate path

**Cost of doing nothing:** the bug class recurs at each new Twitch surface (OPS-20 adds Subscriptions/refunds). Recent evidence: one wrong getter left financial operations in `unknown` and blocked queue deletion (note #20); the `statusCode` mismatch makes real 401/403/404 look transient. Estimated recurring cost: 0.5–1.5 person-weeks per incident (diagnosis + research + fix + live re-test), plus owner time on stream.

**Intermediate path (recommended):** keep Node/Fastify/Prisma/Twurple and close the type gap. Effort **2.5–5 person-weeks**, sliced, without freezing delivery. Why it fixes the class: with `strict` (at least `noImplicitAny` + `strictNullChecks`) and `@param {HelixCustomRewardRedemption} value`, `value.status` becomes a compile error, and `error.statusCode` becomes the only accessible field after `instanceof HttpStatusCodeError`. Contract tests that build **real** Twurple instances (not plain objects) close the fakes gap.

## 7. Recommendation

**Do not migrate the backend language now. Execute the incremental hardening plan (section 9).** Re-evaluate only if a trigger in section 8 fires.

Trade-off accepted: we keep the Node + Docker distribution cost and higher idle memory, in exchange for no freeze, no Twitch layer rewrite and full rule adherence.

## 8. Objective triggers to re-evaluate

Re-open this study (and run a time-boxed Go spike of 1 week on the Twitch layer only) if **any** of these happens:

1. **Distribution:** the Windows/macOS installer requires dropping Docker (owner decision), or installer support costs exceed 2 person-weeks per OS because of Node/Docker.
2. **Runtime measured:** a profile on a reference streamer PC shows backend RSS > 300 MB steady or > 5% CPU sustained while idle, with Node tuning already tried.
3. **Bug class persists:** after H-01..H-04 ship, 2 or more production incidents within 3 months are still caused by wrong library property/error shapes.
4. **Ecosystem:** Twurple stops being maintained (no release for 12 months while Twitch changes EventSub/Helix), or a Go/Rust Twitch library reaches a stable 1.x with a managed EventSub WebSocket and token refresh.

## 9. Incremental hardening plan (same format as `backlog-inventory.md`)

Each slice needs a GitHub issue by `@devops` before implementation, `@dev` test-first, `@qa` final gate. Difficulty: P ≤ half day, M 1–3 days, G several days.

| ID | Item | Type | Story / issue | Status in flow | Current / next gate and next owner | Blocked by | Prio | Diff | Key requirements | Line of thought | Concrete next step |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **H-01** | Twurple error mapping (`statusCode ?? status`, `Retry-After`) in one function used by worker and reconciler | slice | redemption-sync fix (note #20) | not started | `@po` story; `@dev` | none | P0 | P | Real 401/403/404/429 classified correctly; tests with real `HttpStatusCodeError` | Latent financial bug (note #20) | `@sm` drafts story slice |
| **H-02** | Typed Twitch adapter: JSDoc types from Twurple classes on all `helix-adapter`/`eventsub-runtime` boundaries; remove `value.status` fallback | slice | same | not started | `@dev` | H-01 | P0 | M | `tsc` fails on non-existent getters | Root of the bug class | annotate 11 twitch files |
| **H-03** | Contract tests with real Twurple instances (build classes from raw Helix/EventSub JSON fixtures) | test | same | not started | `@qa` defines; `@dev` | H-02 | P1 | M | No plain-object fakes for Twurple types in twitch tests | Fakes diverged from library | list fakes in ≈63 backend unit files |
| **H-04** | Strict type check for `apps/api` only (`tsconfig.api.json`: `strict: true`, fix errors per module) | slice | new story | not started | `@architect` sets config; `@dev` | H-02 | P1 | G | `npm run typecheck:api` strict green; root `strict:false` unchanged until web/infra follow | Incremental, module by module | measure error count with strict (one read-only `tsc` run by `@qa`) |
| **H-05** | Typed HTTP contract: JSON Schema per route (Fastify native) + JSDoc types shared with the frontend via `apps/shared` | slice | follows notes #13/#14 | not started | `@dev` | H-04 | P2 | G | 48 routes validated in/out; generic error contract kept (A5) | Prevents frontend/backend drift | pick 5 high-value routes first |
| **H-06** | SSE channel for panel (`@fastify/sse` or raw), session/CSRF review, polling fallback | story | S-G in panel-defects review | not started | research note #21 (SSE) already exists; `@ux-design-expert` plan ≥9.0; `@dev` | OPS-15 cutover | P2 | G | `Last-Event-ID`, heartbeat, no secrets in events, proxy-safe | Owner decided SSE 2026-10-27 | apply note #21; research only a GAP it leaves open |
| **H-07** | Split `queue-repository.mjs` (2,460 lines) by aggregate | slice | new story | not started | `@data-engineer` + `@dev` | H-04 | P2 | G | No behavior change; PostgreSQL integration green | Largest file, hardest to type | plan split with `@data-engineer` |
| **H-08** | Test process acceleration (one PostgreSQL container + template DB per file; remove duplicate `next build`) | test | test-suite audit items | not started | `@qa` + `@dev` | none | P1 | M | Measured before/after | Process is the real inefficiency | measure per-file durations isolated |
| **H-09** | Runtime baseline: measure backend RSS/CPU idle and under a replayed event burst | test | new | not started | `@qa` | none | P3 | P | Numbers for trigger #2 | Closes the runtime gap | run on reference PC when free |

Total effort H-01..H-08: **2.5–5 person-weeks**, parallelizable with OPS-15/OPS-20 when write sets do not overlap.

## 10. Owner decisions needed

1. Approve "do not migrate now" and the hardening plan H-01..H-09 (recommended: yes).
2. Allow strict type checking per module starting with `apps/api` (keeps JS + JSDoc; no `.ts` yet). Moving to `.ts` files with Node type stripping is a separate later decision (PARTIAL evidence).
3. Confirm that Docker remains required on Windows/macOS (if not, trigger #1 fires).
4. Order of SSE (H-06) vs typing (H-02..H-04): recommended typing first, SSE after the OPS-15 cutover.

## Limitations

No runtime measurement (dev instance in use). Effort ranges are architectural estimates, not measured velocity. Ecosystem findings for Go/Rust/.NET libraries are PARTIAL (index pages, not code review). Strict-mode error count is unknown until one read-only `tsc` run.
