# OPS-5 — Unified cross-platform lifecycle installer

[Português brasileiro](../../pt-BR/stories/OPS-5/story.md)

**Status:** Ready for Review — owner feedback follow-up for displayed product version and GHCR pull diagnostics implemented and independently reviewed; anonymous GHCR access remains blocked by package visibility. Prior corrective implementation remains complete. Prior PR #36 QA and native Actions remain historical baseline evidence only. No physical host uninstall is claimed.
**Planning source:** product owner request on 2026-10-06.
**GitHub issue:** [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30), reopened on 2026-10-07 for the corrective increment after PR #36.

[Spec Pipeline research](spec/research.json) · [Specification](spec/spec.md)

## Story

As a streamer installing the local bot, I want to open one installer file for my platform and choose install, update, or uninstall from its menu, so that I do not need to find separate lifecycle scripts or remove shared dependencies by mistake.

## Confirmed planning decisions

- Deliver exactly one downloadable/openable installer artifact for each supported platform (Windows, macOS, and Linux). The artifact directly opens into the lifecycle menu using that platform's normal launch path; it cannot require a companion `.bat`, `.ps1`, `.sh`, repository clone, or separately downloaded project script. CI may build the artifact from multiple reviewed source/test files.
- The single menu offers **Install / Start**, **Update**, and **Uninstall**. Separate setup/update/uninstall downloads are not the user-facing delivery model.
- First install asks for product language (pt-BR default; English and Spanish available) and host port (3000 default), shows the callback URL implied by the selected port, and saves the choices. Existing installs show their current language/port and let the operator keep or change them; the panel remains the normal place to change product language later.
- If the selected port is occupied, stop and ask for another valid port; never silently select a different port. Explain that changing the port changes the Twitch OAuth callback.
- Update offers **Keep data and update** (default; preserve database, secrets, language, and port) or **Erase product data and install cleanly**. The clean option displays the exact data to be erased and requires a typed, localized confirmation before deleting product volumes/secrets; afterward it runs first-install setup again.
- Uninstall offers **Keep data** or **Erase all product data**. Keep-data removal stops/removes only this product's containers, managed application files, and unused app images while leaving its database/secrets volumes and generated local CA available for a later reinstall. Erase-all also removes only this product's volumes, secrets, and generated CA, after a typed, localized confirmation. It does not delete the installer file the user downloaded.
- Every uninstall result explains that Docker Engine/Desktop, WSL/virtualization features, package managers, and other host dependencies are shared/system software and remain installed. The user must uninstall those dependencies manually using their vendor's instructions if desired.
- Dependency detection is part of the flow. Any installation that needs elevation, restart, changed system features, or acceptance of third-party terms must be explained and explicitly approved; unsupported cases fall back to official manual instructions.

## Research conclusion

A truly identical universal native file is not a realistic default. InstallBuilder can generate native installers from one project across major desktop OSes, but its current Professional license is commercial and listed at USD 1,995. IzPack offers one cross-platform Java installer, but requires a Java runtime unless one is bundled. Oracle `jpackage` creates platform-specific packages and must be run on each target OS. Velopack is MIT-licensed and produces cross-platform desktop install/update packages, but targets compiled desktop application output rather than this Compose-operated service.

**Recommended direction:** ship exactly one directly openable installer artifact per supported OS target (Windows, macOS, Linux). Each artifact owns one interactive menu and all three product lifecycle actions; a user does not need a companion script or repository checkout. The source may share tested modules and CI may package/build platform artifacts from multiple reviewed files. Research and native-runner tests must determine file formats that launch naturally on each OS. Do not add a paid installer framework, Java, Electron, or another runtime solely to wrap the current Docker Compose app unless the one-file launch requirement cannot otherwise be met safely.

**CI and release direction:** keep reviewed installer sources in Git and use GitHub Actions with native Linux/macOS/Windows runners to test the actual single-file deliverable for each supported OS. CI artifacts are temporary engineering/QA outputs. A separate tag-triggered workflow builds and natively launches the same installers, then attaches exactly one `.bat`, `.command`, and `.sh` file to the matching GitHub Release. It derives bilingual user-facing notes from the matching version sections in `CHANGELOG.md` and `docs/pt-BR/CHANGELOG.md`; it never publishes a release from a normal branch push. The tag must encode the exact seven-character source commit SHA, base SemVer, and current stage. Pin third-party Actions to full commit SHAs and review updates through normal PRs.

The runner application itself is open source under MIT, and runner-image definitions are public. GitHub-hosted Actions remains a hosted GitHub service, so the complete CI control plane is not open source. Self-hosting the runner is possible but adds machine maintenance and platform-specific capacity; it does not replace GitHub's workflow service.

The CI workflow does not itself install or keep host Docker updated. It tests the product's installer/update logic and packages the entrypoints. Dependency installation continues to use official vendor instructions and requires the consent and privilege boundaries above. GitHub-hosted runner coverage is useful contract evidence, not a substitute for manual acceptance on physical Windows/macOS/Linux systems.

Dependency installation cannot be guaranteed as silent or fully automatic across systems. Windows Docker Desktop supports per-user installation without admin in documented configurations, but WSL enablement can need administrator action. macOS and Linux Docker installation paths differ and can involve sudo/system changes. The setup flow must detect, explain, ask, perform only an explicitly approved supported step, and resume or show the manual next step.

## Acceptance criteria

