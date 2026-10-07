# Download and use the installer

[Português brasileiro](pt-BR/INSTALADORES.md) · [Back to README](../README.md)

The project provides one unified installer file per supported operating system. It offers **Install / Start**, **Update**, and **Uninstall** in one menu. You do not need to clone the source repository. A release installer installs and updates to the GHCR image matching its release identity; the `main` image remains the default for CI/development builds.

## Download a release

Download the installer from the public [GitHub Releases page](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases). Choose the release for the version you want, read its notes, and download the single file for your system:

- Windows: `subarushogun_twich_bot_setup.bat`
- macOS: `subarushogun_twich_bot_setup.command`
- Linux: `subarushogun_twich_bot_setup.sh`

Each release description contains the user-facing changes from the matching version sections in `CHANGELOG.md` and `docs/pt-BR/CHANGELOG.md`. The tag and title use the complete version identity. A tag-triggered workflow validates the tag against the source commit/version, builds and launches one installer on each native OS runner, then publishes the three installers and bilingual notes together. A normal branch push never creates a release.

**Release status:** there is no public product release yet. The first canonical beta, `v1.0.0-HHHHHHH-beta`, is planned after FND-9 and its acceptance gates. GitHub Actions artifacts are temporary engineering/QA builds, not the end-user download path.

**GHCR status:** the source repository is public, but its image package was still private on 2026-10-07 (anonymous pull returned HTTP 403). The package must be made public and an anonymous pull verified before the planned post-FND-9 Twitch streamer test. Until then, starting the app requires an account authorized to read the package and a classic GitHub token with `read:packages`; see the [installation guide](INSTALLATION.md). Once the package is public, no registry login is needed.

## Open the installer

### Windows

1. Install and start Docker Desktop with Linux containers.
2. Open the downloaded `.bat` file by double-clicking it or from Command Prompt/PowerShell. It supports paths containing spaces.
3. Choose **Install / Start**, **Update**, or **Uninstall**. On first install, choose the product language and port; the defaults are pt-BR and `3000`.

If Windows blocks the file, verify it came from the project's GitHub Releases page before allowing it through the file security controls.

### macOS

1. Install and start Docker Desktop for Mac.
2. Open the downloaded `.command` file in Finder. If macOS blocks it, verify its source and allow it through **System Settings → Privacy & Security**. You can also open Terminal in the download folder and run:

   ```sh
   chmod +x subarushogun_twich_bot_setup.command
   ./subarushogun_twich_bot_setup.command
   ```

3. Choose **Install / Start**, **Update**, or **Uninstall** from the menu.

### Linux

1. Install Docker Engine and the Docker Compose v2 plugin.
2. Open a terminal in the folder where you downloaded the `.sh` file. If it is in `Downloads`, run:

   ```sh
   sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"
   ```

   Replace the path if you saved it elsewhere. This works even when the download does not preserve executable permission. For later launches, use `chmod +x subarushogun_twich_bot_setup.sh` once, then `./subarushogun_twich_bot_setup.sh`.
3. Choose **Install / Start**, **Update**, or **Uninstall** from the menu.

## Data choices

| Menu choice | Result |
| --- | --- |
| **Install / Start** | Creates or starts the local app. Existing installations can keep or change language and port. |
| **Update → Keep data** | Updates the app while preserving database/secrets volumes and settings. |
| **Update → Erase data and install cleanly** | Requires a typed confirmation, then removes this product's data and starts a clean setup. |
| **Uninstall → Keep data** | Removes this product's containers and Compose files but keeps its volumes, settings, and local certificate. |
| **Uninstall → Erase all product data** | Requires a typed confirmation, then removes this product's containers, volumes, settings, secrets, and local certificate. |

The installer does not remove Docker, WSL, virtualization, system packages, or other shared host dependencies. Remove those manually through their vendors if desired. Do not use `docker compose down -v` as a normal stop or update command; it deletes saved data.

For certificate trust, Twitch setup, and full requirements, see the [installation guide](INSTALLATION.md). For daily use, see the [user guide](USER_GUIDE-en_US.md).
