# Windows validation kit (owner run) — beta launch, features 28 to 30

[Português brasileiro](../../pt-BR/stories/OPS-15/windows-validation-kit.md)

**Prepared 2026-11-10 (cycle C1, LA-24).** Nobody has run this on Windows yet: **no Windows result is claimed.** You run it; the filled table is what turns features 28, 29 and 30 of [the ledger](../../process/open-acceptance-criteria-2026-11-10.md) from N to Y. Base: [Windows plan and checklist](windows-native-plan.md).

## 0. Before you start

**You need:** Windows 10 or 11 (64-bit), Docker Desktop running with the WSL 2 backend, OBS Studio, a browser, and a Twitch **test** channel (never your main channel for the first run). A clean user profile or a disposable machine is best.

**Safety warnings (read first):**
- **Never paste or screenshot** a Twitch token, client secret, stream key, the widget link, a UID, or private chat text. Blur or crop them. The widget link has a secret in it.
- Section 4 erases data on purpose. Do it only on this test installation.
- Do not run `npm run dev:stop` without `--keep-data` unless the step says so: it deletes the disposable dev database.

**Open PowerShell** (Start, type `PowerShell`). Every command below goes there. Create a folder for your evidence, for example `C:\Evidence`, and save outputs there with `| Tee-Object C:\Evidence\name.txt`.

### Step 0.1: record the environment (capture)

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture | Tee-Object C:\Evidence\00-windows.txt
docker version --format "{{.Server.Version}}" | Tee-Object -Append C:\Evidence\00-windows.txt
docker compose version | Tee-Object -Append C:\Evidence\00-windows.txt
docker info --format "{{.Architecture}} {{.OperatingSystem}}" | Tee-Object -Append C:\Evidence\00-windows.txt
wsl --status | Tee-Object -Append C:\Evidence\00-windows.txt
```

Also write down the OBS version (OBS, menu Help, About) and, if you can, the browser (CEF) version shown in the OBS log.

### Step 0.2: get the installer and check it

Download `subarushogun_twich_bot_setup.bat` from the release (or the `beta-windows-installer-<sha>` artifact of the Main CD run) into `C:\Evidence\installer`. Then:

```powershell
Get-FileHash C:\Evidence\installer\subarushogun_twich_bot_setup.bat -Algorithm SHA256 | Tee-Object C:\Evidence\01-hash.txt
```

If your installer is the owner-only test build (draft `test-windows-<run_id>`), it asks for the test password in its own window: see `windows-owner-test-installer.md`.

Compare the hash with the one on the release page when there is one. Write down whether Windows SmartScreen or your antivirus warned you (screenshot).

## 1. Install (OWN-01, feature 28)

1. Double-click the `.bat` (or run it in PowerShell: `& C:\Evidence\installer\subarushogun_twich_bot_setup.bat`). A black window opens.
2. Choose the language (1 Português, 2 English, 3 Español), then `1) Install / Start`, then the port (Enter keeps 3000). Try one port that is busy on purpose (for example start something on it) and confirm the installer asks for another instead of changing it.
3. The window prints the exact Twitch callback URL `https://localhost:<port>/callback` and the installer version. **Capture a screenshot of the whole window.**
4. When it says the panel is ready, your browser opens `https://localhost:<port>`. A certificate warning is expected on the first run (see the installation guide to trust the local certificate).
5. Check the health and the product resources:

```powershell
curl.exe --insecure --silent https://localhost:3000/health | Tee-Object C:\Evidence\02-health.txt
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | Tee-Object C:\Evidence\02-ps.txt
docker volume ls --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object C:\Evidence\02-volumes.txt
Get-Content "$env:LOCALAPPDATA\SubaruShogun\subarushogun-gi-twitch-bot\.env" | Select-String "APP_PORT|IMAGE_TAG|PRODUCT_INITIAL_LOCALE" | Tee-Object C:\Evidence\02-env.txt
```

(Use your port instead of 3000.) **PASS** when: health says `ok`, the panel opens in the chosen language, there are 2 containers (bot and database), 2 volumes (`postgres_data`, `operational_secrets`) and `.env` shows your port and language.

Unattended variant (optional): `& .\subarushogun_twich_bot_setup.bat --silent install --locale en --port 3100` must end with exit code 0: `$LASTEXITCODE`.

## 2. Update in place (OWN-02, feature 28)

