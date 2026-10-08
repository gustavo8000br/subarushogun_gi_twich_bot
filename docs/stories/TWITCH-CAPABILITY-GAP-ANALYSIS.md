# Twitch capability and story coverage audit

[Português brasileiro](../pt-BR/stories/TWITCH-CAPABILITY-GAP-ANALYSIS.md)

**Reviewed:** 2026-10-07 (UTC)<br>
**Workflow:** AIOX Planning / Spec Pipeline lenses — Gather, Assess, Research, Write, Critique, Plan<br>
**Purpose:** Compare official Twitch capabilities relevant to this product with every local story and published future issue. This is a planning/research record, not implementation authorization or a story status change.

## Conclusion

The product's core integration model is supported by Twitch's documented interfaces: a broadcaster-authorized local chat client can read chat through EventSub WebSocket and reply through Helix; eligible channels can use app-created Custom Rewards and manage their redemption status. The product correctly treats Channel Points as Twitch-owned, channel-specific points and does not calculate balances or create transfers.

The research found one concrete requirement gap inside FND-6: the original product specification requires native per-viewer-per-stream caps, per-stream caps, and global cooldown for each queue reward. The current Queue schema and reward adapter do not yet expose those settings. FND-6 already includes editing queue/reward settings, so refine that acceptance there; use Twitch's native settings and do not add competing local counters.

FND-9 separates chat connectivity from Channel Points reward capability and now covers three operator choices: app-created reward, Dashboard reward only after full lifecycle proof, and local/manual mode. Streamer/moderator can explicitly add a viewer for free to any active queue; free-form chat never auto-enrolls. A reward-backed queue may switch one-way to manual mode only after Twitch confirms pause; preserve and drain existing redemptions and durably cancel a redemption racing with conversion. Chat-only operation on an ineligible channel still needs authorized live validation.

For issue #17, subscriber/moderator/VIP information can be evaluated from the current chat EventSub message's trusted badge list. Follower eligibility is materially different: checking one viewer through Helix requires `moderator:read:followers`. Recommendation: exclude follower-gated access from the first command-catalog version unless the product owner explicitly approves the added scope and privacy implications. This is a product decision, not an implementation assumption.

## Workflow record

| Phase | Work performed | Result |
| --- | --- | --- |
| Gather | Inventoried local stories FND-0 through FND-7 and OPS-1/OPS-2; reviewed published GitHub issues #1–#7 and #17–#19; compared them with recorded product decisions and loose ideas. | Current backlog map below; FND-8/#18, FND-9/#19 and command catalog/#17 are published planning items. |
| Assess | Separated implemented/covered scope, current FND-6 acceptance gaps, future stories and capabilities that conflict with product constraints. | One concrete missing reward-configuration requirement; two future decisions/validation gates. |
| Research | Consulted official Twitch Helix, OAuth, EventSub, chat and Channel Points product documentation on 2026-10-06; checked the current repository schema, adapter and FND-9 research. | Findings and source links below and in `docs/integrations.md`. |
| Write | Recorded the story crosswalk, gap decisions and recommendations in English and pt-BR. | This report and its reciprocal translation. |
| Critique | Checked each proposed gap against the original Prompt 1 and existing issues; removed unrelated Twitch capabilities and ideas not needed for queue operation. | No new standalone story is justified by the research alone. |
| Plan | Keep active implementation on FND-6; include native reward limits in its existing settings work. Keep #17–#19 and FND-7 in their established sequence. | No issue was edited and no work was authorized by this audit. |

## Story and issue crosswalk

