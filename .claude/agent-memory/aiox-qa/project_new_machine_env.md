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
- `.aiox/` is NOT gitignored; scratch/measurement artifacts go in the ignored `.local/` (e.g. `.local/qa-audit/`). Project rule forbids writing to `/tmp`.
- The Bash tool shell is **zsh**: `$F` holding a file list is NOT word-split (grep sees one bogus path and silently matches nothing), `echo ===` fails (`=` expansion), and `$PIPESTATUS` is `$pipestatus`. Feed file lists with `xargs -d '\n' grep ... < list.txt`, and run `git diff --no-index --check /dev/null "$f"` one file at a time (2026-10-27 gate nearly reported a false-clean secret scan).
- Vitest output in a non-TTY log only has the final summary (no per-file lines); tail-follow the log with `timeout 590 tail -f log | grep -m1 Duration` to wait for a background run (foreground `sleep` is blocked).
- 2026-10-27 (evening): the session had the `docker` group, so plain `docker` worked without `sg`; `postgres:18.6-bookworm` was already cached. Still check, do not assume.
- `git rev-parse --short legacy origin/legacy` (two refs with `--short`) fails with "Needed a single revision"; that is NOT a missing ref. Check each ref separately before reporting.
- Docs batches edited in the same commit shift each other's `file:line` references (e.g. a new Change Log row moves story lines by +1); compare against `git show HEAD:<file>` to tell drift from wrong references.
- Several agents (@dev, other @qa rounds) often run suites in the same worktree at once; timing measured then is contended (load ~9 on 4 cores) and must be labeled unreliable. Vitest phase summary needs the default reporter (JSON lacks it).

**Why:** avoids misreading infra failures as functional ones, and avoids wrongly blocking E2E on this machine.
**How to apply:** check `which opengrep actionlint`, `google-chrome --version` and `docker images` before a gate; verify these still hold.