1. The downloadable package contains exactly one directly openable installer artifact per supported target OS (Windows, macOS, Linux); opening it presents one menu for install/start, update, and uninstall without a companion script, project clone, or separately fetched lifecycle script.
2. First install detects OS/architecture, Docker CLI/daemon, and Compose v2; it asks for language and port, explains defaults, validates the port, and shows the matching HTTPS panel/callback URLs before continuing.
3. When a host dependency is missing, the user can approve a supported official install path or decline and receive current vendor instructions. Privilege elevation, restart, WSL/virtualization changes, and third-party terms are explained before the relevant action.
4. Install/update/uninstall are idempotent and report detected/current state plus visible operation progress. Uninstall inventories this Compose project, reports container/network/image/volume cleanup, verifies postconditions, and identifies remaining resources on failure. A failure or cancellation leaves retained product data intact and provides a recovery action.
5. Normal update preserves PostgreSQL/secrets volumes and current product configuration. Clean update displays data-removal consequences and requires a typed, localized confirmation before deleting product-owned data; it then runs first-install setup again.
6. Uninstall offers keep-data or erase-all. Keep-data removes product containers, managed program files, and app images not used by other containers, but preserves database/secrets volumes and local CA. Erase-all requires typed, localized confirmation and removes only this product's resources/data; the downloaded installer file remains under user control.
7. Both uninstall outcomes explicitly state that Docker and other host dependencies remain installed and must be removed manually through their vendors if desired. No installer action removes or updates shared host dependencies during product uninstall.
8. No path silently chooses another host port, silently elevates, changes virtualization features, accepts license terms, runs unchecked downloaded code, or deletes unrelated Compose projects/resources.
9. Actions tests the real installer artifact on native Windows, macOS, and Linux runners without committing generated artifacts. For beta owner testing, Main CD uploads one Windows installer artifact only after the matching versioned image is published and verified by digest. The release workflow publishes one directly openable installer per supported OS; CI artifacts are not the public user download path.
10. Tests cover direct launch/menu choice, locale/port configuration, path spaces, cancellation, installed/missing dependencies, consent/elevation/restart boundaries, failed network/image/migration/health paths, preservation vs deletion scope, localized confirmation, and explicit manual-dependency-removal guidance.
11. A pushed version tag triggers a release workflow that validates the tag against the package base version, `.release-stage`, and exact seven-character SHA of the tagged commit; it builds and tests all three native installers; and it publishes them only after every platform job succeeds.
12. Release notes contain the matching user-facing changelog sections in English and pt-BR, and the workflow fails if either section is absent. Internal changelogs are not published.
13. Third-party Actions are pinned to full SHAs and reviewed by PR. Tag/release creation remains exclusively an `@devops` action after owner-approved gates. Native user-host acceptance is only claimed after an actual Windows/macOS/Linux operator run.
14. English/pt-BR story, installation/operation guidance, version policy, and changelog entries remain equivalent.
15. Uninstall removes this product's Compose containers/networks and unused product images, retains named volumes for the keep-data choice, and removes product-owned volumes only after the localized erase confirmation. It verifies that unused product images are absent, retains images used by another container, and never runs a global prune.
16. Linux/macOS and Windows installers show localized progress for install, update, and uninstall; clear the terminal only when interactive; distinguish “no installation found” from successful removal; and verify the selected volume policy before reporting completion.
17. Each platform supports unattended `install`, `update`, and `uninstall` actions. Install accepts optional locale/port; update and uninstall preserve data by default; erasing requires both `--erase-data` and `--confirm-erase`. Invalid/contradictory flags exit before Docker mutation. Unattended mode retains visible progress/errors and does not launch a browser.
18. Windows, macOS, and Linux installers show the exact materialized product version before the lifecycle menu; the display excludes any OCI digest and matches the version in the pinned image reference.
19. Before Compose pulls, installers probe the versioned GHCR product image. A rejected/unavailable pull gives localized network/public-package guidance, does not direct users to bot logs before startup, and leaves saved settings and product data intact.

## Implementation and validation record

- **Owner feedback — version display and GHCR access diagnosis (Red / Green):** tests first failed for all three packaged platforms because no exact product version was displayed; Linux/macOS pull-denial tests also showed the installer continuing into Compose without explaining GHCR `unauthorized`. Green — the packager derives/validates a readable version separately from the optional OCI digest, all platform installers display it before the menu, and a product-image preflight reports localized network/public-package guidance before any Compose pull. Regression tests assert configuration preservation and that bot-log guidance is absent for pre-start registry failures. Native Windows Actions validation is part of the current PR gate.
- **Independent QA of owner-feedback delta:** 10/10; no residual findings after aligning the smoke-test image tag, beta artifact publication order, and bilingual validation guidance. Anonymous pull from GHCR remains externally blocked by package visibility and is not reported as passed.