| Item | Current coverage/status | Twitch finding and gap decision |
| --- | --- | --- |
| FND-0 — product baseline | Historical MVP/planning baseline. | Core boundary remains coherent: local single-channel chatbot plus local operator panel; no hosted service, multi-channel mode, or second bot. |
| FND-1 — runtime/version/Compose | In progress only for native Windows retest after the Alpine/helper change; docs and runtime foundation are otherwise recorded. Issue #3 open. | Twitch feature research does not add an FND-1 gap. Keep local secrets, HTTPS callback, startup, and recovery acceptance as already specified. |
| FND-2 — queue domain | Done in local story and issue #2. | Twitch IDs, queue state, UID validation, authorization and PostgreSQL order are appropriately separated from provider payloads. No new gap found. |
| FND-3 — financial outbox | Done in local story and issue #5; real Twitch financial operation remains unverified. | Helix's terminal history is retained only for a few days; existing unknown-state handling and prompt to resolve old unrecoverable states are necessary. Do not claim network exactly-once. |
| FND-4 — OAuth, rewards, EventSub | Implementation complete and issue #4 closed; no authorized live-channel operation claimed. | Documented scopes and interfaces match the chosen broadcaster-token/WebSocket/Helix architecture. Startup and hourly token validation remain required and are documented. |
| FND-5 — chat/queue lifecycle | Done locally and issue #1 closed; live points effects remain unverified. | Send Chat Message returns `is_sent` and `drop_reason`; current requirement to check send result is correct. Native Twitch 500-character message cap remains relevant. |
| FND-6 — panel and local API | In progress; issue #6 open. Queue settings editing and final operation/recovery/security gates remain open. | Add the missing Twitch-native reward configuration fields to current settings work: maximum redemptions per stream, maximum per user per stream, and global cooldown. Keep settings and remote confirmation separate; changes are owned by the app-created reward ID. |
| FND-7 / issue #7 — OBS overlay | Planned, gated on FND-5/FND-6 and UX; no implementation claimed. | No Twitch API addition is needed for local queue projections. Preserve the existing local capability-token/privacy design. |
| OPS-1 — CI | InReview locally; story exists, no issue appears in the current GitHub list. | No Twitch-specific capability gap. Keep build/tests/scanners as release gates. |
| OPS-2 — localized setup status | InProgress locally; story exists, no issue appears in the current GitHub list. | A contained pt-BR copy fix is not complete i18n. Track its remaining acceptance under OPS-2/FND-8; do not expose Twitch enum values. |
| FND-8 / issue #18 — i18n | Published, planning required after FND-7; implementation not authorized. | Provider/internal statuses must map to stable public product codes then local messages. No new Twitch scope required. |
| FND-9 / issue #19 — local/manual queue mode | Spec Pipeline complete; implementation in progress. Mode/provenance migration, local queues, protected panel/API creation, local lifecycle, durable conversion, race cancellation, retry/reconciliation, and separate chat/reward health are implemented with focused tests (195 passed across 9 files). | Keep chat independent; support app-created rewards, Dashboard rewards only after full lifecycle proof, local queues, free explicit manager adds in either mode, and confirmed-pause conversion that drains current redemptions. Requires PostgreSQL transition/race tests and later real-channel validation. |
| Issue #17 — command catalog and role permissions | Published planning item; no local formal story directory yet. | Current message badges support contextual moderator/subscriber/VIP checks. Follower gating requires extra scope; recommendation is defer follower role in v1 of this capability. Streamer-only commands remain unrelaxable per product decision. |

GitHub inventory checked from the configured private remote on 2026-10-06. Issues #1, #2, #4, and #5 are closed; #3 and #6 are open; #7 and #17–#19 are open planning items. OPS-1 and OPS-2 were subsequently published as new issues #20 and #21 during this work. The local index also carries FND-0 and FND-1–FND-7. No GitHub issue comments were posted.

## Concrete findings to carry into the existing stories

### FND-6: configure the Twitch reward's native limits

Helix Custom Reward create/update supports `max_per_stream_setting`, `max_per_user_per_stream_setting`, and `global_cooldown_setting`, each with an enable flag and configured value. The product prompt already requires enable/value configuration for all three. The current Prisma `Queue` model and adapter do not include them.

Add them to FND-6 queue settings with explicit disabled/enabled semantics and input validation. The API's custom reward list includes rewards from other apps for capacity checks; the app may only mutate rewards it created. Twitch documents a 50-reward channel maximum including disabled rewards, 45-character unique titles, and 200-character prompts. The edit call should send only changed fields and remain a durable, recoverable remote operation. Continue to avoid local duplicate counters for native stream/user limits.

### FND-9: keep chat, reward capability, and manual admission separate

Twitch documents `channel.chat.message` with `user:read:chat` (and broadcaster user token for this end-user-hosted setup). Redemption EventSub and reward API operations require redemption scopes; Custom Reward management returns an ineligibility restriction for non-Affiliate/Partner broadcasters. This supports the proposed separation, but the app's OAuth/runtime behavior for a token without `channel:manage:redemptions` and a real ineligible channel is not yet validated.

The application should report chat and reward capability independently. Ineligible channels must not be told the entire Twitch connection is down if chat is active. Manual entries remain `manual`, have no redemption ID and generate no financial outbox action. Streamer/moderator can explicitly add for free in either queue mode after hearing a request; free-form chat is never interpreted as an enrollment. Reward-to-manual conversion is one-way and stays pending until Twitch confirms pause. Preserve the historical reward ID, continue existing redemption finance work, and durably cancel any racing redemption. Unknown pause outcome must not activate manual mode.

### Issue #17: decide follower access before requesting a scope

The current `channel.chat.message` payload contains badges such as moderator and subscriber, supporting checks against the current event. `GET /helix/channels/followers?user_id=...` requires `moderator:read:followers` and broadcaster/moderator identity. A `channel.follow` subscription reports new follow events, not a complete current follower roster. Therefore an event-derived local follower cache would not prove current follow status after offline periods or unfollows.

