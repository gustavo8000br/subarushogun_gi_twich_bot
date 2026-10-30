# Handoff — Windows Claude Code session

[Português brasileiro](../pt-BR/handoffs/windows-session-handoff.md)

**Purpose:** exclusive handoff for the future Claude Code session the owner will run on **Windows** (announced 2026-10-27) so cross-platform checks can be automated. Orion (`@aiox-master`) keeps this file updated whenever the plan, scripts or results change. The macOS session has its own file: `macos-session-handoff.md`. Last update: 2026-10-27.

## Golden rules
1. **Activate Orion first** and read `AGENTS.md`, `CLAUDE.md`, `docs/session-handoff.md` (+ pt-BR) and this file. Same roles: `@dev` implements test-first, `@qa` validates independently, `@devops` commits; push, PR, tag, version bump and release need the owner's express OK.
2. **Never claim a result you did not run on Windows.** Every report names the OS version, architecture, Node, Docker Desktop and how it was run. Ubuntu results do not transfer.
3. Work only inside the project directory; no secrets in logs or reports (tokens, widget links with `ref=`, passwords, connection strings).
4. The product is **beta with no active users**: structural changes are safe until rc/stable; no compatibility shims.
5. Use a disposable database and disposable Docker resources; check Compose project, labels and ownership before removing anything.
6. Orion never edits the Project #5 board; `@devops` syncs it after each event (owner moves win).

## State of the project (2026-10-27)
Branch `feat/ops-15-next-panel`; Node `24.20.0` (`.nvmrc`); Next.js panel + Fastify API + PostgreSQL (Compose). Validated only on **Ubuntu Linux** (165 files / 1,621 tests green, OpenGrep 0 findings, widget-link E2E in Chrome, real-Twitch battery partial). The vanilla panel is being cut over by waves (`docs/stories/OPS-15/cutover-plan.md`); branch `legacy` preserves it.

## Checklist (source: `docs/stories/OPS-15/windows-native-plan.md`; backlog OW-01…OW-04)
Turn each item into a scripted check where possible; keep manual items as owner steps with an evidence template.
- [ ] **Fresh install:** run `subarushogun_twich_bot_setup.bat`; note SmartScreen/antivirus; choose language and port; panel opens at `https://localhost:<port>`.
- [ ] **Certificate:** import the generated CA per the installation guide; the browser warning disappears; `https://localhost:<port>/callback` is reachable.
- [ ] **Panel smoke:** `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings` by direct URL and refresh; language switch persists; create a queue.
- [ ] **Persistence:** reboot or restart Docker Desktop; the same queue and data return.
- [ ] **Update in place:** installer Update with a newer image keeps data, secrets and URL.
- [ ] **Uninstall:** keep-data then reinstall returns data; remove-data removes only this project's containers, network and volumes.
- [ ] **OBS overlay:** Windows OBS Browser Source with the overlay URL; transparent background, live updates, resize/reload recovery, certificate trust (the Linux Flatpak `HOME` override does not apply).
- [ ] **Twitch (owner channel, with owner OK):** OAuth, reward create, one real redemption through call and completion, queue deletion with no pending operations (see OPS-22).
- [ ] **Developer path:** `npm ci`, `npm run dev` / `dev:start` / `dev:stop` on Node 24.20.0 with Git for Windows OpenSSL; Ctrl+C leaves no stray `node.exe`.
- [ ] **Windows contract tests:** `tests/unit/windows-native-contract.test.js` (path → Compose project name, Docker Desktop guidance, `DATABASE_URL` skips Docker, `.gitattributes` LF except `.bat`/`.cmd` CRLF); NTFS secret protection; abrupt Ctrl+C.

## How to run and report
1. Update the branch, install Node 24.20.0, `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:ide:check`.
2. Run the checklist with scripts in `.local/platform-checks/` (ignored by git), with one evidence file per item.
3. Report through `@qa`: `docs/stories/OPS-15/qa-gate-<date>-windows.md` (+ pt-BR) with platform (OS, version, architecture), versions, commands, results, not-run items, cleanup and READY/NOT ready.
4. Propose a CI job to `@devops` only with the owner's OK (CD already builds the Windows installer in `.github/workflows/main-cd.yml`).

## Open questions for the owner
- Windows and Docker Desktop versions to target; whether a real Twitch redemption is allowed on this host; whether the OBS test is manual or scripted.

## Change log
- 2026-10-27 — Created by Orion from the owner's announcement (Windows) and request (macOS).
