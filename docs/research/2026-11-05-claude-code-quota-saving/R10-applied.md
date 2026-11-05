# R10 applied (addendum) — 2026-11-05

Applies R10 (a)-(d) of `README.md` to the ten native subagent definitions in `.claude/agents/aiox-*.md`.

## What changed

- (a) `model: sonnet` in all 10 definitions (9 were `opus`). Not created: `aiox-architect-opus`. The allowlist `ALLOWED_NATIVE_SUBAGENTS` in `.aiox-core/infrastructure/scripts/validate-claude-integration.js` (framework L2 file) would reject a new native agent. For a VERY complex architecture task the Orion passes `model: opus` on that single spawn (per-call parameter), which needs no new file.
- (b) `effort: medium` in all; `maxTurns`: `aiox-dev` 120, `aiox-qa` 150, the other eight 60. Both fields are documented subagent frontmatter (see README, "Subagents").
- (c) Removed the context-loading reads of `.aiox/gotchas.json`, `.aiox-core/data/technical-preferences.md` and `.aiox-core/data/aiox-kb.md` (verified with `ls`: none exist). The remaining items were renumbered.
- (d) Removed the `synapse:tasks:diagnose-synapse` preload from the `skills:` list of all 10 agents.

## Source of the files

`npm run sync:skills:claude` / `sync:ide` do not generate `.claude/agents/`; they are hand-maintained project files, so they were edited directly and the sync was run afterwards (no other file changed). Quality rules (QA >= 9.0, parity, security) are untouched.

## How to measure

In `/usage` compare, before and after: the per-model rows (Opus share should fall toward Sonnet) and the per-subagent rows (`aiox-dev` was 53% of use). Check also that no agent stops at `maxTurns` (a "max turns" ending means the limit is too low for that mission: raise it for that agent only).

## Validation

`sync:skills:claude`, `sync:skills:codex`, `sync:ide:check`, `lint`, `validate:localization`, `validate-claude-integration.js` and `npm test` (171 files, 1900 tests) passed.
