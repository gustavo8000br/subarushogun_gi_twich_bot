# Improvement actions 2026-11-04 — the 9.5 ruler, exit criteria and numbered actions

[Português brasileiro](../pt-BR/process/improvement-actions-2026-11-04.md)

**Date:** 2026-11-04. **Author:** `@sm` (River). **Branch:** `feat/ops-15-next-panel`. **Scope:** documentation only; nothing was created or edited on GitHub (`@devops` does that next). **Input:** [improvement-ideas-2026-11-04.md](improvement-ideas-2026-11-04.md) (10 ideas, scores are Orion's estimates). **Owner request (2026-11-04):** register the ideas in cards and stories and organize them into actions agents follow; target **9.5** for each.

**Writing note:** patterns of the leak guard are written in a defused form (`claude\.ai/` as a regular expression; the name `Claude-Session` without its colon), so the future check of OPS-27 does not flag this document.

## 1. How to read this document

- The "today" scores come from the survey and are **estimates, not measurements**. The `@qa` is the only agent that attests a score, with the ruler below, by recording evidence. No other agent writes "9.5" as a result.
- Each idea has a **vehicle** (a story, slice or item already in the [inventory](backlog-inventory.md)), **exit criteria** an agent can verify, **numbered actions** (AÇ-NN) an agent can pick up without asking, and an **owner part** when it exists.
- Existing stories (OPS-21, OPS-23, OPS-24) keep their scope and acceptance criteria; they only gained a short section "Meta 9,5 (survey of 2026-11-04)" that points here.
- Numbers marked "proposal" are for the `@architect` to confirm; nothing here is a measured fact.

## 2. The 9.5 ruler (common to the 10 ideas)

### 2.1 Four dimensions, equal weight

| Dim | Name | Question it answers |
|---|---|---|
| C | Coverage | Does it cover every case the idea names, and is the list of cases pinned so a new case cannot be left out? |
| A | Automation | Does it run by itself in the local gate and in CI, failing the build when it breaks? |
| P | Proof | Was it proven to fail when it must (planted violation) and to resist a weakened implementation (hand mutation), with evidence classes kept separate? |
| O | Operation | Is it documented in English and pt-BR, does it state its limits and false positives, and can the next person extend it? |

### 2.2 Anchors (0 to 10 per dimension)

| Score | Meaning |
|---|---|
| 0 | Absent. |
| 3 | Intended or manual only; nothing proves it. |
| 5 | Partial: part of the cases, or manual, or not in CI. |
| 7 | Automated for the main cases and green, but with an untested gap or no CI proof. |
| 9.5 | Complete for the idea, automated locally and in CI, proven by a planted violation and by hand mutations, documented in both languages, with every remaining limit written down. |
| 10 | Reserved: 9.5 plus an external confirmation over time (for example a real run by the owner). Agents never claim 10. |

### 2.3 Calculation and attestation

- **Score = simple average of C, A, P and O.** No hidden weights.
- **The `@qa` attests 9.5 only if** the average is at least 9.5, **no dimension is below 9.0**, and there is no open HIGH finding. Otherwise the `@qa` records the real average and the dimension that holds it back.
- **Where it is recorded:** the `@qa` gate file of the story (verdict PASS / CONCERNS / FAIL / WAIVED plus the four dimension scores with their evidence), and the section "Meta 9,5" of the story gets a link to it.
- **Evidence classes stay separate** (fixtures, unit, isolated PostgreSQL with real migrations, services, browser, native OBS, live Twitch). A score never borrows evidence from a stronger class than the one that ran.

### 2.4 Definitions used by the criteria

- **Planted violation:** a deliberate defect added on purpose (in a throwaway branch or a temporary fixture) to prove the gate fails; it is discarded afterwards and the proof is recorded.
- **Hand mutation:** the `@qa` weakens one rule, pattern or guard in the implementation (for example loosens a regular expression or removes a check) and runs the tests; at least one test must fail. No mutation tool is added as a dependency unless the `@architect` approves it.
- **CI evidence:** CI runs on pull requests and on manual dispatch, not on plain branch pushes. The orchestrator holds the delegated authority to push the branch and to create or update pull requests (2026-10-29); merge, tag and release stay with the owner.

## 3. Summary

| # | Idea | Today | Vehicle | Owner part | Ceiling with agents only | Agent and model | Depends on |
|---|---|---|---|---|---|---|---|
| 5 | Leak guard | 5.0 | OPS-27 (ST-20, FT-45, FT-46) | none | 9.5 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | OPS-22 package committed; workflow edits serialized |
| 2 | Read timeouts | 5.0 | FT-44 inside OPS-23 | none | 9.5 | `@po`, `@architect`, `@ux-design-expert` (if text), `@dev`, `@qa`; Sonnet 5.5 | `@po` places FT-44; OPS-21 uncertain-outcome path; FT-13 (same client file) |
| 1 | Browser E2E in CI | 4.0 | OPS-30 (ST-23, TS-17, FT-51, FT-52) | none | 9.5 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | Script stability (TS-15 done, M-2 fixed); FT-42 name; workflow serialization |
| 10 | Clean install | 6.0 | OPS-29 (ST-22, FT-49, FT-50) | real Windows and Mac evidence | 9.5 on what runners can prove; residual declared | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | Workflow serialization with OPS-30; runner capability GAP check |
| 4 | Static scanning | 4.0 | OPS-28 (ST-21, FT-47, FT-48) | none | 9.5 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | OPS-27 FT-45 design (secrets ownership); order on `.opengrep/rules.yml` with OPS-24 FT-30 |
| 6 | Panel API contract | 5.5 | OPS-21 (ST-09, FT-11..FT-17) | D-09 / OW-15 (close with slice 7 open) and the timeout value D-10 | 9.5 only with slice 7 done after the cutover; else declared at the open slice | `@architect` (order of the 3 cycles), `@data-engineer`, `@dev`, `@ux-design-expert`, `@qa`; Sonnet 5.5, Opus 5.5 only for the idempotency state-machine design if the `@architect` justifies it | `@architect` order; FT-02; GV-03; cutover for FT-17 |
| 7 | Live updates (SSE) | 5.5 | OPS-23 (ST-16, FT-27..FT-29) | OD-23-1 wording (decided) | 9.5 | `@architect`, `@ux-design-expert`, `@dev`, `@qa`; Sonnet 5.5 | FT-30 and FT-32 (OPS-24 TS-0 and TS-2); order against FT-01 |
| 3 | Typing | 5.0 | TS-16 and OPS-24 (ST-17, FT-30..FT-35) | none for the code; CI evidence by pull request | 9.5 only when OPS-24 closes | `@architect`, `@data-engineer`, `@dev`, `@qa`; Sonnet 5.5, Opus 5.5 only for the split of `queue-repository` if justified | FT-30 and FT-42; OPS-22 merged on the same files |
| 9 | Accessibility proven | 6.0 | Existing: A-05 / OW-06 (FT-01 dependency) | screen reader, 390x844 layout, focus: A-05 | about 7.0 | `@ux-design-expert`, `@dev`, `@qa`; Sonnet 5.5 | FT-01; owner sitting |
| 8 | Validation outside Ubuntu | 3.0 | Existing: A-02 / OW-03, D-05 / OW-07, OW-16, A-01 / OW-01 | all native results | about 7.0 | `@architect`, `@dev`, `@qa`; Sonnet 5.5 | owner sittings; FND-9 acceptance |

The "ceiling with agents only" for ideas 8 and 9 is computed with the ruler, not guessed: #8 = C 7, A 8, P 5, O 8 (average 7.0) and #9 = C 8, A 9, P 3, O 8 (average 7.0), because the Proof dimension cannot exceed what no human ran. The owner part is never claimed by agents.

## 4. Recommended order

One agent at a time while the weekly quota is tight (owner, 2026-10-29); one write set at a time per file (workflows are shared by ideas 5, 1 and 10; `.opengrep/rules.yml` by ideas 4 and 3).

| Step | Idea | Why here | Board order |
|---|---|---|---|
| 0 | Precondition | The OPS-22 package is committed after the `@qa` verdict (Orion, 2026-11-04). | 8 |
| 1 | **#5** leak guard (OPS-27) | Cheapest, highest return, nothing blocks it, and it protects the commits of everything after it (Orion's decision). | 8.3 |
| 2 | **#2** read timeouts (FT-44) | Small; the `@po` first places it in OPS-23 or in its own story. | 8 (existing card) |
| 3 | **#1** browser E2E in CI (OPS-30) | Medium; scripts are stable enough since TS-15 and M-2; edits workflows (after #5's workflow edit). | 8.4 |
| 4 | **#10** clean install (OPS-29) | Medium; edits the same workflows, so it follows #1. | 8.5 |
| 5 | **#4** static rules (OPS-28) | Medium; needs OPS-27's design on secrets and an order with OPS-24 FT-30 on the rules file. | 8.6 |
| 6 | **#6** panel API contract (OPS-21) | Large; the `@architect` fixes the order of the 3 cycles first; slice 7 waits for the cutover. | existing steps 7, 9, 14 |
| 7 | **#7** live updates (OPS-23) | Large; waits for FT-30 and FT-32 and for the order against FT-01. | existing step 8 |
| 8 | **#3** typing (TS-16 and OPS-24) | Large; TS-16 after FT-30 and FT-42; the folders follow the OPS-24 dependency order. | existing step 16 |
| Parallel track | **#9** and **#8** | The agent part (scripts, automated axe, checklists) is cheap and can run in any gap; the owner parts are scheduled in the owner's sittings (section 6). | existing steps 10 and 19 |

## 5. Ideas, exit criteria and actions

Action format: **ID, agent (model), input, output, done when.** The default model is Sonnet 5.5; Opus 5.5 appears only where a recorded justification exists.

**AÇ-00 (all new stories) — registration.** `@devops` (Sonnet 5.5). Input: [improvement-issue-bodies-2026-11-04.md](improvement-issue-bodies-2026-11-04.md), the inventory and the board design. Output: issues for OPS-27, OPS-28, OPS-29 and OPS-30; cards ST-20..ST-23 and FT-45..FT-52; the "Meta 9,5" note in the bodies of #81, #91 and #79. Done when: every new issue has `## Decisões do dono` and `## Gates`, the cards carry the numbers, and the board counts equal the inventory (76 active, 48 archived).

### Idea 1 — Browser E2E in CI (OPS-30 / ST-23 / TS-17 / FT-51, FT-52). Today 4.0

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | Every `*-browser-only` script runs in the job; the list comes from the folder and a drift test fails if one is left out (13 files on 2026-11-04; the survey said 12). | The contract test and the job log listing every script. |
| A | A red script fails the job; no retry, rerun or tolerated failure anywhere. | The workflow-contract test and a planted break that turns the job red. |
| P | Stable over repeated runs: proposal 10 consecutive local runs and 5 CI runs on distinct commits with no failure and no rerun; each early failure has a recorded root cause. | Run logs and the root-cause notes. |
| O | Policy "investigate, never rerun until green", run time and timeout, artifacts without secrets, documented in both languages. | The documentation page and an artifact check. |

Exit criteria: ACs 1 to 9 of [OPS-30](../stories/OPS-30/story.md). Owner part: none. Dependencies: `@architect` and `@devops` before any workflow change; script stability (TS-15, M-2).

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-01 | `@po` (Sonnet 5.5) | Story OPS-30, the folder listing | `po-validation.md`; the confirmed script count | GO with 7 or more of 10 points, status Ready, the count 12 versus 13 settled |
| AÇ-02 | `@architect` (Sonnet 5.5) | Story, `quality-gates.yml`, the scripts' set-up (Next dev over HTTPS, Chrome) | Design section in the story: job shape, name against wave 4, timeout, stability numbers | The job shape, timeout and the numbers 10 and 5 (or others) are written |
| AÇ-03 | `@qa` (Sonnet 5.5) | Story and design | Test plan: planted break, stability method, artifact check | Plan filed; every AC mapped to a test and an evidence class |
| AÇ-04 | `@dev` (Sonnet 5.5), `@devops` reviews the workflow | Plan, design | FT-51 (job and contract test), then FT-52 (stability runs, fixes, policy) | Red-first evidence per AC; the seven gates green |
| AÇ-05 | `@qa` (Sonnet 5.5) | Implementation, run logs | Gate verdict plus the four scores | Attestation at 9.5 or the real average with the limiting dimension |

### Idea 2 — Timeouts on panel reads (FT-44 inside OPS-23). Today 5.0

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | Every read through the panel client and `loadPanelSnapshot` carries a bounded timeout; a test fails if a new read bypasses it. | The pinned list and its test. |
| A | The behavior runs in the unit suite (fake timers) and in a browser script with a hung API. | Both tests green in the gate. |
| P | Mutations are never aborted or blindly retried by the read timeout (the uncertain-outcome path is intact); a hung API ends in a localized, retryable error state, not an endless "loading". | The mutation test and the browser script. |
| O | Timeout value and reason documented; texts in the three catalogs with `validate:localization`; UX plan at 9.0 or more if visible text changes. | The catalog check and the recorded plan. |

Exit criteria: the acceptance criteria that the `@po` places for FT-44 (scope and AC are not changed here). Owner part: none. Dependencies: `@po` placement (OPS-23 or own story); OPS-21 uncertain-outcome path; FT-13 shares the client file.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-06 | `@po` (Sonnet 5.5) | Inventory FT-44, OPS-23 story | Decision: inside OPS-23 or own story; ACs written by the `@po` | Decision recorded in the story |
| AÇ-07 | `@architect` (Sonnet 5.5) | `lib/api/client.mjs`, OPS-21 notes | Timeout and fallback policy, value and reason | Policy written; mutation exclusion stated |
| AÇ-08 | `@ux-design-expert` (Sonnet 5.5) | Policy, the error state | Plan at 9.0 or more for the visible text and recovery, or "not applicable" | Score and scope recorded |
| AÇ-09 | `@dev` (Sonnet 5.5) | ACs, policy, plan | Red-first tests, then the fix | Unit and browser tests green; seven gates green |
| AÇ-10 | `@qa` (Sonnet 5.5) | Implementation | Gate verdict plus the four scores | Attestation at 9.5 or the real average |

### Idea 3 — Panel and backend typing (TS-16 and OPS-24). Today 5.0

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | JSX errors from 59 to 0 with `apps/frontend/**/*.jsx` back in `typecheck:web`; every `apps/api` folder converted and global `strict: true`. | The type-check output and the folder list. |
| A | `typecheck` runs both configs in the gate and in CI; `.ts` is linted, tested and scanned. | The CI log and the gate list. |
| P | Each gate proven by a planted violation (type error, failing `.test.ts`, lint violation, restricted import, a `.ts` fixture for OpenGrep); zero `@ts-ignore`, `@ts-nocheck`, unjustified `any` or cast in the touched files. | The planted-violation records and a count by search. |
| O | `AGENTS.md` and listed documents updated in both languages; timings recorded (AC 27 of OPS-24). | The documentation diff and the numbers. |

Exit criteria: ACs 1 to 27 of [OPS-24](../stories/OPS-24/story.md) plus TS-16 (59 errors fixed by typing, never by cast or ignore; the count must not grow in the meantime). Owner part: none for code; CI evidence by pull request or dispatch. The 9.5 is attestable only when OPS-24 closes; earlier the `@qa` records a partial score per dimension.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-11 | `@architect` (Sonnet 5.5) | OPS-24 story, [frontend-jsx-typecheck-backlog](../stories/OPS-24/frontend-jsx-typecheck-backlog.md) | Order of TS-16 against FT-30 and FT-42; tsconfig layout | The order is written in the story |
| AÇ-12 | `@qa` (Sonnet 5.5) | The tree, read-only `tsc --strict` | Error count per folder and the test plan | Counts and plan filed |
| AÇ-13 | `@dev` (Sonnet 5.5) | AÇ-11 order, the 59 errors | TS-16: JSX typed, largest file first, no cast or ignore | `typecheck:web` green with JSX included; count 0 |
| AÇ-14 | `@dev` (Sonnet 5.5; Opus 5.5 only for the split of `queue-repository` if the `@architect` justifies it in the story) | OPS-24 dependency order | FT-30..FT-35, one folder per slice | Each slice's ACs green; behavior preserved |
| AÇ-15 | `@qa` (Sonnet 5.5) | The finished OPS-24 | Gate verdict plus the four scores | Attestation at 9.5 or the real average |

### Idea 4 — Static scanning (OPS-28 / ST-21 / FT-47, FT-48). Today 4.0

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | The six classes (raw SQL, `eval`/`Function`, SSRF, secrets in code, `dangerouslySetInnerHTML`, headers and cookies) each have at least one rule, for JavaScript and TypeScript. | The rule list against the survey. |
| A | Rule tests run in `npm test`; `npm run review:static` runs in CI; the full tree exits zero. | The suite and the CI log. |
| P | Each rule has a positive, a negative and an evasion fixture; a hand mutation of each rule makes a test fail; no blanket ignore of product code. | The fixtures, the mutation record and the ignore list. |
| O | A page in both languages lists each rule, reason, fixtures and how to add one; accepted findings carry reasons; the old review provider's name stays blocked. | The page and `aiox-static-review.test.js` green. |

Exit criteria: ACs 1 to 10 of [OPS-28](../stories/OPS-28/story.md). Owner part: none. Dependencies: OPS-27 FT-45 design for secrets; order on `.opengrep/rules.yml` against OPS-24 FT-30.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-16 | `@po` (Sonnet 5.5) | Story OPS-28 | `po-validation.md` | GO, status Ready |
| AÇ-17 | `@architect` (Sonnet 5.5) | Story, `.opengrep/rules.yml`, the constructs in `apps/` | Rule-test mechanism, rule list per construct, secrets ownership with OPS-27, edit order against OPS-24 | Written in the story |
| AÇ-18 | `@qa` (Sonnet 5.5) | Story and design | Test plan: fixtures, evasion variants, mutations, baseline handling | Plan filed |
| AÇ-19 | `@dev` (Sonnet 5.5) | Plan, design | FT-47 then FT-48, rules test-first; real findings fixed test-first | Every rule with its three fixtures; full-tree scan exit zero; seven gates green |
| AÇ-20 | `@qa` (Sonnet 5.5) | Implementation | Gate verdict plus the four scores | Attestation at 9.5 or the real average |

### Idea 5 — Leak guard (OPS-27 / ST-20 / FT-45, FT-46). Today 5.0

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | Four surfaces (commit messages, versioned files, PR bodies, issue bodies) and every listed pattern family (the session host, the session trailer name, credential families with public formats), each with a positive and a negative test. | The pattern list with sources and the tests. |
| A | Local hook active after one documented command; the same script in a CI job on pull requests; a draft issue body is checked before `@devops` sends it; the CI cannot be skipped by `--no-verify`. | A real `git commit` driven test and a CI run. |
| P | A planted leak in each surface fails; one hand mutation per rule fails a test; the output never echoes the matched value; the check does not flag its own tests. | The planted-leak records and the mutation record. |
| O | Baseline scan with zero unaccepted findings (hashes and paths only); allowlist with a reason per entry (rule text in `AGENTS.md`, handoffs and gates that cite the pattern, framework documents); documentation in both languages. | The baseline report and the allowlist. |

Exit criteria: ACs 1 to 11 of [OPS-27](../stories/OPS-27/story.md). Owner part: none (a history rewrite or a rotation would be owner-reserved and is out of scope). Dependencies: the OPS-22 package committed; workflow edits serialized with ideas 1 and 10.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-21 | `@po` (Sonnet 5.5) | Story OPS-27 | `po-validation.md` | GO, status Ready |
| AÇ-22 | `@architect` (Sonnet 5.5) | Story, the known false-positive list, public token documentation | Pattern list with sources, hook mechanism, CI trigger, body-as-data design, allowlist format, size limit, tool ownership against OPS-28 | Written in the story; each pattern has a sample positive and negative |
| AÇ-23 | `@qa` (Sonnet 5.5) | Story and design | Test plan: planted leaks, hand mutations, classes | Plan filed |
| AÇ-24 | `@dev` (Sonnet 5.5) | Plan, design | FT-45: check script, tests, local hook, documented activation | ACs 1, 2, 3, 6, 7 green; gates green |
| AÇ-25 | `@dev` (Sonnet 5.5), `@devops` reviews the workflow | FT-45 merged, design | FT-46: CI job, body checks, `issues`-event option, documentation | ACs 4, 5, 8, 9 green; CI run on a pull request or dispatch |
| AÇ-26 | `@qa` (Sonnet 5.5) | Implementation | Gate verdict plus the four scores | Attestation at 9.5 or the real average |

### Idea 6 — Panel API contract (OPS-21 / ST-09 / FT-11..FT-17). Today 5.5

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | Every non-2xx response carries an enumerated `code` (guard test); the 7 slices are done; routes become `reexecutable` only with PostgreSQL evidence; the legacy `error` field is removed (slice 7, after the cutover). | The guard test and the slice list. |
| A | Guard and idempotency tests run in the gate; PostgreSQL integration with real migrations runs in CI. | The suite and the CI log. |
| P | The idempotency state machine (lease takeover, retention, replay with the same key) is proven on isolated PostgreSQL; the client retry reuses the same key; a hand mutation of the lease check makes a test fail. | The integration tests and the mutation record. |
| O | Contract documented in both languages; closing with slice 7 open is an owner decision (D-09 / OW-15). | The documentation and the decision record. |

Exit criteria: the acceptance criteria of [OPS-21](../stories/OPS-21/story.md) (not changed here). Owner part: D-09 / OW-15 (may the story close with slice 7 open) and the timeout value (D-10). Without slice 7 the `@qa` records the dimension O at the declared open slice, so the average stays below 9.5 until the cutover and FT-17 are done.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-27 | `@architect` (Sonnet 5.5; Opus 5.5 only for the idempotency state-machine design if justified in the story) | OPS-21 story, merged-cycle plan | Order of cycles FT-11+12, FT-13+16, FT-14+15 and where FT-17 sits | Order written; slice 6's dependency on slices 3-5 resolved |
| AÇ-28 | `@data-engineer` (Sonnet 5.5) | Cycle 3 (FT-14+15) | Conditions for the state-machine persistence (already GO with conditions) confirmed | Written confirmation |
| AÇ-29 | `@dev` (Sonnet 5.5) | AÇ-27 order, `@ux-design-expert` plan at 9.0 or more for cycles with visible text | The three cycles test-first, then FT-17 after the owner-authorized cutover | Each cycle's ACs green with PostgreSQL evidence |
| AÇ-30 | `@qa` (Sonnet 5.5) | The finished OPS-21 | Gate verdict plus the four scores | Attestation or the real average with the limiting dimension |

### Idea 7 — Live updates (OPS-23 / ST-16 / FT-27..FT-29). Today 5.5

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | Authenticated SSE with a 15 s heartbeat, event invalidation for the panel views the story names, shared provider and `<Link>` navigation, polling fallback. | The ACs of OPS-23 mapped to tests. |
| A | Tests over a real HTTP listener and in a real browser through the Next rewrite and Compose (unbuffered); the live path measured by a script. | The test list and the measuring script. |
| P | p95 of the live path at or below 2 s and fallback polling at 2 s for a 60 s window (OD-23-2, approved); connection cap; shutdown closes streams; events carry no chat or user data; drafts and focus are never overwritten. | The measurements and the negative tests. |
| O | Event model, flags and the numbers documented in both languages. | The documentation. |

Exit criteria: the ACs of [OPS-23](../stories/OPS-23/story.md) (not changed here). Owner part: none outstanding (OD-23-1 and OD-23-2 are decided). Dependencies: FT-30 and FT-32 (OPS-24 TS-0 and TS-2); order against FT-01.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-31 | `@architect` (Sonnet 5.5) | OPS-23 story, SSE note | Event model, process boundary, proxy, order against FT-01, FT-30, FT-32 | Written in the story |
| AÇ-32 | `@ux-design-expert` (Sonnet 5.5) | Event states, drafts and focus rules | Plan at 9.0 or more (the review scope stated) | Score recorded |
| AÇ-33 | `@dev` (Sonnet 5.5) | Design, plan | FT-27, then the FT-28 + FT-29 cycle, test-first | ACs green; seven gates green |
| AÇ-34 | `@qa` (Sonnet 5.5) | Implementation, measuring script | Gate verdict plus the four scores | Attestation or the real average |

### Idea 8 — Validation outside Ubuntu. Today 3.0. Agents-only ceiling about 7.0

| Dim | Agents can reach | What remains with the owner |
|---|---|---|
| C | 7: matrix written, runners cover what they can (installer smoke on three systems) | Native OBS matrix, Windows installer on a real machine, a Mac, a real Twitch battery on the test channel |
| A | 8: automated smoke on the runners; capture scripts prepared | The native runs themselves |
| P | 5: no native result can be claimed | Every native result (A-02, D-05, OW-16, A-01, A-03) |
| O | 8: limits and procedures written; nothing claimed without evidence | Recording the owner's results |

Exit criteria for the agent part: a written validation matrix that states, per cell, the evidence class and who runs it; automated smoke for what a runner can prove; prepared scripts and checklists so each owner sitting is one short session. The agent part is attested at **7.0 at most**; the 9.5 needs the owner's results.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-35 | `@architect` (Sonnet 5.5) | Existing installer smoke, [windows-native-plan](../stories/OPS-15/windows-native-plan.md) | The matrix: cell, evidence class, who runs it | Matrix filed |
| AÇ-36 | `@dev` (Sonnet 5.5) | Matrix | Prepared capture scripts and checklists; no native claim | Scripts and checklists reviewed by `@qa` |
| AÇ-37 | Owner | Section 6 | The native results | See section 6 |
| AÇ-38 | `@qa` (Sonnet 5.5) | The matrix and the results available | The honest score (7.0 at most without the owner) and the open cells | Score and open cells recorded |

### Idea 9 — Accessibility actually proven. Today 6.0. Agents-only ceiling about 7.0

| Dim | Agents can reach | What remains with the owner |
|---|---|---|
| C | 8: automated axe on the main flows, measured contrast, 320 px layout, focus after navigation | Screen reader pass (NVDA or VoiceOver) |
| A | 9: axe in the gate and in CI | — |
| P | 3: no human used assistive technology | A-05 results |
| O | 8: the screen-reader script written; limits stated | Recording the owner's result |

Exit criteria for the agent part: automated axe tests on the main flows in the gate; measured contrast and 320 px results recorded; a screen-reader script (NVDA or VoiceOver) the owner can follow in one session. Attested at **7.0 at most** without A-05.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-39 | `@ux-design-expert` (Sonnet 5.5) | OPS-15 UX plans, A-05 | Screen-reader script, contrast and 320 px measuring method, focus checklist | Filed; scope of what it does not cover stated |
| AÇ-40 | `@dev` (Sonnet 5.5) | AÇ-39, FT-01 stable | Automated axe tests on the main flows, test-first | Tests green in the gate |
| AÇ-41 | Owner | Section 6 (A-05) | Screen-reader and layout results | See section 6 |
| AÇ-42 | `@qa` (Sonnet 5.5) | AÇ-39..AÇ-41 | The honest score (7.0 at most without the owner) | Score and open items recorded |

### Idea 10 — Clean install (OPS-29 / ST-22 / FT-49, FT-50). Today 6.0

| Dim | 9.5 means | What the `@qa` must see |
|---|---|---|
| C | A clean-state assertion and the first-use flow (install, start, open, update with data kept) on Linux with real Docker; macOS and Windows cover everything their hosted runner can prove, each step labeled real Docker or isolated fake, the residual declared. | The job logs and the labels. |
| A | Jobs in CI; the workflow-contract test pins systems, assertion and order. | The contract test and a CI run. |
| P | A planted regression that depends on a pre-existing folder turns the job red; the assertion helper is unit-tested both ways. | The throwaway-branch record. |
| O | Run time within the timeout; documentation states the evidence classes and limits. | The documentation and the timing. |

Exit criteria: ACs 1 to 10 of [OPS-29](../stories/OPS-29/story.md). Owner part: real Windows and macOS evidence (A-01 / OW-01, D-05 / OW-07) is never claimed by the CI job. Dependencies: serialize workflows with ideas 5 and 1; the runner-capability GAP check.

| ID | Agent (model) | Input | Output | Done when |
|---|---|---|---|---|
| AÇ-43 | `@po` (Sonnet 5.5) | Story OPS-29 | `po-validation.md` | GO, status Ready |
| AÇ-44 | `@architect` (Sonnet 5.5; `@analyst` only for a GAP after the research index) | Story, `quality-gates.yml` | Job shape per system, assertion list, overlap with the installer smoke, timeout, what each runner proves | Written in the story |
| AÇ-45 | `@qa` (Sonnet 5.5) | Story and design | Test plan: planted regression, labels | Plan filed |
| AÇ-46 | `@dev` (Sonnet 5.5), `@devops` reviews the workflow | Plan, design | FT-49 then FT-50 | ACs green; CI run on a pull request or dispatch |
| AÇ-47 | `@qa` (Sonnet 5.5) | Implementation | Gate verdict plus the four scores | Attestation at 9.5 on the declared coverage, or the real average |

## 6. Owner part: what agents must not claim

| Owner action | What it is | What it unlocks | Ideas |
|---|---|---|---|
| **A-02** (OW-03, issue #57) | Retest the native OBS: certificate, transparency, reload | The native overlay matrix; feeds HD-03 and OPS-25 | 8 |
| **A-05** (OW-06, issue #83) | Visual and assistive-technology checks of the new UX pieces (NVDA or VoiceOver, call deadline, focus after saving, 390x844, widget link dialog) | The Proof dimension of accessibility; depends on FT-01 | 9 |
| **D-05** (OW-07, issue #69) | Decide whether macOS stays without manual validation | Option A writes the limitation and caps the macOS cell as declared; option B (get a Mac) opens the macOS cell | 8, 10 |
| **OW-16** (A-06, issue #80) | Authorize and run the live real-redemption check | The real Twitch battery on the test channel; also OPS-22 acceptance | 8 |
| A-01 (OW-01, issue #69) | Windows installer in real Docker and the `npm run dev` flow | The Windows cell | 8, 10 |
| A-03 (OW-04, issue #19) | FND-9 acceptance on Windows and real Twitch | Needed before OW-16; the real Twitch cell | 8 |

Agents prepare scripts, checklists and records; they write no native or live result. A cell without the owner's evidence stays open in the matrix.

## 7. Model policy

Sonnet 5.5 is the default. Opus 5.5 only for a very complex task with a written justification in the story: the idempotency state-machine design of OPS-21 (AÇ-27) and the split of `queue-repository` in OPS-24 (AÇ-14) are the two candidates. Every other action in this document is Sonnet 5.5.

## 8. Traceability and counts

| Idea | Existing line | New line |
|---|---|---|
| 1 | TS-17 | ST-23 (OPS-30), FT-51, FT-52 |
| 2 | FT-44 (inside OPS-23, ST-16) | none (no scope change) |
| 3 | TS-16 (inside OPS-24, ST-17), FT-30..FT-35 | none |
| 4 | — | ST-21 (OPS-28), FT-47, FT-48 |
| 5 | — | ST-20 (OPS-27), FT-45, FT-46 |
| 6 | ST-09 (OPS-21), FT-11..FT-17 | none |
| 7 | ST-16 (OPS-23), FT-27..FT-29 | none |
| 8 | OW-01, OW-03, OW-07, OW-16 | none |
| 9 | OW-06 | none |
| 10 | — | ST-22 (OPS-29), FT-49, FT-50 |

New items: 4 stories (ST-20..ST-23) and 8 slices (FT-45..FT-52) = 12. Inventory: 110 to **122** items (23 ST, 52 FT, 13 GV, 17 TS, 17 OW). Board: 64 to **76** active cards (13 Backlog, 7 Rascunho, 2 Aguardando decisão, 13 Pronto, 4 Em andamento, 5 Em revisão, 30 Bloqueado, 2 Concluído), 48 archived, 124 cards in total.