- **Platform artifacts:** `.bat` for Windows embeds the PowerShell implementation; `.command` for macOS and `.sh` for Linux embed the POSIX implementation. `package-installer.mjs` embeds the Compose manifest and strips build/repository-relative mounts. GitHub Actions packages and directly launches each platform artifact on its native runner. For beta owner testing, Main CD uploads one Windows artifact after image publication; the release workflow publishes all three platform installers.
- **Operator guidance:** Docker is detected, and the installer asks before opening official vendor installation instructions. It does not silently elevate or change WSL/virtualization. Install/update/uninstall steps are in the bilingual installer guide. Existing separate lifecycle wrappers and their tests were removed after the replacement artifact and contracts existed.
- **Data paths:** normal update retains database/secrets volumes and user settings. Clean update pulls the image before deleting any data, requires `APAGAR` / `DELETE` / `ELIMINAR`, then asks language/port again. Uninstall keeps data by default option or erases only product-owned data after the same localized confirmation. Shared Docker/host dependencies and the downloaded installer remain untouched.
- **Red → Green — destructive update recovery:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot download its image'` first failed because an image-pull failure occurred after the saved `.env` had changed from port 3100 to 3200 and locale `en` to `pt-BR`. Green — move `compose pull` before `compose down --volumes`, then start with the already-pulled image. The focused command passed and the saved configuration/local CA remained intact on pull failure.
- **Red → Green — visible and verified uninstall:** `npm test -- --run tests/integration/unified-installer.test.js -t 'shows uninstall progress|no managed installation'` first failed because uninstall had no operation-specific progress, resource inventory/postcondition checks, shared-image protection evidence, or accurate “nothing removed” result. Green — inventory project-labeled Docker resources, list product Compose images, remove only images unused by any container, verify containers/networks and the selected volume policy, and report no-install separately. The focused command passed 2/2 after the implementation. A follow-up expanded the same integration to exercise keep-volumes, reinstall, then erase-volumes; the final focused command passed 3 selected tests, with 18 skipped.
- **Cross-platform uninstall/progress implementation:** the POSIX installer now uses Compose plain progress and localized steps for setup/update/removal. PowerShell now mirrors project resource inventory, unused-image cleanup, keep/erase volume verification, no-install reporting, and progress labels. The harness adds native Windows keep-data and erase-data postcondition checks. PowerShell is not installed in the current Ubuntu environment; its executable path remains pending the Windows Actions runner, so this increment is not yet QA-complete.
- **Red → Green — unattended lifecycle CLI:** `npm test -- --run tests/integration/unified-installer.test.js -t 'supports unattended install'` first failed because `--silent install --locale en --port 3111` still prompted for a language and exited without creating the configuration. Green — parse and validate explicit operations/options, apply safe defaults, skip prompts/browser launch, retain progress, and require explicit paired erase flags. The final affected command `npm test -- --run tests/integration/unified-installer.test.js tests/unit/windows-installer-first-run.test.js` passed 27/27; native Linux artifact launch passed through `node tests/platform/installer-native.mjs`.
- **Red → Green — image inventory and uninstall postconditions:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot inventory the product images'` reproduced a false success when Docker image inspection failed; Green makes inventory failure stop removal with an error. The unused-image postcondition test failed Red with exit 0 when image verification was temporarily disabled, then passed after verifying image absence or a remaining external container reference. Native Windows CI then failed before launch because PowerShell parsed a smart quote as a string delimiter. A new static regression failed Red on that character and passed after replacing the two strings; updated native Windows rerun remains pending. Focused suites passed 29/29 before that added regression; the Windows prompt suite now passes 6/6.
- **Native Windows unattended-argument harness — Red / Green, rerun pending:** Actions run [37649015429](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37649015429) passed PowerShell parsing and initial install, then failed the unattended update because the harness launched the `.bat` with an empty argument list. A regression in `npm test -- --run tests/unit/windows-installer-first-run.test.js` failed Red because the native harness had no explicit argument-forwarding path. Green — pass the test arguments through a dedicated environment fixture and splat them to the batch file through PowerShell's call operator. The focused Windows contract suite passes 7/7 and the Linux native artifact harness passes; a fresh Windows Actions run is still required.
- **Native Windows Docker fake architecture probe — Red / Green, rerun pending:** run [37649606223](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37649606223) confirmed argument forwarding and completed install/other CI jobs, but unattended update failed because the fake `docker.cmd` returned a failing status for the architecture query. The preserved log confirmed the exact `info --format {{.Architecture}}` invocation. A static test failed Red because there was no explicit fake response/preflight or call-log diagnostic. Green — respond with direct `if`/`echo`/`exit` lines, execute a native preflight of the fake before installer launch, include Docker call logs on failure, and assert that the installer performs the expected probe. The focused Windows contract suite passes 8/8 and the Linux native harness passes; a new native matrix is pending.
- **PowerShell architecture probe exit handling — Red / Green, rerun pending:** run [37650741917](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37650741917) showed the fake's direct native preflight passed and the installer logged the correct query, yet the installer treated the probe as failed. A focused regression failed Red because the code piped native output through `Select-Object` before reading `$LASTEXITCODE`. Green — capture the output array and `$LASTEXITCODE` immediately, then select the first output line. The focused Windows contract suite passes 9/9 and Linux native artifact launch passes; full gates and the updated native matrix remain pending.
- **Windows harness exit-code propagation — Red / Green, rerun pending:** run [37651180098](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37651180098) passed architecture detection and unattended update, then the unconfirmed erase check showed the PowerShell harness returned the wrong process status despite the expected error text. A static regression failed Red because the argumented and empty-input wrapper commands did not exit with the `.bat` result. Green — append `exit $LASTEXITCODE` to both PowerShell launcher commands. The focused Windows contract suite passes 9/9 and the Linux native harness passes; a new native matrix remains required.
- **Documentation contract regression:** the full suite found the user guide no longer stated plainly that uninstall asks whether to preserve or erase data. Matching English and pt-BR text was restored; `npm test -- --run tests/unit/documentation-contract.test.js -t 'single-file lifecycle menu'` passed 1/1.
- **Red → Green — image inventory and uninstall postconditions:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot inventory the product images'` reproduced a false success when Docker image inspection failed; Green makes inventory failure stop removal with an error. The unused-image postcondition test failed Red with exit 0 when image verification was temporarily disabled, then passed after verifying image absence or a remaining external container reference. Native Windows CI then failed before launch because PowerShell parsed a smart quote as a string delimiter. A new static regression failed Red on that character and passed after replacing the two strings; updated native Windows rerun remains pending. Focused suites passed 29/29 before that added regression; the Windows prompt suite now passes 6/6.
- **Documentation contract regression:** the full suite found the user guide no longer stated plainly that uninstall asks whether to preserve or erase data. Matching English and pt-BR text was restored; `npm test -- --run tests/unit/documentation-contract.test.js -t 'single-file lifecycle menu'` passed 1/1.
- **Runtime fire test — Linux real Docker:** operator ran `docker compose down -v` before the test; output confirmed removal of `postgres_data` and `operational_secrets`. The installer then ran with `printf '1\nS\n0\n' | sh /tmp/queuebot-installer-smoke/subarushogun_twich_bot_setup.sh`, detected the preserved local `.env` (pt-BR/3000), pulled GHCR `main`, recreated both volumes, completed PostgreSQL/migrations/bot startup and health polling. A subsequent `sh /tmp/queuebot-installer-smoke/subarushogun_twich_bot_setup.sh --silent update` completed without prompts and preserved database/secrets/settings. Final `curl --insecure --silent --show-error --fail https://localhost:3000/health` returned `status=ok`, database `connected`, Twitch `not_configured`, product version `v0.8.0-112a182-alpha`. No Twitch authorization/write operation occurred. The product installation remains running with newly recreated volumes; do not remove them in this story.
- **Red → Green — Windows first-run locale:** `npm test -- --run tests/unit/windows-installer-first-run.test.js` first failed because the PowerShell source initialized `$Locale` to `pt-BR`, bypassing the language prompt on a fresh install. Green — leave locale empty when there is no saved config and prompt before the menu; invalid saved locale falls back to pt-BR. The static contract and actual direct-launch behavior are checked locally/CI respectively.
- **Linux installer behavior:** `npm test -- --run tests/integration/unified-installer.test.js` covers packaging, path-safe launch, locale/port/callback, preserved updates, localized confirmation, failed clean-update download, keep/erase uninstall, and missing-Docker guidance. `node tests/platform/installer-native.mjs` directly launched the generated Linux artifact from a path containing spaces with an isolated fake Docker executable.
- **Documentation (superseded download instructions):** the earlier guide pointed users to temporary GitHub Actions artifacts. Those instructions were replaced with GitHub Releases as the end-user path; CI artifacts remain for engineering/QA only. The bilingual guide gives the three exact asset names, opening steps, menu/data behavior, and source-file locations. The Linux CA command uses `$HOME` and `install -Dm644`.
- **Compose bootstrap regression:** the first full-suite run exposed that the packaged runtime executes bootstrap from `/workspace`, while the production image stores it under `/app`. The real Compose integration failed to find `apps/infra/scripts/bootstrap.mjs`; changing the service working directory to `/app` fixed it. `npm test -- --run tests/integration/compose-runtime.test.js` then passed 3/3, and the final `npm test` passed 643/643.
- **Native Windows launcher harness — Red / Green pending:** Actions run `37574642283`, job `112640688705`, failed because the quoted `.bat` path was treated as an unrecognized command before the artifact ran. The harness added quotes as an argv item to `cmd.exe`, which escaped them literally. It now invokes the `.bat` via PowerShell's call operator and passes its path through `QUEUEBOT_PREBUILT_INSTALLER`, preserving paths with spaces. Linux focused tests pass 9/9; Windows Green must be confirmed by the next native Actions run. Historical status superseded by the successful native Windows/macOS/Linux run 37634641892 recorded below.
- **Windows first-run locale fallback — Red / Green, native rerun pending:** native run `37575104559`, job `112642122850`, failed before reading operator input with `Cannot index into a null array` in `T` because the initial locale is intentionally empty. A regression in `npm test -- --run tests/unit/windows-installer-first-run.test.js` failed Red because `T` indexed `$Copy['']`. Green — use pt-BR only as the temporary copy locale until the user's explicit language choice; keep the product locale unset until selected. The separate `Read-Answer` test-mode helper automates direct native artifact input. Focused installer tests passed 11/11; final `npm test` passed 645/645 and all local quality gates passed. Native Windows rerun is pending. Historical status superseded by the successful native Windows/macOS/Linux run 37634641892 recorded below.
- **Cross-platform prompt handling — Red / Green, native Windows rerun pending:** Windows run `37575367627`, job `112642948904`, timed out while the test harness piped prompt input into the directly launched `.bat`. The harness now supplies a deterministic input fixture file to the embedded PowerShell process; the production prompt prints once before `Read-Host`. Red — a new Linux no-input integration check exhausted `spawnSync`'s output buffer (`ENOBUFS`) because EOF caused the language selector to loop. Green — Linux now exits with localized terminal guidance; focused integration and Windows prompt suites pass 12/12, and `node tests/platform/installer-native.mjs` passes on Linux. Linux docs now show `sh ./subarushogun_twich_bot_setup.sh`, independent of executable permissions. The operator's exact Linux symptom is still needed to confirm whether it matches this reproduced case. Full local gates then passed: 85 files / 646 tests, lint, typecheck, OpenGrep (0 findings), localization, version, port denylist, Compose config, and diff check. Native Windows/macOS reruns remain pending. Historical status superseded by the successful native Windows/macOS/Linux run 37634641892 recorded below.
- **Windows follow-up run:** Actions run `37576026566`, job `112645005291`, no longer timed out, but exited without creating the expected `.env`. The harness previously threw only the filesystem error and discarded installer output; it now includes stdout/stderr in this failure path. Diagnosis and the next native Windows run are pending; no Windows pass is claimed. Historical status superseded by the successful native Windows/macOS/Linux run 37634641892 recorded below.
- **Installation estimate correction — Red / Green:** `npm test -- --run tests/unit/documentation-contract.test.js -t 'separates end-user runtime estimates'` first failed because both guides described CPU, disk, and build-cache needs for a first local image build, although the end-user installer pulls a prebuilt GHCR image. Green — both guides now distinguish runtime estimates from development builds, document supported amd64/arm64 images, and clarify Linux shell invocation. The focused documentation contract passes 1/1. Docker's current macOS requirements were checked against its official installation page on 2026-10-07.
- **Public repository and separate GHCR access — Red / Green (2026-10-07):** a new public-access documentation contract first failed because the root README still claimed the repository was private. Verified GitHub's repository API reports `visibility=public`; an unauthenticated GHCR pull of `main` returned HTTP 403. Green — synchronized both READMEs, contribution/installation/installer/user guides, integration references, and changelogs: public source and temporary Actions artifacts need no repository invitation (artifact download still requires GitHub sign-in), while the image package currently needs authorized `read:packages` access. `npm test -- --run tests/unit/documentation-contract.test.js -t 'public repository without assuming the GHCR package is public'` passes 1/1. Installer scripts were not changed because the installer already pulls the configured image and does not depend on source-repository visibility.
- **Versioned GitHub Releases — Red / Green (2026-10-07):** first added focused tests for materialized version-to-changelog mapping, malformed identities, missing translations, and the tag-release workflow. Red showed that no release-notes generator or release workflow existed. Green — `create-release-notes.mjs` requires both public changelog sections; `.github/workflows/release.yml` validates the exact tag/source identity, builds and tests one native installer per OS, then publishes bilingual notes only for a pushed version tag. `npm test -- --run tests/unit/release-notes.test.js tests/unit/ci-workflow-contract.test.js` passed 9/9. No tag, release, stage promotion, or GHCR visibility change was made.
- **Release-pinned installer images and current gates — Red / Green (2026-10-07):** regression tests showed release installers defaulted to the moving `main` image tag; the update test also verified that failed pulls must preserve the prior `.env` tag. Green — the packager accepts only `main` or a validated materialized version, release artifacts embed their exact tag, and normal updates persist that tag only after a successful pull. The native Linux artifact harness verifies install/update target tag. The QEMU action was pinned to the verified Node 24-compatible v4.4.0 SHA. Final local checks: `npm test` passed 86 files / 660 tests; lint, typecheck, OpenGrep (0 findings), version/localization/port validators, Compose config, YAML parsing, and `git diff --check` passed; the Linux direct-launch harness passed. Windows/macOS native Actions and independent AIOX-QA remain pending. Docker inspection found only the active Compose project; its exited `bootstrap`/`migrate` one-shot containers and both product volumes were preserved. Historical status superseded by the successful native Windows/macOS/Linux run 37634641892 recorded below.
- **Windows first-run locale — Red / Green, native pass (2026-10-07):** Actions run `37633610369`, job `112833952970`, reproduced that the first-run language answer was not retained: the locale prompt repeated, consumed subsequent menu/port input, and no `.env` was written. The improved harness preserved the actual stdout/stderr. A regression in `tests/unit/windows-installer-first-run.test.js` failed first because functions read `$Locale` without scope while prompts wrote `$script:Locale`. Green — initialize, read, and update `$script:Locale` consistently. The focused test passed 3/3 locally; Actions run `37634641892`, job `112837515704`, then passed the native Windows installer test. Native Linux and macOS installer jobs also passed and uploaded their artifacts in the same run. The run completed successfully; GHCR publication was skipped as expected for a pull request.

