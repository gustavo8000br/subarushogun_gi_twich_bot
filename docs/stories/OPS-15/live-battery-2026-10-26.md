# OPS-15 — Live Twitch battery script (2026-10-26)

[Português brasileiro](../../pt-BR/stories/OPS-15/live-battery-2026-10-26.md)

Author: @qa (Quinn). Status: **script only, not executed**. Writing it touched no Twitch resource, sent no message, created no reward and started or stopped no server.

Scope: live acceptance of the Next panel, chat commands and the overlay (in Chrome) against the **real** channel `subarushogun`. The owner authorized test chat messages, `[TESTE]` rewards, test queues and calling/removing people, and wants all test data removed afterwards. A real refund needs the owner's OK at that moment. Native OBS/CEF is the owner's own test, run later.

Sources: [story](story.md) (AC, INV matrix), [queue route/action inventory](queue-route-action-inventory.md) (QRA-xx), [QA gate 2026-10-23](qa-gate-2026-10-23.md), OPS-3/OPS-7 (commands), OPS-11 (presence, removed reward), FND-9 (queue modes, open/close = `is_paused`), FND-7/OPS-13 (overlay), and the code: `apps/api/src/commands/{catalog,parser,chat-handler,help}.mjs`, `apps/api/src/outbox/{chat-worker,timeout-loop,reward-worker}.mjs`, `apps/api/src/http/{queue-routes,overlay-routes,local-session}.mjs`.

## Facts from the code that shape the battery

- The only chat actor is the broadcaster (`subarushogun`). The broadcaster has rank `streamer`, so every command is allowed. The broadcaster has no follower check and no 5-second cooldown. `!fila comandos` / `!<queue> comandos` reply only with a pointer to the panel. Role/permission effects for viewers therefore **cannot** be observed in chat in this battery.
- Bot replies are sent through Helix `sendChatMessage` as the connected account, so they show up as `subarushogun`.
- Bot chat messages are command replies, plus the **call notice** (queue `callMessage`, sent through the `chat.call:<entryId>` outbox row). **There is no join message for redemptions, no deadline message and no removal message from panel actions.** A deadline expiry is a silent `no_show` transition once `callDeadlineAt + 60 s` grace has passed (`timeout-loop.mjs`).
- The global root depends on the product locale: `!fila …` (pt-BR), `!queue …` (en), `!cola …` (es). Another locale's root is ignored without a reply. `!filas` and `!conta` without the root are invalid, and nothing is sent.
- A new reward-backed queue creates its Twitch reward as **enabled + paused** (`reward-worker.mjs`). Viewers can see it in the channel-points menu but cannot redeem it. Opening the queue unpauses the reward, and real viewers **could redeem it**.
- Deleting a reward-backed queue sends `reward.delete` to Twitch. Deleting a queue that was converted to manual keeps the Twitch reward (`converted_queue_locally_deleted_reward_preserved`). That is why conversion is deferred (section 3).
- **Suspected defect, found by reading the code and to be checked by LB-35/LB-38:** `chat-handler.mjs:266` compares `args[0] === 'confirmar'` exactly. The parser accepts the localized label in any letter case (`confirm` in en, `CONFIRMAR`). The likely result is that `!<queue> clear confirm` (en) and `!<queue> limpar CONFIRMAR` issue a new preview instead of confirming.

## 1. Preconditions and initial checks

