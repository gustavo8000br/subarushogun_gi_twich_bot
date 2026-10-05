# Story FND-7: Configurable OBS overlay widgets

[Português](../../pt-BR/stories/FND-7/story.md)

**Complexity:** COMPLEX (17/25)  
**Executor:** @dev  
**Quality gate:** @architect  
**Quality gate tools:** Vitest, Fastify route tests, real PostgreSQL migration integration tests, browser E2E, ESLint, TypeScript, OpenGrep, Prisma validation, Docker Compose validation, `git diff --check`.  
**Priority:** P0 data/style/link lifecycle/security; P1 bilingual guides.  
**Issue:** [#7](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/7)

## Status

**Draft.** Spec Pipeline reviews by PM, PO, Architecture and QA passed. Implementation has not started. FND-0 remains the historical MVP baseline; FND-7 is an explicitly requested post-MVP extension.

## User story

As a streamer using the local Genshin Impact queue bot, I want independent OBS widgets with separately chosen data and styling, so my stream shows only what I select in a consistent visual style.

## Scope and hard dependencies

OBS and the bot run on the same computer. Provide one widget per local OBS Browser Source URL. Each widget shows exactly one atomic field or fixed text:

- Current Genshin account label.
- Selected queue name, open/closed state, or waiting count (one selected queue).
- Called viewer display name or position.
- In-service viewer display name.
- Fixed custom text.

FND-5 and FND-6 must be fully complete before any FND-7 implementation. Map every source projection and the protected panel/security primitives; do not ship a reduced source catalog. @aiox-ux-design-expert must approve the UI journey, defaults, states and accessibility before UI coding.

## Acceptance criteria

1. Authenticated panel users can create/edit/delete independent widgets and choose one atomic field or fixed text. Widget operations never mutate queue, account or viewer state.
2. The authenticated create/regenerate mutation returns the secret-bearing local URL exactly once for immediate copying. Later reads cannot recover it. The OBS read-only projection endpoint never returns the capability secret. Store only its cryptographic hash.
3. Per-widget appearance supports text/background colors, opacity, local allowlisted font stacks, size, weight, alignment, outline/shadow, dimensions, margins, overflow and fallback text. Validate on server and client; fixed/fallback text is limited to 240 Unicode code points, counted identically.
4. Successful empty projections show configured fallback. A first transient fetch failure with no prior value shows neutral unavailable state. A later transient failure retains the last value with a visible stale marker and retries. Invalid/revoked capability (401/403) or unknown/deleted widget (404) clears displayed content.
5. Only the selected field and necessary queue context are projected. No UIDs, Twitch credentials, sessions, financial data, other widgets or queues. All reads use shared application/domain services; OBS capabilities cannot mutate state.
6. Revocation invalidates the old token without issuing a replacement URL. Regeneration invalidates the old token and returns a new URL once. Widget deletion and capability invalidation commit atomically; concurrent reads after deletion success never return data. No replacement URL is issued on deletion.
7. With eight mixed dynamic widgets open, ten consecutive committed state changes must each render in the DOM within two seconds, measured commit-to-DOM with nominal one-second polling. Record the test environment.
8. OBS Browser Source on the same machine renders a transparent, scrollbar-free widget at configured dimensions. English and pt-BR guides explain setup, preview, copy, refresh, revoke and regenerate. Claim only platforms actually tested.

## Style bounds

Colors `#RRGGBB`; opacity 0–100%; font stack from `system-ui`, `Arial/sans-serif`, `Verdana/sans-serif`, `Georgia/serif`, `Courier New/monospace`; integer font size 8–128px; weight 300/400/500/600/700/800/900; alignment left/center/right; effect none/outline/shadow; outline 1–8px; shadow blur 0–32px and offsets −32..32px; width auto or 1–3840px; height auto or 1–2160px; each margin 0–256px; overflow wrap/clip/ellipsis. No arbitrary HTML/CSS/JS or remote assets.

## Security and architecture

Use a random secret in the URL fragment and an Authorization header for same-origin reads. Fragments avoid sending the secret in HTTP requests, but remain visible in OBS settings and copied URLs and are still credentials. Never place secrets in HTTP path/query, logs, caches or referrers; never store raw tokens. Revoke/regenerate immediately. Restrict the overlay host to loopback; return only a widget-scoped projection through existing services.

## Implementation order

Follow `spec/plan.json` and `plan/implementation.yaml`: first complete FND-5/FND-6 readiness and UX gates; then test-first field/style rules, PostgreSQL model/migrations, repository/application service, protected routes, renderer and panel; finish with real-database/E2E checks and manual OBS verification. Every increment follows Red → Green → Refactor. The JSON and YAML plans contain 21 aligned subtasks with explicit service, files, verification and dependencies.

## Testing and status boundary

No FND-7 code, implementation test, OBS installation, or OS compatibility has been verified. Do not mark implementation complete until actual command output and OBS environment evidence are recorded. See `validation.md` and `spec/` for workflow artifacts.
