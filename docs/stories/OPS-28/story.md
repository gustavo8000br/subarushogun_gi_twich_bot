# OPS-28 — Static-scan rules: widen OpenGrep beyond the two current rules

[Português (pt-BR)](../../pt-BR/stories/OPS-28/story.md)

**Status:** Draft (drafted by `@sm` on 2026-11-04; not yet validated by `@po`). **Issue:** pending (`@devops` creates it from [improvement-issue-bodies-2026-11-04.md](../../process/improvement-issue-bodies-2026-11-04.md); no issue comments).
**Source:** idea #4 of the [improvement survey](../../process/improvement-ideas-2026-11-04.md) (owner request, 2026-11-04). Evidence: `.opengrep/rules.yml` has two rules (`no-unsafe-html-sink`, `no-credential-logging`); the first already carries a plain-text match for `dangerouslySetInnerHTML` that is not a structured JSX rule and has no test. Owner decision (permanent): **OpenGrep is the only static reviewer**; the former review provider is not planned and its name is blocked by `tests/unit/aiox-static-review.test.js`.
**Related:** OPS-27 (secrets in commits, files and bodies; shared ground), OPS-24 (AC 7 makes both existing rules scan `.ts`), [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (9.5 ruler, idea #4, actions AÇ-16..AÇ-20).
**Registered items:** inventory ST-21 (this story), FT-47 and FT-48 (slices); see [backlog-inventory](../../process/backlog-inventory.md).
**Coordination required:** `$aiox-po` (validation), `$aiox-architect` (rule test mechanism, which constructs the product really uses, tool ownership against OPS-27), independent `$aiox-qa` (test plan, hand mutations, the 9.5 attestation), `$aiox-devops` (issue). `$aiox-analyst` only for a GAP in a rule-test or SSRF pattern (check [research-index.md](../../research-index.md) first). `$aiox-ux-design-expert` and `$aiox-data-engineer`: not applicable (no user-facing text, no schema).

## Problem

- Two rules cannot catch the classes of defect that matter for a bot that talks to the Twitch API, a PostgreSQL database and a browser: raw SQL built from strings, dynamic code execution, requests to a URL controlled by input (SSRF), credentials written in source, HTML injection through JSX, and unsafe response headers or cookies.
- A rule without a test is a claim. Today neither rule has a positive and a negative fixture proving what it matches.
- The scan must stay one command (`npm run review:static`), editing nothing, with zero accepted-by-silence findings.

## Story

As the owner who reviews through a single static scanner,
I want OpenGrep rules for the main vulnerability classes of this product, each proven by a positive and a negative test,
so that a dangerous construct fails the gate instead of depending on a reviewer's attention.

## Scope

**In (two slices, in this order):**

- **FT-47 — injection and execution rules.** Raw SQL (unsafe Prisma raw calls and queries built by concatenation or template strings), dynamic code execution (`eval`, `new Function`, string arguments to timers), and SSRF (a server-side request whose URL comes from request input without an allowlist). Includes the rule-test mechanism (below) and the run of the whole scan over the current tree.
- **FT-48 — secrets, HTML and transport rules.** Secrets in code (hard-coded credential assignments and token-shaped literals; the family list is shared with OPS-27 and owned by whoever `@architect` names, never copied twice), `dangerouslySetInnerHTML` as a structured JSX rule (replacing the plain-text match), and headers and cookies (cookies set without `httpOnly`, `secure` or `sameSite`, wildcard CORS with credentials, only for constructs that exist in the code).
- **Rule-test mechanism** (fixed by `@architect`): either the scanner's own annotated-fixture test mode or a Vitest test that runs the scanner over fixture files. The fixtures live where the real project scan does not report them as project findings.

**Out of scope:**

- Dependency scanning (`npm audit`, SCA), DAST, runtime protection, a second scanner, Biome security rules, automatic fixes (the scanner never edits files).
- Languages other than JavaScript and TypeScript. The old review provider in any form.
- Changing product behavior to satisfy a rule other than a test-first fix of a real finding.
- Version bump, commit, push, PR, release.

## Acceptance criteria

Evidence classes stay separate: unit/rule tests, the full-tree scan, CI. Every rule starts with a failing test.

1. **Given** each new rule, **when** its positive fixture is scanned, **then** the scanner reports that rule id and `npm run review:static` exits non-zero; **given** its negative fixture (the safe form of the same construct), **then** it reports nothing.
2. **Given** each rule, **then** at least one evasion variant is a positive fixture (an alias, a destructured call, a template literal or a re-assigned value, as the construct allows).
3. **Given** the current tree, **when** `npm run review:static` runs with all rules, **then** it exits zero; every real finding is fixed test-first, every accepted finding is listed in the story evidence with its reason, and no blanket ignore covers product code.
4. **Given** each rule declares `languages: [javascript, typescript]`, **when** a `.ts` positive fixture is scanned, **then** the rule fires (it does not depend on the OPS-24 conversion having happened).
5. **Given** a rule pattern weakened by hand (one mutation per rule, recorded by `@qa`), **when** the rule tests run, **then** at least one fails.
6. **Given** `dangerouslySetInnerHTML` used as a JSX attribute, **then** the structured rule reports it, the plain-text match is removed, and the existing `no-unsafe-html-sink` fixtures still pass.
7. **Given** the rule-test files, **when** `npm test` runs, **then** they run in the normal suite, and CI keeps running `npm run review:static` in the static-analysis job.
8. **Given** `tests/unit/aiox-static-review.test.js`, **then** it still passes: the old provider name stays blocked and OpenGrep stays the only reviewer.
9. **Given** the documentation, **then** a page in English and pt-BR lists each rule, its reason, its fixtures, how to add a rule and how an accepted finding is recorded; the documentation-contract tests pass.
10. **Given** the quality gates, **then** `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate:localization`, `npm run validate:version`, `npm run validate:port-denylist` and `npm run review:static` are green.

## Dependencies

- **Starts after** OPS-27 FT-45 is designed (tool ownership for secrets is fixed first); otherwise independent. Order recommended by the survey: after OPS-27, OPS-30 and OPS-29.
- **OPS-24:** its FT-30 changes `languages` on the two existing rules; this story's new rules declare both languages from the start. Edit order on `.opengrep/rules.yml` is serialized by `@architect` (one write set at a time).
- **CI:** `review:static` already runs in the static-analysis job of the reusable quality gates; no workflow change is expected. If one turns out to be needed, it needs the `@architect` design and the `@devops` review.
- **Known finding classes to expect:** SQL access goes through Prisma; the product has server-side requests to the Twitch API. The baseline of the first scan decides how many fixes the story absorbs.

## Risks

1. **False positives** block the gate and invite blanket ignores. Mitigation: AC 3 (no blanket ignore), negative fixtures (AC 1).
2. **False negatives** hide behind syntax variants. Mitigation: evasion fixtures (AC 2) and hand mutation (AC 5).
3. **Rule syntax or mode differences** in the scanner version pinned in CI. Mitigation: the rule tests run against the pinned version used by the quality gates.
4. **Scope creep into product fixes.** Mitigation: a finding that needs a behavior change becomes its own test-first change recorded in the evidence.
5. **Overlap with OPS-27.** Mitigation: tool ownership is decided before FT-48.

## Complexity (estimate by `@sm`, to be confirmed by `@architect`)

Scope 3, integration 1, infrastructure 2, knowledge 3, risk 2 = **11 → STANDARD**. Difficulty **M**, priority **P2**.

## Business value

The scanner that is the only reviewer starts to cover the classes of vulnerability that would hurt a public bot, with rules whose behavior is proven rather than assumed.

## Test plan (test-first)

1. **Rule tests:** positive, negative and evasion fixture per rule, run in `npm test`.
2. **Full-tree scan:** `npm run review:static` over the real tree; findings fixed test-first or recorded with a reason.
3. **Hand mutation:** `@qa` weakens each pattern in turn and confirms a test fails.
4. **`.ts` proof:** a `.ts` positive fixture fires each rule.
5. **Gates:** the seven project gates; `@qa` issues the verdict before `@devops` commits.

## Meta 9,5 (survey of 2026-11-04)

Current score (Orion's estimate): **4.0**. Target: **9.5**. The `@qa` attests the score with the ruler of [improvement-actions-2026-11-04.md](../../process/improvement-actions-2026-11-04.md) (idea #4): coverage, automation, proof and operation must average 9.5 with none below 9.0. Exit criteria: the six classes of the survey have at least one rule each (coverage); every rule has a positive, a negative and an evasion test and one hand mutation that fails (proof, ACs 1, 2, 5); the scan of the full tree exits zero with no blanket ignore (AC 3); rules run in `npm test` and in CI (AC 7); the rule page exists in both languages (AC 9). No part depends on the owner.

## Planning gates before implementation

- [ ] `@po` validation (10 points) and GO.
- [ ] `@devops` creates the GitHub issue.
- [ ] `@architect`: rule-test mechanism, rule list against the constructs the product really uses, tool ownership for secrets (with OPS-27), order against OPS-24 FT-30 on `.opengrep/rules.yml`.
- [ ] `@qa` test plan (fixtures, evasion variants, hand mutations, baseline handling).
- [ ] `@analyst` note only if a GAP exists; [research-index.md](../../research-index.md) checked first.
- [ ] UX gate: not applicable; `@po` confirms at validation.

## Definition of Done

- ACs 1 to 10 have Red-first evidence by class; accepted findings are listed with reasons.
- Quality gates green; `@qa` verdict and 9.5 attestation recorded; File List and checklists updated in English and pt-BR.

## SM draft validation (story-draft-checklist, 2026-11-04)

1. Goal and context: clear (two rules today, six classes missing, single reviewer). PASS.
2. Technical guidance: classes, languages, fixtures and the test mechanism; open points assigned to `@architect`. PASS.
3. References: survey idea #4, rules file, the static-review test, OPS-27 and OPS-24. PASS.
4. Self-containment: scope, out of scope, known overlaps stated. PASS.
5. Testing: positive, negative, evasion, mutation, `.ts`. PASS.
6. Static analysis: `npm run review:static` is the subject and a gate. PASS.
- Result: ready for `@po`. No rule text was invented; rule patterns are for `@dev` to write test-first.

## File List

- `docs/stories/OPS-28/story.md` (new)
- `docs/pt-BR/stories/OPS-28/story.md` (new)
- `docs/stories.md` and `docs/pt-BR/stories.md` (index entry)
- `docs/process/backlog-inventory.md` and `docs/process/kanban-board-design.md` and pt-BR twins (items ST-21, FT-47, FT-48)

Implementation files will be listed here by `@dev` after the gates.

## Change Log

- 2026-11-04 — `@sm` (River): story drafted from idea #4 of the improvement survey. Status Draft. Slices FT-47 and FT-48 registered.
