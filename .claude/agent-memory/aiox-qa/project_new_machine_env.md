---
name: new-machine-env-quirks
description: Quirks of the owner's fresh Ubuntu install (since 2026-10-23) that affect running npm test, OpenGrep, actionlint and browser E2E as @qa
metadata:
  type: project
---

Owner moved to a fresh Ubuntu install on 2026-10-23. Quirks observed in the @qa gates there:

- Shell starts on a newer Node; must `source ~/.nvm/nvm.sh && nvm use` (`.nvmrc` = 24.20.0).
- Session lacks the `docker` group: run via `sg docker -c "bash -c '...'"` — `sg` uses `sh`, so a bare `source` fails with exit 127.
- First `npm test` on an empty Docker fails `tests/integration/queue-repository.test.js` (cold pull of `postgres:18.6-bookworm` exceeds the 30 s spawnSync timeout) and leaves an orphan `queuebot-repo-*` container in `Created` state. Rerun after the image is cached is green.
- Since the afternoon of 2026-10-23 (owner-authorized): OpenGrep 1.30.0 and actionlint 1.7.12 live in `~/.local/bin` (on PATH); Playwright Chromium is in `~/.cache/ms-playwright`.
- Browser-only E2Es (`tests/e2e/*-browser-only.mjs`) launch the **system Google Chrome** (`channel: CHROME_CHANNEL ?? 'chrome'`, `/usr/bin/google-chrome`), NOT the Playwright Chromium. Missing Playwright Chromium is never a reason to skip them (the morning 2026-10-23 gate got this wrong).
- Browser-only E2E needs your own Next dev HTTPS on 127.0.0.1:3000: `next dev apps/frontend --experimental-https` with the key/cert/ca in the gitignored `.local/dev-tls/` (no API/DB needed). Kill it by exact PID, not `pkill -f` (that also matches the calling shell).

**Why:** avoids misreading infra failures as functional ones, and avoids wrongly blocking E2E on this machine.
**How to apply:** check `which opengrep actionlint`, `google-chrome --version` and `docker images` before a gate; verify these still hold.
