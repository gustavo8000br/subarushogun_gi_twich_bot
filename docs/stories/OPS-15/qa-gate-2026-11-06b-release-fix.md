# QA Gate — release.yml Windows installer fix (2026-11-06b)

[Português brasileiro](../../pt-BR/stories/OPS-15/qa-gate-2026-11-06b-release-fix.md)

**Reviewer:** @qa (Quinn). **Verdict: PASS. Score: 9.3/10** (minimum 9.0).
**Scope:** `shell: bash` in the "Package one installer" step of `.github/workflows/release.yml` (run 42133470156 failed with `--image-tag requires a value.`), the new contract test and the changelog entries. No `git add`, commit or push was done.

## Evidence

| Check | Result |
|-------|--------|
| Diff | Only one added line (`shell: bash`) in `release.yml`; Linux and macOS already ran bash, so no change for them. |
| Windows path in bash | `--output "D:\a\_temp/queuebot-installer"`: inside double quotes bash keeps `\a` and `\_` (only `\$`, backtick, `\"`, `\\` and newline are special). `package-installer.mjs` calls `resolve()`, which accepts mixed separators. No single-quoted or other Windows path argument exists in the step. |
| Other workflows | `main-cd.yml` (`beta-windows-installer`) uses `$env:` correctly; `quality-gates.yml` `installer-smoke` on Windows uses only `${{ }}`. No other PowerShell step with bash-style expansion. |
| Contract test | Rule is correct: `${{ }}` is stripped before matching; `$env:VAR` is not flagged (lowercase `env` filtered); shell defaults to `pwsh` for Windows matrix jobs. |
| Targeted tests | `release-workflow-shell-contract` + `ci-workflow-contract`: 15/15 pass. |
| `npm run lint`, `validate:version`, `validate:localization`, `review:static`, `git diff --check` | all exit 0. |
| `actionlint` | only the accepted `queue: max` in `main-cd.yml` and `release.yml`. |
| `npm test` (twice) | 177 files, 1972 tests, exit 0 both runs. |
| Own mutations (on copies, restored, `cmp` identical) | (a) remove `shell: bash`: 2 tests fail; (b) `shell: pwsh` keeping `"$VAR"`: 2 tests fail; (c) extra `pwsh` step with `"$SOME_VAR"` in `main-cd.yml`: 1 test fails. All 3 killed. |
| Security | `grep "claude.ai/"` on the diff: none; no secrets. |

## Findings

- **Low (accepted):** the rule flags any all-caps `$NAME`, so a PowerShell automatic variable such as `$LASTEXITCODE` in a future `pwsh` step would be a false positive. None exists today; the test message points to the step, so it is easy to fix.
- **Low (accepted):** the test infers the Windows runner from `matrix.include[].runner`; a workflow that hard-codes another expression for `runs-on` is not inferred.

## Honest limits

- The real proof is dispatching `release.yml` on GitHub; there is no `pwsh` or Windows here. Not claimed.
- Remaining risks: Git Bash behavior on `windows-latest` (expected, preinstalled with the runner) and `tests/platform/installer-native.mjs` running on Windows after the packaging step (it already passes in `quality-gates.yml` `installer-smoke`).

## Commit group (single)

Files:
- `.github/workflows/release.yml`
- `tests/unit/release-workflow-shell-contract.test.js` (new)
- `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/stories/OPS-15/qa-gate-2026-11-06b-release-fix.md`
- `docs/pt-BR/stories/OPS-15/qa-gate-2026-11-06b-release-fix.md`

Message: `fix(release): run the shared installer packaging step in bash so Windows expands the image tag [OPS-15]` (the `@devops` adds the attribution trailers required by the project rules, never the session URL).
A temporary index (`GIT_INDEX_FILE`) reproduced the tree with exactly these six paths.
