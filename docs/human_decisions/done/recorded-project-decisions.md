# Recorded project decisions

**Status:** Done — no new owner choice requested.
**Português:** [Decisões de projeto registradas](../../decisoes_humanas/concluidas/decisoes-de-projeto-registradas.md)

## Decisions already recorded — no new choice requested

- Keep the vanilla production panel until panel/overlay parity, legacy-test audit, independent architecture/UX/QA, native OBS/CEF acceptance, and isolated rollback all pass. Only then propose cutover/removal for explicit owner authorization.
- Keep OPS-15 **In Progress**; do not close FND-9, remove vanilla, create a PR, or merge as part of the current implementation work.
- Do not change schema, persistence, cross-session clear semantics, or domain/API policy under this UI migration without the required story and Data Engineer coordination.
- OpenGrep is a tool-installation blocker, not a product decision. The project pins a release and requires signature verification; install the required verifier/tool or leave the static-analysis gate Pending. Never bypass signature verification. See the [project CI/CD tool references](../../CI-CD.md) and [OpenGrep's pinned installation guide](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/INSTALL.md).

## Owner ticks recorded on 2026-10-30

- **2026-10-30 — D-01 (issue #73), option B:** fixed words per supported language, a closed list kept by the project, with no streamer configuration. Effect: card ST-11 moves from Awaiting decision to Draft with policy B recorded here.
- **2026-10-30 — D-12 (issue #102), option A:** remove the 3 historical-status tests. Effect: TS-02 moves to Ready for `@dev` to remove the 3 tests.
- **2026-10-30 — D-13 (issue #102), option A:** measure first. Effect: TS-11 measures; TS-07 implements only if the gain is confirmed.
- **2026-10-30 — D-14 (issue #102), option A:** archive the legacy cards #17 and #18 (archived, never deleted; the issues are not closed).
- **2026-10-30 — A-08 (issue #102), Done:** the Project workflow "Close issues when status changes" is turned off.
- **2026-10-30 — D-15 and OW-14 (issue #102), resolved with no owner action:** the remote branch `backup/ops-15-before-history-fix` was already deleted in the 2026-10-29 cleanup, so there is nothing left to decide. Recorded as resolved without ticking the box on the owner's behalf.
- Recorded mechanically without a QA gate (owner decision at 90% quota); the retroactive `@qa` gate remains DUE.
