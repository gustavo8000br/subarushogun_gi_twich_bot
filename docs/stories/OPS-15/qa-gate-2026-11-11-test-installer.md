# QA gate 2026-11-11: owner test installer (guard, workflow, branch content)

> Portuguese counterpart: `docs/pt-BR/stories/OPS-15/qa-gate-2026-11-11-test-installer.md`. Partial gate: quota ended it early (see "Not verified").

**Verdict: CONCERNS. Score 8.4/10 (minimum 9.0 not reached).** No security defect found in the guard, the packager or the workflow; one blocking test defect (F1) and unfinished checks keep the score under 9.0.

## Findings
- **F1 (blocks main CI, fix required by @dev):** `windows-owner-test-installer-contract.test.js` and `windows-installer-paths-contract.test.js` call `mkdtemp(join(root, '.local', ...))` without creating `.local/`. In a clean checkout (CI) both whole files fail with ENOENT (reproduced). Fix: `mkdir(join(root,'.local'),{recursive:true})` first (proven green in the worktree).
- **F2 (branch only):** on `test/windows-owner` two cases fail by design (workflow present in `.github/workflows`; `Validar-SubaruShogun.ps1` absent). Adapted by `it.skip` / `skipIf` in `branch.patch`.
- **F3 (low):** zizmor `--pedantic` undocumented-permissions on `contents: write` (add a comment). Default audit: no findings.
- **Limits, not defects:** the guard is a deterrent (the `.bat` is editable; the hash allows offline guessing, mitigated by 600000 iterations and a 16+ character password); container tests are skipped silently where the pwsh image is absent (CI), so CI does not prove the guard behaviour.

## Reviewed with no defect
Guard: fails closed (`$accepted` only true after the XOR compare; unreadable/malformed/out-of-range hash, missing .NET, silent mode all exit 4), 3 attempts with 2 s pause, hash only in the encoded payload (once), password bytes zeroed, never on disk/log/argv/env. Packager: hash only from an upper-case env var, canonical base64 and bounds validated, no echo, windows only. Workflow: push on `test/windows-owner` + RUN-MARKER path, actor and ref guard, `permissions: {}` and `contents: write` only in the job, Environment `windows-owner-test`, `persist-credentials: false`, empty secret aborts, secret only in one step env, no `upload-artifact`, draft + prerelease, `--target main`, real `$GITHUB_SHA` in notes, action SHAs equal to those already used on main.

## Evidence
Disposable worktree on `origin/main` (ab50350) with only the branch files: 7 test files 89 passed / 2 skipped; lint, validate:localization, typecheck exit 0; `review:static` 0 findings; actionlint 1.7.12 clean; zizmor 1.32.0 offline clean. Own container proof (PowerShell 7, decoy password): correct password exit 0; wrong x3 exit 4 with 3 denials; `--silent install` exit 4; empty x3 exit 4; test mode did not bypass; decoy not in output. Scan of the branch files: no Claude session URL and no token pattern. Worktree, branch `qa/test-branch-check` and containers removed; `dev:start` untouched.

## Not verified (quota)
The 8+ own mutations with restore and `cmp`; the byte-for-byte comparison of the no-hash `.bat` against an origin/main build (the contract test AC-T1 covers the payload only); malformed/placeholder hash cases beyond the existing suite; `.bat` launcher exit-code propagation of `exit 4` through `-Command`; image `v0.3.0-0d0b595-beta` existence in GHCR; everything that needs Windows 10 (PowerShell 5.1, .NET 4.7.2 constructor, timing) and real GitHub (Environment approval, first-run review, `--target main`, anonymous access to the draft).

## Branch content
See `.local/qa-audit/g1111t/branch-content.md` and `branch.patch` (13 paths; shared files: `installer.ps1` and `package-installer.mjs` whole diff = C1c + C1d; tests carry the F1 hunk plus two branch-only skips). Assembly by @devops: `git switch -c test/windows-owner origin/main && git apply --index <branch.patch>`, change one line of RUN-MARKER per cycle, push, never open a PR to main.
