# OPS-15 — Flow coverage and Twitch chat reply review (QA lenses 1 and 4)

**Reviewer:** @qa (Quinn) — independent, read-only static review. **Date:** 2026-10-21. **Branch:** `feat/ops-15-next-panel`.
**Method:** I read the source and test files and ran cheap greps. I did not run any test suites, browsers, Compose, Twitch or OBS. Every claim below comes from reading files, not from running them. pt-BR version: [`../../pt-BR/stories/OPS-15/flow-and-chat-review.md`](../../pt-BR/stories/OPS-15/flow-and-chat-review.md).

## Lens 1 — End-to-end flow coverage per Next page

Evidence layers: **U** = unit (`tests/unit/next-*`), **A** = API plus disposable PostgreSQL (`tests/integration/*repository*`, compose HTTP checks), **B** = browser-only E2E with intercepted API (`tests/e2e/*-browser-only.mjs`), **C** = Compose Chromium journey over real Next + Fastify + PostgreSQL (`tests/integration/compose-runtime.test.js`, starting at `goto /new-queue/`), **O** = native OBS/CEF.

| Page | Main flows (incl. error/recovery) | U | A | B | C | O | Verdict |
|---|---|---|---|---|---|---|---|
| `/` overview | snapshot render, empty state, API failure/retry | yes (`next-overview-*`) | partial | **no** | **no** (only route ownership HTTP check, line 393) | n/a | CONCERNS |
| `/queues` | lifecycle, settings, reward settings, manual entry, reward resolution, call resend, clear, history, reorder/priority, archive | yes (many) | yes | yes (8 scripts) | yes (create→configure→activate→service→archive) | n/a | PASS for covered flows. Clear (`next-queue-clear-ui`) is unit-only, and chat delivery is never observed |
| `/new-queue` | manual create, reward create accepted/uncertain, validation, call-message preview | yes | yes | yes (accepted, uncertain) | yes (manual only) | n/a | PASS (manual). Reward create is only covered by B |
| `/commands` | load policies, edit minimum role, save conflict/failure, reload | yes (`next-command-permissions-page`, `next-commands-route`) | yes (`command-policy-persistence`) | **no** | **no** | n/a | CONCERNS |
| `/connection` | OAuth start, callback `?oauth=error`, disconnect, credential states, recovery copy | yes (`next-connection-page`) | partial (callback redirect HTTP only) | **no** | **no** | n/a | CONCERNS (highest risk) |
| `/operations` | operations list, retry/inspect, unknown outcomes, failure | yes (`next-operations*`) | partial | **no** | **no** | n/a | CONCERNS |
| `/settings` | locale change and persistence, account label, CSRF failure | yes (`next-account-settings-page`, `next-locale-*`, `next-settings-route`) | yes (`product-locale-projection`) | **no** | **no** (catalog discovery is API-level) | n/a | CONCERNS |
| `/widgets` | create/revoke overlay capability, copy URL, privacy toggles | yes (`next-widgets-page`) | yes (`overlay-widget-repository`) | **no** (overlay-parity only reads `/queues`) | **no** | n/a | CONCERNS |
| `overlay` | 1 s polling, revocation, fragment secret, bundle boundary, parity | yes | yes | yes (4 scripts) | no | **no** (OBS/CEF gate still open) | CONCERNS (OBS gap) |

### Flows with NO browser-level evidence, ranked by risk

