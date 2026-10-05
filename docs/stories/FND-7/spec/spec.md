# Spec: OBS Overlay Widgets

> **Story ID:** FND-7  
> **Generated:** 2026-10-05  
> **Complexity:** COMPLEX (17/25)  
> **Pipeline Phases:** Gather → Assess → Research → Write → Critique 1 → Revise → Critique 2 → Plan

## 1. Overview

### 1.1 Summary

Add a local OBS overlay feature to the existing Genshin Impact Twitch queue application. The streamer configures independent widgets in the protected local panel and adds each widget's individual URL as an OBS Studio Browser Source. Widgets display a selected public operational value or fixed custom text, update within two seconds, and use a configured fallback when no value is available. During a transient connection failure, the last value stays visible with a stale marker until recovery.

This is a separately tracked post-MVP addition that explicitly extends the original FND-0 scope. It remains a single-broadcaster local product: the bot, panel, and OBS run on the same computer.

### 1.2 Goals

- Create, preview, edit, and remove separately styled overlay widgets.
- Display current Genshin account label; a selected queue's name and state; waiting count; called viewer and position; in-service viewer; or custom fixed text.
- Generate one local, read-only, independently revocable OBS URL per widget.
- Update live values within two seconds; show fallback for empty values, and mark the last value stale during a transient outage until recovery.
- Keep administrative controls, Twitch credentials, UIDs, and unrelated widget data out of the OBS surface.
- Give the streamer complete per-widget visual controls and bilingual OBS setup instructions.

### 1.3 Non-Goals

- Public hosting, remote access, LAN use, tunnels, cloud storage, telemetry, or an additional service/container.
- An OBS plugin, scene control, source creation API, or control of OBS itself.
- Viewer signup, UID display/verification, rankings, arbitrary HTML/JavaScript/CSS, remote fonts, or arbitrary remote assets.
- A combined multi-field layout; one widget and one browser URL represent one selected value or fixed text.
- Changing queue, account, call, reward, or financial state from the overlay link.
- Defining finished visual presets before the UX refinement.

## 2. Requirements Summary

### 2.1 Functional Requirements

| ID | Requirement | Priority | Traceability and acceptance |
| --- | --- | --- | --- |
| FR-1 | Create, edit and delete independent widgets, each with exactly one atomic allowlisted field or fixed text, optional queue scope, style and fallback. | P0 | requirements.json FR-1 GWT AC-1/AC-12; story AC-1/AC-6 |
| FR-2 | Offer current Genshin account label, selected queue name, selected queue state, selected queue waiting count, called viewer display name, called viewer position, or in-service viewer display name, or fixed text. | P0 | requirements.json FR-2 GWT AC-1/AC-5; story AC-1/AC-5; atomic fields only |
| FR-3 | Configure text/background colors, opacity, allowlisted font, size/weight/alignment, outline/shadow, dimensions/margins/overflow, and fallback/fixed text up to 240 Unicode code points. | P0 | requirements.json FR-3 GWT AC-3/AC-10; story AC-3 |
| FR-4 | Preview; receive newly issued URL once at create/regenerate; copy, revoke and regenerate each widget URL independently of source/style. | P0 | requirements.json FR-4 GWT AC-2/AC-6; story AC-2/AC-6 |
| FR-5 | Update live values within two seconds; use fallback for empty fields, stale-mark the last value during transient outage, and clear on 401/403. | P0 | requirements.json FR-5 GWT AC-7/AC-11; story AC-4/AC-7 |
| FR-6 | Serve browser page and read-only projection through existing application/domain services. | P0 | requirements.json FR-6 GWT AC-13/AC-8; story AC-5/AC-8 |
| FR-7 | Restrict each local link to read-only access to one widget, with revocation and no administrative privilege. | P0 | requirements.json FR-7 GWT AC-14/AC-15; story AC-2/AC-6/AC-8 |
| FR-8 | Document OBS setup and lifecycle in English and pt-BR. | P1 | requirements.json FR-8 GWT AC-9; story AC-9 |

Every FR acceptance statement is specified in requirements.json as Given/When/Then text, not as an unresolved AC pointer.

### 2.2 Non-Functional Requirements

| ID | Category | Requirement | Target / source |
| --- | --- | --- | --- |
| NFR-1 | Performance | State changes become visible in OBS. | ≤2 seconds, normal local operation; requirements.json NFR-1 / FR-5 |
| NFR-2 | Security | Capability is read-only and widget-scoped; raw secret is returned only once during issue/regenerate; UIDs, credentials, sessions and unrelated data are excluded. | Server-enforced and migration-backed; requirements.json NFR-2 / CON-4 |
| NFR-3 | Usability | Transparent source, configured viewport, no scrollbars, per-widget preview. | OBS Browser Source; requirements.json NFR-3 / R-1 |
| NFR-4 | Reliability | Empty values use fallback; transient failures show last value with stale marker and retry; invalid/revoked capability clears it. | requirements.json NFR-4 / FR-5 |
| NFR-5 | Safe rendering | Text and style are constrained; no HTML/script/arbitrary CSS or remote assets. | requirements.json NFR-5 / CON-2 |
| NFR-6 | Accessibility | Labeled keyboard-operable controls, visible focus, and readability preview before link copy. | requirements.json NFR-6 / phase-0 UX gate |

