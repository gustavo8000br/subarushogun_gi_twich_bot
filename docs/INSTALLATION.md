# Installation guide

[Leia em português brasileiro](pt-BR/INSTALACAO.md) · [Back to README](../README.md)

This guide covers host requirements, first startup, local HTTPS trust, and Twitch setup. For a quick per-platform download and menu walkthrough, see [Download and use the installer](INSTALLERS.md). For queue and panel use, see the [user guide](USER_GUIDE-en_US.md).

## Requirements

- A 64-bit computer running Docker Engine or Docker Desktop in Linux-container mode, with the Docker Compose v2 plugin (`docker compose`) and permission to run Docker commands.
- A supported 64-bit `amd64`/`x86_64` or `arm64`/`aarch64` host architecture. The published application image currently targets Linux `amd64` and `arm64`.
- A current browser on the same computer that can trust a local certificate authority.
- Internet access for GHCR image pulls and Twitch connectivity.
- The source repository is public. The GHCR image package is separately permissioned and was still private on 2026-10-07; until its visibility changes, image pulls require a GitHub account authorized to read the package and a classic token with `read:packages`. Never put the token in project files. A public source repository alone does not grant access to a private image.
- Node.js, PostgreSQL, Git, and a compiler are not needed on the host to run the Compose app. Node.js `24.20.0` runs in the container and is required only for development.

### Host platforms

