# Development Handoff — 2026-10-06

[Português brasileiro](pt-BR/session-handoff.md)

## Current workspace

- Repository/worktree: `/home/gustavo/projects/wt-ops-fnd8-spec`
- Branch: `docs/ops-qa-fnd8-spec` (currently based on `origin/main` at `c008f07`)
- This is the active Codex CLI/VS Code worktree. The user screenshot `Captura de tela de 2026-10-06 18-28-47.png` confirms VS Code is open on `wt-ops-fnd8-spec` and the status bar shows `docs/ops-qa-fnd8-spec*`. Do not switch to the primary checkout at `/home/gustavo/projects/subarushogun_gi_twich_bot`.
- Changes are uncommitted. Do not discard them. The primary checkout contains separate user changes and must not be modified.

## Current objective and stop point

Finish recording the FND-8 Planning Workflow (Spec Pipeline) findings and the OPS QA evidence in this worktree. The user explicitly asked to stop as soon as planning is complete so they can continue in the VS Code Codex session. Do not start FND-8 implementation, create a PR, merge, reset Docker volumes, or launch a clean Compose install in this handoff phase.

## OPS review results

- OPS-1: independent QA PASS 9.3/10, based on GitHub Actions run `37525101710` at `c008f07` (473 tests / 69 files). QA did not rerun the suite in its review worktree. Bilingual gate files exist under `docs/qa/gates/` and `docs/pt-BR/qa/gates/`.
- OPS-2: two UI status precedence defects were fixed test-first. Focused tests passed 12/12; web lint/typecheck passed. Independent QA re-review PASS 9.3/10. No live Twitch credentials were used. Issue #21 synchronization is pending DevOps after merge.
- OPS-4: independent QA PASS 9.3/10 for the already merged PR #25. Bilingual QA gate records were added.
- OPS-1/OPS-2 issue updates and closure must happen only after this branch is reviewed/merged. Do not post issue comments; update issue bodies/status.

## FND-8 Planning status

- Full bilingual Spec Pipeline artifacts: `docs/stories/FND-8/` and `docs/pt-BR/stories/FND-8/`.
- Product-approved scope: whole-product locale selection, pt-BR/en/es, editable persisted locale, one community catalog per module and locale, locale roots `!fila` / `!queue` / `!cola` with no legacy aliases, and coverage for panel/setup/callback/chat/OBS product copy/local lifecycle tools.
- Complexity: COMPLEX 22/25. No implementation started.
- Independent QA on specVersion 1: CONCERNS 8.1/10. The revised specVersion 2 records these gates:
  1. High: define PostgreSQL-to-host locale authority/bridge, bootstrap, atomic panel updates, offline and partial-failure recovery.
  2. High: choose a catalog serialization/escaping/placeholders/plural contract consumable by browser ESM, Node ESM and host tools without adding pre-Docker host runtimes. JSON is only a candidate.
  3. Medium, owner decision: presentation policy for streamer-authored queue/reward/template/widget values after locale changes. Preservation is only a recommendation; stored data must never be silently rewritten.
  4. Medium, owner decision: handling of existing queue slug/alias collisions with reserved roots. Detect-and-block without automatic rename is a proposal.
  5. Low/medium, owner decision: confirm `subarushogun_twich_bot_*` family and exact lifecycle command suffixes.
- Request/record a short independent QA re-review of specVersion 2 if continuing planning approval. Keep FND-8 implementation blocked until required gates/owner decisions are resolved.
- Intended `v1.1.0-HHHHHHH-beta` remains an intent only; no stage promotion, release or tag is authorized here.

## IDE and continuation

- The root `AGENTS.md` now applies to Codex CLI and VS Code Codex IDE, instructs both to read this handoff, and requires both to use the same exact worktree/branch.
- To align/reopen VS Code on this worktree, run from any terminal: `code --reuse-window /home/gustavo/projects/wt-ops-fnd8-spec`.
- Verify in the integrated terminal: `pwd`, `git rev-parse --show-toplevel`, and `git branch --show-current`.
- The screenshot shows the Codex chat notice “Está aberto em outro aplicativo”. The conversation itself is not simultaneously available in both clients: close/release it in the other app and retry there to continue that chat, or start a new IDE chat and use this handoff. This handoff substitutes for assuming history is shared.

## Pending validation

The Docker daemon was upgraded during the prior pause. The current Compose stack was stopped by daemon restart. After the user resumes beyond planning, rerun required quality checks on the final branch; then follow the previously authorized project-scoped clean Compose reinstall, removing only `queuebot-fnd7` containers/volumes and preserving unrelated Docker resources. Verify `/health` and panel before reporting. Keep one-shot `bootstrap`/`migrate` containers as expected.
