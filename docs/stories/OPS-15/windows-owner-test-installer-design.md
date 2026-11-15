# Windows owner-only test installer: design (draft pre-release + password hash) and the `workflow_dispatch` risk off `main`

> Status: architecture proposal for owner decision. No code was written. Author: `@architect` (Aria). Date: 2026-11-11. Base: `main` at `dcfe3da`, release `v0.3.0-0d0b595-beta`.
> Portuguese counterpart: `docs/pt-BR/stories/OPS-15/windows-owner-test-installer-design.md`.
> Contains no secret, no password, no hash, no session URL.

## 1. Context and facts read

| Fact | Source |
| --- | --- |
| The Windows installer is `apps/infra/installer/installer.ps1`, embedded as UTF-16 base64 into a `.bat` by `apps/infra/scripts/package-installer.mjs` (placeholders `__COMPOSE_B64__`, `__IMAGE_TAG__`, `__PRODUCT_VERSION__`). | file read |
| The packager validates the image tag with a strict regex (`v<semver>-<sha7>-<stage>` or `main`, optional `@sha256:`). | file read |
| `installer.ps1` already honors `QUEUEBOT_TEST_MODE` and `QUEUEBOT_TEST_INPUT_FILE` (input from a file). The guard must not be skippable through them. | file read |
| `Read-Answer` is the single input helper; `Parse-CommandLine` returns before any prompt (`--help` exits 0). | file read |
| `release.yml` runs only on `push` to `main` plus `workflow_dispatch`, restricted by `github.actor`; its jobs build, then upload an artifact, then publish. | file read |
| `ci.yml` runs only on pull requests to `main`; `main-cd.yml` only on `push` to `main`; `quality-gates.yml` is `workflow_call`. A push to `test/windows-owner` triggers no existing workflow. | file read |
| `Validar-SubaruShogun.ps1` opens the installer in its own interactive window with `Start-Process -Wait`, so it never sees what is typed there; its log sanitizer already masks `password`/`senha` patterns. | file read |
| `docs/research-index.md` has no note about `workflow_dispatch` on non-default branches. | search |

## 2. Decisions

### D-T1. Where the workflow lives and how it is triggered

Known behavior (to be confirmed, see gap L1): GitHub documents that, to trigger `workflow_dispatch`, the workflow file must exist on the default branch; `gh workflow run` and the Actions "Run workflow" button resolve the workflow by what is registered on the default branch, and a file that only exists on another branch typically fails with "workflow not found on the default branch". Once the file exists on `main`, the run uses the file version at the ref you choose (`-r test/windows-owner`).

| Option | Description | Touches `main`? | Manual? | Risks |
| --- | --- | --- | --- | --- |
| A | `workflow_dispatch` only in the file on `test/windows-owner`, run with `gh workflow run -r test/windows-owner`. | No | Yes | Most likely does not work (workflow not registered). Proving it costs one trivial run on the branch (L1). If it fails, A is discarded. |
| B | Guarded stub on `main` (a no-op `workflow_dispatch` file with the same file name: runs only on `test/*`, only if the secret exists, `permissions: {}`), real logic only on the branch. | Yes, once, a tiny file | Yes (real button/CLI) | Changes `main` (owner said not to); the stub file is public and reviewable; a future edit of the stub on `main` could widen it, so it needs CODEOWNERS or a contract test. |
| C (recommended) | Trigger by `push` on `test/windows-owner` with a path filter (a trigger marker file) and an actor guard, plus a GitHub Environment `windows-owner-test` with the owner as required reviewer and a deployment-branch rule limited to `test/windows-owner`. | No | Yes, by the approval click | Anyone with write can push to the branch, but the job waits for the owner's approval and the secret is only released to that branch; remember never to open a PR from this branch to `main` (it would run `ci.yml`). |

Recommendation: C. It respects "do not touch `main`", keeps a human gate (Environment approval), and also limits the secret to the branch. Keep `workflow_dispatch: {}` in the branch file anyway (harmless, becomes usable if the owner later accepts B). If the owner wants a real "Run workflow" button, choose B knowingly.

Common guards for any option: `if: github.ref == 'refs/heads/test/windows-owner' && github.actor == 'gustavo8000br'`; abort early if the secret is empty (`[[ -n "$HASH" ]]`, without printing it); `permissions: {}` at workflow level.