### 2.3 Constraints

- **[CON-1] Local product:** one broadcaster and one installation; no hosted service, LAN access, or external overlay runtime.
- **[CON-2] Existing stack and safe rendering:** apps/web, apps/api, Fastify, PostgreSQL/Prisma, vanilla JavaScript; no added dependency without demonstrated need; reject arbitrary executable markup/styles.
- **[CON-3] Shared business logic:** routes call application/domain services and policy-aware projections.
- **[CON-4] Capability handling:** one secret per widget; no secret in HTTP path/query, logs, caches, referrers or raw persisted value; the authenticated create/regenerate mutation may return the secret-bearing URL once; the OBS projection never returns it; allow immediate revoke/regenerate.
- **[CON-5] Scope governance:** explicit user-approved post-MVP extension; FND-0 remains historically accurate.
- **[CON-6] Operator surface:** use the approved mutable local panel; no separate product CLI for overlay management.
- **[CON-7] Upstream gate:** FND-5 and FND-6 must be fully complete; verify all field projections and panel/security primitives before any FND-7 implementation. Do not substitute a reduced field set.

### 2.4 Assumptions

- **[ASM-1–ASM-4]** Same-computer OBS availability, app/database operation, one field per widget, local safe fonts, and the Genshin account label interpretation follow requirements.json.

- OBS Studio Browser Source is available and loads the local app on the same computer.
- The application/database run while OBS displays the widget; empty values use the configured fallback, while transient failures retain the last value with a visible stale marker until recovery.
- A widget has one data field or fixed text, one optional queue scope, one style, and one independently revocable link. Duplicate widgets are allowed. Deletion commits atomically with capability invalidation.
- Use generic/local system font stacks; no external font download is needed.
- The visible account value is the Genshin account label managed by existing account functionality, not the Twitch broadcaster's credential or ID.

## 3. Technical Approach

### 3.1 Architecture Overview

**Traceability:** FR-1/FR-2/FR-5/FR-6/FR-7, NFR-1/NFR-2/NFR-4, CON-1/CON-3/CON-4.

Add overlay management to the existing protected operator panel, persistence for widget configuration and a per-widget capability hash, a same-origin local Browser Source page, and a read-only data route. The browser page obtains its source value through an explicit field projection resolved by the existing application/domain layer. It must not read Prisma records directly or reconstruct queue/account rules.

The page URL includes an opaque widget identifier and a random secret in the URL fragment. Client-side code reads the fragment into memory, removes it from the visible address after bootstrap where supported, and sends the secret only in an Authorization header to the same-origin read-only endpoint. The authenticated management create/regenerate mutation returns the new secret-bearing URL once for immediate display/copy; no later read endpoint can recover the raw secret, and the OBS read-only projection endpoint never returns it. Editing source/style does not rotate the capability. The server stores only a cryptographic hash, validates the widget scope, never logs the header, sends Cache-Control: no-store and Referrer-Policy: no-referrer, and rejects the token after revocation/regeneration. The fragment is not sent in HTTP requests, but the full link remains visible in OBS settings and copied text; anyone who obtains it can read that widget until revocation.

Poll at an interval that allows the two-second propagation requirement (nominally once per second). On an empty result, render the configured fallback. On a transient network/server failure, retain the last value only with a visible stale marker, retry automatically, and replace it on recovery. If initial fetch fails before any value, show a neutral unavailable state. A successful empty projection shows configured fallback. On invalid/revoked capability (401/403) or unknown/deleted widget (404), clear the value on that response. Render all data as text. Validate both UI and API against this bounded style contract: text/background color #RRGGBB; opacity 0–100%; font stack enum system-ui, Arial/sans-serif, Verdana/sans-serif, Georgia/serif, or Courier New/monospace; integer size 8–128px; weight 300/400/500/600/700/800/900; alignment left/center/right; effect none/outline/shadow; outline 1–8px; shadow blur 0–32px and x/y offsets −32..32px; width auto or 1–3840px; height auto or 1–2160px; per-side margin 0–256px; overflow wrap/clip/ellipsis. Do not accept arbitrary CSS.

The overlay host is the loopback address 127.0.0.1 and the configured application port. The protected panel chooses one atomic field; queue-scoped fields require exactly one selected queue. OBS receives only a widget-scoped projection. The page uses a transparent background and no external requests.

