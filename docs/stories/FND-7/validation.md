# FND-7 — Spec Pipeline validation

**Refresh date:** 2026-10-06. Spec Pipeline and UX are complete. Backend, protected API, panel editor and renderer are implemented. Native OBS CEF HTTPS and eight-source propagation, outage recovery, stale-state handling, source reload and capability rotation passed on Ubuntu 24.04. After the operator trusted the current local certificate in Chrome, widget create/edit/copy/regenerate/revoke/delete acceptance passed. Queue-source selection was verified against a temporary local PostgreSQL queue fixture; Twitch synchronization was not exercised. Full repository gates now pass after the final documentation and contract-test updates. Independent AIOX QA passed with score 9.2/10; FND-7 is Done.

## Pipeline status

| Stage | Result | Evidence |
|---|---|---|
| Gather | Complete | User selected all proposed fields plus fixed text, same-computer OBS, per-widget complete style, two-second update target, empty fallback, stale marker on transient failure, revocable/regenerable links, 240 Unicode code points. |
| Assess | COMPLEX, 19/25 | Scope 4, integration 3, infrastructure 4, knowledge 4, risk 4. Added native OBS CEF trust, Page Permissions, and multiple-source resource risks. |
| Research | Refreshed | Official OBS Browser Source and obs-browser docs/repository, Chromium Linux certificate guidance, OBS performance guidance, RFC 6750 and project architecture reviewed. No runtime dependency added. |
| Critique 1 | NEEDS_REVISION | Clarified empty, transient failure and invalid/revoked link display states. |
| Critique 2 | APPROVED, 4.6/5 | QA-protocol review; no independent reviewer claimed. Native CEF trust/performance remain explicit implementation acceptance gates. |
| UX refinement | Complete | `$aiox-ux-design-expert` desk research, information architecture, flows, states, default style proposal, accessibility guidance and wireframe are in `ux-refinement.md` and its pt-BR pair. No usability session is claimed. |
| Plan | Refreshed | `spec/plan.json` and `plan/implementation.yaml`, 24 matching tasks; FND-5/FND-6 are complete (PR #16/#22). |

## Current-code readiness map

Verified by source inspection on 2026-10-06 (not runtime or OBS validation):

| Widget source | Existing source of truth | Projection constraint for FND-7 |
|---|---|---|
| Current Genshin account label | `getCurrentAccount()` in `apps/api/src/persistence/queue-repository.mjs`; account is persisted/audited by FND-5. | Select only the safe account label. |
| Queue name/open state/waiting count | `listQueueProjection()` plus active-entry query in the queue repository. | Do not expose that broad projection to OBS: it includes several fields and conditionally UID. Produce a separate one-widget/one-field projection. |
| Called viewer/display name | `listEntriesByStatus(queueId, ['called'])`; ordering is priority/position for waiting, while `listQueueChatEntries()` orders calls by `calledAt`, then `createdAt`. | Select earliest outstanding call by `calledAt`, then `createdAt`. |
| Called viewer original waiting position | `entry.transitioned` audit `safeDetail.previousPosition`, written by call operations at queue-repository lines 558/588. | Read the persisted audit snapshot; `entries.position` becomes null on call. Never treat group order as original position. |
| In-service viewer/display name | `listEntriesByStatus(queueId, ['in_progress'])` and queue-chat projection. | Select one deterministic entry using service start time then creation time; preserve one-field output. |
| Widget static text | New FND-7 widget configuration. | Render as inert text; enforce shared 240-code-point limit. |

FND-5 current-account and call ownership behavior and FND-6 protected panel foundations are in the merged baseline. `registerLocalSession` in `apps/api/src/http/local-session.mjs` checks exact loopback Host/Origin, session and CSRF for mutations; `apps/api/src/server.mjs` registers it before API routes. Readiness 0.1 is complete. FND-7 uses dedicated one-field projections and the local session/CSRF layer.

## Decisions

- Post-MVP extension; FND-0 remains historically accurate.
- OBS and bot on the same computer; no LAN/public/cloud access.
- One atomic field or fixed text per widget, with independent style and capability URL.
- Empty source uses configured fallback. Transient failure retains last value with stale marker. First failure without a prior value shows neutral unavailable state. Invalid/revoked capability clears the source.
- URL secret is emitted once only by authenticated create/regenerate; OBS projection never returns it. Hash-only persistence, revocation and atomic delete.
- 240 Unicode code points for fixed/fallback text, with the same counting rule on both sides.
- OBS Browser Source Page Permissions must be set to None; the overlay does not use OBS bindings or control APIs.
- Native CEF must load the local HTTPS origin with the trusted application CA. Never use HTTP or bypass certificate validation; verify the exact OS/OBS version before claiming support.
- The two-second SLA applies to eight active/enabled pages. An unloaded source fetches current state when it resumes.
- Called viewer position is the persisted `previousPosition` audit snapshot, since active entries no longer retain the waiting `position`.

## Limitations and final evidence

The isolated real-PostgreSQL suite covers migrations, capability hash format/uniqueness, source scope, restart durability, projections and read/delete serialization. The additional test directly verifies that a queue in `delete_pending` projects as closed. Renderer tests cover fallback, unavailable, stale/recovery and invalid/revoked capability clearing. Regression fixes were test-first: pending queue state was initially projected as open, HTTP 403 retained stale content, and polling used two seconds; focused Red runs observed these failures, Green changed the projection to expose only confirmed remote states, clear 401/403/404, and poll each second. The related focused tests passed.

Native OBS evidence: Ubuntu 24.04; OBS Studio 32.2.2 (Flathub); Browser Source `obs-browser` 2.26.9 / CEF 127.0.6533.120. CEF initially rejected the app CA with `net::ERR_CERT_AUTHORITY_INVALID`; after importing it into the temporary test NSS profile, it loaded over TLS 1.3 with secure state and HTTP 200. No certificate bypass or HTTP fallback was used. OBS readback confirmed `webpage_control_level=0` (Page Permissions=None). The final authenticated native E2E ran with `APP_ORIGIN=https://localhost:3437`, isolated Compose project `queuebot-fnd7`, `OBS_VERSION=32.2.2`, and `CEF_VERSION=127.0.6533.120`: eight concurrent active sources completed ten rounds (80 commit-to-DOM updates), maximum 905 ms. It also verified bot stop/restart, stale-value retention and recovery, Browser Source unload/reload fetching current state, and old-capability clearing after rotation with the new capability rendering. The harness was run via `npm run test:e2e:overlay`. These results apply only to this Ubuntu/OBS/CEF combination; Windows and macOS OBS validation are not claimed.

The operator trusted the current local certificate in Chrome and directly reported that widget creation works. Chrome manual acceptance also covered edit, one-time copy, confirmed regenerate/revoke, delete and queue-source selection against a disposable local PostgreSQL fixture. The fixture and widgets were removed after verification. No Twitch credentials or synchronization were used, so no live Twitch operation is claimed. OBS's temporary WebSocket authentication and CA trust configuration were restored after testing; OBS remains installed. The active isolated Compose stack is kept running for the operator, with database and bot healthy, and test widgets are absent.

Certificate installation documentation uses a quoted absolute path (`"$PWD/.local/localhost-ca.crt"`) for Linux and macOS shell commands and PowerShell `Resolve-Path` for Windows, so project directories containing spaces are handled. The Linux `install -D` copy was executed to a temporary path containing spaces and compared byte-for-byte with the source CA. The privileged `sudo` trust-store command could not be run in this session because no interactive sudo credential prompt was available; the operator separately reported successfully running that exact absolute-path command. Windows/macOS host certificate import commands have not been executed here and remain explicitly unverified.

Final engineering gates passed on 2026-10-06: `npm run lint`, `npm run typecheck`, `npm test` (472 tests / 69 files), `npm run review:static` (0 findings / 56 JavaScript application files), `npm run validate:version` (`v0.5.0-0000000-alpha`), Prisma schema validation with a synthetic local URL, isolated Compose config validation, `npm audit --omit=dev --audit-level=low` (0 vulnerabilities), and `git diff --check`. `npx vitest run tests/unit/fnd7-documentation-contract.test.js` passed (5 tests); the matching install operation passed its temporary path-with-spaces check. No authorized Twitch account was used; no Twitch writes or live-channel behavior are claimed.

Independent AIOX QA PASS 9.2/10 is recorded in the story. FND-7 is Done; live Twitch behavior and Windows/macOS certificate/OBS compatibility remain unverified.