1. **`/connection` OAuth round trip and error recovery.** Credentials, state and redirect fragments are involved. A regression here blocks every Twitch feature. Only the redirect `Location` is asserted.
2. **`/widgets` capability create/revoke → overlay sees revocation.** Privacy/security boundary (bearer capability, UID visibility toggle). B tests consume a pre-seeded capability, and none drives the widgets UI.
3. **`/settings` locale switch → panel, chat and overlay copy change, and stays after reload.** It controls the chat locale (Lens 2). No browser test confirms that the persisted locale reaches the rendered UI.
4. **`/commands` policy edit with stale-version conflict.** Wrong policies silently change who can run chat commands.
5. **`/operations` unknown/retry outcomes.** Financial truthfulness ("missing response is never confirmation") is shown here and has no browser evidence.
6. **`/queues` clear (two-step) in the browser**, and **reward-mode create through C** (only B with interception).
7. **`/` overview** degraded/API-down rendering.
8. **Overlay in native OBS/CEF** (reload regression #57). Chromium cannot replace this.

### Minimal new E2E list (proposal, not implemented)

| # | Layer | Scenario |
|---|---|---|
| E1 | B | `/connection`: start OAuth (assert redirect target, no token in DOM/URL), `?oauth=error` shows localized recovery, disconnect confirmation and failure |
| E2 | C | `/widgets`: create capability → open overlay URL → revoke in UI → overlay stops rendering within the poll window |
| E3 | C | `/settings`: switch locale to `en` → reload → panel heading in `en`; `GET` chat catalog projection reflects `en` |
| E4 | B | `/commands`: change a minimum role, save; then a 409 stale-version response shows recovery without losing the edit |
| E5 | B | `/operations`: render `unknown` and `retry` outcomes; never show "confirmed" text for them |
| E6 | B | `/queues` clear: preview → confirm → feedback; cancel path |
| E7 | B | `/` overview: API 500 shows a generic message plus `referenceId`, and retry recovers |
| E8 | O | Manual/native OBS/CEF checklist for the overlay (reload, revocation), recorded as evidence |

## Lens 4 — Twitch chat replies

### Inventory of outbound messages

- **No whispers.** No `whisper` call exists in `apps/`.
- **Command replies:** `apps/api/src/commands/chat-handler.mjs` → `reply()` → `twitch.sendChatMessage` (fire-and-forget, `.catch(onError)`). Texts come from `apps/web/localization/catalogs/chat/{pt-BR,en,es}.tsv` (pt-BR fallbacks are hard-coded in `CHAT_FALLBACKS`). Help and ping text comes from `commands/help.mjs`.
- **Call notification:** queued by `queue-routes.mjs:613/619` (panel) and `chat-handler.mjs:208` (`!<fila> proximo`). It is rendered and sent by the durable outbox `apps/api/src/outbox/chat-worker.mjs` → `helix-adapter.mjs:173` (`isSent`, `dropReasonCode`).
- Follower notices (`chat.follower.*`) are rate-limited per user. Other commands go through `claimChatCommand` (DB) or an in-memory 5 s cooldown (mods/streamer are exempt).

### Findings

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| CH-1 | HIGH | **The call message default is pt-BR only and has no presence instruction.** The worker and `proximo` fall back to `'{user}, sua vez!'`. The API `validCallMessage()` also *silently* replaces a missing or >350-char template with that string. The panel default (`panel.queue_settings.call_message_default`) is localized and includes `{command}` → `!<slug> presente`. An API-created queue or a fallback therefore gives en/es viewers Portuguese text, and nobody tells them how to confirm before the deadline. This is the exact scope of OPS-14/#65. | `chat-worker.mjs:26`, `chat-handler.mjs:207`, `queue-routes.mjs:811`, `panel/en.tsv:647` |
| CH-2 | HIGH | **The API create route does not validate placeholders.** Settings update rejects unknown `{tokens}` (`queue-routes.mjs:395`), but create (`:351`, `:362`) only checks the length. Unknown tokens go out to chat unchanged. The panel validates on the client, but direct API use does not. | `queue-routes.mjs:351-362,811` |
| CH-3 | MEDIUM | **The `{uid}` placeholder is a pre-formatted fragment** (`" · UID 123"`), not the raw value. A template such as `UID: {uid}` renders `UID:  · UID 123`. The panel preview uses `uid: ''`, so it never shows this. Privacy behavior is correct (resolved at send time, `uidMode==='visible' && showUidOnCall`), but the meaning of the token is undocumented. | `chat-worker.mjs:24-30`, `new-queue-form.jsx:24-27`, `panel/en.tsv:164` |
| CH-4 | MEDIUM | **Duplicate, divergent call rendering.** `proximo` renders `messageText` with `previousPosition` and `settings.getAccount`, then enqueues it. The worker ignores that and re-renders with `callPosition` and `repository.getCurrentAccount`. The work is dead, and the two code paths can drift. | `chat-handler.mjs:205-209`, `chat-worker.mjs:22-31` |
| CH-5 | MEDIUM | **Retry handling loses Twitch rate-limit data and has no cap.** `catch {}` calls `retryDelay({}, …)`, so a 429 `retryAfterSeconds` thrown by the adapter is ignored. `isSent:false` with `dropReasonCode` (for example, message rejected by AutoMod or channel settings) is retried indefinitely with backoff up to 1 h. No terminal `failed` state or operator-visible reason exists. This is safe (never confirmed), but the operator gets no actionable signal. | `chat-worker.mjs:3-7,33-50` |
| CH-6 | MEDIUM | **The help truncation suffix is hard-coded in pt-BR.** `bounded()` defaults to `'… Catálogo completo no painel.'`. `renderQueueCommandHelp` and `renderPingResponse` call it without a localized suffix, so a long en/es help reply ends in Portuguese. Fallback `'usuario'` (no accent) is inconsistent with `chat.syntax.user`. | `help.mjs:1-4,62-80` |
| CH-7 | MEDIUM | **Command replies are fire-and-forget**, with no outbox and no delivery check. State-changing commands (`sair`, `remover`, `limpar confirmar`, `abrir`) commit first and then reply. A dropped reply leaves chat without feedback. This is acceptable for acknowledgements, but it should be recorded as a decision. The only durable chat message is the call. The "start of service" announcement (#65) does not exist yet. | `chat-handler.mjs:138-143` |
| CH-8 | LOW | **Pluralization gaps.** `clear_confirm` and `clear_done` use `{count} pessoas` / `{refunds} reembolsos` without plural forms (renders "1 pessoas"). Only `called_many` uses `translatePluralCatalog`. | `chat/*.tsv`, `chat-handler.mjs:270-274` |
| CH-9 | LOW | **Gendered pt-BR/es copy**: "você foi chamado", "@{user} adicionado/agregado". Consider neutral wording. | `CHAT_FALLBACKS`, `es.tsv` |
| CH-10 | LOW | **Length handling.** `safeMessage`/`slice(0,500)` counts UTF-16 units and can split a surrogate pair (emoji). The Twitch limit is 500 characters. The `lista` reply is capped at 5 waiting entries, but "called"/"in progress" lists are not capped before truncation. | `chat-handler.mjs:117,170-174` |
| CH-11 | LOW | **UID in chat list** follows `showUidInList`, which matches `docs/front-end-spec.md:32`. `!<fila> add <user> [UID]` repeats a moderator-supplied UID only through `lista`. The handler does not validate the UID format (it delegates to the repository; I did not verify this here). | `chat-handler.mjs:260` |
| CH-12 | DOC | **`!<queue> presente` is not documented** in `docs/USER_GUIDE-en_US.md` (the grep found only "presented"). The call deadline flow depends on it. No pt-BR user guide was found in `docs/pt-BR/`. | grep |
| CH-13 | TEST | Chat tests are unit-only (`chat-command-handler` 27 cases, `chat-outbox-worker` 4). There is one locale-root test for `en` and none for es reply text, help truncation, 429 retry, or `dropReasonCode`. Twitch delivery has no live or worker evidence, which matches the story's "No live chat/Twitch mutation" statement. | `tests/unit/chat-*.test.js` |

### Truthfulness check

Pending states are worded honestly ("pendente de confirmação", "aguarda confirmação da Twitch"). The call deadline starts only after `sent === true` (`recordCallNotificationResult`). The worker re-checks UID privacy at send time. No message claims a refund or fulfillment was confirmed when it was only requested. Positive.

### Planning holes and the relation to OPS-14 / #65

- CH-1, CH-3, CH-4 and CH-7 (durable service-start announcement) belong to **OPS-14/#65**, which stays separate (`docs/project-completion-roadmap.md:19`, `issue-triage.md:30`). OPS-15 must not claim them. The panel shows a localized default with `{command}`, but the server never produces that text on its own. As a result, the panel preview can promise a presence instruction that an API or fallback queue never sends. Record this explicitly in the OPS-15 story as a known divergence, not as parity.
- CH-2, CH-5 and CH-6 are not covered by any story. Recommend @po adds them to #65 or opens a sub-issue (via @devops).
- The `{command}` token exists only in the panel catalog default and is not in `CALL_MESSAGE_TOKENS`. Before #65 implementation, decide whether `{command}` becomes a real server token or gets expanded at save time.

## Gate (this scope)

**CONCERNS.** `/queues`, `/new-queue` (manual): PASS. `/`, `/commands`, `/connection`, `/operations`, `/settings`, `/widgets`: CONCERNS (no browser evidence). `overlay`: CONCERNS (no OBS/CEF). Chat replies: CONCERNS (CH-1/CH-2 HIGH). These findings do not block OPS-15 panel work, because chat behavior is OPS-14 scope. They do block any claim of chat/locale parity.
