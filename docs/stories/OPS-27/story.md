# OPS-27 — Automatic guard against leaks of sensitive data (commits, files, PR and issue bodies)

[Português (pt-BR)](../../pt-BR/stories/OPS-27/story.md)

**Status:** Ready (`@po` GO 9.0/10 on 2026-11-05 with issue #104, see [po-validation.md](po-validation.md); drafted by `@sm` on 2026-11-04). Ready means validated for planning; the slice gates below still apply. **Issue:** [#104](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/104) (created by `@devops` before 2026-11-05 from [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); no issue comments).
**Source:** idea #5 of the [improvement survey](../../process/improvement-ideas-2026-11-04.md) (owner request, 2026-11-04). Evidence: a Claude session URL reached 45 commits of this public repository; the protection that existed was only text in `AGENTS.md` (rule "never expose the session URL"). A text rule does not stop an agent whose tool adds a default attribution line. Orion's decision (2026-11-04): this idea starts first, right after the OPS-22 package.
**Related:** OPS-28 (OpenGrep rules for code; secrets in source code are shared ground, see "Dependencies"); OPS-24 (script language and Biome); OPS-30 and OPS-29 (they also add CI jobs; workflow edits are serialized); [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (9.5 ruler, idea #5, actions AÇ-21..AÇ-26).
**Registered items:** inventory ST-20 (this story), FT-45 and FT-46 (slices); see [backlog-inventory](../../process/backlog-inventory.md).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (pattern list, hook mechanism, CI trigger and how bodies are passed as data), `$aiox-devops` (issue; reviews the workflow before commit), independent `$aiox-qa` (test plan with planted leaks and hand mutations, the 9.5 attestation), `$aiox-analyst` only if a token-format GAP appears (check [research-index.md](../../research-index.md) first). `$aiox-ux-design-expert` and `$aiox-data-engineer`: not applicable (no user-facing text, no database).

**Writing note:** in this story the patterns are written in a defused form (`claude\.ai/` as a regular expression, and the name `Claude-Session` without its colon), so that the future check does not flag the story itself.

## Problem

- The only barrier against exposing a session URL, a token or a key in a public repository is a sentence in `AGENTS.md`. There is no automatic check on the four places where a leak travels: commit messages (including trailers), versioned files, pull-request bodies and issue bodies.
- Recovering from a leak that already reached a public remote needs a history rewrite and a force push, which is expensive and owner-reserved. Preventing it is cheap.
- A naive check would also flag the places that legitimately *mention* the pattern: the rule text in `AGENTS.md`, handoffs and QA gates that cite it, and framework documents about LLM routing. The check needs a documented, tested allowlist so that it does not train people to bypass it.

## Story

As the owner of a public repository maintained with AI agents,
I want a local hook and a CI check that reject the session host, the session trailer and credential-shaped strings before they reach a commit, a file, a PR body or an issue body,
so that the protection no longer depends on an agent remembering a sentence.

## Scope

**In (two slices, in this order):**

- **FT-45 — check core and local hook.** One check script (path fixed by `@architect`) built around a pure function that receives text and returns findings (rule id, location, never the matched value). Rules: (a) the session host `claude\.ai/`; (b) the trailer name `Claude-Session` followed by a colon; (c) credential families with public formats (private-key block headers, provider token prefixes, connection strings with an embedded password, `client_secret`-style assignments) listed by `@architect` from the providers' public documentation, none invented by `@dev`. Local hook: `commit-msg` (message), `pre-commit` (staged files) and an optional `pre-push` (range), activated by one documented command (a versioned hook directory plus `git config core.hooksPath`). A `npm run` entry runs the same check by hand, including on a body file. Path-scoped allowlist with a reason per entry.
- **FT-46 — CI check and body checks.** A CI job on pull requests that runs the same script over the commit messages of the range, the tracked files and the PR body; the body is passed as data (environment variable or file), never interpolated into a shell command. The same script is run on a draft issue body **before** `@devops` creates or edits an issue (documented step). Optionally the job also runs on the `issues` event; it only fails the run, it **never comments** on the issue (project rule). A baseline scan of the current tree and of the commit range reports hashes and paths only.

**Out of scope:**

- Rewriting history, force push, rotating a real credential (owner-reserved; if the baseline finds a real credential, the story stops and reports to the orchestrator).
- Third-party secret-scanning services and repository settings (push protection, required checks, branch rules): complementary options for the owner, not required here.
- OpenGrep rules for code patterns (OPS-28). Changing the text of `AGENTS.md` (owner; agents may only propose wording).
- Version bump, commit, push, PR, release.

## Acceptance criteria

Evidence classes stay separate: unit (pure function), local hook (real Git in a temporary repository inside the project), CI. Every behavior starts with a failing test. The check output names the rule and the location and never prints the matched value.

1. **Given** a commit message that contains the `Claude-Session` trailer name followed by a colon, **when** the `commit-msg` hook runs, **then** the commit is rejected, the output names the rule and the line, and the output does not echo the value.
2. **Given** a staged file that contains `claude\.ai/` outside the allowlist, **when** `pre-commit` runs, **then** the commit is rejected; **given** the same text in an allowlisted path, **then** it passes.
3. **Given** one positive fixture and one look-alike negative fixture for each credential family listed by `@architect`, **when** the pure function runs, **then** every positive is found and no negative is.
4. **Given** a pull request whose range, files or body carry a planted leak, **when** the CI job runs, **then** it fails; **given** a clean pull request, **then** it passes. The job reads the body as data, never as shell text. (Local fixtures prove the logic; the CI run needs a PR or a workflow dispatch, delegated to the orchestrator.)
5. **Given** a draft issue body with a planted leak, **when** the documented pre-send check runs, **then** it exits non-zero; **given** the `issues`-event run (if adopted), **then** the run fails and no comment is posted.
6. **Given** the current tree and the pull-request range of the branch (`origin/main..HEAD`; old history already pushed and local backup branches are out of this range and are handled by the owner-reserved process, never fixed by this story), **when** the baseline scan runs, **then** it reports zero unaccepted findings; every accepted finding is listed in the story evidence with its reason, and the output lists hashes and paths only.
7. **Given** the check's own tests, **when** each pattern is weakened by hand (one mutation per rule, recorded by `@qa`), **then** at least one test fails for each mutation; the test files build the forbidden strings at run time so the check does not flag its own tests.
8. **Given** `git commit --no-verify`, **when** the commit reaches a pull request, **then** the CI job still fails it: the CI is the layer that cannot be skipped, and this is written in the documentation.
9. **Given** the documentation, **then** it explains in English and pt-BR how to activate the hook, how to add a pattern and how to add an allowlist entry with its reason; the documentation-contract tests pass; `AGENTS.md` is not edited by agents.
10. **Given** the quality gates, **when** they run, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green.
11. **Given** any failing check (local hook, manual run or CI), **when** it rejects an input, **then** the failure is clear and fail-closed: a non-zero exit code that differs from the code of an internal error (values fixed by `@architect`); one line per finding with the rule id and the location (commit, file and line, or the body name) and a pointer to the documentation section on the allowlist, never the matched value; an internal error (unreadable file, input above the size limit, allowlist entry without a reason) also fails and says so, and never passes silently.

## Dependencies

- **Starts after** the OPS-22 package is committed: satisfied on 2026-11-05 (committed and pushed, HEAD `1767c24`, CI of PR #101 11/11 green; Orion, 2026-11-04). No other story blocks it.
- **Workflow edit** (FT-46): no workflow file changes without the `@architect` design and the `@devops` review; serialize with OPS-29 and OPS-30, which edit the same workflows (one write set at a time).
- **OPS-28:** both stories deal with secrets. `@architect` fixes which tool owns what: this check covers commits, bodies and all versioned files; OpenGrep covers source-code constructs. No duplicated pattern list.
- **OPS-24:** the script starts as `.mjs`; if `apps/` is converted later, the script follows the folder rule `@architect` sets.
- **Known false positives (allowlist seed, to be confirmed by the baseline):** the rule text in `AGENTS.md`; handoffs and QA gates that cite the pattern; the improvement survey that states the pattern; framework documents under `.aiox-core/` about LLM routing. The seed is data in the allowlist with a reason each, not a hidden exception in code.

## Owner dependencies

Nothing blocks the validation or the start: no owner decision is needed before `@po` validates, and the 9.5 score does not depend on the owner. Items reserved to the owner that this story touches (agents only propose):

- The wording of the rule in `AGENTS.md` or `CLAUDE.md` (AC 9): agents propose text; the owner edits.
- Repository settings that complement the check (push protection, a required status check on the new CI job, branch rules): optional; the story works without them.
- A real credential found by the baseline scan (AC 6): the story stops and reports to the orchestrator; rotation, history rewrite and force push are owner-reserved.
- Merge of the pull request, tag and release.
- The optional `issues`-event run: technical, decided by `@architect` with `@devops`; it becomes an owner item only if it needs a new permission or secret.

## Risks

1. **False positives block legitimate commits.** Mitigation: baseline scan (AC 6), tested allowlist (AC 2), reasons recorded.
2. **Bypass with `--no-verify` or an uninstalled hook.** Mitigation: the CI layer (AC 8).
3. **The error message leaks the value it blocks.** Mitigation: AC 1 asserts the output never echoes the match.
4. **Workflow injection through a PR or issue body.** Mitigation: body as data (AC 4), reviewed by `@architect` and `@devops`.
5. **Pattern regex cost on large files.** Mitigation: bounded patterns and a size limit decided by `@architect`, tested with a large fixture.
6. **Edit conflicts on shared workflow files.** Mitigation: serialization above.
7. **False negatives: a leak the patterns do not match** (new token formats, URL variants such as upper case, `http://`, no trailing slash or percent-encoding, other hosts that the `AGENTS.md` rule also names). Mitigation: the pattern list is versioned with a public source per family; `@architect` fixes the case, URL-variant and encoded-string decisions; each decision has a positive fixture (AC 3, plus a variant case if `@architect` asks for one); the documentation states that the check is a barrier and not a proof of absence, and how to add a pattern (AC 9). Test that covers it: the AC 3 fixtures (one positive per family and per URL variant decided) and the AC 7 hand mutation per rule.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 2, integration 2, infrastructure 3, knowledge 2, risk 3 = **12 → STANDARD**. Difficulty **M** (the survey estimated S; two slices and a CI job make it M). Priority **P1** `[AUTO-DECISION] priority → P1 (reason: Orion, 2026-11-04, starts first; a leak in a public repository is costly and the check is cheap)`.

## Business value

A leak stops at the commit or at the pull request instead of at a public history rewrite. The rule becomes executable and testable.

## Test plan (test-first)

1. **Unit:** the pure function over fixtures built at run time (positives, look-alikes, allowlist, size limit, output never echoing the match).
2. **Hook:** a temporary Git repository created inside the project tree, with the hooks activated by the documented command, driven by real `git commit` calls (message, staged file, `--no-verify` documented).
3. **Mutation by hand:** `@qa` weakens each pattern in turn and confirms a test fails (no new dependency; an automated mutation tool only if `@architect` approves it).
4. **CI:** workflow-contract test pins the job; a pull request or dispatch run with a planted leak on a throwaway branch fails, a clean run passes.
5. **Gates:** the seven project gates; `@qa` issues the verdict before `@devops` commits.

Red/Green by slice (each behavior starts with a failing test):

| Slice | Red (written first, fails for the right reason) | Green (smallest change that passes) | Guard |
|---|---|---|---|
| FT-45 | Unit: a positive and a look-alike per rule against a function that finds nothing; hook: a real `git commit` with a planted trailer is expected to be rejected before the hook exists | Pure function with the rules listed by `@architect`; `commit-msg` and `pre-commit` hooks; allowlist loader with a reason per entry | Output never echoes the match (AC 1, AC 11); size limit; one hand mutation per rule (AC 7) |
| FT-46 | Workflow-contract test fails while the job does not exist; a planted-leak run on a throwaway branch is expected red | CI job over the commit range, the tracked files and the PR body passed as data; documented pre-send step for issue bodies | Injection test with a hostile body (quotes, command substitution, newlines); baseline scan (AC 6); `--no-verify` commit still red in CI (AC 8) |

## Meta 9,5 (survey of 2026-11-04)

Current score (Orion's estimate): **5.0**. Target: **9.5**. The `@qa` attests the score with the ruler of [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (idea #5): the four dimensions (coverage, automation, proof, operation) must average 9.5 with none below 9.0. Exit criteria: all four surfaces covered by the hook and by CI (ACs 1, 2, 4, 5); every pattern with a positive and a negative test (AC 3); one hand mutation per rule fails a test (AC 7); zero unaccepted baseline findings (AC 6); documentation in both languages (AC 9); a clear, fail-closed failure output (AC 11). No part depends on the owner, so agents can reach 9.5.

## Planning gates before implementation

- [x] `@po` validation (10 points) and GO (9.0/10, 2026-11-05, [po-validation.md](po-validation.md)).
- [x] `@devops` created the GitHub issue [#104](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/104) (seen on the real board on 2026-11-05).
- [ ] `@architect`: pattern list with sources, hook mechanism, CI trigger, body-as-data design, allowlist format, size limit, tool ownership against OPS-28.
- [ ] `@qa` test plan (planted leaks, hand mutations, evidence classes).
- [ ] Research LACUNA (recorded by `@po` 2026-11-05): [research-index.md](../../research-index.md) has no note on credential or token formats nor on Git hook mechanisms. `@architect` closes it by citing public provider documentation and the Git documentation for each family and for the hooks; `@analyst` only if `@architect` cannot cite a public source for a family. Golden rule: no new research otherwise.
- [x] UX gate: not applicable (developer-facing only); `@po` confirmed at validation (2026-11-05): no user-facing text, no screen; the output lines are developer messages governed by AC 11.

## Definition of Done

- ACs 1 to 11 have Red-first evidence by class; the CI part is executed on a pull request or dispatch or explicitly recorded as pending.
- Quality gates green; `@qa` verdict and 9.5 attestation recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-04)

1. Goal and context: clear (incident, text-only protection, four surfaces). PASS.
2. Technical guidance: surfaces, patterns by family, hook and CI shape; open design points assigned to `@architect`; no token format invented. PASS.
3. References: survey idea #5, 9.5 ruler, OPS-28, OPS-24. PASS.
4. Self-containment: false positives and allowlist seed stated; history rewrite explicitly out. PASS.
5. Testing: classes separated; hand mutation; self-flagging avoided. PASS.
6. Static analysis: `npm run review:static` in the gates. PASS.
- Result: ready for `@po`. Nothing was invented beyond the survey; the S to M estimate change is recorded above.

## SM review before the `@po` (story-draft-checklist, 2026-11-05)

Re-checked after the QA gate of 2026-11-05 (PASS 9.1; OPS-22 package committed and pushed).

1. Acceptance criteria testable (Given/When/Then with named outputs): PASS; AC 11 added so the failure is clear and fail-closed.
2. Slices FT-45 and FT-46 with order, scope and a Red/Green table: PASS.
3. Scope covers the local hook/guard, the sweep of commits, PR bodies, issue bodies and files, and a clear failure: PASS (surfaces map to ACs 1, 2, 4, 5; baseline to AC 6; failure to AC 11).
4. Test plan Red/Green with separate evidence classes and hand mutations: PASS.
5. Target 9.5 with the ruler and exit criteria; no part depends on the owner: PASS.
6. Owner-reserved items listed (section Owner dependencies): PASS.
7. Issue exists (#104) and the start dependency is satisfied: PASS.
- Result: **ready for the `@po`**. Changes of this review: AC 11, Owner dependencies, Red/Green table, issue link, satisfied dependency. Nothing was invented beyond the survey; the token-format list stays with `@architect`.

## File List

- `docs/stories/OPS-27/story.md` (new)
- `docs/pt-BR/stories/OPS-27/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/improvement-actions-2026-11-04.md`, `docs/process/improvement-issue-bodies-2026-11-04.md` and pt-BR twins (new)
- `docs/process/backlog-inventory.md` and `docs/process/kanban-board-design.md` and pt-BR twins (items ST-20, FT-45, FT-46)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-04 — `@sm` (River): story drafted from idea #5 of the improvement survey. Status Draft. Slices FT-45 and FT-46 registered.
- 2026-11-05 — `@sm` (River): reviewed before the `@po` (section above): added AC 11 (clear, fail-closed failure), the section Owner dependencies and the Red/Green table; recorded issue #104 and the satisfied start dependency. Status stays Draft.
- 2026-11-05 — `@po` (Pax): `*validate-story-draft` 10 points = 9.0/10, **GO**. Status Draft → Ready (issue #104). No AC changed. Four required corrections for `@sm` (false-negative risk, ruler exit criteria 1 to 11, range definition of the baseline, research LACUNA note) and conditions for `@architect`; none blocks the start of the design. Details: [po-validation.md](po-validation.md).
- 2026-11-05 — `@sm` (River): applied the four `@po` corrections: Risk 7 (false negatives), ruler exit criteria 1 to 11 (in improvement-actions), AC 6 range pinned to `origin/main..HEAD`, research LACUNA recorded in the planning gates. Only the AC 6 range was reworded. Status stays Ready.
