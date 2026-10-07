# OPS-5 specification — single-file lifecycle installer

[Português brasileiro](../../../pt-BR/stories/OPS-5/spec/spec.md)

**Status:** corrective implementation reference; OPS-5 reopened after uninstall progress/removal feedback. Previous Linux/Windows/macOS runner evidence and AIOX-QA PASS for PR #36 are historical baseline only. This increment adds scoped cleanup, progress and postcondition checks; native Windows execution and independent QA are pending.

## Goal

Deliver one directly openable installer file per supported operating system. Opening that file presents one menu for install/start, update, and uninstall. The user never needs separate lifecycle downloads, a companion script, or a repository checkout. Development sources and tests may remain modular; the single-file constraint applies to each user-downloadable platform artifact.

## User flow

### Install / Start

1. Detect OS/architecture, current product state, Docker CLI/daemon, and Docker Compose v2 before changing anything.
2. If Docker/Compose is missing, offer a supported official installation path after explaining privilege, system changes, restarts, and vendor terms. The user may decline and receive official manual instructions. Never elevate, enable WSL/virtualization, accept terms, or run downloaded code silently.
3. On first install, ask for product language (pt-BR default; English and Spanish available) and host port (3000 default). Validate the port, check whether it is occupied, and ask for a different value rather than switching automatically.
4. Show and save the selected settings and exact HTTPS panel/OAuth callback URLs. The chosen locale can later be changed in the panel. Changing the port requires updating the callback registered in Twitch.
5. Start the current supported product image/configuration, wait for Compose health, then open the panel or show a clear recovery instruction. Reopening the installer for an existing setup presents its current status and offers start/reconfigure without duplicating resources.

### Update

Show the installed product version/source and offer:

- **Keep data and update** (default): retain database, Twitch authorization, secrets, generated local CA, language, and port; fetch the selected supported product image and apply migrations. Failure leaves current data intact and reports a recovery step.
- **Erase product data and install cleanly**: summarize that queues, history, Twitch authorization, secrets, and local CA will be erased. Require a typed confirmation in the selected installer language. Then remove only this product's containers/volumes/files and app images not used by another container, and rerun first-install prompts. Cancellation or failed confirmation does not remove data.

### Uninstall

Offer two explicit choices:

- **Keep data**: stop/remove only this product's containers, unused product images, and installer-managed application files. Preserve its PostgreSQL/secrets volumes, saved settings, and generated local CA for a later reinstall.
- **Erase all product data**: list affected data and require a typed localized confirmation. Remove only this product's containers/unused app images/files/volumes/secrets and generated CA. Leave the downloaded installer file under user control.

Both paths leave Docker Engine/Desktop, WSL/virtualization features, package managers, and other host dependencies installed. Explain that the user must remove those manually through the vendors' official uninstallation instructions if desired. Never remove or modify unrelated Docker projects, volumes, images, or host dependencies.

## Platform artifact and CI

- There is exactly one downloadable installer file per supported OS target (Windows, macOS, Linux). The artifact must launch the menu through the platform's normal open/run path without a second launcher or script. Select file formats only after native-runner and direct-launch testing; a `.ps1` that opens in an editor does not meet the requirement by itself.
- Sources may share libraries and tests in the repository. CI builds/packages each standalone artifact from reviewed sources; it does not commit generated files back to the branch.
- Native GitHub Actions runners execute the actual installer contracts for each supported OS and upload exactly one installer artifact per target. CI artifacts are not releases. Release attachment and tags require the existing owner-approved release workflow.
- Pin third-party Actions to full commit SHAs and grant minimal permissions. The runner application is MIT/open source; GitHub-hosted Actions remains a hosted service.

## Safety and recovery

- Every action is idempotent and reports detected/installed state before mutation.
- Uninstall inventories project-labeled containers, networks, and volumes plus images described by this product's Compose configuration. It shows localized progress, removes only this project's Compose resources, and removes an image only when no container uses it. Keep-data verification confirms the volume set remains; erase verification confirms it is empty. Incomplete cleanup never reports success and leaves actionable diagnostics.
- An installer run with no local files or product-owned Docker resources reports that nothing was found/removed. A terminal is cleared only for interactive operation; redirected CI output retains its logs.
- A missing dependency, declined prompt, failed download, unavailable network, failed migration, unhealthy Compose service, or interruption leaves existing product data intact and gives a concrete next step.
- No automatic host-port changes, silent privilege escalation, silent system-feature changes, implicit vendor-license acceptance, unchecked script execution, or blind `down --volumes` against a project name not proven to belong to this application.
- Do not log credentials, OAuth codes/tokens, database secrets, or connection strings.
- Product uninstallation never uninstalls Docker or other shared host dependencies.

## Acceptance evidence

Tests cover direct launch/menu choice, locale and port prompts, callback display, path spaces, cancellation, installed/missing dependencies, consent/elevation/restart boundaries, failures and recovery, update preservation, clean-update deletion, uninstall progress and postcondition verification, keep/erase volume scope, localized typed confirmation, images shared by unrelated containers, no-install reporting, unrelated-resource protection, and explicit manual-dependency-removal guidance. Native user-host acceptance is recorded separately from CI runner results.

Resolved platform formats, Docker dependency behavior, typed confirmation words, and cleanup scope are recorded in the [story](../story.md). Native Actions results, full repository gates, independent QA, and physical user-host acceptance remain separate validation steps.
