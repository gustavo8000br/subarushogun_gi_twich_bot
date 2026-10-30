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

- `git diff --no-index --check /dev/null <f>` always exits 1 ("files differ"); only printed output means a whitespace error.
- `npm test` includes `compose-runtime.test.js`, which builds `ghcr.io/...:ops15-accept-<pid>-<uuid8>` and a `queuebot-accept-*` Compose project and removes both in `afterAll`; seeing them mid-run is not a leftover (2026-10-27c gate: clean after).
- To reproduce a Red without touching the repo: `git archive HEAD <paths> | tar -x -C .local/qa-audit/<dir>`, copy the new test in, run `node_modules/.bin/vitest run --root .` from there (vitest resolves from the parent node_modules), then delete the copy BEFORE the full suite (root vitest include is `tests/**`, not `.local`, but keep it clean). Archive `apps/api apps/shared tests vitest.config.js package.json prisma.config.mjs` (handler imports `apps/shared`; the PostgreSQL integration's `migrate deploy` needs `prisma.config.mjs`, else every case is "skipped"). From `.local/qa-audit/<gate>/red` the link is `ln -s ../../../../node_modules node_modules` (4 levels; 3 gives exit 127). A temporary QA-only `it()` inserted in the copied integration test is a cheap way to probe real PostgreSQL rows with `$queryRaw` (2026-10-29e).
- For a "new code" copy, `git apply` run inside `.local/...` (still inside the repo) silently skips every hunk outside that subdir and exits 0; use `patch -p1 < file.patch` and then `diff -r apps <copy>/apps` to prove parity (2026-10-27d). Tests that spawn `node_modules/next/...` relative to the copy root need `ln -s ../../../node_modules <copy>/node_modules`.
- `tests/e2e/overlay-bundle-boundary.mjs` only reads `apps/frontend/.next`; after a `next dev` it reads dev output, so run `npm run build:frontend` first for a meaningful result. Panel `/` polls, so a Playwright `waitUntil: 'networkidle'` times out; use `load` + wait for `.panel-shell`.
- 2026-10-28 gate: `compose-runtime` "creates, configures, activates ... local queue in Chromium" failed once in 4 runs at `:1220` (`Network.getResponseBody`, a pre-reload polling response matched `waitForResponse`); reruns green. Known intermittent (gate M-1), not a regression signal by itself; rerun before judging.
- To prove a move stages as renames without touching the real index (QA never stages): `cp .git/index .local/qa-audit/<gate>/sim-index`, `GIT_INDEX_FILE=<copy> git add -A -- <old> <new>`, `GIT_INDEX_FILE=<copy> git diff --cached -M --name-status`, then delete the copy (2026-10-28 Wave 2 gate: 15 x R100).
- Never `cp` mutation backups to `/dev/shm` or anywhere outside the repo (slip on 2026-10-28); keep them in `.local/qa-audit/<gate>/`.

**Why:** avoids misreading infra failures as functional ones, and avoids wrongly blocking E2E on this machine.
**How to apply:** check `which opengrep actionlint`, `google-chrome --version` and `docker images` before a gate; verify these still hold.
