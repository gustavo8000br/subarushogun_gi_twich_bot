# Download and use the installer

[Português brasileiro](pt-BR/INSTALADORES.md) · [Back to README](../README.md)

The project provides one unified installer file per supported operating system. It offers **Install / Start**, **Update**, and **Uninstall** in one menu. You do not need to clone the source repository. A release installer installs and updates to the GHCR image matching its release identity; the `main` image remains the default for CI/development builds.

## Download a release

Download the installer from the public [GitHub Releases page](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/releases). Choose the release for the version you want, read its notes, and download the single file for your system:

- Windows: `subarushogun_twich_bot_setup.bat`
- macOS: `subarushogun_twich_bot_setup.command`
- Linux: `subarushogun_twich_bot_setup.sh`

Each release description contains the user-facing changes from the matching version sections in `CHANGELOG-<stage>.md` and `docs/pt-BR/CHANGELOG-<stage>.md`. The tag and title use the complete version identity. Only the repository owner can manually run the release workflow for an existing version tag; it validates the tag against the source commit/version, builds and launches one installer on each native OS runner, then publishes the three installers and bilingual notes as a prerelease. A normal branch push never creates a release.

**Release status:** there is no public product release yet. Beta timing is not scheduled. FND-1's native Windows retest, FND-9's full acceptance, DOC-2, DOC-3, further owner-prioritized changes, and their release gates remain in the pre-release plan; only the owner can explicitly approve beta readiness. `v1.0.0-HHHHHHH-beta` is a candidate identity, not a scheduled release. GitHub Actions artifacts are temporary engineering/QA builds, not the end-user download path.

**GHCR status:** the source repository is public. The image package visibility must be set to public in the package's GitHub settings, then an anonymous pull verified before public distribution. Until anonymous pull succeeds, starting the app requires an account authorized to read the package and a classic GitHub token with `read:packages`; see the [installation guide](INSTALLATION.md). Once public access is verified, no registry login is needed.

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
| **Uninstall → Keep data** | Removes this project's containers/networks, unused product images, and embedded Compose file; keeps volumes, settings, and local certificate. Images still used elsewhere remain. |
| **Uninstall → Erase all product data** | Requires a typed confirmation, then removes this project's containers/networks, unused images, volumes, settings, secrets, and local certificate. |

## Unattended commands

The installer accepts command-line actions for scripts and managed deployments. “Silent” means **no interactive questions**; it still prints localized progress, failures, and the panel URL, and does not open a browser. An unattended install defaults to pt-BR and port `3000` unless you pass `--locale` and `--port`. Updates keep data by default. Uninstall also keeps data by default. Erasing product data always requires both `--erase-data` and `--confirm-erase`; no generic `--yes` switch bypasses this safeguard.

```sh
# Linux
sh ./subarushogun_twich_bot_setup.sh --silent install --locale pt-BR --port 3000
sh ./subarushogun_twich_bot_setup.sh --silent update
sh ./subarushogun_twich_bot_setup.sh --silent uninstall --keep-data
sh ./subarushogun_twich_bot_setup.sh --silent uninstall --erase-data --confirm-erase

# macOS
./subarushogun_twich_bot_setup.command --silent install --locale en --port 3000
./subarushogun_twich_bot_setup.command --silent update

# Windows PowerShell or Command Prompt
.\subarushogun_twich_bot_setup.bat --silent install --locale en --port 3000
.\subarushogun_twich_bot_setup.bat --silent update
```

For a clean update, use `--silent update --erase-data --confirm-erase`. The confirmation flags must be explicit; invalid or contradictory options exit before changing Docker resources. `--help` lists the supported syntax.

Uninstall removes this Compose project's containers and networks, plus product images that no remaining container uses. An image shared by another container is retained. **Keep data** verifies that project volumes remain; **Erase all product data** removes only project volumes after confirmation and verifies their removal. If cleanup cannot be verified, the installer reports an incomplete uninstall instead of success. A message that no managed installation was found means nothing was removed.

The installer does not remove Docker, WSL, virtualization, system packages, or other shared host dependencies. Remove those manually through their vendors if desired. Do not use `docker compose down -v` as a normal stop or update command; it deletes saved data.

For certificate trust, Twitch setup, and full requirements, see the [installation guide](INSTALLATION.md). For daily use, see the [user guide](USER_GUIDE-en_US.md).
