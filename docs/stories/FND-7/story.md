# Story FND-7: Configurable OBS overlay widgets

[Português](../../pt-BR/stories/FND-7/story.md)

**Complexity:** COMPLEX (19/25; reassessed 2026-10-06)
**Executor:** @dev
**Quality gate:** @architect
**Quality gate tools:** Vitest, Fastify route tests, real PostgreSQL migration integration tests, browser E2E, ESLint, TypeScript, OpenGrep, Prisma validation, Docker Compose validation, `git diff --check`.
**Priority:** P0 data/style/link lifecycle/security; P1 bilingual guides.
**Issue:** [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)

## Status

**Done — independent QA PASS 9.2/10.** Backend persistence, capability lifecycle, source projection, protected API, panel widget editor, local renderer, and bilingual operator guides are implemented. Real OBS CEF validation passed on Ubuntu 24.04 with OBS Studio 32.2.2 / CEF 127.0.6533.120. The isolated Compose E2E verified eight active sources over ten update rounds, 80 updates with a maximum of 905 ms, and bot stop/restart, stale-value retention/recovery, Browser Source unload/reload, and capability rotation. After trusting the local certificate, the streamer/operator reported widget creation works; Chrome acceptance also confirmed create/edit, one-time copy, regenerate, revoke, delete, and queue-source selection against a temporary local PostgreSQL fixture. The Twitch channel was not connected, so synchronization and live Twitch writes are not claimed. Full repository gates pass. FND-0 remains the historical MVP baseline; FND-7 is an explicitly requested post-MVP extension.

## User story

As a streamer using the local Genshin Impact queue bot, I want independent OBS widgets with separately chosen data and styling, so my stream shows only what I select in a consistent visual style.

## Scope and hard dependencies

OBS and the bot run on the same computer. Provide one widget per local OBS Browser Source URL. Each widget shows exactly one atomic field or fixed text:

- Current Genshin account label.
- Selected queue name, open/closed state, or waiting count (one selected queue).
- Called viewer display name or its original waiting position at call time, from the persisted transition audit snapshot (not the cleared waiting-position column).
- In-service viewer display name.
- Fixed custom text.

