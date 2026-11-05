# Governance rules alignment audit — 2026-10-22

[Português brasileiro](../pt-BR/audits/rules-alignment-2026-10-22.md)

## Scope and method

Read-only audit by `@architect` (Aria) on branch `feat/ops-15-next-panel`. Reviewed `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`, `.github/copilot-instructions.md`, `.github/agents/*.md`, `docs/CONTRIBUTING.md`, `docs/VERSIONING.md`, selected AIOX tasks/agent definitions, `.aiox-core/core-config.yaml`, the personal project memory (`~/.claude/projects/-home-gustavo-projects-subarushogun-gi-twich-bot/memory/`), `.claude/agent-memory/**`, CI workflows, and the rule-pinning tests `tests/unit/documentation-contract.test.js` and `tests/unit/aiox-static-review.test.js`. No tests, Docker or web research were run (internal audit; golden rule). Line numbers refer to the working tree at audit time. The superseded static-review provider is not named here because a test blocks its name in every project file.

## Findings

Severity: Blocker = rules cannot both be followed and one is owner-permanent; High = likely to cause a wrong action; Medium = ambiguity or staleness; Low = hygiene. OD = owner decision required.

| ID | Sev. | Location | Conflict | Recommended fix (not applied) | OD |
|----|------|----------|----------|-------------------------------|----|
| G-01 | Blocker | `.claude/rules/agent-authority.md:45`; `.github/agents/dev.agent.md`; vs `AGENTS.md:73`, `CLAUDE.md:24`, memory `feedback-git-via-devops.md:10` | Matrix lists `git commit` (and `git add`, local `git merge`) as **Allowed** for `@dev`; owner permanent rule: only `@devops` commits, after `@qa` verdict. | Replace row with: "`git status`, `git diff`, `git log`, `git stash` (read/local only) \| `git add`/`git commit`/`git merge`/`git push` → `@devops` after `@qa` verdict (project override, AGENTS.md)". Because this file is framework-sourced, also add a project-override section to `AGENTS.md` that wins over `.claude/rules/`. | No (already decided) |
| G-02 | Blocker | `AGENTS.md:83` pinned by `tests/unit/documentation-contract.test.js:49-50`; vs `CLAUDE.md:37`, memory `feedback-issues-body-only.md:11` | AGENTS.md allows issue comments "if necessary to record a decision or blocker"; owner said **never** comment. The test enforces the weaker text, so fixing the prose breaks the suite. | `AGENTS.md:83` → "Nunca publique comentários em issues. Toda atualização (decisão, bloqueio, escopo) vai no corpo principal, editado somente pelo `@devops` com `gh issue edit --body-file`." Update the test to assert this sentence and add `not.toContain('comentários só são publicados')`. | Yes (confirm "never, no exception") |
| G-03 | High | `CLAUDE.md:30` vs harness scratchpad under `/tmp`; `tests/unit/aiox-static-review.test.js:86` (`mkdtempSync(tmpdir())`) | "Never write to `/tmp`" is violated by the harness scratchpad, by agents, and by the suite itself; the owner exception (installs) is not written anywhere. | "Escopo de trabalho: artefatos do projeto ficam no repositório. Fora dele só são permitidos: (a) o scratchpad da sessão fornecido pelo harness, para arquivos temporários descartáveis; (b) diretórios temporários criados e removidos pelos próprios testes; (c) caches de instalação (`npm`, `opengrep`) autorizados pelo proprietário. Nada fora do repositório é evidência ou entrega." Mirror in `AGENTS.md`. | Yes |
| G-04 | High | `AGENTS.md:79` vs `docs/stories/OPS-21/story.md:5` (and pt-BR) | "Do not consider a story ready for execution without an issue", yet OPS-21 is `Ready` with issue pending. `story-lifecycle.md:19` makes Ready = `@po` GO only. Two meanings of "Ready". | Define in `AGENTS.md`: "`Ready` = GO do `@po` + issue criada + todos os gates de planejamento aplicáveis (data, UX ≥ 9,0, QA) registrados. Com GO mas gates/issue pendentes, use `Draft (GO do @po; gates pendentes: …)`." Re-label OPS-21 to Draft, or accept "Ready = PO GO" and soften AGENTS.md:79. | Yes |
| G-05 | High | `.claude/rules/story-lifecycle.md:22,30` vs `AGENTS.md:82` | Lifecycle: `@qa` sets Done **before** push; AGENTS.md: Done means published by **merged PR**. Also `@devops` "does not change story status" vs updating issue status. | Pick one: "`@qa` registra o veredito (InReview → QA-PASS); `Done` somente após merge da PR, marcado pelo `@devops` junto com o corpo da issue." Add as project override. | Yes |
| G-06 | High | `CLAUDE.md:3` ("AGENTS.md prevails") vs content only in CLAUDE.md (`:11` Node, `:28` OpenGrep, `:29` legacy, `:30` scope, `:24/:35` analyst step) | The declared single source of truth lacks several owner rules; Codex/Copilot agents never see them. | Move every owner rule into `AGENTS.md` (outside managed blocks); reduce `CLAUDE.md` to Claude-specific deltas plus "see AGENTS.md §X". | No |
| G-07 | High | `AGENTS.md:17-25,100-108` (AIOX-MANAGED `core`, `quality`) | Bilingual-documentation rule (`:24`, `:107`) lives inside managed blocks that a framework sync may overwrite; the managed quality list omits `validate:localization`, `validate:version`, `validate:port-denylist`, `review:static` (only in `CLAUDE.md:51`). No sync procedure is recorded beyond `CLAUDE.md:28` (OpenGrep only). In-repo, only `grok-skills-sync/index.js:991-1025` rewrites managed sections; the installer's behaviour is unverified. | Move bilingual rule and full gate list to an unmanaged "Regras do projeto" section; leave managed blocks generic. Add to `AGENTS.md` a "Atualização do framework AIOX" checklist: diff managed blocks, reapply OpenGrep customizations, remove superseded-provider traces, re-run `sync:ide:check`, re-verify G-01/G-05 overrides, run the rule-pinning tests. | No |
| G-08 | Medium | `AGENTS.md:36` ("always research"), `CLAUDE.md:35-36`, memory `feedback-always-research-web.md:11,19` vs golden rule `AGENTS.md:41` | Consistent in substance (golden rule "refines"), but the memory description still says "Always research" and the analyst-before-every-gate step (`CLAUDE.md:24,35`) is not in AGENTS.md. | Single sentence in AGENTS.md: "Pesquisa obrigatória **quando** `docs/research-index.md` marcar LACUNA ou um gatilho REVISAR SE disparar; caso contrário reutilize a nota." Update memory description accordingly. | No |
| G-09 | Medium | `AGENTS.md` (most lines without accents, e.g. `:3,:5,:9-14`) vs owner rule "pt-BR with correct accents"; `CONTRIBUTING.md:18` ("English is primary") vs `AGENTS.md:24`/`CLAUDE.md:20` | Instruction files are monolingual pt-BR and partly unaccented; rule files in `.claude/rules/` are English-only. Not stated whether governance files are exempt from bilingualism. | State: "Arquivos de instruções de agentes (AGENTS.md, CLAUDE.md, .claude/rules) são monolíngues e isentos da regra bilíngue; pt-BR com acentuação correta." Then re-accent AGENTS.md. | Yes (exemption) |
| G-10 | Medium | `.aiox-core/development/tasks/resolve-github-issue.md:64` ("GitHub Issue Comment"); `.aiox-core/development/agents/devops.md:363` (coverage posted to PR comments) | Framework tasks post comments, contradicting G-02. | Project override in AGENTS.md: "Tasks AIOX que publiquem comentários em issues devem gravar no corpo da issue." Optionally an OpenGrep/test check for `gh issue comment` in project scripts. | No |
| G-11 | Medium | `.aiox-core/core-config.yaml:351` (`frameworkProtection: false`) vs `.claude/CLAUDE.md:128` (default true for projects) | L1/L2 deny rules are off, so framework files are not protected in this product repo. | Set `true` unless the owner is deliberately editing framework files (OpenGrep customizations). Document the reason either way. | Yes |
| G-12 | Medium | `.claude/rules/story-lifecycle.md:128,138` (QA loop max 3) vs `.claude/rules/workflow-execution.md:47,59` (max 5) | Contradictory iteration limit. | Choose one value and reference `autoClaude.qaLoop.maxIterations` from both. | No |
| G-13 | Medium | memory `feedback-git-via-devops.md:14` vs `.claude/agent-memory/aiox-devops/feedback_pathspec_commits.md:10`; `CLAUDE.md:12` | Project memory: history rewrite authorized once and done (backup `backup/ops-15-before-history-fix` exists); devops memory: "history could not be rewritten" (commit `5225fe5` still exists). `CLAUDE.md:12` says never commit without authorization, while a standing commit authorization exists only in memory. | Fix devops note to "was rewritten on 2026-10-22 with owner authorization; backup branch kept". Add to AGENTS.md: "Autorização vigente: commits locais após veredito PASS do `@qa`; push/PR/tag/bump/release exigem autorização explícita." | Yes (confirm standing authorization in repo) |
| G-14 | Medium | Memory `MEMORY.md` (5 entries) vs 6 notes | `feedback-always-research-web.md` is missing from the index, so it may not load. | Add: "- [Research before decisions](feedback-always-research-web.md) — research-index first; research only on GAP/REFRESH". | No |
| G-15 | Medium | `.claude/agent-memory/` (untracked, not in `.gitignore:36`) | Unclear whether agent memory is shared team knowledge; one-off files risk accidental commit or loss. Agent instructions say it is "shared via version control". | Decide: track it (commit through `@devops`) or ignore it. Recommended: track; durable feedback (pathspec commits, QA-first) also copied into `docs/` governance. | Yes |
| G-16 | Medium | Personal memory feedback notes (`feedback-*.md`) | Team-relevant rules (body-only issues, QA final tests, dev-only implementation, pop-up decisions) live in a personal directory; most are mirrored in AGENTS/CLAUDE, but "decisions as pop-ups" and the standing commit authorization are not. | Repo docs own rules; memory keeps only pointers ("see AGENTS.md §…") plus personal preferences. | No |
| G-17 | Low | `.claude/rules/handoff-consolidation.md:33-34,114` | References `business-ai-first/` paths from another project. | Replace with `docs/stories/<ID>/RUN-LOG.md` and `.aiox/run-logs/`. | No |
| G-18 | Low | `.claude/CLAUDE.md:275` (Node 18+), `.claude/rules/tool-examples.md:16,35` (Supabase), `story-lifecycle.md:36` (`{epic}.{story}.story.md`), frontmatter `paths` without `docs/pt-BR/stories/**` | Generic framework text stale for this project (Node 24.20.0, Prisma/PostgreSQL, `docs/stories/<ID>/story.md`). | Add project override lines in AGENTS.md; add `docs/pt-BR/stories/**` to the path filter. | No |
| G-19 | Low | `.github/copilot-instructions.md` (no project rules) | Copilot sees none of the owner rules (issues, commits, research, OpenGrep). | One line: "Siga AGENTS.md; ele prevalece sobre este arquivo." | No |
| G-20 | Low | `.claude/rules/agent-memory-imports.md:7-12` | Imports only 6 of 10 agent `MEMORY.md` files (analyst, data-engineer, sm, ux missing). | Add the four imports. | No |
| G-21 | Low | `.github/workflows/quality-gates.yml` | `validate:port-denylist` (required by `CLAUDE.md:51`) is not run in CI. | Add the step. | No |

