# OPS-27 — `@po` validation (`*validate-story-draft`, 10 points)

[Português (pt-BR)](../../pt-BR/stories/OPS-27/po-validation.md)

**Validator:** `@po` (Pax) — **Date:** 2026-11-05 — **Mode:** YOLO (autonomous; decisions marked `[AUTO-DECISION]`)
**Story:** [story.md](story.md) — **Issue:** [#104](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/104) (exists, created by `@devops`).
**Sources checked:** `.claude/rules/story-lifecycle.md` (10 points), `.aiox-core/development/tasks/validate-next-story.md`, `AGENTS.md` (rule "never expose the session URL", 2026-10-29), [improvement-ideas-2026-11-04.md](../../process/improvement-ideas-2026-11-04.md) (idea 5), [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (9.5 ruler, idea 5, AÇ-21..AÇ-26), [research-index.md](../../research-index.md), [qa-gate-2026-11-05.md](../OPS-15/qa-gate-2026-11-05.md) (OPS-22 package committed and pushed; the gate read OPS-27 AC 1-10), `.github/workflows/` (ci.yml, main-cd.yml, quality-gates.yml, release.yml: no hook directory and no `core.hooksPath` exist today).
**Writing note:** patterns in this file are defused (`claude\.ai/`, the name `Claude-Session` without its colon), so the future check does not flag it.

## Verdict

**GO — 9.0/10.** Status: **Draft → Ready** (GO + issue #104). Ready means "validated for planning"; the slice gates of the story (`@architect`, `@qa` plan, `@devops` workflow review) still apply before `@dev` starts. The UX gate is **not applicable** (confirmed: developer-facing only, no screen, no user-facing text; the output lines are governed by AC 11).

## Scores

| # | Point | Score | Evidence / note |
|---|---|---|---|
| 1 | Clear, objective title | 1.0 | Names the object (sensitive-data leaks) and the four surfaces. |
| 2 | Complete description | 1.0 | Incident (session URL in 45 commits of a public repository), text-only protection, recovery cost, false-positive problem. |
| 3 | Testable ACs | 1.0 | 11 Given/When/Then ACs; evidence class per AC (unit, real Git in a temporary repository, CI); output never echoes the value; AC 7 hand mutation per rule; AC 11 fail-closed with distinct exit codes. |
| 4 | Scope IN/OUT | 1.0 | Two ordered slices (FT-45, FT-46); OUT lists history rewrite, force push, rotation, third-party scanners, repository settings, OPS-28 rules, `AGENTS.md` text, bump/commit/push/PR. |
| 5 | Dependencies | 1.0 | OPS-22 package committed (satisfied); workflow serialization with OPS-29/OPS-30; ownership against OPS-28; OPS-24 script language; allowlist seed as data. |
| 6 | Complexity | 1.0 | 12 STANDARD, difficulty M, priority P1 with a recorded reason; `@architect` confirms. |
| 7 | Business value | 1.0 | A leak stops at the commit or the PR instead of at a public history rewrite. |
| 8 | Risks | 0.5 | Six risks cover false positives, `--no-verify`, echo of the value, body injection, regex cost, workflow conflicts. **Missing: false negatives** (see correction 1). |
| 9 | Definition of Done | 1.0 | ACs 1-11 by class; CI part executed or recorded as pending; gates green; `@qa` verdict and 9.5 attestation. |
| 10 | Alignment with sources and owner decisions | 0.5 | Matches the owner request (2026-11-04), the survey and the `AGENTS.md` rule. Deductions: the ruler's exit criteria still say "ACs 1 to 10" (the story has 11) and the baseline range is not pinned (corrections 2 and 3). |

## Checks requested in the order

1. **ACs testable and without invention.** Every requirement traces to a source: the session host, the trailer name and the four surfaces to the incident of 2026-10-29 and the `AGENTS.md` rule (which names commits including the trailer, PR bodies, issue bodies, files); the credential families (rule c) to idea 5 of the survey ("tokens") and the owner request of 2026-11-04, **not** to the `AGENTS.md` text. `[AUTO-DECISION]` Accept rule (c) as in scope (reason: it is in the owner-requested idea and in the ruler dimension C; the story forbids `@dev` from inventing formats and assigns the list to `@architect` from public provider documentation). Nothing else is invented.
2. **FT-45 and FT-46 independent, with Red/Green.** FT-45 (pure function, hooks, allowlist, manual run, ACs 1, 2, 3, 7, 11) is deliverable and testable alone. FT-46 (CI job, body as data, issue pre-send step, baseline, ACs 4, 5, 6, 8) needs the FT-45 script, which is the declared order, not a hidden coupling. Each slice has Red written first and a guard column. Slice AC map is complete (AC 9 and 10 are cross-slice). PASS.
3. **Owner versus `@dev`.** Correctly separated in "Owner dependencies": `AGENTS.md`/`CLAUDE.md` wording (agents only propose), repository settings (push protection, required check, branch rules; optional, the story works without them), a real credential found by the baseline (the story stops and reports; rotation, history rewrite, force push owner-reserved), merge/tag/release. The `issues`-event run is technical unless it needs a new permission or secret. Everything else (script, hooks, tests, docs, workflow draft) is `@dev`, with the workflow reviewed by `@devops`. PASS.
4. **Target 9.5 measurable.** The ruler (four dimensions, average >= 9.5, none below 9.0, only `@qa` attests) is objective and each dimension has an observable exit criterion in the story and in the ruler table for idea 5. No part depends on the owner. PASS, with correction 2.
5. **False positives and false negatives.** False positives: covered (baseline AC 6, tested allowlist AC 2, reason per entry AC 11, seed list). **False negatives are not covered** by any risk or AC: new token formats, URL variants (`http://`, no trailing slash, upper case, percent-encoding or a split string), other hosts that the `AGENTS.md` rule also names (share links), and text outside the four surfaces (agent memories are files, so they are covered; comments on issues are out by project rule). Not a reason for NO-GO: AC 3 (one positive per family listed by `@architect`) and AC 7 (mutation per rule) bound the listed patterns; but the limit must be written (correction 1) and the pattern cases decided by `@architect`.
6. **Research dependency.** `research-index.md` has no note on credential or token formats nor on Git hook mechanisms: this is a **LACUNA**, as the story anticipates ("only if a token-format GAP appears"). `[AUTO-DECISION]` Treat it as a narrow, non-blocking gap that must be closed in AÇ-22: the pattern list needs sources from the providers' public documentation, gathered by `@architect` (who has internet) or by `@analyst` before the list is written; `@dev` never invents a format. If the architect lists only formats already documented in a cited source, no new `@analyst` note is needed.

## Required corrections (for `@sm`, en and pt-BR; none blocks the start of the design)

1. **Add Risk 7 — false negatives** (a leak the patterns do not match). Mitigation to write: the pattern list is versioned with a source per family; the case, URL-variant and encoded-string decisions are fixed by `@architect` and have positive fixtures; the documentation states that the check is a barrier, not a proof of absence, and how to add a pattern (AC 9). Keep the AC list unchanged unless `@architect` asks for a variant test (then it goes into AC 3).
2. **Fix the ruler exit criteria** in [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (line 176 of the en file and its pt-BR twin): "ACs 1 to 10 of OPS-27" becomes "ACs 1 to 11" (AC 11 was added on 2026-11-05).
3. **Pin the baseline range in AC 6**: the range is the pull-request range (`origin/main..HEAD`), not the whole history and not local backup branches; findings in old history already pushed or in local backups are reported to the orchestrator and handled by the owner-reserved process, never "fixed" by the story. (The `@qa` gate of 2026-11-05 recorded zero matches for `origin/main..HEAD`.)
4. **Record the LACUNA** (item 6 above) in the "Planning gates" box for `@analyst`/`@architect`, with the golden-rule line: "no new research unless the architect cannot cite a public source for a family".

## Conditions for the gates

- `@architect` (AÇ-22): pattern list with a public source and a positive plus a look-alike negative per family; case-insensitivity and URL variants of the session host; exit codes (rejection versus internal error, AC 11); size limit; allowlist format with a mandatory reason; how bodies are passed as data; ownership against OPS-28 (this check owns commits, bodies and all versioned files; OpenGrep owns code constructs, no duplicated list).
- `@devops`: reviews the workflow edit and serializes it with OPS-29/OPS-30; creates or edits issue bodies only after the pre-send check exists (documented step). Never comments on issues.
- `@qa`: test plan with planted leaks per surface and one hand mutation per rule; attests the 9.5 only with the ruler.
- Reminder: the framework's automatic attribution may offer to add a session trailer to commits and PRs; the `AGENTS.md` rule says to ignore it. This story exists to make that ignore automatic.

## Slice readiness

| Slice | Can go to `@dev` now? | Remaining gates |
|---|---|---|
| FT-45 (check core and local hook; ACs 1, 2, 3, 7, 11) | NO — design first | `@architect` design (AÇ-22), `@qa` plan (AÇ-23), corrections 1-4 by `@sm` |
| FT-46 (CI job and body checks; ACs 4, 5, 6, 8) | NO — after FT-45 | FT-45 merged, `@devops` workflow review, serialization with OPS-29/OPS-30 |

## Final status

Draft → **Ready** (GO 9.0/10, issue #104). Recorded in the story Change Log, in the planning-gate box and in the stories index (en and pt-BR).
