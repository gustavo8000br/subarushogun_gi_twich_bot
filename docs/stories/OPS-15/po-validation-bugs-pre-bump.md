# Bugs that enter before the 0.3.0-beta bump — `@po` validation (D-8, FT-53, FT-54, TS-18, widget in OBS, D-6) and closure of AC 9 and AC 15 of OPS-15

[Português (pt-BR)](../../pt-BR/stories/OPS-15/po-validation-bugs-pre-bump.md)

**Validator:** `@po` (Pax) — **Date:** 2026-11-05 — **Mode:** YOLO (`[AUTO-DECISION]` marks autonomous choices). No code, git or GitHub action.
**Owner decisions (2026-11-05):** the six items below enter **before the bump and before the single `@qa` gate** (min. 9.0). The OBS test on this machine is authorized; **no stream start and no real redemption** (that needs an explicit "pode transmitir").
**Sources read:** [OPS-26 story](../OPS-26/story.md), [OPS-25 story](../OPS-25/story.md), [qa-gate-2026-11-05.md](qa-gate-2026-11-05.md) (L-1, L-2, L-3), [live-battery-2026-10-26-results.md](live-battery-2026-10-26-results.md) (D-6, D-8/LB-23), [issue-body-changes-2026-11-05](../../process/issue-body-changes-2026-11-05.md), [research-index.md](../../research-index.md). Code read for evidence: `apps/api/src/commands/chat-handler.mjs:397`, `apps/api/src/commands/help.mjs:76-82`, `apps/api/src/health-route.mjs` (`readTwitchHealth`, `getTwitchHealth`), `apps/api/src/twitch/helix-adapter.mjs:80-84`, `apps/api/src/twitch/integration.mjs:68-72,95-135,195-225`, installed `@twurple/api` `HelixUserApi.getUserById`, `VERSION`.

## Verdicts