| ID | Check | Executor | How | Expected |
|---|---|---|---|---|
| P-01 | Dev instance up, not restarted | @qa | `curl -sk https://localhost:3000/health` | `status ok`, `database/twitch_api/twitch_integration/twitch_chat = connected`, `twitch_rewards = available`. Observed by @qa while writing (2026-10-26): exactly this, `product_version v0.2.0-0000000-beta`, `last_reconciliation_at null` |
| P-02 | Clean DB baseline | @qa | `sg docker -c "docker exec queuebot-dev-ts-subarushogun-gi-twich-bot-db-1 psql -U queuebot -d queuebot -Atc '<query>'"` (in-container socket; never print the password in `.local/dev-db/`) | Observed while writing: 0 queues, 0 entries, 0 widgets, 0 redemptions, 0 open outbox rows |
| P-03 | **Twitch reward baseline** | Orion | Creator Dashboard → Viewer Rewards → Channel Points → Manage rewards. Screenshot plus a written list of reward titles | Saved before LB-06; it is the reference for cleanup |
| P-04 | Panel session | Orion | Open `https://localhost:3000/`, accept the dev CA, keep one tab on the panel | Overview loads with no error |
| P-05 | Chat ready | Orion | Open `https://www.twitch.tv/popout/subarushogun/chat` logged in as the owner | Can type. Leave the bot's replies visible |
| P-06 | @qa read-only API session | @qa | `curl -sk -c .local/live-battery/jar -H 'Origin: https://localhost:3000' https://localhost:3000/api/session`, then only GETs with `-b` | `{csrfToken}` (do not log it). In-memory session, harmless |
| P-07 | Log cursor | @qa | `wc -l .local/dev-session.log`, saved as the starting line | Used by LB-41 |
| P-08 | Owner decisions | Orion → owner | Confirm: (a) live or offline (offline preferred: fewer viewers exposed to the open window); (b) LB-17/LB-37 accepted (reward redeemable for ≤30 s at a 1,000,000-point cost); (c) test messages remain in the chat history | Recorded in the evidence |

Rules for the whole run: time in UTC (`date -u +%H:%M:%S`). Orion types in chat only what is written here. Keep at least 6 s between messages and wait for the bot's reply before the next command. Do not repeat **identical** text within 31 s: the Twitch identical-message rule may apply (not confirmed for the broadcaster; avoid it anyway). If an unexpected redemption shows up, stop and ask the owner before any refund.

## 2. Cases

Legend: **Vis.** = visible in the channel (chat or channel-points menu). DB queries run through the P-02 command.

### Panel

**LB-01 Overview and health** — Orion: open `/`, press "Refresh", then use Tab to reach the button again. Expected: health cards connected and rewards available, current account "Streamer", 0 queues, 0 pending operations; focus stays on the button after refresh. @qa: P-01 again with the same values. Vis.: no.

**LB-02 Connection and reconciliation** — Orion: `/connection/`. Expected: channel `subarushogun` shown as text; no secret value, token or `broadcasterId` rendered; "Reconnect" **not** clicked. Click "Reconcile". Expected: localized completion with no issues. @qa: `/health` `last_reconciliation_at` is no longer null. Vis.: no (Twitch read).

**LB-03 Panel language** — Orion: switch to English, reload, then switch back to pt-BR. Expected: copy changes only after API confirmation and the choice persists after reload. @qa: `select value from settings where key='product_locale'` → locale and revision rise and end at pt-BR. Vis.: no (the chat effect is LB-38).

**LB-04 Command permissions** — Orion: `/commands/`. Change `queue:lista` (list) from follower to moderator, save, reload. Expected: persisted, revision +1; fixed rows (`add`, `remover`, `proximo`, …, `conta <nome>`) locked. Restore follower and save. **If the panel asks for Twitch authorization to restore follower, stop and call the owner.** @qa: `settings` key `chat_command_policies` ends with `queue:lista = follower`. Vis.: no.

**LB-05 Create manual queue B** — Orion: `/new-queue/`, mode "manual only", slug `teste-b`, alias `tb`, title `[TESTE] Fila B manual`, call message `{user}, sua vez na {queue} (posição {position})`, timeout 3 min. Expected: created, no Twitch reward. @qa: `queues` row `queue_mode=manual_only`, `reward_id null`; `queue_keys` has `teste-b` and `tb`; no `reward.*` outbox row. Vis.: no.

**LB-06 Create reward-backed queue A** — Orion: slug `teste-a`, title `[TESTE] Fila A QA`, cost 1000000, max per stream 1, max per user 1, timeout 3 min. Expected: pending, then synced. @qa: `reward_id` filled, `remote_sync_status='synced'`, `is_open=false`, outbox `reward.create` `confirmed`. Orion: the dashboard shows `[TESTE] Fila A QA` **paused**. Vis.: **yes** (paused reward in the menu).

