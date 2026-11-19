# Claude Code quota automation

> Portuguese version: [`docs/pt-BR/process/claude-quota-automation.md`](../pt-BR/process/claude-quota-automation.md)

## Goal

Record the Claude Code quota from the status bar, check it against limits, and install the setup on another
computer, with one portable Node tool (no `jq`, no fixed `/tmp` path). Logic lives in
`apps/infra/src/claude-quota.mjs`; the CLI is `apps/infra/scripts/claude-quota.mjs`.

The quota is shared by every session of the account: a second session spends the same 5-hour and weekly windows.

## Install (Linux, macOS, Windows)

```bash
node apps/infra/scripts/claude-quota.mjs install --dry-run   # shows the change, writes nothing
node apps/infra/scripts/claude-quota.mjs install             # same as: npm run quota:install
```

- It registers `statusLine: { type: "command", command: "node <absolute path of the script> statusline" }` in
  `~/.claude/settings.json` (`%USERPROFILE%\.claude\settings.json` on Windows), keeps every other key, saves a
  backup as `settings.json.bak-<timestamp>` and writes atomically.
- It is idempotent. A different existing `statusLine` is kept with a warning (exit 1); use `--force` to replace it.
- Use `--settings <path>` to target another file. **Restart the Claude Code session** to load the new status line.
- The quota file is `claude_quota.json` inside `os.tmpdir()`: `/tmp` on Linux, `$TMPDIR` (a `/var/folders/...`
  directory) on macOS, `%TEMP%` on Windows. Set `CLAUDE_QUOTA_FILE` to choose another place; `check` reads the same
  variable or `--file`.
- The file keeps the format `{updated_at, rate_limits, model}`. It is written only when the input carries
  `rate_limits`, so an empty input never overwrites good data.
- Observed fact: right after the 5-hour window resets, `rate_limits.five_hour` is absent or null (inactive window)
  while `seven_day` stays present. The tool treats it as 0% (window not started), never as an error.

## Check

```bash
npm run quota:check                                           # text
node apps/infra/scripts/claude-quota.mjs check --json         # for the loop prompt
node apps/infra/scripts/claude-quota.mjs check --file P --limit 80 --hold 70 --max-age-min 30
```

| Exit | State | Meaning |
|---|---|---|
| 0 | OK | 5h below `hold` and week below `limit` |
| 10 | HOLD | 5h at or above `hold` (default 70) and below `limit` |
| 20 | LIMIT | 5h or week at or above `limit` (default 80) |
| 30 | STALE | record older than `max-age-min` (default 30) |
| 31 | MISSING | no file or no readable record |
| 2 | usage error | bad option |

The text output shows the state, both percentages, the reset times in local time and the reason when relevant. The
`--json` output has `state`, `exit_code`, `five_hour_pct`, `seven_day_pct`, `five_hour_resets_at`,
`seven_day_resets_at`, `updated_at`, `age_min`, `reason` and `file`.

## Prompt for the `/loop 15m` cycle

```text
Quota check: run `node apps/infra/scripts/claude-quota.mjs check --json` and read the state.
- LIMIT (5h or week >= 80%): follow the quota interruption protocol (stop agents, save the exact stopping
  point and briefs in the resume file) and do not start new work.
- HOLD (5h from 70% to 80%): keep heavy work on hold; finish what is running and verify.
- OK (5h < 70% and week < 80%): resume the next item of the queue.
- STALE or MISSING: the status line is not recording; report it and do not assume free quota.
```

Notes:

- The `/loop` cron lives only while the session is open. Closing the terminal ends it.
- To resume on another computer without a screen, run in the project directory
  `claude -p --continue "<prompt>"`, or schedule that command with the operating system scheduler. Never run two
  sessions in the same directory.
- Memory travels through the private memory repository: run `./sync.sh pull <project>` there before resuming.
