---
name: feedback-quota-interruption-protocol
description: PROJECT RULE — when the quota is running out, stop the agents and save the exact stopping point (briefs + where each stopped) so work resumes coherently
metadata:
  type: feedback
---

On 2026-10-27 the owner made it a **project rule**: for every interruption caused by the quota running out, Orion must **stop the agents and save the exact point where each one stopped**, so that when work resumes we produce coherent code from where it was interrupted (no lost line of thought).

**Why:** agents stopped mid-edit left a half-done wave and half-written stories; without the briefs and the stopping point, the next session would start from zero and risk incoherent code.

**How to apply (checklist whenever the owner warns the quota is ending, or it reaches ~90%+):**
1. **Stop the running agents** (TaskStop) before they cut off in the middle of a code edit; prefer letting doc-only agents finish only if they are about to end.
2. **Record the exact state** in a versioned resume file `docs/handoffs/resume-agents-<date>.md` (+ `docs/pt-BR/handoffs/`): for EACH interrupted agent, its full brief as originally sent, where it stopped (what was already done, what is missing, the last step it announced), which files it touches, and what to check first (`git status`/`git diff --stat`, run the tests).
3. **Put a "FIRST THING next session" pointer at the very top of `docs/session-handoff.md` (+ pt-BR)** saying to re-dispatch exactly those agents with those briefs, and the fixed order after them (`@qa` then `@devops`).
4. Record the real state of the tree (uncommitted files, commits ahead of origin) and any unvalidated code; code that was not validated by `@qa` is never assumed good.
5. Update the memory snapshot (`docs/handoffs/claude-memory-snapshot/`) and tell the owner what stopped where.
6. On resume: re-dispatch the same agents with the saved briefs BEFORE starting anything new.
Pending: add this rule to `AGENTS.md` (outside the AIOX-MANAGED blocks) through `@po`/`@dev`, `@qa` and `@devops`. Related: [[feedback-agent-concurrency]], [[feedback-qa-runs-final-tests]], [[project-incremental-cutover]].