| Item | Where | Verdict | Score | Status |
|---|---|---|---|---|
| **D-8** `ping` with the real Twitch latency (**slice A of OPS-26**; the `status` command stays out of this bump) | OPS-26 / ST-19 (+ TS-13) | **GO** | **9.0/10** | stays Draft: no issue yet (rule "Ready = GO + issue"); becomes Ready when `@devops` creates it |
| **FT-53** message for a 401 after a possibly-sent DELETE | OPS-22 follow-up, parent #80 | **GO** | **9.0/10** | Backlog -> **Ready** (parent #80 exists; sub-issue just-in-time by `@devops`) |
| **FT-54** singular texts and "recompensa" in pt-BR | OPS-22 follow-up, parent #80 | **GO** | **9.1/10** | Backlog -> **Ready** (same) |
| **TS-18** local `isOpen` in PG36-16 | OPS-22 follow-up, parent #80 | **GO** | **9.2/10** | Backlog -> **Ready** (same) |
| **Widget in the OBS of this machine** | OPS-25 / ST-18 (replaces OPS-13 / #57) | **GO** for the pre-bump subset | **8.8/10** | stays Draft: no issue yet; `@devops` creates it |
| **D-6** `/health` `degraded` from the start of the stream | OPS-22 follow-up (new item, **proposed FT-55**, `@sm` registers) | **GO** (diagnosis only; root-cause fix NOT promised) | **8.6/10** | Ready after `@sm` registers the row (parent #80) |

"Ready" means validated for planning; the gates of each slice still apply (`@architect`/UX before `@dev` where listed, `@dev` test-first, **one** `@qa` gate with score >= 9.0, `@devops` commits).

## Findings that change the plan

1. **Root cause of D-8 found by reading the code (static evidence, still to be proven by the Red test).** `chat-handler.mjs:397` calls `getTwitchHealth()`, which is `health-route.mjs` `getTwitchHealth()`: a **passive snapshot** that returns `null` when `/health` was not requested in the last `probeCacheMs` (60 000 ms) (`if (!cachedProbe) return null; if (now() - cachedAt >= probeCacheMs) return null;`). The chat never triggers a probe, so unless something polled `/health` less than 60 s ago, `ping` prints "latência indisponível". On 2026-10-27 the owner had `/health` open (219 ms), which explains "the owner has seen it several times". OPS-26 AC 4 (record the cause) is met by this finding plus the Red test.
2. **`ping()` is a real single request.** `helix-adapter.mjs:80` -> Twurple `api.users.getUserById(broadcasterId)` -> `callApi({type:'helix', url:'users', query:{id}})`; the installed `HelixUserApi.getUserById` does **not** use the batcher or a cache (the batcher belongs to `getUserByIdBatched`). So the measured time is a real round trip of `GET /helix/users?id=<broadcaster>` including the Twurple client queue and, if due, a token refresh. [VERIFIED in the installed source; the Twitch-side rate-limit numbers are not restated here, see research row 17.]
3. **`VERSION` today is `v0.2.1-0000000-beta`** (commit segment inside). The owner format has no commit segment (`@po` decision of 2026-10-28, kept). After the bump the string must read `v0.3.0-beta`.
4. **D-6 candidates (code, UNVERIFIED live).** `twitch_integration` is `status` from `publishStatus`. It becomes `degraded` in four ways: reconciliation `partial` or failed (logged since FT-24 as `twitch_reconciliation_degraded`), `eventsub_disconnected`, `eventsub_startup_disconnected` and revoked subscriptions (`integration.mjs:204-224`). **The last three leave no log line**, which matches "degraded with no log line". Also plausible: the old D-5 cause (Helix redemption class without `status`) made every reconciliation "partial" and may already be fixed by FT-24; only a live run proves it.
5. **Slice A of OPS-26.** The owner wants D-8 before the bump, not the whole story. The ST-01 dependency ("branch merged into `main`") is lifted for slice A by the owner decision of 2026-11-05. `status`, AC 5, AC 6 and the streamer-only permission stay in the Draft, unchanged, after the bump.

## 10-point checklist

| # | Point | D-8 | FT-53 | FT-54 | TS-18 | Widget | D-6 |
|---|---|---|---|---|---|---|---|
| 1 | Title | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0.8 |
| 2 | Description | 1.0 | 0.9 | 0.9 | 1.0 | 0.9 | 0.8 |
| 3 | Testable ACs | 0.9 | 0.9 | 0.9 | 1.0 | 0.8 | 0.8 |
| 4 | Scope IN/OUT | 0.9 | 0.9 | 0.9 | 1.0 | 0.9 | 0.9 |
| 5 | Dependencies | 0.9 | 0.9 | 0.9 | 1.0 | 0.8 | 0.9 |
| 6 | Complexity | 0.8 | 0.8 | 0.9 | 1.0 | 0.9 | 0.9 |
| 7 | Business value | 0.9 | 0.8 | 0.9 | 0.8 | 0.9 | 0.9 |
| 8 | Risks | 0.9 | 0.9 | 0.9 | 0.8 | 0.9 | 0.9 |
| 9 | Definition of Done | 0.9 | 0.9 | 0.9 | 0.9 | 0.8 | 0.8 |
| 10 | Alignment | 0.9 | 0.9 | 0.9 | 0.9 | 0.9 | 0.8 |
| | **Total** | **9.0** | **9.0** | **9.1** | **9.2** | **8.8** | **8.6** |

Deductions: D-6 has no live evidence and no row yet; the widget has platform rows and one chat step outside the permission; FT-53 has a P3 value (safe today, less actionable).

## Acceptance criteria (Given/When/Then; Red first, then Green)

### D-8 — `ping` (slice A of OPS-26; covers AC 1-4, 7, 8 and 9 of the story for `ping` only; TS-13 travels with it)

**How the latency is measured (decision, no invented number):**
- **What:** the wall-clock time of one `twitch.ping()` of the Helix adapter, that is, one `GET /helix/users?id=<broadcaster>` through Twurple 8.2.0, from the call to the resolved promise. **Not** the EventSub or chat latency, not the time since the message was sent in chat.
- **Unit:** integer milliseconds, rounded (`Math.round`), never negative; printed as `<n>ms`.
- **Clock:** a monotonic clock (`performance.now()`) injected into the health module; the existing `Date.now` default is replaced for the probe so a wall-clock jump cannot produce a negative or huge value.
- **One source:** the chat reads the **same** measurement as `/health` (`twitch_api_ping_ms`), through an async function of `health-route.mjs` that reuses `readTwitchHealth` (cache `probeCacheMs` and the single-flight `pendingProbe`). The passive `getTwitchHealth()` snapshot stops being used by the chat. The cache TTL and an explicit per-chat limit are confirmed by `@architect` (AC 3 of the story); until then the default is the existing 60 000 ms and the test uses fake timers.
- **If it fails:** no invented value. The reply is `Pong 🏓 - <version> - Twitch indisponível (<CODE>).` with a closed code list proposed here and confirmed by `@architect`/UX: `TWITCH_NOT_CONNECTED` (integration not in `connected/ineligible/degraded/reconciling`, no probe made) and `TWITCH_PROBE_FAILED` (probe threw or returned something other than `true`). The failure is logged once with the code, without user data, token, UID or message text.

- **AC-D8-1 (Red first):** Given a measurement of 219 ms exists (fresh `/health` probe or the shared cache), when a viewer runs `!fila ping`, then the reply is exactly `Pong 🏓 - v0.3.0-beta - 219ms.` (version without the commit segment, derived from the same `VERSION` file that `validate:version` reads; no second version constant) and never contains "indisponível". Red: today the chat prints "latência indisponível" because `getTwitchHealth()` is `null` when `/health` was not called in the last 60 s.
- **AC-D8-2 (Red first, TS-13):** Given no fresh measurement and the integration `connected`, when `ping` runs, then the bot takes one probe (one `twitch.ping()`), and answers with its value; given the probe fails, then it answers the error form with `TWITCH_PROBE_FAILED`; given the integration is `reconnect_required` or `not_configured`, then `TWITCH_NOT_CONNECTED` and **zero** Helix calls. The three cases (present, absent, Twitch failing) are three named tests.
- **AC-D8-3:** Given 50 `ping` commands within 1 s (fake timers), when they run, then exactly one `twitch.ping()` happens per cache window (single-flight); after the window one more.
- **AC-D8-4:** Given the version `v0.2.1-0000000-beta` and `v0.3.0-beta`, when the version is formatted, then the outputs are `v0.2.1-beta` and `v0.3.0-beta`; an unrecognized string is printed as is (never throws).
- **AC-D8-5 (equality with `/health`):** Given a fake adapter that takes 219 ms (fake clock), when `/health` and `ping` run in the same window, then `twitch_api_ping_ms` equals the number printed by `ping`.
- **AC-D8-6 (real Twurple instance):** Given a real `ApiClient` with a fake `fetch` (helper `tests/helpers/twurple-real-instances.mjs`), when `ping` runs, then exactly one request to `helix/users?id=<broadcaster>` is made and the measured value is >= the fake delay.
- **AC-D8-7:** Given pt-BR, en and es, when `ping` answers, then `chat.ping.response` and the new `chat.ping.error` exist in the three chat catalogs, the reply is <= 500 characters and `npm run validate:localization` passes. `chat.ping.unavailable` is removed or kept only if still used (grep proves it).
- **AC-D8-8 (chat E2E with fixtures):** connected, degraded and failing Twitch produce the expected outbound messages through the real chat handler.
- **AC-D8-9 (live, OW-17, owner-gated, NOT part of the `@dev` or `@qa` gate):** the real `ping` on the channel shows ms close to `/health` of the same instance. Recorded as a separate live-evidence class; it needs the owner (a real chat message to the real Twitch; no stream is needed for it, but it is the owner's call).
- **Out:** `status`, any change to `/health` fields, SSE, bump.
- **Order:** Red tests AC-D8-1, 2, 3, 5 -> Green (shared async probe + chat handler awaits it) -> AC-D8-4 -> AC-D8-6, 7, 8.

### FT-53 — message after a 401 when the DELETE may have reached Twitch

- **Decision `[AUTO-DECISION]`:** keep HTTP 409 and the code `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` (nothing changes for clients) and **add a closed `reason` field** with `authorization_required` when the read that failed was a 401 (otherwise `reason` is absent). The panel then says both facts: the delete may have reached Twitch **and** the authorization must be renewed. (Reason: L-2 asks to keep or improve; this is the smallest improvement that is actionable and leak-free. `@architect` confirms the field name and that the list is closed; if `@architect` prefers a new code, the ACs below keep their meaning.)
- **AC-F53-1 (Red first):** Given a possibly-sent DELETE and a 401 on the cancel read (PG36-05 401 row), when the cancel is requested, then HTTP 409 with `code: QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` and `reason: 'authorization_required'`; the body has no adapter message, token-like canary or UID (canary test kept).
- **AC-F53-2:** Given the same flow with a non-401 failure (for example a 5xx or network error), then 409 without `reason` or with a value from the closed list asserted by the test (`reason` is never free text).
- **AC-F53-3:** Given the panel receives that 409 with `reason: 'authorization_required'`, when it renders, then it shows a localized text with the two facts and the existing "authorize again" action; pt-BR, en and es exist; `@ux-design-expert` approves the text (>= 9.0, review scope stated).
- **AC-F53-4 (limit written, no code):** the story OPS-22 records, as an explicit limit of AC 16, that a pause task restored by a cancel read to `unknown`/`failed` is **not** re-armed after re-authorization and needs "retry now" (gate item f). `@po` wrote this note in OPS-22 on this date.
- **AC-F53-5:** the existing assertions of PG36-05, audit allowlists (PG36-13) and the canary tests stay green.
- **Order:** Red AC-F53-1/2 (route and PostgreSQL) -> Green -> text and panel test AC-F53-3 after the UX note.

### FT-54 — singular texts and "recompensa" in pt-BR

- **AC-F54-1 (UX record):** `@ux-design-expert` writes an addendum to the UX plan of FT-23/FT-36 acknowledging the four families (`confirm.delete_local.one`, `confirm.delete_converted.one` in en, es and pt-BR; counted as the four families of the gate), with a score >= 9.0 on the reviewed scope and the statement of what was not reviewed (no visual or assistive-technology run).
- **AC-F54-2 (Red first):** Given the pt-BR panel catalog, when a test scans the queue deletion family (`panel.queue.confirm.delete*`, `panel.queue.delete.*`, `panel.queue.status.pending_local_delete`, `panel.operation.confirm.continue_delete`, `panel.queue.confirm.retry_delete_converted`), then no value contains the English word `reward`/`rewards` outside a quoted proper name; the term rule is "recompensa" for reward and "resgate" for redemption. Red: `confirm.delete_local.one`, `confirm.delete_converted.one`, `continue_delete`, `delete.done`, `delete.cancel.*` contain "reward" today.
- **AC-F54-3:** the singular and plural of each key keep the same placeholders (`{title}`, `{count}`) and parity en/es/pt-BR; `npm run validate:localization` and the plural tests stay green.
- **AC-F54-4 (UX decides, not mandatory):** `panel.widget.queue_label` and `panel.widget.source.help` (pt-BR, "reward") are in the same term rule; `@ux-design-expert` says if they enter this slice. If yes, the same scan covers them.
- **Order:** UX addendum -> Red scan -> Green text edits.

### TS-18 — local `isOpen` after a late DELETE

- **AC-T18-1 (Red first):** Given the PG36-16 scenario (open task ends `unknown('reward_open_reward_diverged')`, `remoteSyncStatus = open_unknown`), when the test finishes its existing assertions, then it also asserts the stored `isOpen` value read from PostgreSQL. The expected value is whatever the current semantics produce (`setQueueOpen(true)` leaves the flag `true` while the sync is pending/unknown), written as an explicit assertion with a comment that names the semantics.
- **AC-T18-2 (the test is not vacuous):** Given the mutation "the late-DELETE branch writes `isOpen: false`" (or "reopens" if the flag semantic is the opposite), when the test runs, then it fails; `@dev` records the mutation in the test comment and in the results.
- **AC-T18-3:** if `@dev` finds that the flag semantics are unclear, `@data-engineer` documents them in one paragraph in `docs/stories/OPS-22/data-review.md`; no production code changes in this slice.
- **Order:** assertion Red against a mutated branch -> restore -> Green. Test-only change.

### Widget in the OBS of this machine (OPS-25 / ST-18, pre-bump subset)

Evidence classes stay separate: automated browser, native OBS/CEF on this machine (Linux). Nothing is claimed for Windows or macOS.
- **AC-W-1:** Given the Next overlay with the account widget link as an OBS Browser Source on the native OBS of this machine, when the source is reloaded (refresh and "refresh cache of the current page"), then the label returns with no black screen or authorization error; the time to show it is recorded (up to 5 s proposed, `@qa` fixes it against the first load). Covers OPS-25 AC 1.
- **AC-W-2:** 10 consecutive reloads, 10 labels. Covers OPS-25 AC 2.
- **AC-W-3:** after the panel session expires and after the API restarts, the same link still shows the label. Covers OPS-25 AC 3.
- **AC-W-4:** account change **in the panel** updates the label without a reload within the documented 1 s poll (`apps/shared/panel/overlay-renderer.mjs:176`, `:129`); the observed delay is recorded. Covers OPS-25 AC 5.
- **AC-W-5:** revoking the widget shows the safe unauthorized state; a new link works. Covers OPS-25 AC 6.
- **AC-W-6:** `@ux-design-expert` reviews the loading, authorized and unauthorized states over transparent and dark backgrounds (>= 9.0, review scope stated). Covers OPS-25 AC 7.
- **AC-W-7:** OBS and CEF versions, date, commit and URL type (capability link, no secret) are recorded in the OPS-25 story, en and pt-BR. Covers OPS-25 AC 8.
- **AC-W-8 (chat, pending):** the account change by `!fila conta` (OPS-25 AC 4) needs a real chat message on the real Twitch connection, which the owner did not authorize in the OBS test. It stays **pending the owner's OK**; until then the chat path is covered only by the fixture class.
- **Out of this subset:** OPS-25 AC 9 (Windows, macOS; "pending platform") and AC 10 (closing #57 needs the verdict and the owner's OK). A defect found becomes its own bug story; no fix is mixed in.
- **Rules during the run:** no stream start, no real redemption; the link is a capability link and is never written in documents; `@qa` runs it.

### D-6 — `degraded` from the start of the stream (diagnosis only)

Without live evidence, `@po` limits the promise: **make every `degraded` transition explain itself, and prove what is provable**. The root cause is closed only when a live run with the new logs identifies it.
- **AC-D6-1 (Red first):** Given the integration publishes `degraded` for `eventsub_disconnected`, `eventsub_startup_disconnected` or a revoked subscription (`integration.mjs:204-224`), when it happens, then one structured log line is written with a closed `reason` code (and the subscription `type` and `revokeStatus` for revocations), `level: warn`, without token, UID, chat text or connection string. Red: today these three paths write nothing.
- **AC-D6-2:** Given a transition into `degraded` from any source, then the line carries the same field set (`event: 'twitch_integration_degraded'`, `reason`, `trigger` where it applies) and the reconciliation line of FT-24 (`twitch_reconciliation_degraded`) is kept unchanged.
- **AC-D6-3 (no spam):** Given the status is already `degraded` with the same `reason`, when it is published again, then no second line is written (one line per transition) and a log failure never changes the status (the `try/catch` pattern of `logReconciliationDegraded`).
- **AC-D6-4 (what is testable now):** Given a fake EventSub runtime that disconnects before `onConnected` and a fake reconciliation that returns `partial` with the issue codes of the old D-5 cause, when the integration starts, then the logs name the right source for each case, in the order they occur.
- **AC-D6-5 (honest limit):** `/health` fields are unchanged. The D-6 line of the results file is annotated "diagnosable; root cause pending live evidence". Whoever transmits and sees `degraded` reads the log and names the cause; **this is owner-dependent** (needs "pode transmitir").
- **Order:** Red AC-D6-1/3 -> Green -> AC-D6-2/4.

## Research (item 3 of the request)

**No GAP for D-8 and no `@analyst` step before `@dev`.** The note on `docs/research-index.md` row 17 (Twurple 8.2.0 rate-limiter source VERIFIED, **SUFFICIENT**) and row 20 (installed Twurple source) cover the Helix client; the single-request behavior of `getUserById` was verified above in the installed source; the clock choice is a standard Node decision. What stays UNVERIFIED is the **live** value and whether a token refresh inflates one measurement; it is closed by the live check AC-D8-9 (OW-17), not by research. **REFRESH IF** `@twurple/api` leaves 8.2.0. For D-6 the Twitch EventSub documentation is not needed to add logs; if the live run shows an unexplained cause, the `@analyst` is asked then with the exact question.

## Extra steps (one agent at a time)

1. **`@architect` (one short note, no full review):** confirm for D-8 the shared async probe, the cache TTL/limit and the two error codes; for FT-53 the `reason` field and its closed list; for D-6 the closed `reason` list and the log field set. Output: one page, en and pt-BR, before `@dev`.
2. **`@ux-design-expert` (one dispatch, before `@dev` writes texts):** (a) `ping` and `ping` error formats in three languages (the owner format is binding; the review checks readability and length), (b) FT-53 text, (c) FT-54 addendum and the "recompensa" rule, (d) the widget states (AC-W-6), (e) **the notes D1 and D3 of wave 4**: D1 is behavior only (picker fallback to pt-BR, chosen locale kept while saving); D3 is visible CSS (+3 px between actions, +1 px notice text, scoped to `.reward-resolution-dialog`, `ts-10-wave-note.md` lines 27-29); the note should say whether the spacing and font are acceptable at 390x844 and 768x900, score >= 9.0, with static versus visual review stated.
3. **`@data-engineer`:** not needed (no schema, no migration, no new query); TS-18 may ask for one paragraph on the `isOpen` semantics only if `@dev` finds it unclear.
4. **`@analyst`:** not needed now (see Research).
5. **`@sm`:** register D-6 as a new row (proposed **FT-55**, parent #80, P2, S) and add the pre-bump notes to ST-18 and ST-19; the board shows the new Ready cards.
6. **`@devops`:** create the OPS-26 (slice A) and OPS-25 issues (bodies only, no comments) and the sub-issues of #80 just-in-time for FT-53, FT-54, TS-18 and FT-55.

## What depends on the owner

- "Pode transmitir" to reproduce D-6 live; without it D-6 is only made diagnosable (AC-D6-5).
- OW-17: the real `ping` on the channel (AC-D8-9), and the explicit OK for a real chat message in the widget step AC-W-8.
- Windows and macOS rows of OPS-25 (no session available; D-05 = B keeps macOS blocked); the final decision on #57.
- Native OBS/CEF run on this machine (AC-W-1..5): the authorization exists; the owner may need to open the scene or hand over the display to `@qa`.

## Order of execution for `@dev` (serial)

1. **TS-18** (test-only, small).
2. **`@architect` note and the single `@ux-design-expert` dispatch** (in parallel with 1 only if the quota allows; otherwise before 3).
3. **D-6** (AC-D6-1..4, logs only).
4. **D-8** (AC-D8-1..8).
5. **FT-53** (route first, text after UX).
6. **FT-54** (text, after the UX addendum).
7. **Single `@qa` gate** (min. 9.0) with these six items plus waves 5, 4 and 6; then the widget run on native OBS by `@qa` (AC-W-1..7) and the owner steps; then the bump. The widget run does not need new code.

## Closure of AC 9 and AC 15 of OPS-15 (pending since FT-43 / AC-43-4)

Evidence read today: `apps/` contains only `api`, `frontend`, `infra`, `shared`; `grep` for `API_ONLY` and `@fastify/static` under `apps/` and `package.json` returns nothing; commits of waves 0-3 exist (`08e84cb`, `384a7e7`, `ec12ae0`, `906fd5c`) with their `@qa` verdicts; waves 4, 5 and 6 are implemented test-first by `@dev` in the working tree, **not committed and without a `@qa` verdict**.

| Part of the AC | AC 9 (incremental waves, rollback) | AC 15 (retire the vanilla panel) |
|---|---|---|
| **Proven** | Waves 0-3 each had an independent `@qa` verdict and a commit hash (cutover-wave files, QA gates 2026-10-28 and 2026-10-29); no polling workaround or shim was found by the wave gates in the removed paths; `legacy` is a historical reference only (owner decision, no evidence needed); rollback = revert of the wave commit (process rule, no migration in the waves). | `apps/web` no longer exists in the tree; no `API_ONLY`, no `@fastify/static`; class-B contracts ported to Next tests (`ts-10-wave-note.md`); `/overlay.html` aliases removed in wave 3; archive route removed in wave 5 (legacy-row safety on isolated PostgreSQL). |
| **Pending evidence** | Waves 4, 5 and 6: the single `@qa` gate and the commit hashes (record hash, verdict and evidence classes per wave). | The same `@qa` gate and the commit (the removal is only in the working tree); **native OBS/CEF** with the new `/overlay` link (never run; covered by the widget run AC-W-1..5); **screen reader and assistive-technology run of the Next panel** (never executed); Windows/macOS. |

`[AUTO-DECISION]` Close AC 9 and AC 15 as "closed in what the evidence proves, with the pending rows named" and not as "Done". (Reason: the rule is not to claim what was not executed; the unified `@qa` gate and the native/AT runs are real gaps.) AC 9 and AC 15 are marked in the OPS-15 story, en and pt-BR, with this table's content in short form; their text is not changed. They become fully closed when the gate PASS is recorded with the hashes of waves 4-6; the OBS and screen-reader rows stay "pending evidence" until executed.

## Files changed by this validation

- This file and its pt-BR twin.
- `docs/stories/OPS-15/story.md` and pt-BR: closure notes under AC 9 and AC 15 and one Change Log row.
- `docs/stories/OPS-22/story.md` and pt-BR: explicit limit of AC 16 (restored pause, gate item f) and one Change Log line.
- `docs/stories/OPS-26/story.md` and pt-BR, `docs/stories/OPS-25/story.md` and pt-BR: Change Log line with the pre-bump decision (status unchanged: Draft).
- `docs/process/backlog-inventory.md` and pt-BR: FT-53, FT-54, TS-18 Ready; ST-19 and ST-18 notes.