### D-T2. Password guard in the installer

- Placeholder `__TEST_PASSWORD_HASH__` appears exactly once, in `$TestPasswordHash = '__TEST_PASSWORD_HASH__'`. The packager always replaces it: with the hash for the test build, with the empty string for official builds (official behavior unchanged, no guard). The check is `if ($TestPasswordHash.Length -gt 0)` and never compares against the placeholder text (a global `replaceAll` would rewrite the comparison too). An unreplaced placeholder is treated as a malformed hash and denies (fail closed).
- The packager reads the hash from an environment variable (`--password-hash-env TEST_INSTALLER_PASSWORD_HASH`), not from argv, and validates the format before use.
- Where: right after `Parse-CommandLine` (so `--help` still works) and before `Prompt-Language`, any docker call, any file creation.
- Prompt: `Read-Host -AsSecureString` (no echo). Convert to UTF-8 bytes, derive, then zero the byte arrays; the plain string never goes to `Write-Host`, `$env`, a file, or the transcript. In test mode only the input source changes (the test input file); the guard stays active.
- KDF: PBKDF2-HMAC-SHA256, 600000 iterations, 16-byte random salt, 32-byte output (OWASP guidance for PBKDF2-SHA256). Windows PowerShell 5.1 uses `Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName)` (needs .NET Framework 4.7.2+; Windows 10 1803 and later). If the constructor is missing, fall back to a small `Add-Type` C# HMAC-SHA256 loop (a pure PowerShell loop would be too slow at 600000 iterations). If neither works, deny with a generic message.
- Secret format `TEST_INSTALLER_PASSWORD_HASH`: `pbkdf2-sha256$600000$<salt-base64>$<hash-base64>` (one line, no spaces). The packager accepts only this exact shape (iterations 100000 to 2000000, salt 16 bytes, hash 32 bytes).
- Constant-time compare: `FixedTimeEquals` does not exist in 5.1, so XOR-accumulate over the 32 bytes and test the accumulator once at the end (lengths are fixed and public).
- Attempts: 3 tries, 2-second pause between failures; then exit code 4. The limit is only friction (see 4): anyone holding the file can edit it.
- Message: always `Invalid password.` (pt-BR/en/es via the existing `$Copy` table); no hint, no distinction between wrong password and malformed hash except a separate generic `Invalid test installer.` for a malformed hash (reveals nothing secret).
- Silent/non-interactive modes (`--silent`, `install` argument): with the guard active they are denied with exit code 4. The password is never accepted through argv or an environment variable (child processes such as `docker compose` inherit environment and the process list exposes argv).
- `Validar-SubaruShogun.ps1`: no change in how it launches the installer. It opens the installer window; the owner types the password there; the script does not ask for, receive, or log it. Add a note to the on-screen instructions ("the installer asks for the test password in its own window; do not type it in this window or send it in the report"). Contract: the script has no `-Senha`/`-Password` parameter and no `-AsSecureString`.

How the owner generates the hash (no password in history or process list):

- Linux/macOS/Windows with Node: a new helper `apps/infra/scripts/gen-test-password-hash.mjs` (to be built by `@dev`) prompts on the terminal with echo off, using `node:crypto` `pbkdf2Sync`, and prints only the hash line. Run `node apps/infra/scripts/gen-test-password-hash.mjs`.
- Windows PowerShell: a helper `apps/infra/scripts/windows/Gerar-HashSenhaTeste.ps1` with the same logic (`Read-Host -AsSecureString`, `RandomNumberGenerator`, the constructor above); the two helpers must produce interoperable hashes (contract test).
- Register: `gh secret set TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test` (the CLI prompts for the value; or pipe the helper output into `gh secret set ... --env windows-owner-test` with no `--body`).

### D-T3. Workflow

File `.github/workflows/test-windows-owner.yml`, only on `test/windows-owner`. Name for the run and the draft: `test-windows-<run_id>`.

