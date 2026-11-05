# Saving Claude Code quota in this project (research note)

[Português brasileiro](../../pt-BR/research/2026-11-05-claude-code-quota-saving/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-05. Branch: `feat/ops-15-next-panel`.
- Labels: **VERIFIED** (official Anthropic / Claude Code docs read in this session, or measured in the repository), **PARTIAL** (secondary source), **UNVERIFIED** (inference).
- Scope: research and recommendations only. No code, rules, settings or agent files were changed.
- Token figures are estimates: bytes / 4 (English) and bytes / 3.5 (Portuguese). They are orders of magnitude, not measurements.

## TL;DR

1. Quota is driven by **context size x number of requests**, not by the number of messages. Prompt caching makes re-reading cheap but not free, and a cold cache (idle longer than the TTL, model switch, new subagent) re-processes everything at the full rate.
2. The biggest levers for this project, in order: **(1)** stop whole-reading the 220 KB / 239 KB `session-handoff.md` pair and the 277 KB OPS-15 `story.md`; **(2)** align the agent models with the owner's own Sonnet-5.5 rule (9 of 10 agent definitions pin `model: opus`); **(3)** use `/clear` and a compact "current state" file between unrelated tasks; **(4)** shorter agent prompts that point to a file instead of pasting text; **(5)** move always-loaded text out of `.claude/CLAUDE.md` and unscoped rules.
3. Biggest unknown: the real split of recent usage per skill / subagent / MCP / `CLAUDE.md`. The official `/usage` screen shows exactly that for subscriptions and was not available to this note. **Run `/usage` first** (see R0).
4. Self-assessment: **8.9 / 10** (rubric at the end). Verdict for `docs/research-index.md`: **SUFFICIENT** for the decision, with a **REFRESH IF** trigger.

## 1. How Claude Code consumes quota (VERIFIED, official)

| Fact | Source |
| - | - |
| Every request re-sends the whole context (system prompt, project context, history, tool results). Cache reads are billed at the cached rate (0.1x of base input on the API); 5-minute writes cost 1.25x and 1-hour writes 2x. | [Prompt caching in Claude Code](https://code.claude.com/docs/en/prompt-caching.md); [API prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) |
| Cache layers, in order: system prompt and tools, project context (CLAUDE.md, auto memory, unscoped rules), conversation. A change early in the prefix invalidates everything after it. | prompt-caching page, "How the cache is organized" |
| Cache is per model. Switching `/model` re-reads the whole history uncached. A skill whose frontmatter names another model is also a switch. `opusplan` toggles are switches. | same page, "Switching models" |
| Effort change keeps the cache on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1 (API key or subscription). | same page, "Changing effort level" |
| TTL: on a subscription, within plan usage, the **main conversation** gets 1 hour; **subagents, compaction, teammates and forks get 5 minutes**. With usage credits or API key the default is 5 minutes. Settings `promptCacheTtl` and `subagentPromptCacheTtl` (v2.1.242+) override. | same page, "Which TTL each request gets" |
| A subagent starts a **separate cache** with its own system prompt; its first request does not read the parent's cache. A **fork** shares the parent's cache and costs less than a fresh subagent when it needs the same context. | same page, "Subagents and the cache"; [Subagents](https://code.claude.com/docs/en/sub-agents.md) |
| `/compact` itself is a large request (it reads the history to summarize it). Cheap while the cache is warm, expensive after an idle gap. `/clear` costs nothing. Idle compaction can run on a 1-hour-TTL session (`idleCompaction`). | [Manage costs](https://code.claude.com/docs/en/costs); prompt-caching page |
| CLAUDE.md is read once at session start; edits apply only after `/clear`, `/compact` or restart. Target is under 200 lines per file. Auto memory `MEMORY.md` loads the first 200 lines or 25 KB. Rules with `paths:` frontmatter load only when matching files are touched. | [Memory](https://code.claude.com/docs/en/memory.md) |
| MCP tool definitions are deferred by default (tool search); only names enter context. CLI tools such as `gh` are still lighter than MCP servers. | Manage costs, "Reduce MCP server overhead" |
| Sonnet is recommended for most coding tasks; Opus for hard reasoning. A switch to Opus also applies to subagents that inherit the session model. Subagent `model:` field and `CLAUDE_CODE_SUBAGENT_MODEL` (+ `_FORCE=1`) control it. Resolution order: invocation parameter, frontmatter, env var, parent model. | Manage costs; Subagents |
| Default effort is `medium` on Opus 5.5, Sonnet 5.5 and Haiku 5.5; thinking cannot be turned off on these models, so effort is the lever. `ultrathink` raises one turn to `xhigh`. | [Model config](https://code.claude.com/docs/en/model-config.md) |
| Subagents: fresh context, only the final summary returns; their requests count against the same plan limits. `maxTurns`, `effort`, `autoCompactWindow` (100k-1M) can be set in frontmatter. A completed subagent can be resumed with `SendMessage` and keeps its full history. Descriptions of all subagents sit in every session (warning above 15,000 tokens). | Subagents |
| Skills load on demand; `skills:` in subagent frontmatter **injects the full skill content at startup**. | Subagents; Manage costs |
| Agent teams use roughly 7x the tokens of a standard session in plan mode. We do not use teams. | Manage costs |
| Hooks can filter output before Claude sees it (example: show only test failures). | Manage costs, "Offload processing to hooks and skills" |
| Long sessions climb because every request carries the whole conversation; idle gaps cause cache misses; scheduled tasks, goal check-ins and cross-session messages re-send full context. | Manage costs, "Why usage climbs in a long session" |
| `/usage` shows, for subscriptions, attribution per skill / subagent / plugin / MCP server and recommendations with a share of recent usage; `Prompt cache (main)` line needs v2.1.251+. | Manage costs, "Plan usage breakdown" |

## 2. What we measured in the repository (VERIFIED, 2026-11-05)

| Item | Size | Rough tokens | Loaded when |
| - | - | - | - |
| `docs/session-handoff.md` | 220,047 B, 862 lines | ~55k | Read first on every resume (CLAUDE.md instruction) |
| `docs/pt-BR/session-handoff.md` | 239,031 B | ~68k | Same instruction |
| `docs/stories/OPS-15/story.md` | 277,158 B | ~69k | Any agent that opens the story whole |
| `docs/stories/OPS-15/queue-route-action-inventory.md` / `ux-code-audit.md` / `test-suite-audit` | 74,885 / 51,686 / 42,904 B | ~19k / 13k / 11k | When consulted |
| `AGENTS.md` | 32,878 B, 212 lines | ~8k | Project instructions (loading mode not verified here) |
| `CLAUDE.md` + `.claude/CLAUDE.md` | 7,133 + 12,745 B (51 + 356 lines) | ~5k | Every session; `.claude/CLAUDE.md` is far above the 200-line target and mostly generic AIOX boilerplate |
| `.claude/rules/*` without `paths:` (5 files) | ~20.3 KB | ~5k | Every session |
| `.claude/rules/*` with `paths:` (6 files) | ~19 KB | 0 until matched | On demand |
| Owner `MEMORY.md` index | 5,127 B (about 30 entries) | ~1.3k | Every session of the orchestrator |
| Agent definitions `.claude/agents/*` | 36,443 B for 10 (2.7-5.3 KB each) | ~0.7-1.5k each | At each spawn; all descriptions in every session |
| Skills | 16 directories, 840 KB on disk; 8 agents preload `checklist-runner`, 10 preload `synapse:tasks:diagnose-synapse`, 3 `opengrep-static-analysis`, 1 `tech-search` (17 KB) | ~0.9k + other | Injected in full at subagent start |
| `.mcp.json` | none in project | 0 | n/a. The session shows connected claude.ai connectors (Figma, Notion, Vercel, Descript, Claude Docs); with tool search only names and server instructions cost context, but their long instruction blocks are present |
| Agent `model:` frontmatter | **9 of 10 = `opus`**, only `aiox-sm` = `sonnet`; no `effort`, no `maxTurns` | n/a | At each spawn unless the Orion overrides with the `model` parameter |
| Agent start-up reads | Each agent prompt orders: git status/log, `.aiox/gotchas.json`, `technical-preferences.md`, `core-config.yaml` (9,810 B), KB. `.aiox/gotchas.json`, `.aiox-core/data/technical-preferences.md` and `aiox-kb.md` do **not exist** here, so those reads fail and waste turns | ~2.5k + failed calls | Every spawn |
| Activity | 30 commits since 2026-10-29; 51 files in `docs/stories/OPS-15/` | n/a | n/a |

Not measured (honest limits): real prompts the Orion sends to agents (not stored in the repo), the number of agent spawns per cycle, how much of AGENTS.md reaches subagents, the real token split from `/usage`, and the weekly limit already consumed.

Observation on the handoff: the file has 8 sections and the freshest one (`Current objective`, line 697) is near the **end**, while the resume rule says to put the "call" at the top. A reader that opens the whole file pays ~120k tokens (both languages) before doing anything, and with a 200k-class window plus later compaction this alone can force an early `/compact`.

## 3. Prioritized recommendations

Gain scale: High = likely above 20% of weekly usage; Medium = 5-20%; Low = under 5%. These are **estimates from the mechanisms above, not measurements**; R0 turns them into measurements.

| # | Recommendation | Gain (basis) | Risk | Effort | Owner | How to measure |
| - | - | - | - | - | - | - |
| R0 | Run `/usage` now and record the attribution rows and `Prompt cache (main)` line; repeat after each change | Enabler (shows true shares) | None | 5 min | Orion / owner | Screenshot or text copied to the handoff |
| R1 | Never read `session-handoff.md` (en + pt-BR) whole. Read only the top ~60 lines and the section named in the call; read pt-BR only when editing it | **High**: ~120k tokens per resume, plus cold-cache re-read after idle | Low (can miss context if the "call" is incomplete) | Low | Orion | Context size at first prompt (`/context`) before/after |
| R2 | Same for `story.md` (277 KB): use `Grep` for the AC/section and `Read` with `offset`/`limit`; give agents the section line ranges in the prompt | **High** (~69k per whole read, per agent, repeated) | Low | Low | Orion in prompts; agents | Spawn count x tokens in `/usage` subagent row |
| R3 | Pass `model: sonnet` on every spawn except the owner's "VERY complex" list; keep Opus only for those | **High**: model is the largest per-token multiplier; the owner already decided this (AGENTS.md, 2026-10-29) and 9 of 10 definitions contradict it | Low-Medium for QA/architect quality: keep their rubric and re-run only on CONCERNS | Low | Orion now; permanent via R10 | `/usage` per-model rows |
| R4 | Run the long phases at `medium` effort (Sonnet 5.5 default) and let `ultrathink` or `/effort high` apply only to hard turns; do not set `max`/`xhigh` as default | Medium-High (thinking tokens are billed as output) | Low-Medium (shallower reasoning on hard bugs) | Low | Orion; owner for default | `/usage` recommendation row on effort |
| R5 | `/clear` (after `/rename`) between unrelated tasks; `/compact <focus>` only at natural breaks and while the cache is warm; avoid idle gaps over 1 hour in a big session (cold `/compact` is the costliest) | High for the orchestrator session | Low (state must live in files first: handoff, story) | Low | Orion | `Prompt cache (main)` misses and rebuilds |
| R6 | Short agent prompts: goal, exact files/line ranges, acceptance, output file path; no pasted logs, no repeated rules already in AGENTS.md | Medium (prompt is re-sent on every turn of that agent) | Low | Low | Orion | Prompt size; subagent share in `/usage` |
| R7 | Agents write the full report to a file and return a 10-20 line summary with the path (the `README`/verdict pattern already used here) | Medium (returned text enters the Orion's context for the rest of the session) | Low | Low | Orion in prompts | Orion context growth per delegation |
| R8 | Reuse an agent with `SendMessage` for follow-ups on the same story (warm history; resumed run can read the cache the first run warmed), instead of spawning a new one that re-reads the story | Medium | Medium: a long history also keeps being re-sent; resume only within the same task, not across stories | Low | Orion | Re-read count in transcripts |
| R9 | Fewer cycles: one `@qa` pass per bundle (already the rule), merge `@po` validations of the same wave, skip the `@analyst` when `docs/research-index.md` says SUFFICIENT, no `@ux-design-expert` repeat for an unchanged scope | Medium-High (each agent has a cold start: ~10k+ tokens before real work) | Low if the existing gates stay | Low | Orion | Spawns per merged bundle |
| R10 | **Rule changes** (owner): (a) set `model: sonnet` in `.claude/agents/*` (except an explicit `-opus` variant); (b) add `maxTurns` and `effort: medium`; (c) remove references to files that do not exist (`.aiox/gotchas.json`, `technical-preferences.md`, `aiox-kb.md`) from agent prompts; (d) drop the always-preloaded `synapse:tasks:diagnose-synapse` skill from 10 agents (it is a diagnostics task, not needed for work) | Medium-High and permanent | Medium: touches framework files (L2 boundary says extend-only; confirm with owner) | Medium | Owner decides; `@dev`/`@devops` apply | `/usage` per-subagent rows |
| R11 | Trim the always-loaded layer: move AIOX boilerplate of `.claude/CLAUDE.md` (356 lines) and the 5 unscoped rules into `paths:`-scoped rules or skills; keep CLAUDE.md under ~200 lines | Medium (~10k tokens x every request of every session; cache reduces the price but not the window) | Low-Medium (framework updates may re-add it) | Medium | Owner decides; `@dev` | `/context` at session start |
| R12 | Split `session-handoff.md` into a short "current state" (<200 lines, en + pt-BR) and an archive; same for the OPS-15 story (index + per-wave files) | High, makes R1/R2 automatic | Medium (contract tests and parity checks may reference the files) | Medium-High | Owner decides; `@sm`/`@dev`; tests by `@qa` | Size of the resume read |
| R13 | Hooks: a `PreToolUse` hook that truncates `npm test` / `npm run` output to failures (+ keep command output in a file under the project); tell agents to redirect long output to a file and `Read` only the failing slice | Medium (test suite output is large; QA runs the full battery) | Low-Medium (truncation can hide a warning; keep exit code and summary) | Medium | `@devops` configures | Tool-result sizes in a transcript |
| R14 | Set `subagentPromptCacheTtl` to `1h` only if subagents are long-lived and idle between messages; otherwise leave 5 minutes | Low-Medium; situational, higher write price | Low | Low | `@devops` | `usage.cache_creation` split |
| R15 | Check connectors: disable unused claude.ai connectors (Figma, Notion, Vercel, Descript, Claude Docs) for this project; they add instruction blocks to every session | Low-Medium (~1-2k tokens per request; not measured) | Low | Low | Owner | `/context` MCP section |

### (a) What the Orion can apply now (no rule change)
R0, R1, R2, R3 (via the per-call `model` parameter, which is first in the resolution order), R4 (per-session `/effort`), R5, R6, R7, R8, R9. These only change how prompts are written and which files are read; the owner rules (QA >= 9.0, parity, security, serial agents) stay as they are.

### (b) What needs an owner decision (rules / framework files)
R10, R11, R12 (and the permanent form of R3). Reason: `AGENTS.md` and `CLAUDE.md` are the source of rules, the agent definitions are framework (L2) files, and parity tests may reference them. Suggested decision text: "agents default to Sonnet 5.5 at `medium`; Opus only per the existing very-complex list; handoff and story files are read by range".

### (c) What needs configuration by `@devops`
R13 (hook), R14 (TTL setting), the per-agent `maxTurns`/`effort`/`model` edits once approved, and the sync commands in `CLAUDE.md` (`npm run sync:skills:claude`, `npm run sync:ide:check`) after editing agent files.

## 4. Pitfalls: what looks like saving but costs more (VERIFIED unless marked)

- **Switching model or effort mid-task** (except effort on Sonnet/Opus/Haiku 5.5): cold cache, full re-read. Pick the model at session start; spawn a Sonnet agent instead of toggling the Orion's model.
- **`opusplan` or a skill that names another model**: every toggle is a model switch.
- **`/compact` after an idle gap**: reprocesses the whole history uncached; `/clear` is free. Compact while warm, or clear and restart from the handoff.
- **Many tiny subagents**: each starts a cold, separate cache with 5-minute TTL and re-reads the same files; a few well-scoped ones win. Conversely, **one subagent for everything** accumulates a big context re-sent every turn.
- **Resuming an agent across unrelated stories**: keeps the old history in every request.
- **Re-reading files that did not change**: the file is already in context; a second `Read` appends it again. Use `Grep` for a fact.
- **Trimming CLAUDE.md in the middle of a session**: no effect until `/clear`/restart, and invalidates nothing; do it between sessions.
- **Connecting/removing MCP servers or denying a tool when tool search is off**: invalidates the cache.
- **Starting a session without a plan and course-correcting late**: rework costs more than a plan (official advice: plan mode, Escape early, `/rewind` instead of compacting a wrong path; `/rewind` hits the earlier cache).
- **Cutting quality gates to save quota**: the owner rules (QA verdict, parity tests) are the cost of the product; cut duplicated reads and spawns, not gates. A failed gate costs a full extra cycle.
- **Third-party "save 80%" claims**: not supported by official data (PARTIAL/UNVERIFIED); treat them as marketing until R0 shows the real share.

## 5. Limits of the research

- The weekly quota weighting by model (how much more Opus consumes than Sonnet) is **not published as a current figure** in the official pages read; third-party reports range from about 2x to about 5x and date from the 2025 launch (PARTIAL: [ClaudeLog](https://claudelog.com/claude-code-limits/), [InventiveHQ](https://inventivehq.com/blog/opus-vs-sonnet-claude-code), reddit snapshots). R3's gain is therefore directional.
- The exact way `AGENTS.md` and `.claude/CLAUDE.md` reach subagents was not tested (the memory page says subagents can start without project instructions in some cases). Not verified here.
- The subscription plan tier, current weekly percentage, and the real prompts sent to agents were not available. Gains are estimates until R0.
- `docs.anthropic.com/.../claude-code/costs` redirects to `code.claude.com/docs/en/costs`; pages were read on 2026-11-05 and the docs mention versions up to v2.1.314. The installed Claude Code version was not checked.
- Large official pages (memory, best-practices, subagents, model config) were read through a summarizer that returned the first ~100k characters; the tail was read only for subagents.
- Tools and flag names (`idleCompaction`, `subagentPromptCacheTtl`, `autoCompactWindow`) depend on the installed version (v2.1.242 / v2.1.290 / v2.1.296 or newer).

## 6. Self-assessment (rubric, 0-10 each)

| Criterion | Weight | Score | Justification |
| - | - | - | - |
| Official source coverage | 25% | 9.3 | Costs, prompt caching, model config, memory, subagents read from `code.claude.com` plus the API caching docs; weekly-limit weighting not official |
| Evidence per recommendation | 20% | 8.8 | Each row cites a mechanism; gains are estimates, flagged as such |
| Fit to our context | 20% | 9.4 | Measured the repo: handoff 220/239 KB, story 277 KB, 9/10 agents pinned to Opus, missing referenced files |
| Measurability | 15% | 9.0 | `/usage` attribution, `Prompt cache (main)`, `/context`, `usage.cache_creation`; every row has a metric |
| Risk handling | 10% | 8.8 | Risk per row and a pitfalls section; no real A/B run |
| Honesty about limits | 10% | 9.0 | Section 5 |

Weighted result: **9.1 / 10** on the rubric, reported conservatively as **8.9 / 10** because no real `/usage` data and no run of the changes could be done in this session. The note is enough to act on R0-R9 now; R10-R15 should wait for R0 numbers.

## 7. Sources (read 2026-11-05)

- [Manage costs effectively (Claude Code)](https://code.claude.com/docs/en/costs)
- [How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching.md)
- [Model configuration](https://code.claude.com/docs/en/model-config.md)
- [Subagents](https://code.claude.com/docs/en/sub-agents.md)
- [How Claude remembers your project](https://code.claude.com/docs/en/memory.md)
- [Best practices](https://code.claude.com/docs/en/best-practices)
- [API prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- Secondary (PARTIAL): [ClaudeLog limits](https://claudelog.com/claude-code-limits/), [InventiveHQ Opus vs Sonnet](https://inventivehq.com/blog/opus-vs-sonnet-claude-code)

## Next steps

1. Orion: apply R0-R9 in the next cycle and note the `/usage` rows in the handoff.
2. Owner: decide R10-R12 after the first `/usage` reading.
3. `@devops`: prepare R13/R14 only after approval.