Superseded provider (item 8): enforcement is strong. `tests/unit/aiox-static-review.test.js:142-150` scans every file under the repository (tracked and untracked, except generated directories) for the name; `CLAUDE.md:28` and `.claude/rules/opengrep-static-analysis.md` are consistent; framework tasks mention only OpenGrep. No residual was found by inspection (the test is the authority and was not run here).

## Proposed source-of-truth map

| Rule area | Owner file | Others |
|-----------|-----------|--------|
| Owner rules (git/commit authority, issues body-only, QA-final, scope/tmp, OpenGrep, legacy, research golden rule, Ready definition, language) | `AGENTS.md` unmanaged section "Regras do proprietário" | `CLAUDE.md`, `copilot-instructions.md`, memory: pointers only |
| Project overrides of framework rules (G-01, G-05, G-10, G-12, G-18) | `AGENTS.md` "Sobreposições ao framework AIOX" | `.claude/rules/*` stay framework-generic |
| Claude-specific behaviour (scratchpad, skills, sub-agents) | `CLAUDE.md` | — |
| Contribution, commits format, safety | `docs/CONTRIBUTING.md` | — |
| Versioning, stage, release | `docs/VERSIONING.md` | — |
| Story status workflow | `AGENTS.md` override + `.claude/rules/story-lifecycle.md` | — |
| Research reuse | `docs/research-index.md` | — |
| Agent learning (non-normative) | `.claude/agent-memory/**` (tracked) | Personal memory: preferences only |
| Enforcement | rule-pinning tests + CI | — |

