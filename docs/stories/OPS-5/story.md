# OPS-5 — Unified cross-platform lifecycle installer

[Português brasileiro](../../pt-BR/stories/OPS-5/story.md)

**Status:** Implementation complete; local quality gates and Linux native-launch checks pass. Native Windows/macOS Actions results and independent AIOX-QA review remain pending before closure. No physical Windows/macOS operator acceptance is claimed.
**Planning source:** product owner request on 2026-10-06.
**GitHub issue:** [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30) (open for planning).

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

**CI direction using open-source runner:** keep reviewed installer sources in Git and use GitHub Actions with native Linux/macOS/Windows runners to test the actual single-file deliverable for each supported OS. Upload one installer file per target OS as CI artifacts, generated from checked-in sources; keep its operator documentation in the repository rather than bundling another required file. Actions must not rewrite or commit generated installers. A release workflow may attach tested artifacts only as part of an explicitly authorized release. Pin third-party Actions to full commit SHAs and review updates through normal PRs.

The runner application itself is open source under MIT, and runner-image definitions are public. GitHub-hosted Actions remains a hosted GitHub service, so the complete CI control plane is not open source. Self-hosting the runner is possible but adds machine maintenance and platform-specific capacity; it does not replace GitHub's workflow service.

The CI workflow does not itself install or keep host Docker updated. It tests the product's installer/update logic and packages the entrypoints. Dependency installation continues to use official vendor instructions and requires the consent and privilege boundaries above. GitHub-hosted runner coverage is useful contract evidence, not a substitute for manual acceptance on physical Windows/macOS/Linux systems.

Dependency installation cannot be guaranteed as silent or fully automatic across systems. Windows Docker Desktop supports per-user installation without admin in documented configurations, but WSL enablement can need administrator action. macOS and Linux Docker installation paths differ and can involve sudo/system changes. The setup flow must detect, explain, ask, perform only an explicitly approved supported step, and resume or show the manual next step.

## Acceptance criteria

1. The downloadable package contains exactly one directly openable installer artifact per supported target OS (Windows, macOS, Linux); opening it presents one menu for install/start, update, and uninstall without a companion script, project clone, or separately fetched lifecycle script.
2. First install detects OS/architecture, Docker CLI/daemon, and Compose v2; it asks for language and port, explains defaults, validates the port, and shows the matching HTTPS panel/callback URLs before continuing.
3. When a host dependency is missing, the user can approve a supported official install path or decline and receive current vendor instructions. Privilege elevation, restart, WSL/virtualization changes, and third-party terms are explained before the relevant action.
4. Install/update/uninstall are idempotent and report detected/current state. A failure or cancellation leaves existing product data intact and provides a recovery action.
5. Normal update preserves PostgreSQL/secrets volumes and current product configuration. Clean update displays data-removal consequences and requires a typed, localized confirmation before deleting product-owned data; it then runs first-install setup again.
6. Uninstall offers keep-data or erase-all. Keep-data removes product containers, managed program files, and app images not used by other containers, but preserves database/secrets volumes and local CA. Erase-all requires typed, localized confirmation and removes only this product's resources/data; the downloaded installer file remains under user control.
7. Both uninstall outcomes explicitly state that Docker and other host dependencies remain installed and must be removed manually through their vendors if desired. No installer action removes or updates shared host dependencies during product uninstall.
8. No path silently chooses another host port, silently elevates, changes virtualization features, accepts license terms, runs unchecked downloaded code, or deletes unrelated Compose projects/resources.
9. Actions tests the real installer artifact on native Windows, macOS, and Linux runners and uploads exactly one artifact per supported target OS from reviewed sources without committing generated artifacts. It does not publish releases/tags or mutate installer sources.
10. Tests cover direct launch/menu choice, locale/port configuration, path spaces, cancellation, installed/missing dependencies, consent/elevation/restart boundaries, failed network/image/migration/health paths, preservation vs deletion scope, localized confirmation, and explicit manual-dependency-removal guidance.
11. Third-party Actions are pinned to full SHAs and reviewed by PR. Release attachment remains a separate owner-authorized operation. Native user-host acceptance is only claimed after an actual Windows/macOS/Linux operator run.
12. English/pt-BR story, installation/operation guidance, and changelog entries remain equivalent.

## Implementation and validation record

