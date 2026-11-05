# Handoff — macOS Claude Code session

[Português brasileiro](../pt-BR/handoffs/macos-session-handoff.md)

**Purpose:** exclusive handoff for the future Claude Code session the owner will run on **macOS** (announced 2026-10-27) so cross-platform checks can be automated. Orion (`@aiox-master`) keeps this file updated whenever the plan, scripts or results change. The Windows session has its own file: `windows-session-handoff.md`. Last update: 2026-10-27.

## Golden rules
1. **Activate Orion first** and read `AGENTS.md`, `CLAUDE.md`, `docs/session-handoff.md` (+ pt-BR) and this file. Same roles: `@dev` implements test-first, `@qa` validates independently, `@devops` commits; push, PR, tag, version bump and release need the owner's express OK.
2. **Never claim a result you did not run on macOS.** Every report names the OS version, architecture, Node, Docker Desktop and how it was run. Ubuntu results do not transfer.
3. Work only inside the project directory; no secrets in logs or reports (tokens, widget links with `ref=`, passwords, connection strings).
4. The product is **beta with no active users**: structural changes are safe until rc/stable; no compatibility shims.
5. Use a disposable database and disposable Docker resources; check Compose project, labels and ownership before removing anything.
6. Orion never edits the Project #5 board; `@devops` syncs it after each event (owner moves win).

## State of the project (2026-10-27)
Branch `feat/ops-15-next-panel`; Node `24.20.0` (`.nvmrc`); Next.js panel + Fastify API + PostgreSQL (Compose). Validated only on **Ubuntu Linux** (165 files / 1,621 tests green, OpenGrep 0 findings, widget-link E2E in Chrome, real-Twitch battery partial). The vanilla panel is being cut over by waves (`docs/stories/OPS-15/cutover-plan.md`); branch `legacy` preserves it.

## Checklist (macOS has never been validated; every finding is a "first validation")
- [ ] **Installer lifecycle:** the macOS installer artifact is built by `.github/workflows/release.yml` (runner `macos-15`); fresh install, panel opens at `https://localhost:<port>`, language and port choice.
- [ ] **Certificate:** trust the generated CA through Keychain; browser warning disappears; `/callback` reachable.
- [ ] **Panel smoke:** `/queues`, `/new-queue`, `/operations`, `/commands`, `/widgets`, `/settings` by direct URL and refresh; create a queue.
- [ ] **Persistence, update in place and uninstall:** same expectations as the Windows list, with Docker Desktop for macOS (Apple Silicon and Intel if both are available).
- [ ] **OBS overlay:** macOS OBS Browser Source with the overlay URL (transparency, live updates, resize/reload, certificate trust).
- [ ] **Developer path:** Node 24.20.0, OpenSSL, `npm ci`, `dev:start` / `dev:stop`; permissions of generated secrets (`.local/` files not world-readable); no stray processes after Ctrl+C.
- [ ] **Suite on macOS:** `npm test` and note macOS-only failures separately from the Ubuntu baseline.
- [ ] **Twitch (owner channel, with owner OK):** OAuth, reward create, one real redemption through call and completion.

## How to run and report
1. Update the branch, install Node 24.20.0, `npm ci`, `npm ci --prefix .aiox-core`, `npm run sync:ide:check`.
2. Run the checklist with scripts in `.local/platform-checks/` (ignored by git), with one evidence file per item.
3. Report through `@qa`: `docs/stories/OPS-15/qa-gate-<date>-macos.md` (+ pt-BR) with platform (OS, version, architecture), versions, commands, results, not-run items, cleanup and READY/NOT ready.
4. Propose a CI job to `@devops` only with the owner's OK (`release.yml` already builds the macOS artifact on `macos-15`).

## Open questions for the owner
- macOS and Docker Desktop versions to target; whether a real Twitch redemption is allowed on this host; whether the OBS test is manual or scripted.

## Change log
- 2026-10-27 — Created by Orion from the owner's announcement (Windows) and request (macOS).