1. Triggers: `push` (branch `test/windows-owner`, `paths: ['.github/test-windows-owner.trigger']`) and `workflow_dispatch: {}`.
2. `permissions: {}` at workflow level; `concurrency: { group: test-windows-owner, cancel-in-progress: false }`; `timeout-minutes: 15`.
3. A single job `build-and-draft` with `environment: windows-owner-test` and `permissions: { contents: write }`. One job, not build/publish split: an Actions artifact of a public repository can be downloaded by any signed-in GitHub account, and the `.bat` embeds the hash. So: no `upload-artifact` for the installer.
4. Steps: checkout with `persist-credentials: false` (pinned SHA, same as `release.yml`); `setup-node` `24.20.0`; `npm ci --ignore-scripts`; resolve and pin the image digest as `release.yml` does (`imagetools inspect --raw`), image `v0.3.0-0d0b595-beta`; package with `node apps/infra/scripts/package-installer.mjs --platform windows --image-tag "$IMAGE_REF" --password-hash-env TEST_INSTALLER_PASSWORD_HASH --output "$RUNNER_TEMP/owner-test"` where `TEST_INSTALLER_PASSWORD_HASH` comes from `${{ secrets.TEST_INSTALLER_PASSWORD_HASH }}` only in this step's `env:`; `sha256sum` the `.bat`; the final step runs `gh release create "test-windows-$GITHUB_RUN_ID" <bat> <sha256> --draft --prerelease --target "$GITHUB_SHA" --title "TEST (private, do not share) $GITHUB_RUN_ID" --notes "..."` with `GH_TOKEN` only in that step's `env:`.
5. Secrets hygiene: no `echo`/`cat`/`set -x` of the secret or of the `.bat`; the secret is masked by GitHub automatically, so do not print it just to call `::add-mask::`; mask only derived fragments (salt and digest fields) with `printf '::add-mask::%s\n'` when the shell trace is off; user inputs (none planned) never interpolated into `run:` through `${{ }}`.
6. Draft naming: tag `test-windows-<run_id>` does not match any tag-triggered workflow (none exist) and is not created while the release is a draft. The release body must not contain the hash.
7. Cleanup: the owner deletes the draft with `gh release delete test-windows-<run_id> --cleanup-tag --yes` (or the web UI), and the branch after the test cycle. The Environment secret can be deleted with `gh secret delete TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test`. Rotate by repeating the generation with a new password.

### D-T4. Honest limits

- A draft release is visible to people with write access; the password is only a second lock for the case the file leaves that circle.
- The hash is embedded in the `.bat`; whoever has the file can attack it offline. PBKDF2 (600000 iterations) slows this down; the real defense is a long random password (at least 16 characters or a 5-word passphrase). Attempt limits are friction, not security: the file can be edited.
- Anyone who can read the `.bat` can remove the guard by editing it. The guard protects against accidental or casual use, not against a determined holder.
- The test installer pulls the same public image `ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:v0.3.0-0d0b595-beta`; the guard protects the installation, not the image.
- The branch and its workflow file are public (repository is public); only the secret and the draft are private. The test workflow code must therefore contain no secret and no private path.
- If the friend streamer needs the file, the owner downloads the asset and passes it on; the password goes through a separate channel.

### D-T5. Test plan

Order Red then Green: tests first, each failing for the expected reason before implementation.

1. Contract (Node `node:test`, same style as `tests/unit/windows-installer-contract.test.js`):
   - Placeholder appears exactly once in `installer.ps1`; `package-installer.mjs` replaces it in every build; official build yields empty value and no behavior change.
   - Guard sits after `Parse-CommandLine` and before `Prompt-Language`; uses `-AsSecureString`; no `Write-Host`/`Out-File`/`Set-Content` of the password variable; compare is XOR-accumulate, never `-eq`/`-ceq` on hashes; no use of `QUEUEBOT_TEST_MODE` to skip it.
   - Packager: rejects malformed hash, accepts only env source; no `--password` option.
   - Workflow: only `test/windows-owner`; `persist-credentials: false`; `permissions: {}` at top and `contents: write` only in the one job; no `upload-artifact`; no `echo`/`set -x` of the secret; `timeout-minutes` and `concurrency` present; SHA-pinned actions; `gh release create` has `--draft --prerelease`; secrets only in step `env:`.
   - `Validar-SubaruShogun.ps1`: no password parameter, no `-AsSecureString`.