Recommended planning default: support streamer, moderator, VIP, subscriber and everyone roles only where a fresh current message supplies trustworthy badges; do not offer follower as an access tier in the first release. If the owner wants follower access, explicitly approve the new scope, its setup copy and its failure/staleness behavior during #17 planning.

## Ideas previously discussed and where they live

| Idea | Tracking | Assessment |
| --- | --- | --- |
| Streamer operates all product functions from a local panel; separate connection, queues, new queue, financial operations and settings views. | FND-6 / issue #6 and UX research. | Captured; queue settings and final control/QA gates are still open. |
| Existing generic reward such as “beber água” must not become the queue trigger; use a dedicated reward created by this app. | FND-9 / issue #19. | Captured and supported by app ownership limits in Helix. |
| Streamer/mod can manually add for free in either queue mode; reward-backed queues can convert to local/manual mode. | FND-9 / issue #19. | Confirmed and captured. Conversion requires confirmed pause, preserves/drains existing redemptions, and cancels racing redemptions; no automatic enrollment from free-form chat. |
| Priority for subscription/Bits/PIX-like external benefit. | FND-6 priority-lane work and story. | Captured as operator-verified FIFO priority; there is no payment/Bits verification or receipt processing. |
| Complete chat command catalog with per-role access, contextual `!<queue> comandos`, and immutable streamer-only actions. | Issue #17. | Captured as a published planning issue; follower scope is the material unresolved Twitch dependency. |
| PT-BR default, English/Spanish, community translations, and no backend status leakage. | Issue #18/FND-8; OPS-2 tracks current status text. | Captured. Full i18n remains future scope. |
| Local OBS widgets with privacy-filtered queue fields. | FND-7 / issue #7. | Captured and gated; no extra Twitch functionality found. |
| `/health` status and Twitch API latency visible to operator. | FND-6. | Implemented in the current worktree with cached authenticated Helix probe; independent full FND-6 retest remains pending. |

No other free-floating product idea was found in the current story files or published issues for the Twitch areas reviewed. This statement is limited to those repository artifacts and the available conversation context.

## Capabilities intentionally excluded

- Do not read or simulate viewer Channel Points balances, transfer points, or issue points. The product reacts to Twitch redemption IDs; Twitch remains the points authority.
- Do not adopt unrelated pre-existing Custom Rewards by title. Reward ownership and redemption history are tied to the creating application.
- Do not add IRC, a second bot account, broad moderation scopes, follower scope, Discord, payment processing, or a hosted backend as a result of this research.
- Polls, predictions, raids, ads, Bits leaderboards, and other Helix products do not solve a queue requirement in the current backlog and do not justify new stories here.

## Official sources reviewed

- [Twitch Helix API Reference](https://dev.twitch.tv/docs/api/reference/) — Custom Rewards and redemptions, channel followers, message sending; checked 2026-10-06.
- [Twitch EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/) — chat message, redemption add/update, follow scopes and payloads; checked 2026-10-06.
- [Twitch chat authentication](https://dev.twitch.tv/docs/chat/authenticating/) and [sending/receiving messages](https://dev.twitch.tv/docs/chat/send-receive-messages/) — installed chat client scopes, WebSocket suitability, send result; checked 2026-10-06.
- [Twitch API concepts and rate limits](https://dev.twitch.tv/docs/api/guide) — token bucket and `Ratelimit-Reset` handling on HTTP 429; checked 2026-10-06.
- [Twitch EventSub WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/) — keepalive, reconnect/resubscribe; checked 2026-10-06.
- [Twitch token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/) — startup and hourly validation for maintained OAuth sessions; checked 2026-10-06.
- [Twitch Channel Points creator guide](https://help.twitch.tv/s/article/channel-points-guide), [FAQ](https://help.twitch.tv/s/article/channel-points-faq), and [viewer guide](https://help.twitch.tv/s/article/viewer-channel-point-guide) — product concepts; checked 2026-10-06. Help Center content is dynamically rendered, so detailed API constraints above are grounded in Helix reference.

## Planning decisions / remaining gates

1. Fold native reward limits into FND-6's existing queue/reward settings acceptance and implementation; keep native Twitch limits authoritative.
2. Keep #17 follower role unselected unless the product owner explicitly authorizes `moderator:read:followers` during its Spec Pipeline.
3. Implement FND-9 only when it enters the authorized sequence; use the published Spec Pipeline plan and preserve the approved conversion/finance rules.
4. Revisit this crosswalk when FND-6 closes or Twitch changes its API. No new issue, release, issue comment, live Twitch call, or story completion was produced by this audit.