### 3.2 Key Decisions

**Traceability:** FR-4/FR-7, NFR-2/NFR-5, CON-2/CON-4; technical basis R-1/R-2/R-3 in research.json.

- One widget per URL, to match the request for separately selectable OBS elements; the source catalog fields are atomic, not hidden field combinations.
- Capability-based read access because OBS Browser Source does not use the operator's interactive session; no administrative cookie or API key is reused.
- Secret appears in the URL fragment for one-time link handoff, then client JS sends it in an Authorization header, never in the HTTP request target. RFC 6750 supports the Authorization header and warns against URI query tokens; a fragment still remains visible in OBS configuration/copy-paste and is a revocable local secret, not risk-free.
- Immediate token revocation and replacement, because copied links cannot be recalled. Creation/regeneration returns a URL exactly once; the panel must offer regeneration instead of reading back the hashed secret.
- Configured fallback for empty values; transient connection failures retain the last value with a visible stale marker, while invalid/revoked capabilities clear the value.
- Generic/local fonts and validated style properties only; no arbitrary CSS or remote resource loading.
- Reuse the existing static web assets, Fastify process and PostgreSQL persistence; no new runtime dependency or service.

### 3.3 Patterns to Use

- Existing application/domain services and safe route projections.
- Existing authenticated, CSRF-protected panel mutation patterns for create/edit/revoke actions.
- Existing PostgreSQL/Prisma migration and isolated database integration-test conventions.
- Static vanilla JavaScript page with same-origin fetch, safe text rendering, and explicit cache/referrer/CSP headers.
- Red → Green → Refactor per behavior, with real PostgreSQL migrations for persistence/security guarantees.

### 3.4 Implementation Strategy

1. Gate: require FND-5 and FND-6 to be fully complete before any FND-7 implementation. Then verify every account, queue, call and service projection in the live codebase. No reduced P0 field set is allowed.
2. Write failing tests for field catalog, safe projections, style validation, persistence and token scope/revocation before implementation.
3. Add widget configuration and token-hash persistence with a real versioned migration; keep widget edits and token rotations auditable.
4. Add protected management API and a read-only, widget-scoped overlay API; test Host/Origin, session/CSRF for management and token-only access for OBS.
5. Build the overlay renderer and live refresh/fallback behavior; test injection, no-store headers, and ≤2 second propagation.
6. Add panel configuration, preview, copy/revoke/regenerate controls; complete UX review before coding these controls.
7. Verify the browser source manually in supported OBS environments; document tested environments and any limits in both languages.

## 4. Dependencies

### 4.1 External Dependencies

| Name | Version | Purpose | Verified |
| --- | --- | --- | --- |
| OBS Studio Browser Source | Current supported release | Load local overlay URL with viewport and transparent CSS. | Official OBS documentation reviewed 2026-10-05 |
| RFC 6750 | Standards Track | Authorization header and URI bearer-token leakage guidance. | RFC Editor source reviewed 2026-10-05 |

No new npm runtime or test dependency is indicated.

### 4.2 Internal Dependencies

- apps/api/src/domain/ and apps/api/src/persistence/: existing account, queue, and entry application/domain operations.
- apps/api/src/http/ (or current route registration): protected management endpoints, safe projections and host/origin security.
- apps/web/: existing vanilla JS panel and local static assets.
- apps/api/prisma/: schema and real PostgreSQL migrations.
- FND-2 queue rules; FND-5 current-account/call state; FND-6 local panel/session/security foundations.

### 4.3 Unverified Claims

- The two-second end-to-end refresh target must be measured against the running app and isolated PostgreSQL.
- Manual OBS verification is still required on the supported operating systems; official feature availability alone does not prove this application's URL works in every installation.
- Default style preset, colors and exact font menu remain for UX refinement; no external font dependency should be added.

## 5. Files to Modify/Create

### 5.1 Expected New Files

Final paths to be confirmed against the current source tree during story implementation:

- apps/web/overlay.html and its local renderer module/style.
- apps/api/src/http/overlay-routes.mjs or the existing route module.
- apps/api/src/domain/overlay-widget.mjs and projection/style validation modules.
- apps/api/src/persistence/overlay-widget-repository.mjs.
- One Prisma schema update and versioned SQL migration.
- Unit, PostgreSQL integration, HTTP security, and browser acceptance tests.
- Bilingual overlay setup documentation and story evidence.

### 5.2 Modified Files

- API bootstrap/route registration.
- Existing panel navigation and settings UI.
- Prisma schema/migration index as required.
- docs/stories.md, docs/pt-BR/stories.md, relevant bilingual user/integration docs.
- Package scripts only if a new targeted test command is needed; no dependency change expected.

### 5.3 Deleted Files

