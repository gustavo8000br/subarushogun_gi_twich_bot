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

## Owner decisions executed on 2026-11-05 (release)
- **D-06 and D-07 (issue #69), executed:** PR #101 was merged earlier and, with the owner authorization of 2026-11-05 (release only), the pre-release `v0.3.0-0d0b595-beta` was published by the release workflow after PRs #111 (Windows packaging step) and #112 (bot identity before the annotated tag). No `rc` or stable action was taken.
- **OW-18, dismissed by the owner (2026-11-05):** the scene source replacement is no longer required; the card is Concluído and archived, never deleted. Agents did not touch any OBS file.
- **OWN-15 (screen reader), owner risk acceptance (2026-11-05):** accepted without validation. **OW-06** reads "checked by agents in the browser (OWN-16 to OWN-18 pending in FT-09); screen reader accepted without validation". The checklist box in issue #69 is not ticked, because no validation took place.
- **OW-10, concluded:** D-08 = A (issue #83) recorded; the card is Concluído. FT-63 stays open.
- **Branch cleanup (owner, 2026-11-05):** `docs/post-cutover-docs`, `feat/ops-15-next-panel`, `fix/release-windows-installer`, `fix/release-tag-identity` and `legacy` were deleted (remote and local) and two local backups deleted locally, after the tag and the merged PRs; no history rewrite (the audit found `origin/main` clean). Names and SHAs are kept outside the repository.

## Owner decisions recorded on 2026-11-05/06 (OPS-31, queue flow, OPS-32)

- **OPS-31 (issue #115), refund by group, 2026-11-06:** the refund happens only when the service ends (the redemption stays `UNFULFILLED` during the service and becomes `CANCELED` on conclusion). On cancel, skip or no-show the streamer decides on the spot whether the points return. One OAuth scope per enabled group. A failed group lookup shows "check group" and never refunds or fulfills by itself. Subscriber = paid + gifted + Prime, and the streamer counts as a member of the group. Points are held until the service ends, and the panel explains this on the control itself.
- **Queue flow, 2026-11-06:** `fulfill` stays at the start of the confirmed service for normal redemptions.
- **OPS-32 (issue #117), queue cycle calendar, 2026-11-06:** the queue restarts automatically for known games (the streamer chooses the game and the server); when the game is chosen the product suggests queues and rewards as editable presets, created only after confirmation; the restarted queue goes to the "Old queues" tab for 7 days; the default policy for pending redemptions after the 7 days is set by the streamer in Settings. Pending owner decision: OD-32-1 (does OPS-32 enter the 0.4.0-beta or come later; recommended: later), no box ticked.
- **FT-09, 2026-11-06:** blocked only by FT-06.
- **Screen reader, 2026-11-05/06:** risk accepted without validation (see OWN-15 above).
- **`legacy`, 2026-11-06:** stays until the owner deletes it himself (it is covered by a ruleset). Divergence: the 2026-11-05 branch cleanup above records it as deleted; on 2026-11-06 the remote has only `main` and a local `legacy` branch still exists. No branch was touched by `@devops`.
- **OW-18** dismissed and **OW-10** concluded with D-08 = A (already recorded above).
