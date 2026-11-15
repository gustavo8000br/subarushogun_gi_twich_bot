# Windows owner-only test installer: owner step by step

> Status: implemented, untested on Windows. Implements AC-T1..AC-T7 of `windows-owner-test-installer-design.md` with the corrections of `docs/research/2026-11-11-owner-test-installer-github/README.md`.
> Portuguese counterpart: `docs/pt-BR/stories/OPS-15/windows-owner-test-installer.md`.
> Contains no password, hash, token or session URL.

## What this is

A separate Windows installer for you only. It is published as a **draft pre-release** (visible only to people with write access) and it **refuses to run without a test password**. The password is never stored: the installer carries only a PBKDF2-SHA256 hash (600000 iterations, random 16-byte salt). The production installer is not changed: the guard is added only when the packager receives a hash.

## Steps (you)

1. **Create the Environment** `windows-owner-test` (Settings, Environments): required reviewer = you; **"Prevent self-review" OFF** (you start the run and you are the only reviewer; with it ON you could not approve your own run); deployment branches = only `test/windows-owner`. `@devops` can do it with `gh api` using your admin login.
2. **Pick a password**: long and random (at least 16 characters, or a 5-word passphrase), **ASCII only** (letters, digits, common symbols; the Windows console may encode accents differently). Do not paste it in chats or files.
3. **Generate the hash locally**, typing the password hidden:
   - Node (Linux/macOS/Windows): `node apps/infra/scripts/gen-test-password-hash.mjs`
   - Windows PowerShell: `powershell -ExecutionPolicy Bypass -File apps\infra\scripts\windows\Gerar-Hash-Senha.ps1`
   Only a line `pbkdf2-sha256$600000$<salt>$<hash>` is printed. Both helpers give interoperable hashes.
4. **Register the Secret** in the Environment, without typing it on the command line: `gh secret set TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test` (it prompts; paste the hash line). If the secret is empty, the workflow aborts before building.
5. **Ask `@devops` to start the run**: it copies `apps/infra/test-owner/windows-owner-test-installer.yml` to `.github/workflows/` **only on the branch `test/windows-owner`** and pushes a commit that **changes one line of `apps/infra/test-owner/RUN-MARKER`** (an empty commit does not trigger the run). Never open a pull request from that branch to `main`.
6. **Approve the run** in the Actions page (the job waits for your review; the secret is released only after the approval).
7. **Download the `.bat`** (and its `.sha256`) from the draft `test-windows-<run_id>`: `gh release download test-windows-<run_id> --repo <owner>/<repo>`. Check it with `Get-FileHash ... -Algorithm SHA256`. **Never publish the draft.**
8. **Run it on Windows.** The installer asks `Test password:` in its own window (hidden typing). Three wrong attempts end with exit code 4. Do not type the password in the validation script window and do not send it in the report.
9. **Clean up**: `gh release delete test-windows-<run_id> --cleanup-tag --yes`; delete the branch `test/windows-owner`; `gh secret delete TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test`. To rotate, repeat steps 2 to 4 with a new password.

## Honest limits

- The hash is inside the `.bat`: whoever has the file can try passwords offline. PBKDF2 slows that down; the real defense is a long random password. Attempt limits and the 2-second pause are friction, not security (the file can be edited).
- Anyone who can read the `.bat` can remove the guard by editing it. It protects against accidental or casual use, not against a determined holder.
- It protects the installation, not the image: the test installer pulls the same public image as the release.
- The branch and the workflow file are public; only the Secret and the draft are private. No Actions artifact carries the installer (artifacts of public repositories can be downloaded by any signed-in account).
- The draft targets `main` (`GITHUB_TOKEN` has no `workflow` scope, which the API would require for a commit that changes `.github/workflows/`); the real commit SHA is written in the draft notes. The tag would point at `main` if published: another reason never to publish.
- `SecureString` means no echo and short exposure only; the plain text exists briefly in memory and .NET strings are immutable. Buffers are zeroed best effort.

## What is proven where

| Item | Evidence |
| --- | --- |
| Production `.bat` unchanged without hash; guard before every other action; XOR compare; fail closed; workflow contract; no leak of a decoy password | `tests/unit/windows-owner-test-installer-contract.test.js` (Node plus disposable `pwsh` container) |
| Correct password passes, wrong password exits 4 after 3 tries, silent/test mode/malformed hash denied, Node and PowerShell helpers interoperate | same file, container (PowerShell 7 on Linux) |
| Windows PowerShell 5.1 specifics: `Read-Host -AsSecureString` in the `.bat` window, constructor availability (.NET Framework 4.7.2+, Windows 10 1803+; older builds use the C# fallback), time of the 600000 iterations (estimate 1 to 2 s, **to be measured on Windows** with `Measure-Command`), ASCII password interoperability | **only Windows proves it** (owner session) |
| Open runtime checks T-1..T-7 of the research note (first run waits for review, admin bypass, `--target main` accepted, anonymous access to the draft asset and run logs, timing) | real runs by `@qa` with the owner; not provable offline |