**LB-07 Safe creation errors** — Orion: try slug `fila` (reserved), slug `teste-b` (duplicate) and a 46-character title. Expected: localized messages for 400/409/400, no stack trace or code dump, form keeps the typed data. @qa: still 2 queues, no new outbox row. Vis.: no.

**LB-08 Local settings** — Orion: queue B → set timeout 2 and save; then try call message `{user} {foo}` → localized template error. @qa: `call_timeout_min=2`, `version` +1, message unchanged. Vis.: no.

**LB-09 Stale version** — Orion: open queue B settings in two tabs; save a change in tab 1, then a different change in tab 2. Expected: tab 2 gets the stale/conflict message with a refresh path and does not overwrite tab 1. @qa: the tab 1 value persisted. Vis.: no.

**LB-10 Edit linked reward (QRA-04)** — Orion: queue A → reward settings: title `[TESTE] Fila A QA ed`, cost 999999. Expected: accepted as pending, then synced. @qa: outbox `reward.update` `confirmed`, queue `version` +1. Orion: the dashboard shows the new title/cost, still paused. Vis.: **yes**.

**LB-11 Manual add in the panel (QRA-10)** — Orion: queue A (closed, reward-backed) → add `subarushogun`; then add `qa_inexistente_zz9q` (no Twitch user expected). Expected: 1 waiting entry; for the second, a localized "not found" (404). @qa: `entries` `source` manual, `redemption_id null`, no financial outbox. Vis.: no.

**LB-12 Audited priority (QRA-07)** — Orion: mark the entry as priority (reason operator override), then remove the priority. Expected: badge appears and disappears. @qa: `audit_logs` has both events and `priority_class` is back to `standard`. Vis.: no.

**LB-13 Call from the panel (QRA-13)** — Orion: queue A → call the entry. Expected: the call message appears in chat (`@subarushogun, sua vez!` default or the configured text). @qa: entry `status=called`, `call_notified_at` and `call_deadline_at ≈ notified + 3 min` set, outbox `chat.call:<id>` `confirmed`. Vis.: **yes**.

**LB-14 Resend call (QRA-12)** — Orion: ≥35 s after LB-13, "Resend call". Expected: queued-not-delivered feedback, then a second call message in chat. @qa: `call_deadline_at` **unchanged** (compare with LB-13); `audit_logs` `entry.call_notification_resent`; outbox `confirmed` again. Vis.: **yes**.

**LB-15 Service transitions and history (QRA-11/05)** — Orion: start service, then complete; expand history. Expected: entry in history as completed. @qa: `status=completed`, `finished_at` set; no `redemption.*` outbox row (manual entry). Vis.: no.

**LB-16 Clear from the panel (QRA-14/15)** — Orion: add `subarushogun` to A again → "Clear" → preview (1 person, 0 refunds) → confirm. Expected: empty queue and accessible feedback. @qa: entry `removed`, 0 financial outbox rows. Vis.: no.

**LB-17 Open/close A from the panel (QRA-16)** — needs P-08(b). Orion: open → wait for confirmation → close within ≤30 s. Expected: pending, then open; pending, then closed. @qa: outbox `reward.set_open` confirmed twice, `is_open=false`, `remote_sync_status='synced'`; `redemptions` still 0. Orion: the dashboard shows paused again. Vis.: **yes** (redeemable window).

**LB-18 Operations** — Orion: `/operations/`. Expected: empty list and summary 0; no retry/resolve action shown. @qa: GET `/api/operations` = `[]`. Vis.: no.

### Widgets and overlay

**LB-19 Create widgets and one-time link** — Orion: `/widgets/`, create W1 `queue_waiting_count` (queue B), W2 `called_viewer_display_name`, W3 `account_label`, W4 `queue_state` (queue A). Copy each link, close the dialog and reopen it. Expected: the link is shown only once and reopening does not reveal it. Keep the links in the browser only and do not paste them in any report. @qa: 4 rows in `overlay_widgets` with `capability_hash` not null (do not print it). Vis.: no.

**LB-20 Overlay in Chrome** — Orion: open each link in its own tab (`/overlay.html?ref=…#token`). Expected: the fragment disappears from the address bar; W1=0, W2=fallback, W3="Streamer", W4=closed; DevTools Network does not load panel chunks. Vis.: no.