### Acceptance status

- [x] One directly openable artifact is packaged per OS; no separate old lifecycle file is required.
- [x] Install/start, update, uninstall, language, port, callback display, path spaces, localized destructive confirmation, keep-data behavior, and missing Docker guidance have implementation tests.
- [x] Docker daemon architecture tests allow `amd64`/`x86_64` and `arm64`/`aarch64`, reject unsupported values before Compose, and verify a readable first-run language prompt. Controlled CLI-boundary failure tests verify that startup/migration errors and an unhealthy post-update panel preserve the saved configuration and never request volume deletion.
- [x] Failed clean-update image pull is proven to preserve saved settings and product data.
- [x] Old lifecycle wrappers and tests are deleted; user-facing guides point to the single installer.
- [x] Full repository quality gates and OpenGrep pass on the current tree: `npm test` (86 files / 677 tests), lint, typecheck, OpenGrep (0 findings), localization, port denylist, version, Compose config, workflow YAML parsing, and diff check. The last production dependency audit recorded earlier in this story found 0 vulnerabilities.
- [x] Linux native artifact direct-launch check passes from a path containing spaces; the generated `.sh` selected locale/port, displayed the callback, invoked Compose, and exits cleanly when first-run input is unavailable.
- [x] Public source-repository access and GHCR image-package access are documented separately in English and pt-BR; anonymous GHCR access was checked and denied while the package remains private.
- **Earlier extracted-artifact instructions — historical Red / Green, superseded:** the operator ran `sh ./subarushogun_twich_bot_setup.sh` from the repository root and received `cannot open ... No such file`; at that time the packaged file existed only in a downloaded CI archive. The resulting documentation contract was fixed by explaining the extraction directory. The current delivery plan uses standalone files attached to GitHub Releases, so users open the downloaded `.sh` directly from its saved location; the earlier CI archive instruction is not current guidance.
- [x] Historical native Windows, macOS, and Linux Actions passed in [run 37637847991](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37637847991).
- [x] Corrective installer passed native Windows/macOS/Linux Actions in [run 37651571138](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37651571138).
- [x] Tag release workflow validates runtime identity and creates release notes from the matching English and pt-BR changelog sections.
- [x] User guides use GitHub Releases; Actions artifacts are documented as temporary engineering/QA files.
- [ ] Create any tag/release only after the owner-approved gate; FND-9 is incomplete and no public product release exists.
- [x] Historical AIOX-QA applies only to the pre-reopen baseline. Corrective AIOX-QA passed 17/17 criteria at 100/100; see the final review and gate below.
- [x] Physical Windows/macOS acceptance is not claimed; actual host Docker lifecycle and dependency-install runs remain operator follow-up and are not a prerequisite for the native-runner CI criterion.
- [ ] Before the planned post-FND-9 Twitch streamer acceptance, make the GHCR package public and verify an anonymous pull; the source repository is public, but the image package was still private on 2026-10-07.