- **Platform artifacts:** `.bat` for Windows embeds the PowerShell implementation; `.command` for macOS and `.sh` for Linux embed the POSIX implementation. `package-installer.mjs` embeds the Compose manifest and strips build/repository-relative mounts. GitHub Actions packages and directly launches the platform artifact on its native runner, then uploads exactly one artifact per OS.
- **Operator guidance:** Docker is detected, and the installer asks before opening official vendor installation instructions. It does not silently elevate or change WSL/virtualization. Install/update/uninstall steps are in the bilingual installer guide. Existing separate lifecycle wrappers and their tests were removed after the replacement artifact and contracts existed.
- **Data paths:** normal update retains database/secrets volumes and user settings. Clean update pulls the image before deleting any data, requires `APAGAR` / `DELETE` / `ELIMINAR`, then asks language/port again. Uninstall keeps data by default option or erases only product-owned data after the same localized confirmation. Shared Docker/host dependencies and the downloaded installer remain untouched.
- **Red → Green — destructive update recovery:** `npm test -- --run tests/integration/unified-installer.test.js -t 'cannot download its image'` first failed because an image-pull failure occurred after the saved `.env` had changed from port 3100 to 3200 and locale `en` to `pt-BR`. Green — move `compose pull` before `compose down --volumes`, then start with the already-pulled image. The focused command passed and the saved configuration/local CA remained intact on pull failure.
- **Red → Green — Windows first-run locale:** `npm test -- --run tests/unit/windows-installer-first-run.test.js` first failed because the PowerShell source initialized `$Locale` to `pt-BR`, bypassing the language prompt on a fresh install. Green — leave locale empty when there is no saved config and prompt before the menu; invalid saved locale falls back to pt-BR. The static contract and actual direct-launch behavior are checked locally/CI respectively.
- **Linux installer behavior:** `npm test -- --run tests/integration/unified-installer.test.js` covers packaging, path-safe launch, locale/port/callback, preserved updates, localized confirmation, failed clean-update download, keep/erase uninstall, and missing-Docker guidance. `node tests/platform/installer-native.mjs` directly launched the generated Linux artifact from a path containing spaces with an isolated fake Docker executable.
- **Documentation:** a bilingual installer guide now gives the GitHub Actions download path, exact artifact names, opening steps for each OS, menu/data behavior, and source-file locations. The Linux CA command uses `$HOME` and `install -Dm644`. Full README, guide, and story contracts remain part of the final suite.
- **Compose bootstrap regression:** the first full-suite run exposed that the packaged runtime executes bootstrap from `/workspace`, while the production image stores it under `/app`. The real Compose integration failed to find `apps/infra/scripts/bootstrap.mjs`; changing the service working directory to `/app` fixed it. `npm test -- --run tests/integration/compose-runtime.test.js` then passed 3/3, and the final `npm test` passed 643/643.
- **Native Windows launcher harness — Red / Green pending:** Actions run `37574642283`, job `112640688705`, failed because the quoted `.bat` path was treated as an unrecognized command before the artifact ran. The harness added quotes as an argv item to `cmd.exe`, which escaped them literally. It now invokes the `.bat` via PowerShell's call operator and passes its path through `QUEUEBOT_PREBUILT_INSTALLER`, preserving paths with spaces. Linux focused tests pass 9/9; Windows Green must be confirmed by the next native Actions run.
- **Redirected Windows prompt input — Red / Green pending:** the next native run `37574818960`, job `112641223983`, invoked the artifact but failed when PowerShell `Read-Host` did not consume the redirected test input, leaving the locale unset. `npm test -- --run tests/unit/windows-installer-first-run.test.js` was added first and Red failed because the test-mode input helper was absent. Green — add `Read-Answer`, using `[Console]::In.ReadLine()` only in test mode and retaining `Read-Host` for interactive installs. Focused tests passed 10/10 and full `npm test` passed 644/644 locally; the native Windows rerun remains pending.

### Acceptance status

- [x] One directly openable artifact is packaged per OS; no separate old lifecycle file is required.
- [x] Install/start, update, uninstall, language, port, callback display, path spaces, localized destructive confirmation, keep-data behavior, and missing Docker guidance have implementation tests.
- [x] Failed clean-update image pull is proven to preserve saved settings and product data.
- [x] Old lifecycle wrappers and tests are deleted; user-facing guides point to the single installer.
- [x] Full repository quality gates and OpenGrep pass on the current tree: `npm test` (85 files / 644 tests), `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), localization, port-denylist, version, Compose config, `git diff --check`, and `npm audit --omit=dev --audit-level=low` (0 vulnerabilities).
- [x] Linux native artifact direct-launch check passes from a path containing spaces; the generated `.sh` selected locale/port, displayed the callback, and invoked Compose.
- [ ] Native Windows, macOS, and Linux Actions artifact jobs pass and upload one artifact each.
- [ ] Independent AIOX-QA score meets the project's acceptance threshold.
- [ ] Physical operator acceptance remains separate; real Docker update/uninstall and host dependency installation have not been run in this session.

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