- **Ubuntu/Linux:** Ubuntu 24.04 LTS x86-64 with Docker Engine and Compose v2 is the validated Linux setup. Other distributions need a compatible shell and Docker installation and have not all been tested.
- **Windows:** Docker Desktop with the WSL 2 backend and Linux containers. Check [Docker's current Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) before installing; Windows Server is not supported by Docker Desktop.
- **macOS:** Docker Desktop for Mac with Linux containers. Host behavior has not been validated by this project.

### Approximate hardware estimates

These are **approximate estimates for the current alpha**, not guaranteed minimums. Actual use depends on product version, operating system, queue history, logs, and other applications. Requirements may change between versions and will be reviewed as usage is measured. A normal installation pulls a prebuilt image; users do not build the application image locally.

- CPU: about 2 logical cores available to Docker for normal operation.
- Memory: about 4 GB available to Docker; 8 GB system RAM is a practical target. Docker Desktop for Mac itself requires at least 4 GB RAM.
- Disk: about 10 GB free for downloaded images, database/secrets volumes, logs, and updates.
- No dedicated GPU is required.

Local image builds are only needed for development and can require additional CPU, memory, and disk for build cache; see the [development guide](DEVELOPMENT.md).

Windows figures also reflect Docker Desktop prerequisites. Check the current [Windows guide](https://docs.docker.com/desktop/setup/install/windows-install/), [Ubuntu Engine instructions](https://docs.docker.com/engine/install/ubuntu/), [Linux post-install guide](https://docs.docker.com/engine/install/linux-postinstall/), or [Compose plugin instructions](https://docs.docker.com/compose/install/linux/) for platform requirements.

## First startup

OPS-5 provides **one unified installer file per operating system**. Each file opens a menu for **Install / Start**, **Update**, or **Uninstall**; there are no separate updater or uninstaller downloads. When available, download the platform file from the public [GitHub Releases page](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases). Each release contains one installer for Windows, macOS, and Linux, with user-facing notes in English and pt-BR taken from the matching sections of both public changelogs. No public product release is available yet: the first canonical beta is planned after FND-9 and its acceptance gates. CI artifacts are temporary engineering/QA builds, not the end-user download path. The installer includes its Compose configuration, so end users do not clone the source repository. The GHCR image package is still private; it must be made public before the planned post-FND-9 Twitch streamer test. On Linux, run the downloaded `.sh` file from its saved location as shown under [Ubuntu/Linux](#ubuntulinux).

The first launch asks for the product language (pt-BR, English, or Spanish) and host port (3000 by default), then shows the exact panel and Twitch callback addresses. The product language can later be changed in the panel. If port 3000 is occupied, choose another port; the installer never changes it silently.

If Docker/Compose is unavailable, the installer asks before opening the official vendor instructions for your system. Install Docker yourself, accept its terms, enable WSL/virtualization, restart if required, and reopen the installer. It does not elevate privileges or alter system virtualization automatically.

### Windows

1. Install and start Docker Desktop with Linux containers. Its WSL 2 backend requires Windows prerequisites; use the current [official Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/). Docker Desktop is not supported on Windows Server.
   In PowerShell, `wsl --version` reports the installed WSL version. If WSL is missing or needs an update, follow Microsoft's current WSL setup instructions and restart when Windows requests it.
2. The GHCR image package is currently private even though the source repository is public. Authenticate in PowerShell with an account authorized for that package:

   ```powershell
   docker login ghcr.io --username YOUR_GITHUB_USERNAME
   ```

   Enter a classic GitHub token with `read:packages` at the password prompt. Do not put it in a file. Skip this step once the package is public.
3. Open the downloaded release file `subarushogun_twich_bot_setup.bat` (double-click or run it from Command Prompt/PowerShell). Choose **Install / Start**, the language, and port. The file is self-contained and works from paths containing spaces.
4. The installer starts Compose, waits for health, and opens the panel. The public local CA is at `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt`. To trust it for the current Windows user:

   ```powershell
   Import-Certificate -FilePath (Join-Path $env:LOCALAPPDATA 'SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt') -CertStoreLocation Cert:\CurrentUser\Root
   ```

5. Open the panel URL printed by the installer. If you chose another port, use that port in the URL and register its exact `/callback` URL in Twitch.

### Ubuntu/Linux

1. Install Docker Engine and the Compose plugin. Ubuntu 24.04 LTS is the Linux environment validated by this project; see Docker's [supported Linux installation procedures](https://docs.docker.com/engine/install/).
2. The GHCR image package is currently private although this repository is public. Run `docker login ghcr.io --username YOUR_GITHUB_USERNAME` with an account authorized for the package and enter a classic GitHub token with `read:packages`. Never store the token with the installer or in `.env`. Skip this step once the package is public.
3. Download `subarushogun_twich_bot_setup.sh` from the release page. If you saved it in `Downloads`, open a terminal and run:

   ```sh
   sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"
   ```

   Replace the path if you saved it elsewhere. This works even without executable permission. For later launches, run `chmod +x subarushogun_twich_bot_setup.sh` once and then `./subarushogun_twich_bot_setup.sh`. A graphical launcher without an interactive terminal receives a clear exit message.
4. Trust the local CA generated under `$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt`:

   ```sh
   sudo install -Dm644 "$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt" /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

5. Open the panel URL printed by the installer. The displayed callback matches the selected port.

### macOS

1. Install and open [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/). Docker supports the current and two previous major macOS releases and requires at least 4 GB RAM; check its current requirements before installing. This project's installer smoke test runs on a GitHub-hosted macOS runner; a physical Mac operator run is still separate acceptance.
2. The GHCR image package is currently private although this repository is public. Authenticate with `docker login ghcr.io --username YOUR_GITHUB_USERNAME` using an account authorized for the package and a classic GitHub token with `read:packages`. Skip this step once the package is public.
3. Open `subarushogun_twich_bot_setup.command` from the release download in Finder. If Gatekeeper blocks a downloaded unsigned command file, verify its source and use the macOS security prompt/Privacy & Security controls to allow it, or run it from Terminal with `chmod +x subarushogun_twich_bot_setup.command && ./subarushogun_twich_bot_setup.command`.
4. Trust the local CA at `~/Library/Application Support/SubaruShogun/subarushogun-gi-twitch-bot/.local/localhost-ca.crt` in Keychain Access. The CLI trust command is:

   ```sh
   security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db "$HOME/Library/Application Support/SubaruShogun/subarushogun-gi-twitch-bot/.local/localhost-ca.crt"
   ```

5. Open the panel and callback addresses printed by the installer.

## Connect the Twitch channel

1. Open the panel at `https://localhost:3000` and note the exact callback address, normally `https://localhost:3000/callback`.
2. In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), create a confidential app and register that exact HTTPS callback. Protocol, host, port, and path must match. Enable the Twitch account security requested by Twitch.
3. Enter Client ID and Client Secret in the local panel, validate/save, then select **Connect with Twitch** and approve the requested scopes. Secrets and tokens are not entered in `.env`, YAML, chat, issues, or screenshots.
4. Confirm the expected channel identity in the panel. Reward-backed queues require Affiliate/Partner eligibility and Channel Points. The panel explains ineligible status; see the [user guide](USER_GUIDE-en_US.md) for current product limits.

The local CA is private to this installation, not a public certificate authority. Its private key stays in the Docker secrets volume; only the public certificate is exported. If that volume is removed, bootstrap creates a new CA. On Windows, remove the old trust entry through `certmgr.msc` under **Trusted Root Certification Authorities > Certificates**.

## Advanced host port

Port `3000` is not changed automatically when occupied. Open the installer, choose **Install / Start**, and decline to keep the current settings when prompted. Select the product language and new port; the installer prints the matching panel and callback URLs. Register that exact callback with Twitch. For daily operation, updates, and uninstall choices, see the [user guide](USER_GUIDE-en_US.md).
