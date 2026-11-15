# OPS-31 — Natural queue notices and refund of channel points by group

[Português (pt-BR)](../../pt-BR/stories/OPS-31/story.md)

**Status:** Ready (drafted by `@sm` on 2026-11-06). `@po` **GO 8.7/10** on 2026-11-06 ([po-validation](po-validation.md)); moved to Ready on 2026-11-06 once the issue existed (project rule: Ready = GO + issue). **Issue:** [#115](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/115) (created by `@devops`; body in [issue-body-changes-2026-11-06b](../../process/issue-body-changes-2026-11-06b.md)).

**Source:** owner request of 2026-11-06 and the `@analyst` research note [2026-11-06-queue-group-refund](../../research/2026-11-06-queue-group-refund/README.md) (feasibility SUFFICIENT, 9.1/10; sections cited below as "note §N").
**Related:** OPS-20 (refund by subscriber status; `@architect` and `@data-engineer` treat it and this story as one design, note §8.1), OPS-22 (financial recovery; the outbox and its read-verify are reused unchanged), OPS-26 (system chat commands), OPS-23 (SSE; the widget "next"), FT-70 (document the duplicate-entry refund), FT-68/FT-69.
**Registered items:** inventory **ST-24** (this story) and slices **FT-71..FT-78**; proposed scope of the 0.4.0-beta+ (owner, 2026-11-06). See [backlog-inventory](../../process/backlog-inventory.md).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (decision service, one terminal intent per redemption, send queue for notices), `$aiox-data-engineer` (schema), `$aiox-ux-design-expert` (plan and review, minimum 9.0, before the `@dev`), `$aiox-analyst` (done: the note; new research only for a GAP), `$aiox-devops` (issue), independent `$aiox-qa` (test plan, real-channel run, verdict).

## Problem

- The queue works but is silent: the viewer is not told the position or what to do, a no-show or a skipped turn leaves no trace in chat, the end of a service is not announced and the widget does not show who is next.
- The streamer cannot reward a group (subscribers, moderators, VIPs, own list) by returning the points of a redemption. Today every normal redemption is fulfilled when service starts; a fulfilled redemption **can never be refunded** through the API (note §3), so the choice must be made once, from a decision persisted before the Twitch call.

## Story

As a streamer,
I want the queue to talk to the viewers in chat, to handle no-shows and reordering visibly, and to return the points of the groups I choose,
so that the queue feels natural and the viewers I want to reward keep their points.

## Owner decisions taken as given (2026-11-06)

- The queue flow **keeps** `redemption.fulfill` when service starts (`in_progress`) for normal redemptions.
- Scope: (1) chat notice on joining (position and instruction); (2) no-show / skip / reorder with a chat message; (3) end-of-service message and "next" in the widget; (4) pause or close the queue with a notice (new redemptions refused with a refund); (5) refund by group at the streamer's discretion.
- Groups: subscribers (paid, gifted and Prime), moderators, VIPs and the streamer's own list; **the streamer counts as a member of the group**.
- OAuth scopes: **one per enabled group** (subscribers `channel:read:subscriptions`, moderators `moderation:read`, VIPs `channel:read:vips`; own list needs none); already connected channels reauthorize once.
- Lookup failure: **ask the streamer** (the entry is marked "check group" in the panel and the streamer decides to refund or not); never refund or fulfill by itself.
- **Moment of the refund (owner decision, 2026-11-06): a single moment, when the service ends.** For the special group the redemption stays `UNFULFILLED` during the whole service and is `CANCELED` when the service is concluded. There is no refund on joining and no refund on start. The panel explains, on the control itself, that the points only return after the service ends (retention accepted).
- **Cancel, skip or no-show of a special-group entry (owner decision, 2026-11-06):** the streamer decides on the spot whether the points return; no automatic refund; the chat informs the person.
- Non-group redemptions are still fulfilled when service starts.

## Scope

**In (slices, in the order of the Dependencies section):**

- **FT-71 (a)** chat notices (join, end of service, pause/close) and their texts in pt-BR, en and es.
- **FT-72 (b)** no-show, skip and reorder with a chat message.
- **FT-73 (c)** "next" in the OBS widget.
- **FT-74 (d)** per-queue `settlement` setting and refund groups (data model, panel, own list).
- **FT-75 (e)** group lookup, optional scopes, reauthorization.
- **FT-76 (f)** refund when the service ends (the only refund moment).
- **FT-77 (g)** "check group" state in the panel.
- **FT-78 (h)** real-channel tests.

**Out of scope:** Send Chat Announcement (note §6: plain messages suffice); a persistent roster of subscribers/mods/VIPs (store the decision only, note §4.3 and §7); EventSub-driven rosters; refunding rewards not created by this product; rewards that skip the request queue (never refundable); a tier restriction (unless the owner asks); release, tag, bump.

## Acceptance criteria

Evidence classes stay separate: unit, isolated PostgreSQL integration, fake Twurple, real channel. Every behavior starts with a failing test.

### Group A — chat notices (FT-71)

1. **Given** a redemption that creates an entry, **when** it is accepted, **then** the chat receives one message with the viewer's position and the instruction to follow, in the channel language.
2. **Given** a service that ends, **then** the chat receives an end-of-service message.
3. **Given** a queue paused or closed, **then** the chat receives one notice, and **given** a new redemption while paused or closed, **then** it is refused with a refund (`CANCELED`) and the viewer is told why.
4. **Given** a burst (clear, close, mass reorder), **then** at most one summary message per event type is sent through a bounded send queue below 100 messages per 30 s; the "your turn" call has priority; informational notices are merged or dropped on overflow and never retried forever; `is_sent != true` counts as not delivered (note §6).
5. **Given** the notices, **then** each can be turned off per queue, the three languages exist, no text carries a user id, token or chat body in logs, and a message never exceeds 500 characters.

### Group B — no-show, skip, reorder (FT-72)

6. **Given** an entry the streamer marks as no-show or skips, **then** the entry changes position or state by a defined rule, the chat gets a message with the new situation, and the action is reversible by the streamer where the rule allows.
7. **Given** a manual reorder, **then** affected viewers are informed with one aggregated message (AC 4).

### Group C — widget (FT-73)

8. **Given** a running service with a waiting entry, **then** the account widget shows "next" with the next viewer's display name; **given** no waiting entry, **then** it shows nothing misleading. Widget checks follow the OPS-25 method (native OBS) and are a separate evidence class.

### Group D — settlement setting and groups (FT-74)

9. **Given** a queue, **then** it has `settlement` (`fulfill_on_start`, the default, or `refund_on_end` for the chosen groups) and a set of refund groups (`subscriber`, `moderator`, `vip`, `own_list`); an empty set refunds nobody; existing queues migrate to `fulfill_on_start` unchanged.
10. **Given** the own list, **then** it stores only the numeric user id plus an optional label, resolves the typed login once at add time, supports remove and clear-all, and holds at most 500 people (adding the 501st is refused with a stable code and a clear message). `@architect` decided (D-31-7): the list is **one per channel, not per queue**; it is deleted with the channel data; deleting a queue removes only that queue's `own_list` switch, never the people. [AUTO-DECISION `@po`: limit 500 (design proposal accepted; reason: far above any real streamer circle, bounds the stored viewer ids, and the lookup is a database read; the value is one configuration constant, reversible without migration).]
11. **Given** the `refund_on_end` control, **then** the panel explains in plain words, on the control itself, that the status is checked at the decision moment and that **the points only return after the service ends** and are held until then.
12. **Given** a refund mode, **then** it is disabled unless: the reward was created by this product, skip-request-queue is off, the channel is affiliate or partner, and the scope of each enabled group is granted. Reward and queue deletion are blocked while refundable redemptions are pending.

### Group E — group lookup and scopes (FT-75)

13. **Given** a redemption, **when** the decision runs, **then** the result is `eligible | not_eligible | unknown`, persisted once per redemption (`matched_group`, `settlement_mode`, `checked_at`, `unknown_reason`) before any Twitch call; a retry never re-queries and flips the answer.
14. **Given** the streamer, **then** the rule `user_id == broadcaster_id` makes them eligible without a call; a viewer in several groups matches by a fixed order (own list, moderator, VIP, subscriber).
15. **Given** a missing scope, 401/403/429/5xx, timeout, malformed body or non-affiliate channel, **then** the result is `unknown`, never "not a member".
16. **Given** a group being enabled, **then** only that group's scope is requested (accumulating with the granted set), the panel shows "Reconnect Twitch to enable this group" and the required scopes stay unchanged so existing connections keep working; the granted list is verified with `/validate`.

### Group F — refund when the service ends (FT-76)

17. **Given** a member of an enabled group in a `refund_on_end` queue, **when** service starts, **then** `redemption.fulfill` is skipped and the redemption stays `UNFULFILLED` during the whole service; **when** the service is concluded, **then** `redemption.cancel` refunds it. `redemption.cancel` is issued **only** on conclusion; non-members are fulfilled at start as today.
18. **Given** two intents for one redemption (finish and remove, retry and start), **then** only one final operation exists per redemption (unique constraint written in the same transaction as the decision; the decision is persisted before any Twitch call). A contradictory late request is refused with a stable code, audited (`settlement.contradictory_request`) and shown in the panel with the recorded outcome ("already decided: refund / no refund"); it never changes the recorded operation; when the recorded operation itself needs review (OPS-22 `unknown`, `conflict`, `failed`) it stays in the OPS-22 manual resolution. A late request from an automatic rule (switch, timer) keeps today's downgrade, with the audit row.
19. **Given** a second cancel (Twitch answers 404), **then** the read shows `CANCELED` and it resolves as already done, tested with the real Twurple class.

### Group G — cancel, skip and no-show of a special-group entry (FT-76, FT-72)

20. **Given** a special-group entry the streamer cancels, skips or marks as no-show, **then** the panel asks right then, with two clear choices ("refund the points" and "do not refund") and text that says the choice is final; the decision is persisted before any Twitch call, a single final operation is issued per redemption (D-31-4: refund = `redemption.cancel`; **"do not refund" = `redemption.fulfill` recorded at the moment of the choice**, never left `UNFULFILLED`), nothing is refunded automatically, and the chat tells the person the outcome in pt-BR, en and es after Twitch confirms (AC 33). **Skip** keeps the entry in the queue (it returns to `waiting`) and does **not** ask about points; the question is asked when the entry leaves the queue.

### Group H — "check group" state (FT-77)

21. **Given** an `unknown` decision (a lookup failure of AC 15 with no positive answer in another group), **then** the redemption stays `UNFULFILLED`, the entry is marked "check group" (never mixed with the OPS-22 financial `unknown`) and the service start does not fulfill it, while the service itself still starts; the panel offers retry now, refund, fulfill, or keep; nothing happens without the streamer's action; if the service ends with the entry still unresolved, the conclusion does not decide for it: the entry stays `UNFULFILLED`, listed as pending with the same four choices.

### Group I — real-channel tests (FT-78)

22. **Given** the exclusive SubaruShogun test channel, **then** `@qa` runs the six checks of the list below with a verdict, recorded by class; no platform result outside what was run is claimed.

### Cross-cutting

23. **Given** logs and errors, **then** no user id, login, token, header, chat or redemption body appears; only counts and reason codes (`matched_group`, `unknown_reason`); unexpected failures return the generic localized text with `referenceId`.
24. **Given** the documentation, **then** user guide, panel copy and docs exist in English and pt-BR; localization and documentation-contract tests pass.
25. **Given** the quality gates, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green.

26. **Given** a special-group entry closed without a service (queue clear, queue delete, removal of waiting entries, viewer leaves, removed while called), **then** the outcome follows the trigger table of D-31-4; consistent with the owner decision, nothing is refunded automatically and the streamer decides on the spot. For clear and delete, in two steps (D-31-6): (1) *prepare* looks the groups up in chunks of up to 100 ids and returns **counts only** (non-members, members, check group); (2) *confirm* applies one choice to the members ("refund all", "do not refund" or "decide one by one") in the same transaction that removes the entries, guarded by the confirmation snapshot (a stale snapshot is refused). Non-members keep today's per-trigger switches; a 429 waits once, within a short bound, and the affected chunk becomes `unknown` (`rate_limited`); the clear itself never fails because of the lookup; the result text says "requested" or "pending", never "refunded", until Twitch confirms. [`@po` AUTO-DECISION of 2026-11-06 confirmed by `@architect` (D-31-6); no owner question.]
27. **Given** abuse by re-entering to be refunded again, **then** the design records the duplicate-entry and per-user limits in force (FT-70) and the live test closes whether a `CANCELED` redemption restores the reward limits (real test item 2); no automatic penalty is invented.
28. **Given** a paused or closed queue that refuses a redemption (AC 3), **then** this refusal refund is a separate case from the group refund (it happens before any service, only for rewards created by this product, and is not subject to the single end-of-service moment); the texts do not mix the two.

### Added after the `@architect` design (2026-11-11; `architect-design.md` section 9)

29. **Given** an entry that left the queue by no-show, **when** the streamer restores it (`no_show→waiting`), **then** the restore is allowed only while its redemption has no terminal operation (settlement state not `intent_recorded`) and the viewer has no other active entry; after a refund or a fulfill was recorded the entry is final (D-31-4, design section 4).
30. **Given** the `refund_on_end` setting, **when** it is saved before the refund-at-the-end slice (FT-76) is delivered, **then** the API refuses it with a stable code, so no queue can hold points with half a feature; the single migration of FT-74 already carries every column (existing queues stay `fulfill_on_start`).
31. **Given** a trigger that cannot ask the streamer (call timer, viewer-leaves chat command, removal by a chat command), **when** the entry is a member's, **then** it never decides for a member: the entry closes and the redemption is listed as `awaiting_choice` (waiting for the streamer's decision); a choice is never accepted from chat.
32. **Given** a clear or delete batch choice (AC 26), **then** it applies to members only; redemptions in `check_group` are never decided by it (they keep the four choices of AC 21, with their own batch actions in the pending list); queue and reward deletion stay in `deleting` while any redemption is `held_for_service`, `awaiting_choice` or `check_group`.
33. **Given** a refund or a no-refund outcome, **then** the chat tells the person that the points were returned only after Twitch confirms the remote status (the worker read-verify); a missing answer is never a confirmation and never produces the notice.


