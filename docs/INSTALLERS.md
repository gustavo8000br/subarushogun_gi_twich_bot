# Download and use the installer

[Português brasileiro](pt-BR/INSTALADORES.md) · [Back to README](../README.md)

There is one directly openable installer artifact for each supported desktop operating system. The artifact embeds the product's Compose file; do not download separate setup, update, or uninstall scripts and do not clone the repository to use it.

## Download from GitHub Actions

1. Sign in to the private repository: [SubaruShogun Twitch Queue Bot](https://github.com/gustavo8000br/subarushogun_gi_twich_bot).
2. Open **Actions** → **CI** → choose the latest successful run on the `main` branch.
3. At the bottom of that run's summary, find **Artifacts** and download the artifact for your operating system:
   - `subarushogun-twitch-queue-bot-installer-windows`
   - `subarushogun-twitch-queue-bot-installer-macos`
   - `subarushogun-twitch-queue-bot-installer-linux`
4. Extract the downloaded artifact. It contains one installer file. Follow the matching platform steps below.

## Windows

1. Install and start Docker Desktop with Linux containers. If Docker is missing, the installer can open [Docker's official Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/) after you agree.
2. Open `subarushogun_twich_bot_installer.bat` by double-clicking it, or run it from Command Prompt/PowerShell. It works from a folder whose path contains spaces.
3. On a first install, choose a product language, then choose a port or press Enter for `3000`. Review the displayed HTTPS panel and Twitch callback addresses.
4. On an existing install, choose **Install / Start**. Keep current language/port or answer **No** to reconfigure them.
5. To update, choose **Update**. The default keeps your data. To erase queues, history, authorization, secrets, and the local certificate before a clean install, choose the erase option and type the exact confirmation displayed in your selected language.
6. To remove the product, choose **Uninstall**, then choose **Keep data** or **Erase all product data**. Docker Desktop, WSL, virtualization, and other shared Windows dependencies stay installed.

If Windows blocks the file, verify it came from the repository's CI artifact, then use Windows' file properties/security controls. Do not run a replacement script from an unrelated download.

## macOS

1. Install and open Docker Desktop for Mac. If Docker is missing, the installer can open [Docker's official Mac installation guide](https://docs.docker.com/desktop/setup/install/mac-install/) after you agree.
2. Open `subarushogun_twich_bot_installer.command` from Finder. If macOS blocks the downloaded file, verify its source and allow it through **System Settings → Privacy & Security**, or open Terminal in the extracted folder and run:

   ```sh
   chmod +x subarushogun_twich_bot_installer.command
   ./subarushogun_twich_bot_installer.command
   ```

3. Choose **Install / Start**, **Update**, or **Uninstall** from the menu. First install asks for language and port. Existing installs can keep or change their saved settings.
4. Update preserves data by default. Clean update and full uninstall erase product data only after you type the exact confirmation shown in the selected language. Docker Desktop and other shared host dependencies remain installed.

## Linux

1. Install Docker Engine and the Docker Compose v2 plugin. If Docker is missing, the installer can open [Docker's official Engine installation instructions](https://docs.docker.com/engine/install/) after you agree.
2. In a terminal, change to the folder containing the extracted artifact. If the download removed the executable permission, run:

   ```sh
   chmod +x subarushogun_twich_bot_installer.sh
   ./subarushogun_twich_bot_installer.sh
   ```

3. Choose **Install / Start**, **Update**, or **Uninstall**. The menu asks for language/port on first install and prints the exact HTTPS callback URL.
4. Normal update preserves data. Clean update or data-erasing uninstall requires the exact localized confirmation. Docker Engine and other shared host packages remain installed.

## Menu choices and data

| Choice | Result |
| --- | --- |
| **Install / Start** | Creates or starts the local app. Existing installations can keep or change language/port. |
| **Update → Keep data** | Pulls the selected image and updates the app while preserving database/secrets volumes and current settings. |
| **Update → Erase data and install cleanly** | Downloads the image first; after confirmation, removes this product's volumes and local certificate, then asks for language/port again. |
| **Uninstall → Keep data** | Stops/removes this product's containers and Compose file while retaining its volumes, saved settings, and local certificate. |
| **Uninstall → Erase all product data** | After confirmation, removes this product's containers, volumes, settings, secrets, and local certificate. |

Cancel a confirmation by entering anything other than the word shown. The installer never removes Docker Engine/Desktop, WSL, virtualization features, system packages, or the downloaded installer file. Remove host dependencies manually through their official vendor instructions if you want to uninstall them.

## Where the installer files live in this repository

These are developer source files; users should download the single packaged artifact from Actions:

| Platform artifact | Source | Packager/workflow |
| --- | --- | --- |
| `subarushogun_twich_bot_installer.bat` | `apps/infra/installer/installer.ps1` | `apps/infra/scripts/package-installer.mjs` and `.github/workflows/ci.yml` |
| `subarushogun_twich_bot_installer.command` | `apps/infra/installer/installer.sh` | `apps/infra/scripts/package-installer.mjs` and `.github/workflows/ci.yml` |
| `subarushogun_twich_bot_installer.sh` | `apps/infra/installer/installer.sh` | `apps/infra/scripts/package-installer.mjs` and `.github/workflows/ci.yml` |

The workflow tests and uploads one artifact per native runner. Its Actions artifact is a test/download package, not a product release.