1. In the panel create a manual queue and one entry (so there is data to lose).
2. Save the volume list again (`docker volume ls ...` into `03-before-update.txt`).
3. Run the **newer** installer (the older one stays installed from step 1; if you only have one version, run the same file again), choose `2) Update`, then `1) Keep data and update`.
4. **PASS** when: the window ends with "Update complete" (database, secrets and settings preserved), the panel URL is unchanged, the queue and entry are still there, the volume list is identical, and `docker ps` shows the new image tag. Save `03-after-update.txt`.

## 3. Uninstall keeping data, then reinstall (OWN-03, feature 28)

1. Run the installer, `3) Uninstall`, option `1` (remove containers, networks and exclusive images; keep data/volumes).
2. It must end with "volumes and data preserved". Check that containers are gone but volumes remain:

```powershell
docker ps --all --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object C:\Evidence\04-after-keep.txt
docker volume ls --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object -Append C:\Evidence\04-after-keep.txt
```

3. Run the installer again (`1) Install / Start`). **PASS** when the queue and entry created in step 2 come back and Docker Desktop itself is untouched (the message says Docker stays installed).

## 4. Uninstall erasing data (OWN-04, feature 28)

1. Before: start any unrelated container (`docker run -d --name other-check alpine sleep 600`) so you can prove other projects are untouched.
2. Run the installer, `3) Uninstall`, option `2`, and type the confirmation word (`APAGAR` in Portuguese, `DELETE` in English, `ELIMINAR` in Spanish). A wrong word must cancel.
3. Check: containers, network and the two volumes of the product are gone, the folder `%LOCALAPPDATA%\SubaruShogun\subarushogun-gi-twitch-bot` is gone, `other-check` is still running:

```powershell
docker ps --all --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object C:\Evidence\05-after-erase.txt
docker volume ls --filter label=com.docker.compose.project=subarushogun-gi-twitch-queue-bot | Tee-Object -Append C:\Evidence\05-after-erase.txt
Test-Path "$env:LOCALAPPDATA\SubaruShogun\subarushogun-gi-twitch-bot" | Tee-Object -Append C:\Evidence\05-after-erase.txt
docker ps --filter name=other-check | Tee-Object -Append C:\Evidence\05-after-erase.txt
docker rm -f other-check
```

**PASS** when the product lists are empty, `Test-Path` says `False` and `other-check` was running. Then install again (step 1) for the next sections.

## 5. Panel, persistence and Twitch test channel (LB-02, feature 29)

1. **Panel smoke.** Open by direct URL and refresh each: `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings`. Switch the language and refresh: it must persist. Create a manual queue, add, call and complete an entry. (Screenshots: one per page is enough.)
2. **Persistence.** Restart Windows (or restart Docker Desktop). Wait for Docker to be ready, then check `https://localhost:<port>/health` and that the queue and entries are still there.
3. **Twitch test channel.** Open `/connection`, connect the **test** channel through the Twitch authorization (the callback URL is the one shown by the installer, and it must be registered in your Twitch application). Create a queue and a reward, redeem the reward once from the test channel, call and complete it. Screenshot the connected state and the queue without any token, UID or chat text; redact first.
4. **PASS** when the panel pages open, data survives the restart, the connection shows as connected, the reward appears, and the redemption goes through call and completion.

## 6. OBS Browser Source on Windows (LB-04, feature 30)

1. In the panel, `/widgets`: create or open the widget and copy its link (do not share it).
2. OBS, Sources, `+`, Browser, paste the link; width 1920, height 1080 (or the size your scene uses). Keep "Shutdown source when not visible" off for the first test.
3. Check: transparent background over a video source, the queue updates within about 2 seconds after you add or call an entry, resize the source (it must re-fit), hide and show the source or press "Refresh cache of current page" (it must recover), and add a **second** Browser Source with the same link (both update).
4. **Capture:** OBS version, the OBS log line with the browser (CEF) version, and one screenshot of the scene with the widget (link hidden).
5. **PASS** when all five checks above are true.

## 7. Developer path (OWN-05 and OWN-06, optional, outside the beta formula)

Needs Node.js 24.20.0, Git for Windows (OpenSSL) and Docker Desktop. In a clone of the repository:

```powershell
node --version
npm ci
npm run dev
```

