# Installation guide

[Leia em português brasileiro](pt-BR/INSTALACAO.md) · [Back to README](../README.md)

This guide covers host requirements, first startup, local HTTPS trust, and Twitch setup. For a quick per-platform download and menu walkthrough, see [Download and use the installer](INSTALLERS.md). For queue and panel use, see the [user guide](USER_GUIDE-en_US.md).

## Requirements

- A 64-bit computer running Docker Engine or Docker Desktop in Linux-container mode, with the Docker Compose v2 plugin (`docker compose`) and permission to run Docker commands.
- A current browser on the same computer that can trust a local certificate authority.
- Internet access for GHCR image pulls and Twitch connectivity.
- During this private pre-release, access to the source repository and the GHCR package. If the package is private, authenticate once with a GitHub classic token granting `read:packages`; never put the token in project files.
- Node.js, PostgreSQL, Git, and a compiler are not needed on the host to run the Compose app. Node.js `24.20.0` runs in the container and is required only for development.

### Host platforms

- **Ubuntu/Linux:** Ubuntu 24.04 LTS x86-64 with Docker Engine and Compose v2 is the validated Linux setup. Other distributions need a compatible shell and Docker installation and have not all been tested.
- **Windows:** Docker Desktop with the WSL 2 backend and Linux containers. Check [Docker's current Windows requirements](https://docs.docker.com/desktop/setup/install/windows-install/) before installing; Windows Server is not supported by Docker Desktop.
- **macOS:** Docker Desktop for Mac with Linux containers. Host behavior has not been validated by this project.

### Approximate hardware estimates

These are **approximate estimates for the current alpha**, not guaranteed minimums. Actual use depends on product version, image rebuilds, operating system, queue history, logs, and other applications. Requirements may change between versions and will be reviewed as usage is measured.

- CPU: about 2 logical cores available to Docker; 4 are more comfortable during the first image build.
- Memory: about 4 GB available to Docker for the app and first build; 8 GB system RAM is a practical target.
- Disk: about 10 GB free before first build for images, build cache, and initial data volumes.
- No dedicated GPU is required.

Windows figures also reflect Docker Desktop prerequisites. Check the current [Windows guide](https://docs.docker.com/desktop/setup/install/windows-install/), [Ubuntu Engine instructions](https://docs.docker.com/engine/install/ubuntu/), [Linux post-install guide](https://docs.docker.com/engine/install/linux-postinstall/), or [Compose plugin instructions](https://docs.docker.com/compose/install/linux/) for platform requirements.

## First startup

The installer is a single directly openable file for each system: `.bat` on Windows, `.command` on macOS, and `.sh` on Linux. Download the matching file from the latest successful [CI workflow run](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/actions/workflows/ci.yml). The repository is private during pre-release, so you need repository access to download its artifact. The installer contains its Compose configuration; do not clone the repository.

The first launch asks for the product language (pt-BR, English, or Spanish) and host port (3000 by default), then shows the exact panel and Twitch callback addresses. The product language can later be changed in the panel. If port 3000 is occupied, choose another port; the installer never changes it silently.

If Docker/Compose is unavailable, the installer asks before opening the official vendor instructions for your system. Install Docker yourself, accept its terms, enable WSL/virtualization, restart if required, and reopen the installer. It does not elevate privileges or alter system virtualization automatically.

### Windows

1. Install and start Docker Desktop with Linux containers. Its WSL 2 backend requires Windows prerequisites; use the current [official Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/). Docker Desktop is not supported on Windows Server.
   In PowerShell, `wsl --version` reports the installed WSL version. If WSL is missing or needs an update, follow Microsoft's current WSL setup instructions and restart when Windows requests it.
2. While the GHCR package is private, authenticate once in PowerShell if needed:

   ```powershell
   docker login ghcr.io --username YOUR_GITHUB_USERNAME
   ```

   Enter a GitHub token with `read:packages` at the password prompt. Do not put it in a file. This step goes away when the package becomes public.
3. Open the downloaded `subarushogun_twich_bot_installer.bat` file (double-click or run it from Command Prompt/PowerShell). Choose **Install / Start**, the language, and port. The artifact is self-contained and works from paths containing spaces.
4. The installer starts Compose, waits for health, and opens the panel. The public local CA is at `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt`. To trust it for the current Windows user:

   ```powershell
   Import-Certificate -FilePath (Join-Path $env:LOCALAPPDATA 'SubaruShogun\subarushogun-gi-twitch-bot\.local\localhost-ca.crt') -CertStoreLocation Cert:\CurrentUser\Root
   ```

5. Open the panel URL printed by the installer. If you chose another port, use that port in the URL and register its exact `/callback` URL in Twitch.

### Ubuntu/Linux

1. Install Docker Engine and the Compose plugin. Ubuntu 24.04 LTS is the Linux environment validated by this project; see Docker's [supported Linux installation procedures](https://docs.docker.com/engine/install/).
2. While GHCR is private, run `docker login ghcr.io --username YOUR_GITHUB_USERNAME` and enter a GitHub token with `read:packages`. Never store the token with the installer or in `.env`.
3. Download and open `subarushogun_twich_bot_installer.sh`. If the executable bit was not preserved by your download tool, run `chmod +x subarushogun_twich_bot_installer.sh` once, then `./subarushogun_twich_bot_installer.sh`.
4. Trust the local CA generated under `$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt`:

   ```sh
   sudo install -Dm644 "$HOME/.local/share/subarushogun-gi-twitch-bot/.local/localhost-ca.crt" /usr/local/share/ca-certificates/queuebot-localhost-ca.crt
   sudo update-ca-certificates
   ```

5. Open the panel URL printed by the installer. The displayed callback matches the selected port.

### macOS

1. Install and open [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/). Docker supports the current and two previous major macOS releases and requires at least 4 GB RAM; check its current requirements before installing. This project's installer smoke test runs on a GitHub-hosted macOS runner; a physical Mac operator run is still separate acceptance.
2. While GHCR is private, authenticate with `docker login ghcr.io --username YOUR_GITHUB_USERNAME` and a GitHub token with `read:packages`.
3. Open `subarushogun_twich_bot_installer.command` from Finder. If Gatekeeper blocks a downloaded unsigned command file, use the macOS security prompt/Privacy & Security controls to allow the file, or run it from Terminal with `chmod +x subarushogun_twich_bot_installer.command && ./subarushogun_twich_bot_installer.command`.
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