None expected.

## 6. Testing Strategy

### 6.1 Unit Tests

- Validate fixed/fallback text to 240 Unicode code points with identical browser/server counting.
- Verify each source field is atomic and composed fields are not inferred.

- Allowlisted source field and queue-scope validation; fallback-text length and Unicode handling.
- Strict style input validation, bounded values, invalid CSS/font rejection.
- Safe text rendering and formatting for missing, long, and special-character values.
- Cryptographically random token generation, hash-only persistence contract, widget scope and revocation/rotation.

### 6.2 Integration Tests

- Real isolated PostgreSQL and actual Prisma migration for widget CRUD, token hash persistence, replacement, revocation, atomic delete/capability invalidation and concurrent read/delete.
- Fastify tests prove protected management routes, read-only scoped endpoint, wrong/missing/revoked token rejection, no session leakage, no UID/secret/cross-widget disclosure, no-store/referrer headers, safe Host/Origin handling and no mutation path through OBS.
- Shared application service projection tests prove account/queue/call consistency and policy compliance.

### 6.3 E2E Tests

- Browser test covers create → preview → save → load widget URL → update source value → observe update within 2 seconds → fallback on empty → stale marker on transient error → recovery → revoke/replace. Run eight concurrent widgets on mixed dynamic fields; measure commit-to-rendered-DOM for ten consecutive changes, each ≤2s, and record test environment.
- Injection payload in fixed text, fallback and source values renders as inert text.
- Tests run against the real local app and isolated migrated PostgreSQL; mocks alone do not prove database or route security.

### 6.4 Manual Verification

- UX reviewer approves the documented journey, loading/error/empty states, keyboard/label/focus behavior, readability preview, font allowlist and design consistency before UI implementation.

- Add a widget URL as OBS Studio Browser Source; confirm transparent background, dimensions, no scrollbars, legible styling and live update.
- Verify link remains local, source shows the last value marked stale when the bot stops, then recovers after restart, and replacement link works after recovery.
- Test on each supported OS before claiming compatibility; do not claim a native Windows/macOS/Linux test unless actually executed.

## 7. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Capability URL is copied or exposed. | Keep secret out of the HTTP request target and use Authorization header; store only hash; issue once; no logs/cache/referrers; provide immediate revoke/rotate and explain that OBS config/copies are sensitive. |
| An overlay endpoint bypasses privacy or exposes extra fields. | Explicit field catalog/projection, no UID fields, tests assert exact response keys and prevent cross-widget reads. |
| Stale viewer or account is shown during API failure. | Show configured fallback for empty data; during transient network/server failure, retain the last value with a visible stale marker and retry; clear immediately for revoked/invalid capability. |
| Malicious text or styling breaks out of widget. | Render text nodes; schema-validate styles; reject HTML, script, arbitrary CSS and remote URLs. |
| Frequent polling harms runtime or misses the SLA. | Poll no slower than once per second, bound response to one widget, measure from committed source change to rendered value for each active widget under a documented local test setup, and test realistic 8 concurrently active widgets in the local acceptance run. |
| Browser Source differs by OS/version. | Use documented standard Browser Source capabilities; record manual acceptance per supported platform. |

## 8. Open Questions

- UX refinement must choose the initial default style/preset and exact safe font menu, then record the choice before panel UI implementation.
- The 240-code-point limit and shared browser/server counting rule are defined; validate implementation against boundary cases.
- FND-5 and FND-6 must complete their relevant application projections and protected panel/session/CSRF/Host-Origin foundations before any FND-7 implementation begins.

## 9. Implementation Checklist

**Traceability:** FR-1–FR-8, NFR-1–NFR-6, CON-1–CON-7, R-1–R-3.

- [ ] Verify source projections and upstream FND-5/FND-6 readiness.
- [ ] Complete UX refinement of defaults/font allowlist before panel UI.
- [ ] Write and observe Red tests before each field, persistence, security, renderer, and panel implementation increment.
- [ ] Use an isolated real PostgreSQL database and actual migration tests for widget/token lifecycle.
- [ ] Verify per-widget access, secret handling, no-store, no-referrer, safe text/style rendering, fallback/stale/revocation states.
- [ ] Measure the two-second update target in an end-to-end run.
- [ ] Manually verify OBS Browser Source and document only tested OS/version combinations.
- [ ] Update bilingual guides, story checklist/file list, and record exact test commands/results before marking done.

## Metadata

- **Status:** Spec draft revised; awaiting second critique and implementation plan.
- **Source:** User request and explicit AIOX Gather elicitation answers, 2026-10-05.
- **Research:** R-1 official OBS Browser Source page, R-2 RFC Editor RFC 6750, and R-3 repository internal-boundaries/source tree.
- **No implementation or tests have been performed for FND-7.**
