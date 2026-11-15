# Handoff run log (archived handoffs, closed waves)

[Português brasileiro](../../pt-BR/handoffs/_archive/RUN-LOG.md)

Consolidation under `.claude/rules/handoff-consolidation.md` (D-07, 2026-11-14). The originals sit in this folder, unchanged except for an "ARCHIVED" banner. The active state lives in [`docs/current-state.md`](../../current-state.md) and the top of [`docs/session-handoff.md`](../../session-handoff.md); the latest quota-stop file stays outside the archive: [`resume-agents-2026-11-14.md`](../resume-agents-2026-11-14.md).

## Strategic context

The OPS-15 pipeline replaced the vanilla panel with the Next.js panel in cutover waves, with explicit owner authorization at each step. These handoffs were written at quota interruptions; their orders were valid only at the moment of writing.

## Wave: OPS-15 continuation prompt and Next overlay continuation (before 2026-10-27)

- **Files:** `docs/pt-BR/handoffs/_archive/claude-code-ops15-prompt.md` (pt-BR only), `next-overlay-continuation.md` (en, pt-BR).
- **What they said:** keep the vanilla panel as fallback, do not close FND-9, no cutover, no vanilla removal, branch `feat/ops-15-next-panel`, target `v0.2.0-beta`.
- **Why they are dead:** cutover waves 1 to 4 were executed with explicit owner authorization, the vanilla code is gone, the `legacy` branch was removed on 2026-11-13 (it is neither fallback nor rollback target), and the version plan changed (`AGENTS.md`, version bump policy).
- **Do not follow:** any "do not cut over" or "keep vanilla" instruction.

## Wave: resume the interrupted agents (2026-10-27)

- **Files:** `resume-agents-2026-10-27.md` (en, pt-BR).
- **Status:** CLOSED on 2026-10-28 (Wave 3 code `906fd5c` and `8e20277`; OPS-15/22/23/24 alignment `0604799`; `@qa` gate `qa-gate-2026-10-28.md`, CONCERNS 9.0/10). Kept as record only.

## Wave: quota stop with a merge in progress (2026-10-29)

- **Files:** `resume-agents-2026-10-29.md` (en, pt-BR).
- **What it said:** a merge of `origin/main` was in progress, "do not abort", re-dispatch the `@dev` with its brief, this round skips `@qa`.
- **Why it is dead:** the merge state described no longer exists, the session-URL history rewrite changed the commit hashes (local map only), and the permanent rule is that the `@qa` always gates before commit, PR or release.
- **Blocker resolved:** none carried over; nothing in it is pending.

## Wave: resume after the 2026-11-11 quota stop

- **File:** `docs/pt-BR/handoffs/_archive/resume-2026-11-11.md` (written in Portuguese; it was in the English folder with no pair, so it now sits in the pt-BR archive only).
- **Carry-forward that still matters (already tracked elsewhere):** the beta target (80% rule, ledger `docs/process/open-acceptance-criteria-2026-11-10.md`, recounted by D-04), the owner-only Windows test installer, the Windows validation kit, the pending live checks TS-25 and TS-27a.
- **Note:** it names Fable 5.1 as the model of the OPS-31 design; Fable is forbidden by the model policy (`AGENTS.md`), historical mention only.

## Not archived

- `docs/handoffs/macos-session-handoff.md` and `windows-session-handoff.md` (platform sessions still pending, owner items).
- `docs/handoffs/resume-agents-2026-11-14.md` (the active quota-stop file).
- `docs/handoffs/claude-memory-snapshot/` is NOT touched here: its removal (D-01) waits for the owner to check the client-confidentiality file first.