FND-5 and FND-6 are complete (merged in PRs #16 and #22). Before implementation, verify every source projection and protected panel/security primitive against the current code; do not ship a reduced source catalog. @aiox-ux-design-expert must approve the UI journey, defaults, states and accessibility before UI coding. Native OBS CEF trust of the app's local HTTPS CA must be verified on each claimed OS/OBS version before renderer implementation or compatibility claims; keep certificate verification enabled, with no HTTP fallback.

## Acceptance criteria

1. Authenticated panel users can create/edit/delete independent widgets and choose one atomic field or fixed text. Widget operations never mutate queue, account or viewer state.
2. The authenticated create/regenerate mutation returns the secret-bearing local URL exactly once for immediate copying. Later reads cannot recover it. The OBS read-only projection endpoint never returns the capability secret. Store only its cryptographic hash.
3. Per-widget appearance supports text/background colors, opacity, local allowlisted font stacks, size, weight, alignment, outline/shadow, dimensions, margins, overflow and fallback text. Validate on server and client; fixed/fallback text is limited to 240 Unicode code points, counted identically.
4. Successful empty projections show configured fallback. A first transient fetch failure with no prior value shows neutral unavailable state. A later transient failure retains the last value with a visible stale marker and retries. Invalid/revoked capability (401/403) or unknown/deleted widget (404) clears displayed content.
5. Only the selected field and necessary queue context are projected. No UIDs, Twitch credentials, sessions, financial data, other widgets or queues. All reads use shared application/domain services; OBS capabilities cannot mutate state.
6. Revocation invalidates the old token without issuing a replacement URL. Regeneration invalidates the old token and returns a new URL once. Widget deletion and capability invalidation commit atomically; concurrent reads after deletion success never return data. No replacement URL is issued on deletion.
7. With eight mixed dynamic widgets open, ten consecutive committed state changes must each render in the DOM within two seconds, measured commit-to-DOM with nominal one-second polling. Record the test environment.
8. OBS Browser Source on the same machine renders a transparent, scrollbar-free widget at configured dimensions. Set Page Permissions to None; the app never reads OBS bindings or controls OBS. Guides explain setup, preview, copy, refresh, revoke/regenerate, and only certificate trust steps verified on the tested OS/OBS version. Never bypass HTTPS validation or fall back to HTTP. Claim only platforms actually tested.
9. For each claimed OS/OBS version, native CEF loads the same local HTTPS URL without certificate bypass. The two-second target is measured for active, enabled Browser Source pages; after a source unload/reload, it fetches the latest value.

## Style bounds

Colors `#RRGGBB`; opacity 0–100%; font stack from `system-ui`, `Arial/sans-serif`, `Verdana/sans-serif`, `Georgia/serif`, `Courier New/monospace`; integer font size 8–128px; weight 300/400/500/600/700/800/900; alignment left/center/right; effect none/outline/shadow; outline 1–8px; shadow blur 0–32px and offsets −32..32px; width auto or 1–3840px; height auto or 1–2160px; each margin 0–256px; overflow wrap/clip/ellipsis. No arbitrary HTML/CSS/JS or remote assets.

## Security and architecture

Use a random secret in the URL fragment and an Authorization header for same-origin reads. Fragments avoid sending the secret in HTTP requests, but remain visible in OBS settings and copied URLs and are still credentials. Never place secrets in HTTP path/query, logs, caches or referrers; never store raw tokens. Revoke/regenerate immediately. Restrict the overlay host to loopback; return only a widget-scoped projection through existing services. Configure OBS Browser Source Page Permissions to None and do not call OBS APIs. Keep local HTTPS certificate verification enabled; CEF trust must be verified natively, with no HTTP or bypass fallback.

## Implementation order

Follow `spec/plan.json` and `plan/implementation.yaml`: verify completed FND-5/FND-6 projections and security foundations, complete UX gates, and validate native OBS HTTPS trust; then proceed test-first through field/style rules, PostgreSQL model/migrations, repository/application service, protected routes, renderer and panel; finish with real-database/native OBS E2E checks. Every increment follows Red → Green → Refactor. The JSON and YAML plans contain 24 aligned subtasks with explicit service, files, verification and dependencies. The two-second target applies to eight active/enabled Browser Source pages; if OBS unloads a hidden source, it must fetch the latest value after reload.

## Tasks / Subtasks

Task IDs and scope match the canonical JSON/YAML plans.

- [ ] 0. Readiness gates
  - [x] 0.1 Verify FND-5/FND-6 are complete and map every dynamic field to delivered projections and protected panel/security services; block if any prerequisite is incomplete. Source-level map recorded in `validation.md`.
  - [x] 0.2 Complete UX review and record approved font labels, default style, preview, empty/stale/unavailable states, accessible labels/focus, and consistency before UI coding. See `ux-refinement.md` and its pt-BR pair.
  - [x] 0.3 Write and validate shared Unicode code-point examples for 240-character fixed/fallback text.
- [ ] 1. Widget persistence foundation
  - [x] 1.1 Write real PostgreSQL migration-contract tests for widget create/edit/delete, capability hashing, widget scope, rotation, revocation, and restart durability.
  - [x] 1.2 Add the Prisma widget model and SQL migration only after database tests fail for the missing behavior.
- [ ] 2. Field and capability policy
  - [x] 2.1 Write unit tests for field scope, queue selection, fallback states, 240-character Unicode counting, style allowlists, and malicious input.
  - [x] 2.2 Implement pure field/style validation after observing behavioral Red.
  - [x] 2.3 Write tests for random token generation, hash-only persistence boundary, single-widget scope, rotation, and revocation.
  - [x] 2.4 Implement capability issue/verify/revoke policy and retest after Refactor.
- [ ] 2B. Widget repository/service
  - [x] 2B.1 Write PostgreSQL/application tests for create/edit/delete, token issue/hash verification, one-time URL, rotate/revoke, and concurrent delete/read atomicity.
  - [x] 2B.2 Implement repository and application service for widget persistence and capability lifecycle after Red.
- [ ] 3. Management API and OBS read route
  - [x] 3.1 Write HTTP contract tests for management session/CSRF, Host/Origin, token scope, rejected/revoked capabilities, exact data projection, cache/referrer headers, and no mutations.
  - [x] 3.2 Implement widget management and token-only read routes through shared application/domain projections.
- [ ] 4. Browser Source page
  - [x] 4.0 Verify native OBS CEF HTTPS certificate trust and Page Permissions=None before renderer work. Ubuntu 24.04, OBS Studio 32.2.2, CEF 127.0.6533.120; certificate validation remained enabled.
  - [x] 4.1 Run the browser E2E against isolated Compose/PostgreSQL with eight active sources and ten rounds (80 committed-change-to-DOM measurements); all met the two-second limit. Renderer contract unit tests cover safe text, transparency, style, fallback, transient stale/recovery and invalid capability clearing.
  - [x] 4.2 Implement the single-widget local renderer and polling using local assets only.
- [ ] 5. Panel integration
  - [x] 5.1 Complete UX review for the safe font menu, initial style, empty/stale labels, preview, duplicate-widget identification, and one-time link guidance before panel UI coding. Confirm implementation against the approved brief before panel coding.
  - [x] 5.2 Complete browser acceptance for widget create/edit/delete, field/queue selection, style preview, validation, copy, revoke, and regenerate. Chrome acceptance passed; queue selection used an isolated local PostgreSQL fixture because no Twitch account was connected. This verifies local selection, not Twitch synchronization.
  - [x] 5.3 Implement overlay management controls in the existing local panel; acceptance evidence is recorded under 5.2.
- [ ] 6. OBS verification and documentation
  - [x] 6.1 Verify create/edit/regenerate/revoke/delete and one-time clipboard copy on the real local panel/database, queue-source selection with a disposable local queue fixture, and renderer propagation in the 80-update E2E. Fixture data and widget were removed after verification.
  - [x] 6.2 Complete native OBS Browser Source checks for dimensions, transparency, live state, failure/recovery, unload/reload, and link rotation. The authenticated OBS E2E ran against OBS Studio 32.2.2 / CEF 127.0.6533.120 with certificate validation enabled.
  - [x] 6.3 Publish bilingual integration and story-index evidence.
  - [x] 6.4 Publish equivalent bilingual README widget instructions and record the passing documentation contract test.
  - [x] 6.5 Rerun complete project quality gates and record exact outcomes. Independent AIOX QA passed at 9.2/10.
## Testing and status boundary

Final engineering gates pass: lint, typecheck, 472 tests / 69 files, OpenGrep (0/56 application JavaScript files), version `v0.5.0-0000000-alpha`, Prisma validation, Compose configuration, `npm audit --omit=dev --audit-level=low` (0 vulnerabilities), and diff check. Native OBS E2E passed 80 updates (maximum 905 ms), bot stop/restart recovery, stale-state display/recovery, Browser Source unload/reload, and old/new capability rotation on Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120. The streamer/operator reported widget creation works after trusting the local certificate. No authorized Twitch channel was connected; live synchronization is not claimed. Independent AIOX QA passed at 9.2/10.

## Planning file list

Updated on 2026-10-06: `apps/api/prisma/schema.prisma`, the PostgreSQL migration, overlay policy/service/projection/repository/routes, safe queue projections, renderer and widget form/page assets, navigation, Vitest unit/PostgreSQL integration tests, authenticated native OBS E2E harness, OBS WebSocket authentication and timeout helpers, Compose origin-port helper, README pair, bilingual FND-7 spec/story/validation/UX, implementation plan, integrations, story indexes, version docs, and changelogs. Independent QA PASS 9.2/10 is recorded below.

## QA Results

### Review date: 2026-10-06

### Reviewer: Quinn (Test Architect)

### Reviewed revision

`HEAD 27effa73a362a1eb23aa8a3ef8e1e06e43c9d313` plus working-tree digest `sha256:ddc90ffc5eef8c5c5cff96d43ee1a3a80eb8e46101757a93cbd46e46a037fb4e` immediately before this QA-section update (uncommitted feature worktree).

### Verdict and score

**PASS — 9.2/10 (92/100).** The previously open native OBS and operator acceptance evidence is now recorded, the bilingual documentation contract matches the delivered state, and the full quality suite passes. FND-7 meets the requested 9/10 completion threshold. No live Twitch operation was tested or is claimed.

### Evidence

- `npm test` — 472 tests passed across 69 files, including the corrected FND-7 bilingual documentation contract (5/5).
- `npm run lint`, `npm run typecheck`, `npm run review:static`, `npm run validate:version`, Prisma schema validation, isolated Compose configuration, `npm audit --omit=dev --audit-level=low`, and `git diff --check` passed. OpenGrep reported 0 findings across 56 application JavaScript files; audit reported 0 vulnerabilities.
- The recorded authenticated native OBS E2E on Ubuntu 24.04 / OBS Studio 32.2.2 / CEF 127.0.6533.120 covers eight active sources and 80 commit-to-DOM updates (maximum 905 ms), bot stop/restart, stale-value retention/recovery, Browser Source unload/reload, and old/new capability rotation. The run evidence and exact command were inspected; this review did not rerun native OBS E2E because the active OBS/Compose instance was kept available for the operator.
- The operator directly reported widget creation after trusting the local certificate. Recorded Chrome acceptance covers create/edit, one-time copy, regenerate, revoke, delete, and queue-source selection against an isolated PostgreSQL fixture. English and pt-BR validation records now agree on these results and on the limits: no Twitch credentials/synchronization or live Twitch writes were tested; Windows/macOS OBS compatibility is not claimed.
- Read-only operational checks showed the isolated bot and PostgreSQL containers healthy, `pg_isready` accepting connections, `/health` reporting `status=ok` and database `connected`, Twitch `not_configured`, and zero active widgets. No volume or persisted application data was removed.
- Regression fixes remain verified: queue state is projected only for `synced`, `synced_manual`, or `delete_pending` (the PostgreSQL integration test asserts deletion-pending projects closed); renderer polls each 1,000 ms; HTTP 401/403/404 clears displayed data; capability URL replay protection is covered.

### Findings

No blocking or non-blocking product findings remain. No real Twitch authorization, reward synchronization, or point operation is claimed.

### Compliance

- Native OBS and operator acceptance: **PASS** for the tested Ubuntu/OBS/CEF combination.
- Projection, privacy/capability lifecycle, renderer error handling and polling: **PASS**.
- PostgreSQL migrations/persistence and application quality gates: **PASS**.
- Bilingual operator documentation and evidence: **PASS**.
- All FND-7 acceptance criteria: **PASS** within the explicitly documented platform and Twitch-validation limits.
- Refactoring performed during QA: **None**. Only this QA Results section was updated.

### Lifecycle

**QA gate: PASS; score 9.2/10.** FND-7 is Done. The README, story indexes, implementation-plan task state, validation records, changelogs, and integration documentation have been synchronized to record the completed story and its documented platform/Twitch validation limits.
