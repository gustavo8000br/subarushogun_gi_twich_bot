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

## Owner ticks recorded on 2026-11-05 (issue #69, read 2026-11-04)

- **D-04 (issue #69), registered as option A (defer):** the owner ticked B ("accept after a successful native test") before running any test and then clarified that he ticked it before testing. Recorded as A by his clarification; his box on the issue stays ticked as he left it. Effect: HD-03 stays pending, action A-02 (run the native overlay matrix) stays with the owner, and no native OBS/CEF evidence is claimed.
- **D-05 (issue #69), option B:** get a Mac and validate before `rc`. Effect: OW-07 stays Blocked until there is access to a Mac; no macOS result is claimed.
- **D-06 (issue #69), option A:** wait. Effect: no merge of PR #101 now; the merge stays reserved to the owner and Orion asks again when the final `@qa` verdict and the CI are green.
- **D-07 (issue #69), option A:** postpone. Effect: no tag and no release of `v0.3.0-beta` until the cutover ends and the PR is merged.

## Owner ticks recorded on 2026-11-05 (issue #83)

- **D-08 (issue #83), option A:** delegate the language-selector placement to the FT-01 UX plan (`@ux-design-expert` compares the options and proposes with a minimum score of 9.0). The owner ticked A with no timestamp; read from the issue body on 2026-11-05. Effect: OW-10 moves from Awaiting decision to Done; no UI change until the FT-01 plan is approved.
