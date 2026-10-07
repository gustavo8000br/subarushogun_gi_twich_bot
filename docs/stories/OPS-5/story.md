# OPS-5 — Unified cross-platform lifecycle installer

[Português brasileiro](../../pt-BR/stories/OPS-5/story.md)

**Status:** Planning draft; no installer implementation started.
**Planning source:** product owner request on 2026-10-06.
**GitHub issue:** [#30](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/30) (open for planning).

[Spec Pipeline research](spec/research.json) · [Specification](spec/spec.md)

## Story

As a streamer installing the local bot, I want one platform-specific setup file to guide installation, dependency setup, update, and uninstall, so that I can operate the product without choosing among separate lifecycle scripts.

## Confirmed planning decisions

- Deliver one entry-point file per operating system family; do not claim one identical binary can run natively on Windows, macOS, and Linux.
- The entry point offers install/start, update, and uninstall actions.
- Dependency detection is part of the flow. Any installation that needs elevation, restart, changed system features, or acceptance of third-party terms must be explained and explicitly approved; unsupported cases fall back to official manual instructions.
- Product removal must retain the existing preserve-data vs delete-data choice. It removes only product resources and never uninstalls Docker as a shared dependency.
- Existing data-deletion safeguards remain mandatory; no normal action may remove Docker volumes without the operator's explicit typed confirmation.

## Research conclusion

A truly identical universal native file is not a realistic default. InstallBuilder can generate native installers from one project across major desktop OSes, but its current Professional license is commercial and listed at USD 1,995. IzPack offers one cross-platform Java installer, but requires a Java runtime unless one is bundled. Oracle `jpackage` creates platform-specific packages and must be run on each target OS. Velopack is MIT-licensed and produces cross-platform desktop install/update packages, but targets compiled desktop application output rather than this Compose-operated service.

**Recommended direction:** keep one small interactive source entrypoint for POSIX systems (`.sh`, shared by supported Linux/macOS targets) and one PowerShell entrypoint for Windows (`.ps1`); consolidate actions into a menu/arguments and reuse one tested operation contract. Do not add a paid installer framework, Java, Electron, or another runtime solely to wrap the current Docker Compose app. Explore a native self-contained executable only if testing proves the two entrypoints cannot provide a safe and usable flow.

**CI direction using open-source runner:** keep the installer source files as the canonical deliverables in Git and use GitHub Actions with a Linux/macOS/Windows runner matrix to execute platform contract checks. Package each platform's entrypoint and its required documentation as separate workflow artifacts, generated from the checked-in sources. This keeps downloadable artifacts aligned with reviewed source changes; Actions must not rewrite or commit installer files automatically. A release workflow may attach the already tested artifacts only as part of an explicitly authorized release. Pin third-party Actions to full commit SHAs and review updates through normal PRs. No paid installer framework is needed for this workflow.

The runner application itself is open source under MIT, and runner-image definitions are public. GitHub-hosted Actions remains a hosted GitHub service, so the complete CI control plane is not open source. Self-hosting the runner is possible but adds machine maintenance and platform-specific capacity; it does not replace GitHub's workflow service.

The CI workflow does not itself install or keep host Docker updated. It tests the product's installer/update logic and packages the entrypoints. Dependency installation continues to use official vendor instructions and requires the consent and privilege boundaries above. GitHub-hosted runner coverage is useful contract evidence, not a substitute for manual acceptance on physical Windows/macOS/Linux systems.

Dependency installation cannot be guaranteed as silent or fully automatic across systems. Windows Docker Desktop supports per-user installation without admin in documented configurations, but WSL enablement can need administrator action. macOS and Linux Docker installation paths differ and can involve sudo/system changes. The setup flow must detect, explain, ask, perform only an explicitly approved supported step, and resume or show the manual next step.

## Acceptance criteria to refine

1. A user downloads/runs one documented entrypoint for their OS and sees install/start, update, and uninstall actions.
2. The entrypoint detects supported OS, architecture, Docker CLI/daemon, and Compose v2 before changing the app.
3. Missing dependency guidance is versioned and verified against official platform instructions. Supported automated setup requires explicit consent and uses official sources with signature/checksum verification where available.
4. The flow never elevates silently, changes virtualization/system features silently, accepts license terms for the user, or runs unchecked downloaded scripts.
5. Interrupted or failed dependency setup leaves a clear recovery path and does not remove application data.
6. Update preserves PostgreSQL and secret volumes, and identifies the source/version being installed.
7. Uninstall always offers preserve vs delete; deletion requires a typed confirmation and names the affected app data. Docker itself is left installed.
8. The single entrypoint is idempotent; invoking it again resumes or reports the actual installed state instead of duplicating setup.
9. A GitHub Actions workflow runs platform contract tests on native Linux, macOS, and Windows runners; packages one artifact per OS family from checked-in source; and uploads artifacts without committing generated files back to the branch. Documentation states that GitHub-hosted Actions is a hosted service, while the runner application is MIT-licensed.
10. Test contracts cover Linux/macOS shell and Windows PowerShell behavior, path spaces, quoting, user cancellation, missing tools, privilege/restart boundaries, failed downloads, Compose health, and volume preservation/deletion.
11. Workflow/action versions are pinned and updated through reviewed PRs; release attachment is separate and requires the project's release authorization.
12. Bilingual docs and concise internal changelogs stay synchronized. Native Windows/macOS acceptance is recorded only after running on those hosts.

## Open questions

- Which Linux distributions and macOS versions are officially supported for guided dependency installation, versus detection plus manual instructions?
- Should a supported dependency install launch the vendor's official GUI installer or run package-manager commands after explicit consent?
- Should the Windows entrypoint remain `.ps1`, or should the deliverable be a signed native `.exe` that embeds the launcher? A `.bat` shim would violate the one-file goal if it requires a second script.
- Is automatic Docker Desktop installation an acceptable optional action when UAC/sudo is presented, or should setup always leave that installation to the user?
- How should this consolidation relate to the FND-8-approved generic names `subarushogun_twich_bot_setup`, `..._update`, and `..._uninstall`? A single setup entrypoint may supersede separate files while preserving those action names in its menu.

## Out of scope

Replacing Docker Compose, removing Docker as part of product uninstall, silently provisioning host virtualization, changing data-retention policy, hosted install services, or committing to a paid installer vendor.

## Change log

| Date | Change | Agent |
| --- | --- | --- |
| 2026-10-06 | Created planning draft after official installer and Docker prerequisite research; implementation not started | @aiox-master |
| 2026-10-06 | Added GitHub Actions matrix using the open-source runner, native-runner contracts, per-platform artifacts, and no-auto-commit/release boundaries | @aiox-master |