**OWN-05 PASS** when the panel opens, and Ctrl+C leaves no stray `node.exe` (`Get-Process node` is empty afterwards).
**OWN-06:** `npm run dev:start` then `npm run dev:stop -- --keep-data` must start in the background and stop cleanly with the dev database volume kept. (Plain `npm run dev:stop` deletes the disposable dev database: use it only if you want that.)

## 8. Result table (fill in and send back)

Write PASS or FAIL for each row, the date, and the evidence file. Save it as `C:\Evidence\result.md` and give it (without secrets) to Orion in the session, together with the evidence files; `@devops` records it in the story and the ledger (never as an issue comment).

| ID | What | Feature | PASS / FAIL | Evidence (file or screenshot) | Notes |
| --- | --- | --- | --- | --- | --- |
| OWN-01 | Fresh install, language, port, callback, health | 28 | | `00` to `02` | |
| OWN-02 | Update in place keeps data | 28 | | `03-*` | |
| OWN-03 | Uninstall keep data, reinstall brings data back | 28 | | `04-*` | |
| OWN-04 | Uninstall erase data, other Docker projects untouched | 28 | | `05-*` | |
| LB-02-a | Panel pages by URL and refresh, language persists | 29 | | screenshots | |
| LB-02-b | Persistence after restart | 29 | | health + screenshot | |
| LB-02-c | Twitch test channel: connect, queue, reward, redemption | 29 | | screenshots (redacted) | |
| LB-04-a | OBS Browser Source: transparency, updates, resize, recovery | 30 | | OBS log + screenshot | |
| LB-04-b | Two sources at once | 30 | | screenshot | |
| OWN-05 | `npm ci` and `npm run dev`, Ctrl+C leaves no `node.exe` (optional) | none | | output | |
| OWN-06 | `dev:start` and `dev:stop -- --keep-data` (optional) | none | | output | |

Environment (fill in): Windows build ____ ; Docker Desktop ____ ; OBS ____ ; CEF ____ ; installer version ____ ; SHA-256 ____ .

## 9. How the result becomes credit

- **Feature 28** counts when OWN-01 to OWN-04 are all PASS (LB-01).
- **Feature 29** counts when LB-02-a, -b and -c are all PASS (LB-02).
- **Feature 30** counts when LB-04-a and -b are PASS (LB-04).
- Any FAIL reopens the matching OPS-15 criterion; send the evidence file and the exact message on screen. OWN-05 and OWN-06 are not part of the 80% formula.

## 10. Automatic script (added 2026-11-10)

`apps/infra/scripts/windows/Validar-SubaruShogun.ps1` (PowerShell 5.1, UTF-8 BOM, CRLF; ready-to-copy folder `.local/windows-test/`) runs the prerequisites (PRE-01..10; PRE-10 is informational: reports accent, space or apostrophe in the user path) and the steps **OWN-01, OWN-02, OWN-03, OWN-04, LB-02-a, LB-02-b, LB-02-c, LB-04-a, LB-04-b** (OWN-05, OWN-06 with `-Opcionais`), with the same IDs as this kit. Automatic parts: installer run, health, containers and volumes before and after, `other-check`; manual parts ask PASS/FAIL/SKIP. It asks S/N before install, update and uninstall, masks secrets, never reads `.env`, sends nothing to the internet, and writes `Documents\SubaruShogunTeste\Relatorio-SubaruShogun-<date>.md` and `.zip`. Flags: `-InstaladorPath`, `-Idioma`, `-WhatIf`, `-SemConfirmacao`, `-Parse`, `-Somente`, `-Opcionais`. Guide: `LEIA-ME-ROTEIRO.md` in the same folder. Syntax checked with the PowerShell parser (pwsh 7.4 in Docker) and a `-WhatIf` smoke run on Linux; **PowerShell 5.1 on Windows is not proven**: run `-Parse` first.

**C1c (2026-11-10):** o instalador foi corrigido para caminhos de usuario com acento, espaco ou apostrofo (`.env` gravado em UTF-8 sem BOM e lido com `-Encoding UTF8`; o `.bat` repassa o proprio caminho ao PowerShell pela variavel `QUEUEBOT_SELF`, em vez do literal `'%~f0'`). O `.bat` da release `v0.3.0-0d0b595-beta` e anterior a correcao: neste teste use o `.bat` gerado do codigo que esta em `.local/windows-test/`. Provado ate aqui: testes de contrato e pwsh 7 no Docker; Windows PowerShell 5.1 e cmd.exe em perfil real com acento/apostrofo seguem nao provados.