## Enforcement (item 10)

Backed by tests/CI: superseded-provider ban; OpenGrep in workflow executor and CI; changelog/versioning text; DevOps issue-body sentence (but pins the weaker exception, G-02); lint, typecheck, tests, localization, version in CI. Prose only: `@dev` cannot commit, QA-before-commit, never comment, Ready definition, no `/tmp`, bilingual docs, UX ≥ 9.0, research golden rule, Docker hygiene, PostgreSQL-only evidence. No local git hooks exist (no `.husky`/`.githooks`).

## Professional governance checklist — 6.5/10

Covered: single declared source of truth; explicit role authority; owner decisions written down; CI quality gates; tests that pin key policy text; bilingual docs policy; versioning/release policy; research reuse index. Not covered: precedence between `AGENTS.md` and framework rules (G-01, G-05); one owner rule pinned in its weaker form (G-02); rules inside overwritable blocks without a sync procedure (G-07); impossible/unwritten exceptions (G-03); split definitions of Ready/Done (G-04, G-05); memory drift and untracked agent memory (G-13–G-16); most authority rules unenforced by tests or hooks.

## Owner decisions needed

1. G-02: issue comments — "never, no exception" (recommended) and update the pinned test.
2. G-03: write the scope exceptions (scratchpad, test temp dirs, installs).
3. G-04/G-05: meaning of Ready (recommended: PO GO + issue + gates) and Done (recommended: after merged PR).
4. G-09: exempt agent-instruction files from bilingualism.
5. G-11: re-enable `frameworkProtection`.
6. G-13/G-15: write the standing commit authorization in the repo; track `.claude/agent-memory/`.

