# Spec: Hierarchical chat-command permissions and Twitch audience roles

[Português brasileiro](../../../pt-BR/stories/OPS-7/spec/spec.md)

> **Story ID:** OPS-7 (GitHub issue #39)
> **Complexity:** COMPLEX (24/25)
> **Planning date:** 2026-10-07
> **Status:** Implementation and local quality gates complete; independent QA passed 10/10. See `../story.md`, `../tdd-log.md`, and `../qa/qa-report.md`. Live Twitch verification was not performed.

## 1. Overview

Replace the command catalog's explicit role allowlists with a minimum-role policy that inherits access upward. Add a distinct follower criterion verified against Twitch Helix, while keeping subscriber status based on the current chat event badge. Preserve fixed streamer/moderator boundaries, localize role labels, and upgrade existing settings without changing their effective permissions on startup.

The role order is a product permission ladder, **not** a Twitch-defined hierarchy:

| Rank | Canonical role ID | English label | pt-BR label | Spanish label | Evidence |
| ---: | --- | --- | --- | --- | --- |
| 0 | `everyone` | Everyone | Todos | Todos | No role claim required |
| 1 | `follower` | Followers | Seguidores | Seguidores | Current Helix query |
| 2 | `subscriber` | Subscribers | Inscritos | Suscriptores | Current target-channel message badge |
| 3 | `vip` | VIPs | VIPs | VIPs | Current badge and existing VIP toggle |
| 4 | `moderator` | Moderators | Moderadores | Moderadores | Current target-channel message badge |
| 5 | `streamer` | Streamer | Streamer | Streamer | Exact configured broadcaster user ID; fixed |

`Everyone` is the lowest threshold. A selected minimum grants the command to that group and every higher verified group. A sender can hold overlapping claims; the resolver uses the highest claim valid for the current decision. Subscriber and follower remain two separate criteria. Labels are localized and do not create duplicate role IDs.

## 2. Goals and non-goals

### Goals

- Let the streamer choose a command's minimum audience level and preview the full inherited audience.
- Make the panel, `!fila comandos` / `!queue comandos` / `!cola comandos`, and server authorization use one policy resolver.
- Add current follower verification with the least OAuth permission needed.
- Preserve legacy saved policies and all fixed command boundaries.
- Keep local product content localized without translating streamer-authored queue names, reward text, or templates.

### Non-goals

- Follower duration/tenure, subscriber tenure, subscription tier, gift-sub history, or paid-vs-Prime distinctions.
- Persisting followers or role membership, adding a follower database/cache, or using `channel.follow` events as a current membership source.
- Changing the command catalog beyond correcting the owner-approved account-command lock and localizing existing role labels.
- Granting follower access to queue-management operations or changing queue/financial behavior.
- Adding new Twitch scopes beyond the specifically approved optional `moderator:read:followers` scope.

## 3. Requirements and acceptance

The normative requirements are FR-1–FR-12, NFR-1–NFR-5, and CON-1–CON-6 in `requirements.json`. Acceptance criteria AC-1–AC-17 are the implementation gate. In particular:

1. Every configurable command stores exactly one minimum access level (`everyone`, `follower`, `subscriber`, `vip`, or `moderator`). The broadcaster retains identity-based access to configurable commands; the effective audience is computed by the same pure resolver used by chat authorization and help, and broadcaster identity is never client supplied. Streamer-only behavior is reserved for immutable commands.
2. Fixed command access is immutable: queue-management actions and `!queue ping` require streamer/moderator; `!conta <name>` and `!conta reset` require the broadcaster identity only.
3. VIP is a role claim only while the existing VIP-management toggle is enabled. Independent subscriber, moderator, or streamer evidence remains valid when that toggle is disabled.
4. Use current target-channel chat badges for moderator, VIP, and subscriber. `source_badges`, message text, display name, login, request-body roles, and previous events never grant access.
5. Follower membership uses a current Helix check for the exact event `user_id`. Check scope and token identity before interpreting `data: []` as a confirmed non-follower. Any unresolved check fails closed for that command and creates no mutation, outbox task, account read, queue read, or financial action.
6. Request the follower scope only after the streamer attempts to use a follower threshold. Authorization is session-bound and validates the actual returned token scopes, Client ID, broadcaster ID, and OAuth state. Rejected/failed consent leaves the previous usable credential and policy intact.
7. Existing version-1 allowlists remain `legacy_exact` on upgrade. They are not converted implicitly. The panel shows their current effective roles and proposes a new minimum threshold; conversion occurs only after explicit save for the edited command.
8. Help is bounded to 500 characters and filters using the same current effective access policy. If follower verification is unavailable, follower-only commands are omitted and the response uses localized safe wording.
9. All implementation increments follow Red → Green → Refactor. PostgreSQL guarantees use an isolated real PostgreSQL instance and actual migrations; mocks are limited to Twitch/network boundaries.

## 4. Architecture

### 4.0 Dependencies, files and rollback boundary

- Runtime dependencies stay at the versions already pinned in `package-lock.json`: `@twurple/api`, `@twurple/auth`, and `@twurple/eventsub-ws` 8.2.0, Prisma/PostgreSQL and the existing vanilla web stack. No new package, service, database table, or Twitch subscription is planned. Recheck declarations/official docs if the lockfile changes before implementation.
- Expected existing files to inspect/update: `apps/api/src/commands/catalog.mjs`, `authorization.mjs`, `chat-handler.mjs`, `help.mjs`; `apps/api/src/twitch/oauth.mjs`, `auth-runtime.mjs`, `helix-adapter.mjs`, `eventsub-runtime.mjs`; `apps/api/src/persistence/queue-repository.mjs`; `apps/api/src/http/queue-routes.mjs`; `apps/web/app.js`, `command-catalog-view.mjs`, `index.html`, `styles.css`, chat/panel locale TSVs; `tests/unit/command-catalog.test.js`, `command-authorization.test.js`, `chat-command-handler.test.js`, `command-help.test.js`, `queue-routes.test.js`, `twitch-oauth.test.js`, `twitch-adapter.test.js`, `eventsub-runtime.test.js`; and `tests/integration/command-policy-persistence.test.js` plus any new narrowly scoped tests. Files may be removed from or added to the final story file list only with a documented reason before changing them.
- No destructive migration is expected: keep the version-1 JSON readable and preserve its value until a command is explicitly converted. If v2 write or runtime validation fails, stop the policy write and keep the prior JSON. Rollback deploys the previous application code; it must not rewrite v2 records into guessed v1 allowlists. A subsequent compatible version reads v2 minimum policies and `legacy_exact`; if a prior binary cannot safely read v2, disable writes/conversion until the compatible binary is restored rather than downgrade persisted data.
- Optional OAuth consent uses a staged credential handoff: validate the callback grant for the same client/broadcaster and required+optional scope, then atomically replace the active credential and save the selected policy/revision. Any error before commit discards the staged grant and leaves the active credential and policy untouched. This boundary must be tested with real PostgreSQL transaction behavior plus OAuth fakes.

### 4.1 Policy data and pure domain resolver

The existing `chat_command_policies` Setting is JSON `{ version, policies }`, where policy values are arrays. Introduce a versioned v2 representation without requiring a new service or table:

```json
{
  "schemaVersion": 2,
  "revision": 2,
  "policies": {
    "queue:lista": { "mode": "minimum_role", "minimumRole": "follower" },
    "queue:posicao": { "mode": "legacy_exact", "allowedRoles": ["subscriber", "moderator"] }
  }
}
```

The stored envelope uses `schemaVersion` and `revision`; the API projection names the concurrency revision `version`. Keep schema version separate from concurrency revision; neither is `product_version` or the API contract version.

- Parse/validate every policy shape and fail closed for malformed or unknown values.
- Read legacy arrays as `legacy_exact` without rewriting the database on startup. Their former OR semantics remain until that specific command is explicitly converted.
- New/default policies use `minimum_role`. Existing defaults for public/self-service commands map to `everyone`; fixed commands continue to come from the canonical registry, not mutable persistence.
- A policy update writes the selected command, increments policy revision, and records actor, origin, command ID, old/new mode and threshold in one PostgreSQL transaction.
- Do not write user role claims, follower results, raw Twitch responses, message text, or OAuth values to audit details.
- The pure resolver receives a canonical definition, validated policy and verified role evidence. External follower lookup occurs in a Twitch service before calling the pure resolver; no network call or database mutation happens inside the pure function.

### 4.2 Trusted role evidence

Resolve claims in this order, using the highest current valid rank:

1. `streamer`: `message.userId === configuredBroadcasterId`.
2. `moderator`: current event `badges` contains `moderator` for the target channel.
3. `vip`: current event `badges` contains `vip`, and `allowVipManagement === true`.
4. `subscriber`: current event `badges` contains `subscriber` for the target channel.
5. `follower`: only if a current Helix membership check succeeds for the event's Twitch user ID.
6. `everyone`: baseline; does not require a network claim.

The ordering is a product access policy. Twitch badges can overlap and are not inherently a strict ladder. A VIP who is not a subscriber still satisfies a subscriber-minimum command because the product has placed VIP higher; with the VIP toggle disabled, the VIP claim is ignored. A moderator remains higher than VIP and subscriber. `everyone` policies never require follower verification.

Reject wrong-channel events and the existing foreign Shared Chat source condition before any Twitch lookup or command side effect. Use the current Twurple EventSub `badges` object map and retain normalized-array compatibility only at the existing adapter/domain boundary.

### 4.3 Follower verification and OAuth scope

Use the installed `@twurple/api@8.2.0` adapter method `api.channels.getChannelFollowers(broadcasterId, eventUserId)`, corresponding to `GET /helix/channels/followers?broadcaster_id=...&user_id=...`.

- Authenticate with the install's broadcaster user token. Confirm broadcaster/client identity and current `moderator:read:followers` scope through the existing token/auth-provider state before using the API result.
- Return a tri-state result: `follower`, `not_follower`, or `unknown`; never collapse request failure, missing scope, unauthorized response, malformed response, timeout, or rate limit into `not_follower`.
- Confirm a positive row has exactly the requested Twitch user ID. Never authorize by login/display name.
- Query only after a recognized command needs follower evidence. Known higher claims can bypass the follower query. Help may perform at most one required check for its sender; if it is unknown, list only commands proven available below follower and explain that follower access could not be confirmed.
- Do not use a completed follower-result cache. Concurrent in-flight checks for the same broadcaster/user may be coalesced; the next independent command performs a fresh check. Do not persist membership or response payloads.
- Do not add a new EventSub subscription for follower status. `channel.follow` reports new follows, not current membership or unfollows.
- Follow status errors are sanitized in logs. For 429, respect Twitch rate-limit reset information and do not retry aggressively; for unresolved authorization, fail closed. Do not expose technical errors/tokens to chat.
- The current required scope list remains unchanged. When a streamer chooses a follower-level policy without the optional scope, the panel starts a session-bound OAuth authorization with the existing required scopes plus `moderator:read:followers`. The callback validates the actual granted scopes. Only after successful validation may the policy save complete. A denied/failed callback must not replace the old token or policy.
- If the optional scope later disappears, disable only follower-based policy use and show a reconnection/reauthorization action; do not mark unrelated chat or queue functions unavailable solely because of this optional capability.

### 4.4 Fixed policy matrix

| Commands | Minimum/fixed audience | Editable? |
| --- | --- | --- |
| Queue management: add, remove, next, attend, complete, move, open/close, clear preview/confirm | Moderator (streamer inherits) | No |
| `!conta <name>` and `!conta reset` | Streamer identity only | No |
| `!queue ping` / localized root equivalent | Moderator (streamer inherits) | No |
| Public read, self-service, and command-discovery definitions | Configurable minimum; current defaults stay `everyone` | Yes |

The canonical registry is the source of immutable audience rules. Reject any HTTP payload that targets a fixed command before persistence. Update the existing `global:conta:set` and `global:conta:reset` rules/tests to meet the explicit streamer-only contract, even though the current OPS-3 catalog/tests still permit moderators.

### 4.5 Panel, API, chat help, localization

- Continue using the authenticated local panel routes, session, CSRF, idempotency key, schema validation, and optimistic policy revision.
- The command API returns a safe projection: command ID, localized text/syntax, policy mode, minimum role, effective inherited roles, fixed audience, legacy review state, follower-scope readiness, and policy revision. Do not serialize Prisma rows or tokens.
- For each configurable command, the panel offers one minimum-role choice and previews the inherited set (e.g. “Subscribers and above”: Subscribers, VIPs, Moderators, Streamer). Fixed rows are visibly locked. Legacy exact rows show the current role set and the proposed new effective set before the streamer saves conversion.
- Chat help uses language catalog keys for role labels and localized command roots from FND-8. The product maps `subscriber` to English `Subscribers`, pt-BR `Inscritos`, Spanish `Suscriptores`; `follower` to English `Followers`, pt-BR `Seguidores`, Spanish `Seguidores`. These are separate canonical role IDs.
- User-authored queue slug/title/reward/template remain unchanged. All user-controlled text remains rendered via `textContent` and safe bounded chat output.
- Viewer cooldown continues for every non-moderator/non-streamer command sender, including followers, subscribers and VIPs; only permitted management actors are exempt. Do not grant cooldown exemption merely because a user is VIP/subscriber/follower.

## 5. Twitch and Twurple research

Consulted 2026-10-07; exact endpoint, scope, SDK method, and current installed declarations are recorded in `research.json`.

| Operation | Twitch endpoint/event | Scope | Adaptation |
| --- | --- | --- | --- |
| Read current moderator/VIP/subscriber badges | EventSub `channel.chat.message` v1 | Existing `user:read:chat` | Twurple 8.2.0 exposes target `badges` as an object map; read per event and never persist. |
| Verify a current follower | `GET /helix/channels/followers?broadcaster_id={broadcaster}&user_id={chatter}` | Optional `moderator:read:followers` user scope; token user must be the broadcaster or a channel moderator | Twurple 8.2.0 `api.channels.getChannelFollowers(broadcaster, user)`; verify current token scope before interpreting empty `data`. |
| Observe new follower only | EventSub `channel.follow` v2 | `moderator:read:followers` | Not used for authorization; it is not a current membership check. |
| Validate OAuth token and granted scopes | `GET https://id.twitch.tv/oauth2/validate` | Token validation contract | Existing startup/hourly validation; verify exact configured Client ID/broadcaster and current scope set. |

### Research sources

- [Twitch — Sending and Receiving Chat Messages](https://dev.twitch.tv/docs/chat/send-receive-messages/)
- [Twitch — EventSub Reference](https://dev.twitch.tv/docs/eventsub/eventsub-reference/)
- [Twitch — EventSub Subscription Types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Twitch — Helix API Reference, Get Channel Followers](https://dev.twitch.tv/docs/api/reference)
- [Twitch — OAuth Scopes](https://dev.twitch.tv/docs/authentication/scopes/)
- [Twitch — Validating Tokens](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [Twitch — API Rate Limits](https://dev.twitch.tv/docs/api/guide)
- [Twurple 8.2.0 — HelixChannelApi](https://twurple.js.org/reference/api/classes/HelixChannelApi.html)
- [Twurple 8.2.0 — RefreshingAuthProvider](https://twurple.js.org/reference/auth/classes/RefreshingAuthProvider.html)
- Installed Twurple declaration: `node_modules/@twurple/eventsub-base/lib/events/EventSubChannelChatMessageEvent.d.ts` (`badges: Record<string,string>`, `sourceBadges: Record<string,string> | null`).

## 6. TDD test strategy

Every item is a behavior increment, and its first implementation artifact must be a failing behavioral test. Record the exact Red command/failure, Green result, and relevant Refactor rerun in the paired story docs. Do not use a mock to prove a PostgreSQL guarantee.

1. **Role ladder:** table-driven tests for all minimum/actual role combinations, overlaps, streamer identity, VIP toggle on/off, and monotonic inherited access. Verify no login/display-name/body role can grant access.
2. **Fixed commands:** catalog, route-payload, chat and direct service tests for queue management=moderator+, account set/reset=streamer-only, ping=moderator+, and denial-before-side-effect.
3. **Badge/EventSub adapter:** current target badges, Twurple object map, normalized arrays, `sourceBadges` ignored, current-event-only behavior, wrong target and foreign Shared Chat.
4. **Follower adapter:** positive exact user ID; non-follower with valid scope; missing scope; missing/invalid broadcaster identity; empty response ambiguity; wrong user row; thrown request; timeout; 401; 429/reset; 5xx; malformed response; current-scope change; no data/log/audit persistence.
5. **Conditional lookup:** no request on unrelated/non-command input, `everyone` policy, known subscriber/moderator/streamer qualification, or threshold a known role cannot reach; one in-flight request for simultaneous same user; no completed stale cache.
6. **No unintended effect:** for follower unknown/denied, prove no queue lookup/mutation, account lookup/mutation, redemption effect, outbox insert, or command-success chat message. Verify unrelated everyone commands continue when Helix fails.
7. **Help and cooldown:** global/localized and queue-specific help, unknown follower result, hidden follower-only commands, tier inheritance, exact 500-character boundary, and five-second cooldown for follower/subscriber/VIP but not streamer/moderator.
8. **Policy storage compatibility:** isolated real PostgreSQL with actual migrations; load v1 array policies; process restart; ensure same effective legacy decision; save one command as v2 minimum; preserve other legacy entries; transactional audit and optimistic revision conflict; malformed JSON fail closed. Do not rewrite v1 settings during startup.
9. **Protected API/panel:** session and CSRF, idempotency/revision, unknown roles, fixed command mutation rejection, safe DTO, inherited-audience preview, legacy conversion preview, localized role labels, safe text rendering and scope-readiness state.
10. **OAuth optional scope:** state is single-use, short-lived and bound to panel session; requested scope set is minimal; callback ignores query-supplied scope; validate token/client/broadcaster/current scopes; denial/missing scope/error preserves prior token and policy; valid same-channel grant works; channel/client switch remains blocked.
11. **Security and observability:** no access/refresh token, user role snapshot, follower response, or raw Twitch error in logs, chat, URL, panel DTO, audit detail, or public state; sanitized reason and actionable panel status only.
12. **Document/version gates:** English and pt-BR parity for spec/story/integrations/changelogs; no stage promotion before OPS-7, OPS-8, FND-9, DOC-2; validate version policy without rewriting VERSION during tests.

Final story quality gates: focused tests after each increment; PostgreSQL integration suite; `npm run lint`; `npm run typecheck`; `npm test`; `npm run review:static`; `npm run validate:version`; Compose config; documentation parity; clean diff. Independent AIOX-QA implementation score must be 10/10 for Done. A real authorized Twitch follower lookup remains a separate validation fact and must not be claimed unless performed.

## 7. Risks and mitigations

| Risk | Severity | Mitigation / required test |
| --- | --- | --- |
| A saved explicit allowlist converts to a broader inherited audience | Critical | Keep legacy exact until per-command owner save; compare old/new effective audience in UI. |
| Empty Helix response is misread as non-follower despite missing scope | Critical | Validate current token scope/identity first; tri-state result; scope-omission test. |
| Helix is unavailable during follower check | High | Fail closed only for follower-dependent policy; no command/outbox effect; localized safe message. |
| Stale role evidence grants access | Critical | Read event badges per message; no completed follower cache; source channel rejected. |
| VIP toggle changes inheritance unpredictably | High | Treat VIP claim as absent if disabled; independent roles remain; full truth-table tests. |
| Existing account mutation accidentally remains moderator-accessible | Critical | Hard-lock to broadcaster identity in canonical definition and route; regression tests. |
| Follower check adds latency/rate use to ordinary commands | Medium | Resolve after parsing; check only when the threshold needs it; reuse only in-flight promises; respect rate reset. |
| Optional scope loss disrupts unrelated queue operations | High | Track follower capability separately; disable only follower-dependent policies until reauthorization. |

## 8. Implementation plan

The ordered, test-first workstreams and verification commands are in `plan.json`. Work begins only after this spec passes the two QA critique gates and is accepted as the OPS-7 implementation contract.

### Expected file map

The implementation story must confirm this expected list against each Red test and record the exact final paths, adding/removing files only with a reason. Planning artifacts are paired under `docs/stories/OPS-7/spec/` and `docs/pt-BR/stories/OPS-7/spec/`; story/status indexes, roadmap and integration decision records have bilingual pairs. Do not create an API, migration, package, or scope outside reviewed acceptance criteria.

## 9. Release sequencing

Owner-authorized sequence: OPS-7 → OPS-8 → FND-9 → DOC-2. The owner has conditionally authorized stage promotion to `beta` only after all four stories are complete. No story completion, PR, commit, test result, or implementation alone promotes `.release-stage`; when the entire sequence is done, follow the approved canonical `v1.0.0-HHHHHHH-beta` release/version workflow with @devops. Do not change stage or materialize a release during OPS-7 planning.

## 10. Open questions

None. Product decisions received during this planning session distinguish subscriber badge from follower status and approve optional follower scope. The hierarchy order and role labels are recorded above as explicit product policy.
