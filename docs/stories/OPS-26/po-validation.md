# OPS-26 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-26/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-10-28 — **Mode:** YOLO (autonomous; decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) (en) and [pt-BR](../../pt-BR/stories/OPS-26/story.md), as drafted by `@sm` on 2026-10-27 (complete: every section present, Change Log and `@sm` draft check included). **Issue:** pending.
**Sources checked:** `.claude/rules/story-lifecycle.md`, `.aiox-core/development/tasks/validate-next-story.md`, [live-battery-2026-10-26-results.md](../OPS-15/live-battery-2026-10-26-results.md) row LB-23, `apps/api/src/commands/help.mjs` lines 76-79 (`renderPingResponse` reads `twitchHealth?.pingMs`, otherwise `chat.ping.unavailable`), `apps/api/src/health-route.mjs` lines 42-84 (cached probe `pingMs`, exposed as `twitch_api_ping_ms`), `apps/api/src/commands/catalog.mjs` (fixed `streamer` permissions already exist), the chat catalogs `apps/web/localization/catalogs/chat/{pt-BR,en,es}.tsv`, `package.json` (`validate:version`), `docs/process/backlog-inventory.md`.

## Verdict

**GO — 9.0/10.** Status stays **Draft**: the project rule "Ready = `@po` GO + existing issue" applies, the issue does not exist, and the owner placed the story **after** the cutover and the merge of `feat/ops-15-next-panel` into `main` (ST-01 / #69). `@po` does **not** mark Ready.

## Scores

| # | Point | Score | Evidence / note |
|---|---|---|---|
| 1 | Clear, objective title | 1.0 | Two commands, each with its outcome. |
| 2 | Complete description | 1.0 | D-8 with the exact chat reply and the `/health` value; the code leads are real (`help.mjs:76-79`, `health-route.mjs`); the root cause is honestly marked unverified. |
| 3 | Testable ACs | 1.0 | Nine Given/When/Then ACs; the owner-mandated three-case test (present / absent / Twitch failing) is explicit in AC 1-2; allowlist and refusal are testable. |
| 4 | Scope IN/OUT | 1.0 | IN traces to the owner request; OUT keeps `version`/`uptime` as a suggestion only, no panel, no SSE, no bump. |
| 5 | Dependencies | 0.5 | ST-01/#69 merged in `main`, `@architect`, UX, OPS-22. Deductions: D-8 and the new owner-work ID **OW-17** are not yet registered in the backlog inventory (only in this story); the write set does not mention that the localization catalogs move to `apps/shared/localization/catalogs/` in cutover Wave 2 (DP-3), so the path the story will touch is the post-Wave-2 one. |
| 6 | Complexity | 1.0 | 10 → STANDARD, M, P2. |
| 7 | Business value | 1.0 | Removes a recurring false "unavailable" and gives the streamer one-message health. |
| 8 | Risks | 1.0 | Rate limit, data leak (allowlist test), chat length × 3 languages, unknown root cause. |
| 9 | Definition of Done | 1.0 | Red-first evidence by class; AC 9 executed or explicitly waived by the owner; gates listed. |
| 10 | Alignment with sources/owner decisions | 0.5 | Matches the owner decisions of 2026-10-27. Deductions: (a) the version form is left open between owner decision 2 (`vMAJOR.MINOR.PATCH-stage`, example `v0.2.0-beta`) and AC 1 (`<version>`); (b) LB-23 is graded **PASS** in the live-battery results while this story classifies it as defect D-8 — the story should say why (the battery checked that `ping` answers; the owner later classified the missing latency as a defect). |

**Template / executor fields:** this project's stories do not use the `executor` / `quality_gate` fields of `story-tmpl.yaml`; not a deduction. **Static analysis plan:** `npm run review:static` is in the gates, with the full project gate list; findings block. **Security:** allowlist of `status` fields with an exact-keys test; no tokens, UID, chat or redemption text; honest error with a code, no internal message; failure logged without user data. PASS.

## `[AUTO-DECISION]` Exact version form of `ping` (planning gate "exact version form fixed")

`[AUTO-DECISION]` Which version form does `ping` show? → **The owner format is binding: `Pong 🏓 - vMAJOR.MINOR.PATCH-stage - <value>ms.`, i.e. without the commit segment (today `Pong 🏓 - v0.2.0-beta - 219ms.`).** `@architect` confirms only *where* the string comes from (derive it from the same source as `validate:version`, no second version constant). (Reason: owner decision 2 states the format and gives the example; the commit segment `0000000` appears only in today's runtime string, not in the owner's request. If the owner wants the commit segment back, that is a new owner decision.) `@sm` writes this into AC 1 and ticks the "exact version form fixed" half of the first planning gate.

## Required corrections (owner of the edit: `@sm`, en and pt-BR; before the `@architect` gate)

1. **AC 1:** replace `<version>` with the fixed form above (`vMAJOR.MINOR.PATCH-stage`, no commit segment) and add it to the unit test of AC 1.
2. **Inventory:** register D-8 (defect, source LB-23) and OW-17 (owner live check of `ping`/`status`) in `docs/process/backlog-inventory.md` (+ pt-BR), linked to this story (this is in the `@sm` brief of 2026-10-27; listed here so it is not lost).
3. **Source note:** one sentence explaining that LB-23 was graded PASS for "the bot answers `ping`", and that the owner classified the missing latency as defect D-8 on 2026-10-27.

## Should-fix (non-blocking)

1. Write set: name the catalog path after cutover Wave 2 (`apps/shared/localization/catalogs/`, DP-3) instead of "the three localization catalogs", since the story starts after the merge.
2. AC 5: state the chat length limit used by the existing `bounded()` helper (500 characters, `help.mjs`) as the bound for splitting, so the length test has a number.

## Final status

**GO 9.0/10 — Draft kept** (no issue; blocked until ST-01/#69 is merged into `main`). Next: `@sm` applies required corrections 1-3; `@architect`, `@ux-design-expert` and `@qa` gates run when the story is unblocked; `@devops` creates the issue when it is ready; then `@po` records the Draft → Ready transition in the story Change Log. `@po` did not edit the story file (write set of this session).