**LB-21 Rotate capability (regenerate)** — after LB-34. Orion: regenerate W1 and watch the old W1 tab. Expected: the old tab clears within ~2 s and stays empty after reload; the new link works. @qa: `capability_version` +1. Vis.: no.

**LB-22 Revoke** — Orion: revoke W2 and watch its tab. Expected: clears and stays empty after reload. @qa: `revoked_at` set. Vis.: no.

### Chat (Orion types; @qa checks DB/log)

**LB-23 Ping** — `!fila ping`. Expected: `Pong 🏓 Bot ativo · v0.2.0-0000000-beta · Twitch: <n> ms` (or "latência indisponível"). Vis.: **yes**.

**LB-24 Help** — `!fila comandos`, then `!teste-b comandos`. Expected: both give the streamer pointer to the "Comandos" page. Vis.: **yes**.

**LB-25 Queues** — `!fila filas`. Expected: `Filas disponíveis: teste-a (fechada), teste-b…` (record B's suffix as observed). Vis.: **yes**.

**LB-26 Account** — `!fila conta` → `Conta atual: Streamer.`; `!fila conta QA Teste` → `Conta atual: QA Teste.`; check W3 updates in ≤2 s and the panel overview shows it; `!fila conta reset` → `Conta atual: Streamer.` @qa: `settings.account_state` label back to default. Vis.: **yes**.

**LB-27 Entry and duplicate** — `!teste-b add subarushogun` → `@subarushogun adicionado à fila.`; W1=1. Then `!tb add subarushogun` (alias, different text) → `Essa pessoa já está ativa nesta fila.` @qa: 1 active entry, `source` manual. Vis.: **yes**.

**LB-28 List and position** — `!teste-b` → title + `Aguardando: 1. @subarushogun`; `!tb lista` → same content; `!teste-b posicao` → `@subarushogun, você está na posição 1.` Vis.: **yes**.

**LB-29 Next and call notice** — `!teste-b proximo` → `1 pessoa chamada.` plus the call notice with the LB-05 text (`posição 1`). W2 shows the name; W1=0. `!teste-b posicao` → `@subarushogun, você foi chamado.` @qa: outbox `chat.call` confirmed, deadline ≈ +2 min (LB-08). Vis.: **yes**.

**LB-30 Presence** — `!teste-b presente` → `@subarushogun, presença confirmada…`. @qa: `call_acknowledged_at` set and status still `called` (it does not start service). Vis.: **yes**.

**LB-31 Serve and complete** — `!teste-b atender` → `Atendimento iniciado.`; `!teste-b concluir` → `Atendimento concluído.` @qa: `completed`; no financial outbox. Vis.: **yes**.

**LB-32 Deadline (no presence)** — Orion: set B timeout to 1 in the panel. `!teste-b add subarushogun`, then `!teste-b proximo`; **do not** type `presente`. Wait 2 min 30 s. Expected: **no** bot message at expiry; the entry goes to history as no-show; W2 clears. @qa: `status=no_show`, `terminal_reason='call_timeout'`, `finished_at ≥ call_deadline_at + 60 s`. Vis.: **yes** (add/next only).

**LB-33 Removal and leave** — `!teste-b add subarushogun`; `!teste-b remover subarushogun` → `Pessoa removida.`; `!tb add subarushogun`; `!teste-b sair` → `Você saiu da fila.`; after ≥31 s, `!tb sair` → `Você não está nesta fila.` @qa: `removed` with reasons `operator_removed` and `viewer_left`; no refund. Vis.: **yes**.

**LB-34 Clear from chat** — `!teste-b add subarushogun`; `!teste-b limpar` → `Confirme em até 15 segundos com !teste-b limpar confirmar: 1 pessoas…; 0 reembolsos…`; within 15 s `!teste-b limpar confirmar` → `Fila limpa: 1 pessoas removidas; 0…`; then `!tb limpar` → `A fila já está vazia.` Vis.: **yes**.

**LB-35 Probe: confirmation letter case** — `!tb add subarushogun`; `!teste-b limpar`; within 15 s `!teste-b limpar CONFIRMAR`. Contract expectation: the clear is confirmed. Suspected result (code): a new preview. Record what happens. If it is not confirmed, finish with `!tb limpar confirmar`. @qa: entries = 0 active at the end. Vis.: **yes**.

**LB-36 Safe chat errors** — `!teste-b proximo 11` → `Use um número de 1 a 10.`; `!naoexiste lista` → `Essa fila não foi encontrada.`; `!teste-b add qa_inexistente_zz9q` → `Esse usuário da Twitch não foi encontrado.`; `!filas` and `!queue ping` → **no reply** (invalid syntax / root of another locale); `!teste-b proximo` (empty) → `Não há pessoas aguardando.` @qa: the log has no stack or message text for these. Vis.: **yes**.

**LB-37 Open/close A from chat** — needs P-08(b). `!teste-a abrir` → `Fila aberta e recompensa confirmada.` (or `Alteração solicitada…`); within ≤30 s `!teste-a fechar` → `Fila fechada e recompensa pausada.` @qa: as in LB-17. Vis.: **yes**.

**LB-38 Chat locale (en) + probe** — Orion: panel → English. `!queue ping` → English Pong; `!fila ping` → no reply; `!teste-b add subarushogun` (en label is also `add`); `!teste-b clear` → English confirmation prompt; within 15 s `!teste-b clear confirm`. Contract: confirms. Suspected: a new preview. Finish with `!teste-b clear confirmar` if needed and record the result. Panel back to pt-BR; `!fila ping` answers again (≥31 s after the earlier `!fila ping`). Vis.: **yes**.

### Recovery and safe errors

**LB-39 Reward removed on Twitch (OPS-11 AC4)** — Orion: create queue C `teste-c`, `[TESTE] Fila C remocao`, cost 1000000 (synced and paused). In the Twitch dashboard, **delete** that reward. In the panel, "Reconcile". Expected: C leaves the active list without an error leak. @qa: C `lifecycle_status='deleted'`, `is_archived=true`, `remote_sync_status='deleted'`, `reward_id` kept, audit recorded. Orion: the dashboard has no `[TESTE] Fila C`. Vis.: **yes** (paused reward for a few minutes).

**LB-40 Session, CSRF, origin, overlay bearer** — @qa, curl with no domain effect: `POST /api/queues` with no CSRF → 403 generic text; with `Origin: https://evil.example` → 403 `Origem inválida.`; `Host: 127.0.0.1:9999` → 403; `GET /overlay/api/widget` with no bearer → 401 `Widget indisponível.`; with a malformed bearer → 401. No stack, path or SQL in any body. @qa: `queues` count unchanged. Vis.: no.

**LB-41 Logs without leaks** — @qa: on `.local/dev-session.log` from the P-07 line, count (do not print) matches for `access_token|refresh_token|Bearer |client_secret|password|postgres://|oauth:`, for the test texts (`QA Teste`, `sua vez na`), and stack lines (`    at `). Expected: 0 secrets/connection strings; no chat or redemption body; any error carries only a code/`referenceId`. Vis.: no.

**LB-42 Delete reward-backed queue A (QRA-22)** — part of cleanup. Orion: delete A with the confirmation. Expected: deletion pending, then removed from the list. @qa: outbox `reward.delete` `confirmed`, `lifecycle_status='deleted'`. Orion: the dashboard has no `[TESTE] Fila A…`. Vis.: **yes**.

**LB-43 Delete manual queue B and widgets** — part of cleanup. Orion: delete B and delete W1–W4; old overlay tabs clear. @qa: B deleted with no `reward.*` outbox row; `overlay_widgets.deleted_at` set on all 4. Vis.: no.

## 3. Not runnable now

| Item | Reason |
|---|---|
| Entry by redemption, refund on remove/no-show/clear, fulfill on complete, operations retry/resolve-unknown | The owner does not redeem his own rewards, and a real viewer would need a real refund (needs the owner's OK) |
| QRA-08/09 reward candidates/resolve | Needs `create_unknown` state; inducing it means forcing a Twitch failure |
| QRA-19/20 local archive, QRA-21 unarchive | Needs unconfirmed remote state; QRA-18 was retired with the vanilla panel |
| QRA-23 cancel deletion | The window between request and worker execution is too short to be reliable |
| QRA-17 conversion to manual | Leaves a paused `[TESTE]` reward on Twitch (deletion keeps it), so cleanup would have to be done by hand in the dashboard. Deferred until the owner authorizes it |
| Move/reorder (`mover`, QRA-06) and priority affecting order | Needs 2+ distinct people; adding real third parties would mention them in chat. Needs a second account controlled by the owner |
| Viewer permissions, follower check, cooldown, `presente` by someone not called, Shared Chat | The only actor is the streamer (rank 5); needs a viewer account |
| `referenceId` on an unexpected 500/503 | Needs an internal failure (stopping the DB/Fastify), which this battery forbids. The covered evidence is unit/integration (QRA tables) plus LB-41 |
| Twitch 401/429/5xx/timeout paths | Cannot be induced safely on the real channel |
| Native OBS/CEF | The owner's own test, later |
| Spanish locale in chat, UID mode visible, automatic account switching per call (OPS-11 AC1), assistive technology | Low value per message or needs extra configuration; outside this round |

## 4. Execution order (groups chat messages)

1. **Silent setup (≈15 min, no chat):** P-01…P-08 → LB-01, LB-02, LB-03, LB-04, LB-05, LB-07, LB-08, LB-09, LB-18 → LB-06, LB-10 (Twitch visible, menu only) → LB-19, LB-20.
2. **Chat block 1 — queries (≈1 min, 6 s apart):** LB-23, LB-24, LB-25, LB-26.
3. **Chat block 2 — happy path B (≈2 min):** LB-27, LB-28, LB-29, LB-30, LB-31.
4. **Panel calls on A (≈2 min):** LB-11, LB-12, LB-13, (wait 35 s) LB-14, LB-15, LB-16.
5. **Chat block 3 — deadline (≈3 min, mostly waiting):** LB-32. Meanwhile @qa runs LB-40.
6. **Chat block 4 — removal/clear/errors (≈3 min):** LB-33, LB-34, LB-35, LB-36. Then LB-21, LB-22.
7. **Redeemable window (≈1 min, only with P-08(b)):** LB-17, then LB-37, back to back with a short gap.
8. **Chat block 5 — locale (≈2 min):** LB-38.
9. **Removed reward:** LB-39.
10. **Cleanup:** LB-42, LB-43, section 5, then LB-41 last.

Spacing: ≥6 s between commands and wait for the reply; ≥31 s before repeating identical text. Expected total is about 45–60 messages (owner + bot).

## 5. Exact cleanup and confirmation

1. Make sure no queue is open (`is_open=false` on all) and none has an active entry (`entries` status in `waiting/called/in_progress` = 0).
2. Delete queue A (LB-42) and queue B (LB-43); C is already retired (LB-39). Delete W1–W4.
3. Restore: product locale `pt-BR` (LB-03/38), account `Streamer` (LB-26), `queue:lista = follower` (LB-04).
4. @qa, DB: `select slug, lifecycle_status, remote_sync_status, is_open from queues` → all `deleted`; `select operation_type, status, count(*) from outbox group by 1,2` → nothing in `pending/processing/retry/unknown/failed`; `select count(*) from redemptions` = 0; `overlay_widgets` all with `deleted_at`.
5. Orion, Twitch: dashboard rewards list = baseline P-03 (no title starting `[TESTE]`); channel-points menu in the channel view with no `[TESTE]`. Screenshot.
6. @qa: `/health` still connected; `rm` of `.local/live-battery/jar` (only the cookie jar that @qa created).
7. Not removed: chat messages (they remain in the history; the owner decides whether to clear them), local tombstones in the disposable dev DB (expected; the next `dev:start` creates a fresh one), and the instance itself (Orion decides).

## 6. Evidence template (one per case)

```
### LB-xx — <title>
- Result: PASS | FAIL | BLOCKED | NOT RUN
- Start/end UTC: hh:mm:ss / hh:mm:ss
- Executor: Orion (browser/chat) | @qa (API/DB/log)
- Observed (chat/panel text, verbatim; no token/link):
- DB/API check (query + result, no secrets):
- Visible in channel: yes/no
- Note / deviation / defect ID:
```
