# Multi-model governance: advisor, subagents, worktrees, hooks and Haiku (research note)

[Português brasileiro](../../pt-BR/research/2026-11-14-multimodel-governance/README.md)

- Author of the findings: `@architect` (Aria), mission of 2026-11-14 (design package approved by the owner the same day). Registered here by the `@dev` so the index stays complete. No new web research was done by the `@dev`.
- Source class: **A1** = official Claude Code and Anthropic documentation as read by the `@architect`; direct page links were not kept in the design, so they must be re-collected before any decision that depends on a detail below. **LOCAL** = observed in this repository. **UNVERIFIED** = inference, to be proven by the V-* checks in `12-plano-de-testes` of the design (run by `@qa`, never by the `@dev`).
- Limits: nothing below was executed in a fresh Claude Code session, on GitHub, in Docker or in a browser. The weekly-quota weight of each model is not public; the 60 % and 80 % thresholds in `AGENTS.md` are operational choices, not measurements.

## Findings

| # | Topic | Finding | Class |
|---|---|---|---|
| 1 | Advisor tool | Experimental server-side tool; the executor decides when to call it (it cannot be forced or capped, only instructed). It sees the whole conversation, only advises (no tools) and answers in roughly 400 to 700 tokens. Each call reprocesses the conversation without cache at the advisor's price. | A1 |
| 2 | Advisor pairs and switches | The advisor must be at least as strong as the executor; Sonnet 5.5 accepts Opus 5 and later. Per session: `claude --model sonnet --advisor opus`; `/advisor opus` writes `advisorModel` to the user settings (not used here); `/advisor off` and `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` turn it off. | A1 |
| 3 | Advisor and subagents | Subagents inherit the advisor, so a Haiku read agent could trigger an Opus call that rereads the conversation. Rule adopted: no Haiku dispatch in a session with advisor. Real behaviour on this installation is untested (V-ADV-1, V-ADV-2). | A1 + UNVERIFIED |
| 4 | Subagent model | The `model` argument of the dispatch call wins over the agent frontmatter; the frontmatter alias `haiku` resolves to Haiku 5.5 on the Anthropic API. | A1 |
| 5 | Haiku for reading | Input price is about 1/20 of Sonnet; Haiku scored 39.2 % against 70.6 % for Sonnet on a terminal-agent benchmark, so Haiku is limited to reading and triage, never to verdicts, money or security. | A1 |
| 6 | Tools of subagents | `Grep` and `Glob` did not appear for subagents in the installed version; the read agents therefore use `Bash` behind an allowlist hook. `disallowedTools` is expected to hold even in `bypassPermissions`; `permissionMode: plan` is ignored there. | LOCAL + UNVERIFIED (V-SUB-2) |
| 7 | Hooks | `PreToolUse` hooks in `.claude/settings.json` and in agent frontmatter can return `allow`, `ask` or `deny`. The hook input carries the subagent type (`agent_type`) when the call comes from a subagent; this is assumed, not proven here (V-HOOK-3). Hooks are guardrails, not a security boundary: scripts and interpreters still reach Git; credentials and branch protection are the real boundary. | A1 + UNVERIFIED |
| 8 | Worktrees | A subagent worktree starts from the default branch (fresh) or from the committed HEAD; staged, unstaged and untracked changes are not copied. Because this project does not commit before the gate, an automatic worktree would audit an incomplete diff, so `aiox-audit` reads the main checkout and proves the version with a fingerprint. Worktrees with unpublished work are not removed by the periodic cleanup. | A1 + UNVERIFIED (V-WT-1, V-FP-1) |
| 9 | Framework config | `autoClaude.worktree.autoCreate` is read only by `.aiox-core/infrastructure/scripts/story-worktree-hooks.js`; `models.active` is read only by `.aiox-core/core/synapse/context/context-tracker.js` (context window and prompt size). | LOCAL |
| 10 | permissionMode bypassPermissions | Kept for the ten write agents (owner decision 2026-11-14); the three read agents use `plan`. Reason: background agents have nobody to answer a permission prompt, so autonomous lanes would stop. The risk is covered by `PreToolUse` hooks, `permissions.deny` and the `@qa` gate. That the hooks still run and block under `bypassPermissions` in this installation is **not proven** (V-HOOK-1, run by `@qa` in a real session). | LOCAL + UNVERIFIED (V-HOOK-1) |

## Decision record: bypassPermissions kept

- Decision (owner, 2026-11-14): keep `permissionMode: bypassPermissions` on `aiox-analyst`, `aiox-architect`, `aiox-data-engineer`, `aiox-dev`, `aiox-devops`, `aiox-pm`, `aiox-po`, `aiox-qa`, `aiox-sm` and `aiox-ux`.
- Written justification: autonomous lanes need agents that do not stop on prompts; the guard denies by default for everyone who is not `@devops`.
- Pending: V-HOOK-1 decides. If the hook does not run under `bypassPermissions`, the owner decides the replacement; until then the state is "kept, not proven", with no acceptance credit.
- Contract: `tests/unit/claude-governance-contract.test.js` fixes the state and the pending check.

## What changed in the project because of this note

`AGENTS.md` (lanes, hot files, gate queue, read agents, one model bullet), `CLAUDE.md` (read agents, lanes, advisor per session), `.claude/settings.json`, the two hooks plus `lib/shell-words.cjs`, the three read agents, the Git rules of `@devops`, the commit overrides of two skills, and `.aiox-core/core-config.yaml` (`models.active` and `autoCreate: manual`).

## Verdict for the index

**REFRESH IF** the installed Claude Code version changes, or when the V-HOOK, V-SUB, V-ADV, V-WT and V-FP checks produce results (then update items 3, 6, 7 and 8 with the measured behaviour).
