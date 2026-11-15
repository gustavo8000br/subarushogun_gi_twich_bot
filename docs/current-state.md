# Current state (short file, read this first)

[Português brasileiro](pt-BR/current-state.md)

**Updated:** 2026-11-14 (D-15, quota lever R12). This file replaces "read the top of `docs/session-handoff.md`" as the entry point on resume: `docs/session-handoff.md` is a long historical log (about 230 KB) and must not be read whole. Keep this file under about 60 lines and update it whenever the state changes; the orchestrator's private memory handoff is not available to the other agents and is not a rule source.

## Where the work is

- Never publish the old branch `chore/emergency-snapshot-2026-11-12`: its history has a WIP commit with memory files. New work goes on a new branch from `main` (flow: `main` -> Conventional Commits branch -> PR -> `main`); commits, push and PR belong to `@devops` after the `@qa` verdict.
- Confirm `pwd`, `git rev-parse --show-toplevel` and `git branch --show-current` before editing; do not presume branch names from old documents.
- Quota stop and open packages: [`docs/handoffs/resume-agents-2026-11-14.md`](handoffs/resume-agents-2026-11-14.md). Audit synthesis: [`docs/audits/audit-2026-11-13.md`](audits/audit-2026-11-13.md).

## Beta target

- `v1.0.0-beta` needs at least 26 of 32 planned features tested and functional. Ledger: [`docs/process/open-acceptance-criteria-2026-11-10.md`](process/open-acceptance-criteria-2026-11-10.md).
- Honest count (D-04): **20 firm + 3 provisional** (features 14, 23 and 24; 23 added by the `@qa` gate of OPS-19, PASS 9.3, 2026-11-14, pending a live Twitch observation of the fulfill), not 23. Money guard still open: features 7 and 9 are N. Windows (28 to 30) needs the owner's run.
- Next bump: owner decides rc/stable; alpha/beta bumps follow `AGENTS.md`. The `restart: unless-stopped` line is waiting for the next changelog section: [`docs/process/pending-changelog-entries.md`](process/pending-changelog-entries.md).

## Rules that changed recently

- Execution by lanes (up to 3 read lanes, 1 write lane; "multi-agents on/off" switch), not "one agent at a time": `AGENTS.md`, "Operação do orquestrador e dos agentes".
- The `legacy` branch no longer exists; the panel is the Next.js one. Old handoffs were archived: [`docs/handoffs/_archive/RUN-LOG.md`](handoffs/_archive/RUN-LOG.md).
- HD-03 (native OBS/CEF acceptance) is archived (D-14). Windows and macOS acceptance stay owner items.

## Owner items and blockers

- D-01: `docs/handoffs/claude-memory-snapshot/` stays in place until the owner checks its client-confidentiality file; then a clean removal PR (no history rewrite unless that check says otherwise).
- Windows run of the validation kit (features 28 to 30), macOS before `rc`, express OK for `rc` and `stable`, merge/tag/release.
- Sub-issues for planned slices are created when each story becomes Ready (D-16, exception recorded in `AGENTS.md`).

## Open packages (order)

1. `@qa` gate of the governance package (P1), then P2 (`release.yml`, done in this branch), P3 (this documentation wave), P4 (CI job for the browser-only scripts), final `@qa` gate, `@devops` builds the new branch by pathspec groups.
2. Later: OPS-24 (Biome and TypeScript), OPS-31 design v2, money fixes.