## File List

- `.aiox/project-status.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/main-cd.yml`
- `.github/workflows/quality-gates.yml`
- `CHANGELOG.md`
- `CHANGELOG-beta.md`
- `CHANGELOG_INTERNAL.md`
- `README.md`
- `README.pt-BR.md`
- `VERSION`
- `apps/api/src/persistence/queue-repository.mjs`
- `apps/api/src/server.mjs`
- `apps/infra/installer/installer.ps1`
- `apps/infra/installer/installer.sh`
- `apps/infra/scripts/create-release-notes.mjs`
- `apps/infra/scripts/host-lifecycle.ps1`
- `apps/infra/scripts/host-locale.sh`
- `apps/infra/scripts/package-installer.mjs`
- `atualizar.bat`
- `atualizar.sh`
- `compose.yaml`
- `desinstalar.bat`
- `desinstalar.sh`
- `docs/CONTRIBUTING.md`
- `docs/INSTALLATION.md`
- `docs/INSTALLERS.md`
- `docs/MANUAL_DE_USUARIO-pt_BR.md`
- `docs/ROADMAP.md`
- `docs/USER_GUIDE-en_US.md`
- `docs/VERSIONING.md`
- `docs/integrations.md`
- `docs/planning-validation.md`
- `docs/pt-BR/CHANGELOG.md`
- `docs/pt-BR/CHANGELOG-beta.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CONTRIBUICAO.md`
- `docs/pt-BR/INSTALACAO.md`
- `docs/pt-BR/INSTALADORES.md`
- `docs/pt-BR/ROADMAP.md`
- `docs/pt-BR/VERSIONING.md`
- `docs/pt-BR/integrations.md`
- `docs/pt-BR/planning-validation.md`
- `docs/pt-BR/stories.md`
- `docs/pt-BR/stories/DOC-1/story.md`
- `docs/pt-BR/stories/FND-8/spec/complexity.json`
- `docs/pt-BR/stories/FND-8/spec/critique.json`
- `docs/pt-BR/stories/FND-8/spec/plan.json`
- `docs/pt-BR/stories/FND-8/spec/requirements.json`
- `docs/pt-BR/stories/FND-8/spec/spec.md`
- `docs/pt-BR/stories/FND-8/story.md`
- `docs/pt-BR/stories/OPS-5/spec/research.json`
- `docs/pt-BR/stories/OPS-5/spec/spec.md`
- `docs/pt-BR/stories/OPS-5/story.md`
- `docs/qa/gates/FND-4-twitch-integration.yml`
- `docs/stories.md`
- `docs/stories/DOC-1/story.md`
- `docs/stories/FND-8/spec/complexity.json`
- `docs/stories/FND-8/spec/critique.json`
- `docs/stories/FND-8/spec/plan.json`
- `docs/stories/FND-8/spec/requirements.json`
- `docs/stories/FND-8/spec/spec.md`
- `docs/stories/FND-9/validation.md`
- `docs/pt-BR/stories/FND-9/validation.md`
- `docs/stories/FND-8/story.md`
- `docs/stories/OPS-5/spec/research.json`
- `docs/stories/OPS-5/spec/spec.md`
- `docs/stories/OPS-5/story.md`
- `iniciar.bat`
- `iniciar.sh`
- `package-lock.json`
- `package.json`
- `subarushogun_twich_bot_setup.bat`
- `subarushogun_twich_bot_setup.sh`
- `subarushogun_twich_bot_uninstall.bat`
- `subarushogun_twich_bot_uninstall.sh`
- `subarushogun_twich_bot_update.bat`
- `subarushogun_twich_bot_update.sh`
- `tests/integration/compose-contract.test.js`
- `tests/integration/unified-installer.test.js`
- `tests/integration/windows-lifecycle-contract.test.js`
- `tests/platform/installer-native.mjs`
- `tests/platform/windows-lifecycle-localization.ps1`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/unit/documentation-contract.test.js`
- `tests/unit/fnd7-documentation-contract.test.js`
- `tests/unit/host-lifecycle-localization.test.js`
- `tests/unit/host-locale-copy.test.js`
- `tests/unit/installer-locale-default.test.js`
- `tests/unit/lifecycle-wrapper.test.js`
- `tests/unit/maintenance-scripts.test.js`
- `tests/unit/release-notes.test.js`
- `tests/unit/start-script.test.js`
- `tests/unit/windows-installer-first-run.test.js`

- `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`
- `docs/pt-BR/qa/gates/OPS-5-unified-lifecycle-installer.yml`
- `docs/qa/assessments/OPS-5-risk-20261007.md`
- `docs/qa/assessments/OPS-5-nfr-20261007.md`
- `docs/pt-BR/qa/gates/OPS-5-unified-lifecycle-installer.yml`
- `docs/pt-BR/qa/assessments/OPS-5-risk-20261007.md`
- `docs/pt-BR/qa/assessments/OPS-5-nfr-20261007.md`

## Resolved implementation choices

- File formats: `.bat`, `.command`, `.sh`; no companion launcher.
- Install source: GHCR `main` image through embedded Compose; end users do not clone the repository or need Node.js.
- Docker prerequisite: detection plus consented opening of official vendor instructions; no silent host installation or privilege escalation.
- Typed confirmations: `APAGAR`, `DELETE`, `ELIMINAR` for pt-BR, English, and Spanish.
- Existing wrappers are deleted only after the unified artifact sources/tests and platform instructions are present.

## Out of scope

Replacing Docker Compose, removing Docker as part of product uninstall, silently provisioning host virtualization, changing data-retention policy, hosted install services, or committing to a paid installer vendor.

## Change log

| Date | Change | Agent |
| --- | --- | --- |
| 2026-10-06 | Created planning draft after official installer and Docker prerequisite research; implementation not started | @aiox-master |
| 2026-10-06 | Added GitHub Actions matrix using the open-source runner, native-runner contracts, per-platform artifacts, and no-auto-commit/release boundaries | @aiox-master |
| 2026-10-07 | Refined delivery to one directly openable installer artifact per OS with a single install/update/uninstall menu, locale/port setup, clean-update confirmation, explicit data-retention choices, and manual host-dependency removal guidance | @aiox-master + @architect |
| 2026-10-07 | Implemented the unified artifacts, embedded Compose packaging, native CI matrix, safety/regression tests, bilingual per-platform instructions, and removal of superseded lifecycle scripts; final CI/QA gates pending | @aiox-dev |
| 2026-10-07 | Completed local quality gates (643 tests, lint, typecheck, OpenGrep and supporting validators); fixed the Compose bootstrap working directory from `/workspace` to `/app`; Linux direct-launch passed. Native Windows/macOS Actions and independent QA remain open | @aiox-dev + @qa |
| 2026-10-07 | Native Windows Actions exposed two launcher-test harness defects; fixed batch path invocation and redirected prompt input in test mode. The local suite now passes 644/644; rerun of Windows Actions is pending | @aiox-dev + @qa |
| 2026-10-07 | Native Windows rerun found that initial language copy indexed an empty locale before prompting; added a Red regression and pt-BR temporary copy fallback. Focused tests pass 11/11; full and native reruns pending | @aiox-dev + @qa |
| 2026-10-07 | After the first-run locale fallback, full local gates passed: 645 tests, lint/typecheck, OpenGrep, all validators, Compose, diff check, and dependency audit. New native Windows Actions run remains pending | @aiox-dev + @qa |
| 2026-10-07 | Release installers now pin the matching versioned image and save the new tag only after a successful pull; regression covers failure without config mutation. QEMU updated to a verified Node 24-compatible pin. At that point, local gates passed with 660 tests and native Linux passed; this evidence was superseded by the later 667-test run and Windows/macOS/Linux Actions run 37634641892. Docker inspection found only the active install; one-shot containers and volumes were preserved | @aiox-dev + @qa |
| 2026-10-07 | Updated acceptance evidence: all three native Actions installer jobs passed (run 37634641892); physical operator acceptance remains unclaimed; independent QA started | @aiox-dev |
| 2026-10-07 | Added architecture and recovery regressions: unsupported Docker daemon architectures stop before Compose, supported architecture aliases proceed, the first language prompt is readable, and migration/startup or post-update health failures preserve settings/data. The new Red cases failed because architecture was not checked and the initial copy showed internal keys; Green adds daemon architecture checks and a pt-BR prompt fallback. Local full-suite result is 667 tests; fresh native CI and independent QA remain pending | @aiox-dev |
| 2026-10-07 | Native Actions run 37637259314 passed Linux/macOS but Windows failed because the harness log lacked `compose up -d`; its failure output did not yet reveal the cause. Updated the `.cmd` fake to match arguments individually and included captured installer output in the assertion. Run 37637847991 then passed all native Windows/macOS/Linux jobs and uploaded the three installer artifacts | @aiox-dev |
| 2026-10-07 | Independent AIOX-QA review passed 14/14 acceptance criteria with score 100/100; no blocking risks remain. Physical Windows/macOS host tests remain unclaimed | @qa |
| 2026-10-07 | Reopened after operator feedback; added progress, scoped Docker cleanup, volume-policy postconditions, and no-install reporting acceptance criteria. Previous Done/QA evidence is retained as historical baseline only; corrective increment is InProgress | @aiox-master + @aiox-devops |
| 2026-10-07 | Added unattended cross-platform CLI contract, safe explicit erase flags, and bilingual operator commands; real Linux Compose install/update fire test passed. Native Windows PowerShell execution and new QA remain pending | @aiox-dev + @aiox-master |
| 2026-10-07 | Native Windows/macOS/Linux matrix passed in Actions run 37651571138; local gates pass with 677 tests. Status transitioned Ready for Review → InReview for independent corrective QA | @aiox-dev |
| 2026-10-07 | QA Gate PASS (0.9.0) — Status: InReview → Done; all 17 acceptance criteria verified against 677 tests and native Windows/macOS/Linux CI | @qa |

## QA Results

### Corrective increment review — 2026-10-07

### Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

The corrective POSIX and PowerShell installers now report lifecycle progress, scope Docker cleanup to this Compose project, inventory product images, avoid removing images referenced by any container, and verify container/network/volume/image postconditions before reporting success. Unattended actions have explicit safe defaults and require paired erase flags. The user guide and installer documentation describe the same behavior in English and pt-BR.

### Validation Evidence

- `npm test`: 86 files, 677 tests passed after the PowerShell architecture-probe correction.
- `npm run lint`, `npm run typecheck`, `npm run review:static`: passed; OpenGrep reported 0 findings.
- `npm run validate:version`, `npm run validate:localization`, `npm run validate:port-denylist`, `docker compose config --quiet`, `sh -n apps/infra/installer/installer.sh`, `node --check tests/platform/installer-native.mjs`, `node tests/platform/installer-native.mjs`, and `git diff --check`: passed.
- Focused installer tests: 29/29 passed; documentation contract regression: 1/1 passed.
- Linux Compose runtime remains healthy; `bot` and `db` are healthy and the `postgres_data`/`operational_secrets` volumes are preserved.
- Native Windows Actions run 37648518488 initially failed before launch on a PowerShell parse error caused by smart quotes in single-quoted strings; commit `b92a4cc` fixes it. Run 37649015429 then passed parsing and installation but exposed an argument-forwarding defect in the native harness during unattended update. The harness now forwards explicit test arguments, and a new native matrix run is pending.

### Interim Gate Status — superseded by final corrective review below

Historical interim result: CONCERNS — score 88/100 (8.8/10), recorded before the last Windows harness fix and final native Actions run. It is superseded by the final corrective review below, which covers the updated revision and reports PASS 100/100.

### Security Review

OpenGrep reported 0 findings. Image cleanup checks container references before removal; no global prune or host dependency removal is used. The database and secrets volumes in the active installation were not removed.

### Interim Lifecycle Decision — superseded

Independent QA evaluated the corrective revision after the final CI run. No physical Windows/macOS host run or Twitch write operation is claimed.

### Historical baseline review — Review Date: 2026-10-07

### Reviewed By: Quinn (Test Architect)

### Reviewed Revision: `11e1e3f836a521256c5c450e5c21cb081b82bb68`

### Code Quality Assessment

The installer remains one directly openable artifact per operating system while its implementation stays testable from reviewed source files. Destructive choices are explicit and localized, normal updates preserve data, unsupported Docker architectures stop before Compose, and failures provide a recovery path. All 14 acceptance criteria have traceable implementation or workflow evidence.

### Refactoring Performed

No product-source refactor was needed during QA. The prior native Windows harness failure was corrected by making the fake Docker matcher parse arguments individually and preserving stdout/stderr in failure output. The corrected native run passed.

### Compliance Check

- Coding Standards: ✓ Existing JS/ESM and shell/PowerShell boundaries preserved.
- Project Structure: ✓ Installer sources, package tooling, tests, docs, and QA evidence follow repository organization.
- Testing Strategy: ✓ Vitest, PostgreSQL/Compose CI, and native OS artifact launches passed.
- All ACs Met: ✓ Trace 1–14; see `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`.

### Improvements Checklist

- [x] Verified 86 files / 667 tests on the current implementation.
- [x] Verified lint, typecheck, OpenGrep (0 findings), localization/version/port validators, Compose config, and Linux direct launch.
- [x] Verified native Windows/macOS/Linux launch and artifact upload in [Actions run 37637847991](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37637847991).
- [ ] Record physical Windows installation/update smoke test when the owner resumes notebook testing; CI used fake Docker.

### Security Review

No secrets are embedded in generated installer artifacts or emitted by installer diagnostics. Destructive cleanup requires exact localized confirmation and uses the fixed product Compose project. OpenGrep reported zero findings. No release or tag was created.

### Performance Considerations

Installer health polling is bounded to 60 attempts. Architecture and Compose checks add bounded startup work; no long-running process or background task was introduced.

### Files Modified During Review

QA reports and bilingual assessments only; no application source was changed during this review.

### Gate Status

Gate: PASS → `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`

Risk profile: `docs/qa/assessments/OPS-5-risk-20261007.md`

NFR assessment: `docs/qa/assessments/OPS-5-nfr-20261007.md`

### Lifecycle Transition

Historical baseline only: PASS InReview → Done for PR #36. OPS-5 was reopened on 2026-10-07; this prior review did not cover the corrective increment. The final corrective review below records PASS InReview → Done for PR #37; @devops synchronizes issue #30 after merge.

### Final corrective review — Review Date: 2026-10-07

### Reviewed By: Quinn (Test Architect)

### Reviewed Revision: `07f2dbdb7e9bfb2f916dab3ad1b1169dd3637d55`

### Code Quality Assessment

The corrective installer work is maintainable across POSIX and PowerShell entrypoints, keeps Docker cleanup scoped to the product Compose project, validates removal postconditions, preserves shared images and user data by default, and makes destructive actions explicit. The Windows native run exercised the packaged `.bat` directly and verified unattended update, refusal of unconfirmed erase, keep-data uninstall, restart, confirmed erase, and exit-code behavior.

### Refactoring Performed

No QA-owned code refactor was needed. All test-harness and PowerShell probe corrections were made test-first by development and have Red/Green evidence in the implementation records.

### Compliance Check

- Coding Standards: ✓ JavaScript ESM, shell/PowerShell boundaries, scoped Docker operations, and English technical identifiers are preserved.
- Project Structure: ✓ Installer, packaging, tests, documentation, and QA files follow the established project layout.
- Testing Strategy: ✓ Vitest contracts, real PostgreSQL/Compose integration, direct native artifact launches, and test-first regressions were used at the appropriate boundaries.
- All ACs Met: ✓ 17/17. CI run [37651571138](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/runs/37651571138) passed Windows, macOS, Linux, lint/typecheck, OpenGrep, tests, and production image build.

### Improvements Checklist

- [x] Verify all 17 acceptance criteria against implementation tests, release workflow contracts, bilingual docs, and native artifact CI.
- [x] Verify full local suite: 86 files / 677 tests; lint, typecheck, OpenGrep (0 findings), version/localization/port validators, Compose config, Linux direct launch, shell/Node syntax, and diff check pass.
- [x] Verify the final Windows/macOS/Linux native artifact matrix and uploads in Actions run 37651571138.
- [x] Verify new criteria 18–19 with Red/Green regressions: exact displayed version matches immutable image identity and GHCR pull denial exits with localized guidance while retaining saved state.
- [x] Verify beta QA artifact is uploaded only after its matching image digest is published; contract tests reject mutable/mismatched identities and premature artifact publication.
- [x] Verify current local quality gates: 106 files / 910 tests, lint, typecheck, version/localization validators, OpenGrep (0 findings), Docker build, Linux native harness, actionlint, and diff check.
- [ ] Record physical Windows/macOS host lifecycle smoke tests when the owner performs them; current native runner uses isolated fake Docker.

### Security Review

OpenGrep found 0 issues. Uninstall inventories project-labeled resources, checks image use by any container, verifies selected volume policy, and never runs global prune or removes host dependencies. No secrets or raw user data are added to artifacts or logs.

### Performance Considerations

Installer checks are bounded local Docker queries and bounded health polling. No resident process, background service, or dependency was added.

### Files Modified During Review

Only the QA gate, QA results, and lifecycle/status records were updated; product source was not changed during QA.

### Gate Status

Gate: PASS (100/100) → `docs/qa/gates/OPS-5-unified-lifecycle-installer.yml`

Risk profile: existing baseline `docs/qa/assessments/OPS-5-risk-20261007.md`; no new blocking risk identified in this corrective review.

NFR assessment: corrective security, performance, reliability, and maintainability checks PASS in the gate file.

Physical Windows/macOS host acceptance and Twitch write operations were not performed and are not claimed.

### Lifecycle Transition

PASS: InReview → Done (0.9.0). @devops can now synchronize issue #30 and merge PR #37 after the QA gate is committed.