## Remediation status (owner authorization, 2026-10-22)

The owner authorized fixing the non-decision findings. Owner-decision items were not applied. Fixes that ideally belong in protected framework paths (L1/L2) or in `AIOX-MANAGED` blocks were applied as a **documented project divergence** in the unmanaged `AGENTS.md` section "Regras do proprietário e sobreposições ao framework AIOX"; a future framework sync must re-check them (procedure recorded in that section).

| ID | Status | Note |
|----|--------|------|
| G-01 | FIXED | `.claude/rules/agent-authority.md` row rewritten; override in AGENTS.md. Correction: `.github/agents/dev.agent.md` does not mention commits. |
| G-02 | PENDING-DECISION | Text and pinned test unchanged; AGENTS.md override strengthens body-only editing without touching line 83. |
| G-03 | PENDING-DECISION | — |
| G-04 | PENDING-DECISION | OPS-21 status unchanged. |
| G-05 | PENDING-DECISION | — |
| G-06 | FIXED | OpenGrep, legacy, Node/stack, analyst step and git authority copied into AGENTS.md; the scope (/tmp) rule stays only in CLAUDE.md until G-03 is decided. |
| G-07 | FIXED (divergence) | Unmanaged copy of the bilingual rule and full gate list plus framework-update checklist in AGENTS.md; managed blocks untouched. |
| G-08 | FIXED | Memory description and AGENTS.md research line; golden rule text unchanged. |
| G-09 | PENDING-DECISION | — |
| G-10 | FIXED (divergence) | AGENTS.md override; framework tasks (L2) untouched. |
| G-11 | PENDING-DECISION | — |
| G-12 | FIXED | `story-lifecycle.md` aligned to 5 iterations. |
| G-13 | FIXED (memory) / PENDING-DECISION (repo) | Devops note corrected (`5225fe5` now exists only on the backup branch); writing the standing commit authorization in the repo awaits the owner. |
| G-14 | FIXED | Index now lists 6 notes; all `[[...]]` links resolve. |
| G-15 | FIXED (decision documented) | Decision: `.claude/agent-memory/**` is tracked team knowledge (AGENTS.md); not committed — commit belongs to `@devops`. |
| G-16 | ACCEPTED-WITH-REASON | "Decisions as pop-ups" is a personal Claude interaction preference, not a team rule; it stays in personal memory. |
| G-17 | FIXED | Paths replaced with this project's. |
| G-18 | FIXED | `.claude/CLAUDE.md` Node line (outside managed block), story path note and `docs/pt-BR/stories/**` filter; Supabase examples covered by the AGENTS.md override. |
| G-19 | FIXED | Pointer to AGENTS.md at the top of `.github/copilot-instructions.md`. |
| G-20 | FIXED | Four imports added. |
| G-21 | ACCEPTED-WITH-REASON | CI changes belong to `@devops`; delegate adding `validate:port-denylist`. |

Files changed: `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/agent-authority.md`, `.claude/rules/story-lifecycle.md`, `.claude/rules/handoff-consolidation.md`, `.claude/rules/agent-memory-imports.md`, `.github/copilot-instructions.md`, `.claude/agent-memory/aiox-devops/feedback_pathspec_commits.md`, personal memory `MEMORY.md` and `feedback-always-research-web.md`, plus this report (en + pt-BR).