2. Mutation (reuse the repository mutation style): remove the guard call; replace the compare with `-eq`; set iterations to 1; skip guard when `TestMode`; add a second placeholder occurrence; drop `--draft`; set `persist-credentials: true`; add `upload-artifact`; move `contents: write` to workflow level. Each mutant must make at least one test fail.
3. Disposable `pwsh` container (as in `windows-installer-paths-contract.test.js`): correct password proceeds to the next stage; wrong password three times exits 4 with only the generic message; malformed or unreplaced hash denies; `--silent` denied; a canary password never appears in stdout, stderr, the install home, or any file under the work directory; hash from the Node helper verifies in the PowerShell guard (interoperability).
4. Not testable here (dono/Windows): Windows PowerShell 5.1 specifics (constructor availability, `Add-Type` fallback speed under 5 s), the `.bat` window prompt on the real Windows 10 machine.

## 3. Acceptance criteria (for `@dev`)

- AC-T1: `installer.ps1` has the guard per D-T2; official builds are byte-for-byte unchanged apart from the empty default and keep passing existing installer tests.
- AC-T2: `package-installer.mjs` accepts `--password-hash-env <NAME>`, validates the format, fails closed, and never prints the hash.
- AC-T3: the password is never written to disk, log, report, argv, or environment; `Validar-SubaruShogun.ps1` neither asks for nor records it.
- AC-T4: helpers (`.mjs` and `.ps1`) generate interoperable hashes without echoing the password.
- AC-T5: the workflow meets D-T3 and runs only through the chosen option (C by default).
- AC-T6: tests of D-T5 items 1 to 3 exist, fail first (Red), then pass (Green); mutation set kills every mutant.
- AC-T7: documentation en and pt-BR (how to generate the hash, register the secret, run, download, delete the draft), including the limits of D-T4.

## 4. What `@qa` validates and what depends on the owner

`@qa`: full contract, mutation and container batteries; lint, typecheck, the quality gates; leak scan (repository tree, the built `.bat` decoded payload, the Actions run log, the draft body and asset names: no password, no hash, no session URL, no token); verify the official build is unaffected; check that no `upload-artifact` carries the test `.bat`.

Owner: create the Environment `windows-owner-test` (required reviewer = owner; deployment branch `test/windows-owner`); choose the password (long, random); generate the hash locally and register `TEST_INSTALLER_PASSWORD_HASH` as an Environment secret; approve the run; test on Windows 10 and return the log; delete the draft and secret afterwards. `@devops` creates the branch and the workflow file only after owner choice on D-T1.

## 5. Risks summary

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Option A fails (workflow not registered off `main`) | wasted run | prove with a trivial run first; default to C |
| Hash lifted from the `.bat` and brute-forced offline | guard bypassed | PBKDF2 600000, long random password, rotate after the test |
| Artifact leak through `upload-artifact` | public download of the `.bat` | single job, no artifact (contract + QA) |
| Secret in logs | disclosure | env-only, masked, no echo, QA log scan |
| Push by another writer runs the job | wasted minutes or draft spam | actor guard, Environment approval, branch-restricted secret |
| PR from the test branch to `main` | triggers `ci.yml`, confuses history | owner rule: never open it; contract that the branch is only for this purpose |
| `Add-Type` or constructor missing in old Windows PowerShell | owner cannot pass the guard | fallback C# loop; manual Windows check |

## 6. Gaps for `@analyst` (no internet for the architect)

- L1: official GitHub documentation on `workflow_dispatch` requiring the workflow on the default branch, the exact `gh workflow run` error, and whether a file present only on a non-default branch can be dispatched (cite page and date; confirm with a trivial test on the branch).
- L2: Environment protection rules on public repositories: required reviewers, deployment-branch restriction, environment secrets, self-review, and plan limits.
- L3: whether artifacts and draft release assets of a public repository are visible to non-collaborators (confirm that drafts are write-only and artifacts are public to signed-in users).
- L4: current OWASP guidance for PBKDF2-HMAC-SHA256 iterations, and Windows 10 builds that ship .NET Framework earlier than 4.7.2 (`Rfc2898DeriveBytes` with `HashAlgorithmName`).
- L5: `gh release create --draft` behavior with `--target` (tag creation timing) and `gh secret set --env` input handling (stdin versus prompt).

Add these as LACUNA entries in `docs/research-index.md` when the analyst delivers.
