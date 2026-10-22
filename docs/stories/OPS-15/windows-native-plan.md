# OPS-15 — Native Windows plan and owner acceptance checklist

[Português brasileiro](../../pt-BR/stories/OPS-15/windows-native-plan.md)

**Status:** Planned and partly programmed on Ubuntu, 2026-10-21. **No Windows result is claimed here.** Windows end-user testing belongs to the owner and must pass before the owner accepts publishing the end-user beta release.

## What already exists (source-inspected, not re-run on Windows in this cycle)

| Area | Windows-aware behavior | Evidence |
|---|---|---|
| Product installer | `subarushogun_twich_bot_setup.bat` embeds `installer.ps1` as UTF-16LE Base64, so accented pt-BR/es text survives Windows PowerShell 5.1 | `apps/infra/scripts/package-installer.mjs`; CI job “Native windows installer smoke” (`windows-latest`, fake Docker) |
| TLS bootstrap | OpenSSL is located off `PATH` (Git for Windows `usr/bin`) on `win32` | `tests/unit/bootstrap-secret.test.js` |
| Dev launcher | `npm run dev` spawns `process.execPath` (no shell, no `.cmd` shims), pins Node 24.20.0, checks Docker Compose/Engine, and accepts an explicit `DATABASE_URL` that skips Docker | `apps/frontend/scripts/dev-*.mjs`; new `tests/unit/windows-native-contract.test.js` |
| File modes | POSIX permission assertions are skipped on `win32` | existing unit tests |

## Programmed in this cycle

- `.gitattributes`: LF for text, CRLF for `.bat`/`.cmd` and `*.ps1 eol=crlf` for PowerShell scripts (owner decision; without `text`, so `text=auto` does not renormalize files already stored with CRLF), so a Windows clone with `core.autocrlf=true` cannot corrupt shell scripts, YAML, SQL migrations (Prisma checksums) or Dockerfile.
- `tests/unit/windows-native-contract.test.js` (5 tests, passing on Linux): Windows-style checkout path → valid Compose project name; actionable Docker Desktop message; `DATABASE_URL` skips Docker; line-ending policy.

## Known risks and planned work (not yet done)

1. **Compose project name collision.** `getDevelopmentComposeProject` keeps only the last 28 characters of the checkout path, so two checkouts with the same tail (for example `/home/a/queue-bot` and `/srv/b/queue-bot`, on any operating system) share one dev project/volume. **Resolved (owner-approved 2026-10-21):** the default name is unchanged, so existing development databases stay linked; an opt-in `DEV_COMPOSE_PROJECT` override (lowercase letters, digits, `-`, `_`; 1–63 characters) now separates such checkouts. Tests in `tests/unit/windows-native-contract.test.js`.
2. **Secret file protection.** `0o600/0o400` modes are not enforced by NTFS; Windows relies on the user profile ACL. Planned: document it, and consider `icacls` hardening for `.local/dev-db/password` and the TLS key.
3. **Ctrl+C on Windows.** `child.kill('SIGINT')` terminates the Next and Fastify children abruptly (no graceful drain). Acceptable for development; verify no orphan `node.exe` remains.
4. **CI.** A `windows-latest` job running `npm ci`, lint, typecheck and `tests/unit` is deferred by owner decision (2026-10-21) until after the panel migration; `@devops` adds it when the beta release is being prepared.
5. **Real Docker installer run.** Fresh install, update in place, uninstall and data preservation against real Docker Desktop on Windows remain unproven (the CI smoke uses a fake Docker).
6. **OBS Browser Source on Windows** (OBS/CEF versions, transparency, resize/reload, multiple sources).

## Owner acceptance checklist (run before accepting the beta release)

Environment: Windows 10/11 64-bit, Docker Desktop with WSL 2 backend running, a clean user profile or a disposable Windows machine/VM, the exact beta installer produced by the release workflow. Record Windows build, Docker Desktop version, OBS version, installer version.

- [ ] **Fresh install.** Run `subarushogun_twich_bot_setup.bat`; SmartScreen/antivirus behavior noted; choose language and port; panel opens at `https://localhost:<port>`; health is `ok`; no Twitch data is required.
- [ ] **Certificate.** Importing the generated CA (per the installation guide) removes the browser warning; callback URL `https://localhost:<port>/callback` is reachable.
- [ ] **Panel smoke.** `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings` open by direct URL and by refresh; language switch persists; create a manual queue and add/call/complete an entry.
- [ ] **Persistence.** Reboot Windows (or restart Docker Desktop); the product starts again with the same queue and data.
- [ ] **Update in place.** Run the installer's Update with a newer image: data and secrets preserved, panel URL unchanged.
- [ ] **Uninstall.** Run Uninstall choosing keep-data, reinstall and confirm data returns; then uninstall removing data and confirm containers, network and volumes of the product are gone while other Docker projects are untouched.
- [ ] **OBS overlay.** Add the overlay URL as a Browser Source in Windows OBS; transparent background, polling updates within about 2 seconds, resize/reload recovery, two sources at once.
- [ ] **Twitch.** With a test channel: OAuth connect, reward creation/pending state, one real redemption through call and completion (only if you accept using a real account).
- [ ] **Developer path (optional).** `npm ci`, `npm run dev` on Node 24.20.0 with Git for Windows OpenSSL; Ctrl+C leaves no stray `node.exe`.

Mark each item Pass/Fail with notes; any Fail blocks release acceptance and reopens the corresponding OPS-15 criterion.