## Owner decision on closings without service (2026-11-06)

The refund moment is a single one, when the service ends. For a special-group entry that is canceled, skipped or marked as no-show, the owner decided on 2026-11-06 that **the streamer decides right then** whether the points return; there is no automatic refund in those cases. No question to the owner is pending. Design question for `@architect`: which terminal operation applies to "do not refund" (fulfill the redemption, or another outcome) and how the single final operation per redemption is guaranteed.

## Open owner items (not blocking; `@architect` OW-31-1, 2026-11-11)

- **OW-31-1 (decided by `@po` as a reversible AUTO-DECISION).** In a `refund_on_end` queue, a waiting non-member who is removed or leaves is refunded automatically (today's rule), while a member waits for the streamer's choice. Decision: **keep "nothing automatic for members"** (owner rule of 2026-11-06: the streamer decides on the spot; refunding members automatically would also contradict AC 31). Reason: the alternative would refund members at triggers where the owner asked to be asked, and it can be added later by a setting without migrating past decisions. The owner may reverse it at any time; it blocks nothing. The panel copy must state the difference in plain words (`@ux-design-expert`).
- **Own-list maximum:** 500 (AC 10), accepted.
- **Owner-only, for FT-78:** reconnect the test channel with the new scopes and perform the real redemptions.

## Dependencies

- **Before the `@dev`:** `@analyst` note (done); `@architect`, `@data-engineer` and `@ux-design-expert` (score at least 9.0) opinions; `@po` GO and the issue.
- **Order (confirmed by `@architect`, design section 6; numbering unchanged):** FT-71 (brings the limiter and `chat.notice`) -> FT-72 (depends on FT-71; no money change) -> FT-73 (independent, may run beside 1-2; OPS-23 for refresh) -> FT-74 (**one migration** with every column; the API refuses `refund_on_end` until FT-76, AC 30) -> FT-75 (depends on FT-74; decision service and adapter tested alone) -> FT-76 (depends on FT-72, 74, 75; the money slice, closes AC 20 and AC 26) -> FT-77 (depends on FT-76; adds the four actions and the list) -> FT-78 (two runs: notices after 1-3, money after 4-7). One `@qa` gate at the end; **FT-76 and FT-77 are validated together**. FT-76 and FT-77 use the "very complex" model tier; the other slices are common tasks.
- **Related stories:** OPS-23 for the widget refresh.
- **OPS-20 is substituted (confirmed by `@architect`, D-31-9; recorded by `@po` 2026-11-11):** OPS-20 is **not implemented**. OPS-31 replaces its rule and audiences (ACs 1, 2, 9, 10), the trigger rule (AC 4 becomes the table of D-31-4), absorbs ACs 5-8, 11-12 and 14, and decides AC 13 (non-eligible: fulfill at start). Gifted/minimum-tier options (AC 3) are **out** (owner: paid, gifted and Prime all count; reopen only on owner request). ACs 15-17 are replaced by the OPS-31 gates. **Pending for `@devops` (not done by the `@po`; the inventory is not edited here):** close issue #76 as superseded by #115, or update its body to say so (body edit only, never a comment), and update the OPS-20 entry of the inventory and board. **Two residues for the backlog (not OPS-31 scope):** R1 (refunding a non-member by hand after the start is impossible on Twitch; before the start, removing the entry already does it: no work, record only) and R2 (a no-show or a called removal with the switch off leaves a normal redemption `UNFULFILLED` forever; recommended follow-up: fulfill in that case). The next bullet is the earlier `@po` position, kept for history.
- **Relation to OPS-20 (earlier `@po` position; `@architect` confirmed in the design, AC 26):** OPS-31 is the umbrella design and OPS-20 is **not** implemented separately. OPS-31 supersedes the OPS-20 rule "everyone / subscribers only / nobody", its audiences and its subscriber definition (OPS-20 ACs 1-3 and 9-10 become the groups of OPS-31 ACs 9-16; the OPS-20 default "refund on every trigger" gives way to the single moment). OPS-20 ACs 5-7 and 14 are absorbed by OPS-31 ACs 13-15, 18 and 21; OPS-20 AC 8 (manual override) by ACs 20-21. OPS-20 still owns, until the `@architect` rules: the batch lookup and rate limit of queue clear (OPS-20 ACs 11-12), the handling of non-eligible redemptions (OPS-20 AC 13; here the owner decision "fulfill at start") and the configurable subscriber definition (gifted / tier; OPS-31 counts paid, gifted and Prime). OPS-20 stays open (#76) and is closed or reduced only by the `@architect` and `@po` after that record.
- **Relation to OPS-22:** the outbox, bounded retries, read-verify and manual resolution are reused unchanged; the end-of-service `redemption.cancel` and the "do not refund" fulfill are outbox intents; the OPS-22 `unknown` and the group `unknown` (AC 15) are different states and must not be mixed in the panel.

## Risks

1. **Race fulfill vs cancel.** Mitigation: AC 18 (one terminal intent), read-verify, manual resolution.
2. **Group lookup fails.** Mitigation: `unknown` waits for the streamer (AC 15, 21); never auto-decide.
3. **Held points** until the service ends (expiry of an UNFULFILLED redemption is unverified). Mitigation: panel copy (AC 11); owner accepted retention.
4. **Abuse:** members re-entering to be refunded again. Mitigation: duplicate-entry and per-user caps; live test of whether a canceled redemption restores the reward limits.
5. **User id in logs or roster.** Mitigation: AC 10 and 23; store only the decision and the own list.
6. **Chat bursts and dropped messages.** Mitigation: AC 4.
7. **Reauthorization friction.** Mitigation: one scope per group, clear panel copy.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 5, integration 4, infrastructure 2, knowledge 3, risk 5 = **19 → COMPLEX** (6 phases plus a revision cycle). Confirmed by `@architect` on 2026-11-11 (the `@sm` estimate was 17; scope and risk raised by one each). Difficulty **GG**, priority **P2**.

## Test plan

1. **Unit and fake Twurple:** decision service for each group and for `unknown` causes; terminal-intent uniqueness; double cancel with the real Twurple class; notices queue and limits.
2. **Isolated PostgreSQL with real migrations:** `settlement`, groups, own list, decision columns, default migration, race by constraint.
3. **Panel and widget:** component tests and the browser scripts; visual evidence separate from static review.
4. **Real channel (SubaruShogun test channel):** `@qa` creates queues and rewards; the Orion performs the redemption actions in Chrome; `@qa` records the verdict.
5. **Gates:** the seven project gates; `@qa` verdict before `@devops` commits.

### What only a real test closes (note §11)

1. Whether Twitch expires an UNFULFILLED redemption.
2. Whether a CANCELED redemption restores the reward's per-user/per-stream limit and cooldown.
3. Whether `...redemption.update` fires for changes made by the app itself.
4. How Prime is represented in the subscription lookup.
5. Whether the broadcaster appears in their own subscriber, moderator and VIP lists.
6. What the second authorization carries (only the newly requested scopes or the whole set).

## Planning gates before implementation

- [x] `@po` validation (10 points) and GO (8.7/10, 2026-11-06).
- [x] `@devops` creates the GitHub issue (#115, 2026-11-06).
- [x] `@architect` design ([architect-design](architect-design.md), D-31-1..D-31-11, 2026-11-11); its section 9 wording applied here (ACs 10, 18, 20, 21, 26 and new 29-33).
- [ ] `@data-engineer` schema opinion.
- [ ] `@ux-design-expert` plan and review, score at least 9.0.
- [ ] `@qa` test plan.

## Definition of Done

- ACs 1 to 33 have recorded evidence by class; the six real-test items are closed or recorded as pending.
- Quality gates green; `@qa` verdict recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-06)

1. Goal and context: clear (silent queue; irreversible fulfill). PASS.
2. Technical guidance: design from the note; open points assigned to specialists. PASS.
3. References: note sections, OPS-20, OPS-22, FT-70. PASS.
4. Self-containment: scope, out of scope, owner decisions (including the single refund moment and the closings without service) stated. PASS.
5. Testing: unit, PostgreSQL, real channel, the six open items. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po`, with no question pending. Priority and order are proposals.

## File List

- `docs/stories/OPS-31/story.md` (new; amended 2026-11-11 for the `@architect` design)
- `docs/stories/OPS-31/architect-design.md` (new, `@architect`)
- `docs/stories/OPS-31/po-validation.md` (reconfirmed 2026-11-11)
- `docs/pt-BR/stories/OPS-31/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md`, `docs/process/kanban-board-design.md` and pt-BR twins (ST-24, FT-71..FT-78)
- `docs/process/issue-body-changes-2026-11-06b.md` and pt-BR twin (issue text)
- `docs/session-handoff.md` and pt-BR twin (state block)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-06 — `@sm` (River): story drafted from the owner request and the `@analyst` note. Status Draft. Slices FT-71..FT-78 registered. [AUTO-DECISION] item ID in the inventory → ST-24 (reason: next free story ID); all priorities P2. 2026-11-06 (Orion, owner decision): the only refund moment is when the service ends; refund on joining and on start removed, the slice "refund on joining" deleted, the later slices renumbered; closings without service decided by the owner on 2026-11-06 (the streamer decides on the spot).
- 2026-11-06 — `@po` (Pax): validation, **GO 8.7/10**, see [po-validation](po-validation.md). Edits by the `@po`: order corrected (FT-76 before FT-77); relation to OPS-20 and OPS-22 stated; ACs 26-28 added (bulk closings, abuse, refusal refund); AC 21 completed (service ends with an unresolved entry). Status stays Draft until the GitHub issue exists (Ready = GO + issue).
- 2026-11-06 — `@devops` (Gage): issue [#115](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/115) created; status moved Draft → Ready (mechanical, per the `@po` GO and the Orion authority; ACs untouched).
- 2026-11-11 — `@po` (Pax): ACs adjusted to the `@architect` design ([architect-design](architect-design.md), section 9), **GO reconfirmed 9.3/10** ([po-validation](po-validation.md)). Changed: AC 10 (one own list per channel, max 500, queue deletion removes only the switch), AC 18 (contradictory request refused with a stable code, audited, shown; OPS-22 review stays), AC 20 ("do not refund" = `redemption.fulfill` recorded at the choice; skip does not ask), AC 21 (`unknown` -> "check group", service still starts), AC 26 (two-step batch with counts, 429 bound, "requested/pending" wording). New: ACs 29-33 (restore only without terminal operation; API refuses `refund_on_end` until FT-76; automatic triggers never decide for members; batch choice for members only; chat notice only after Twitch confirms). Complexity 17 -> 19. OPS-20 recorded as substituted (pending actions for `@devops`). [AUTO-DECISION] OW-31-1 -> keep "nothing automatic for members" (reversible; owner may switch later; not blocking). [AUTO-DECISION] own-list maximum 500 accepted. ACs 1-9, 11-17, 19, 22-25, 27, 28 untouched; numbering kept stable (new ACs appended).
