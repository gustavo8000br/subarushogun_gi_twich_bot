# Research Batch B: conventions, security and performance of PowerShell, Batch, Shell, GitHub Actions, Dockerfile, Compose and YAML

- Date: 2026-11-10 | Author: `@analyst` | Parity file: `docs/pt-BR/research/2026-11-10-language-conventions-infra/README.md`
- Scope: research only. No code, git or GitHub change. Batch A (JavaScript, TypeScript, React, Next, Fastify, Prisma, PostgreSQL, CSS) lives in a separate note.
- Evidence tags used on every recommendation:
  - **[DOC]** proven by official documentation (link and consultation date 2026-11-10 given).
  - **[MEDIDO]** measured in this repository on 2026-11-10 (output kept in `.local/lote-b/`, git-ignored).
  - **[MED]** depends on measurement before adopting (no speculative optimization).
  - **[COM]** community opinion or secondary source.

## 1. Executive summary

1. The project is already in good shape on the hardest items: all 12 `actions/checkout`/`setup-*` style references are pinned to full commit SHAs with version comments, workflows declare `permissions: contents: read` at top level, jobs have `timeout-minutes`, deployments use `concurrency` with `cancel-in-progress: false`, Compose uses `depends_on` with `service_healthy` / `service_completed_successfully`, containers run as UID 10001, `.gitattributes` fixes line endings per file type, and the `.bat` payload is shipped as UTF-16LE base64 (immune to the BOM/code-page trap). [MEDIDO] by reading the files.
2. Measured findings (all run in disposable containers, read-only mount of the repo):
   - **zizmor** (GitHub Actions security linter): 27 findings, 0 high, 12 medium, 2 low, 2 informational, 11 suppressed. All 12 medium are `artipacked`: every `actions/checkout` leaves the `GITHUB_TOKEN` in `.git/config` (no `persist-credentials: false`). No `unpinned-uses` finding, which confirms the SHA pinning. [MEDIDO]
   - **ShellCheck** on `installer.sh` with `-s sh`: only 2 warnings (SC1112, curly quotes inside message strings). Very clean. [MEDIDO]
   - **Hadolint** on `Dockerfile`: 2 warnings, both DL3018 (unpinned `apk add openssl`). [MEDIDO]
   - **actionlint with ShellCheck enabled** (CI runs it with `-shellcheck=` which disables it): 4 notes (3x SC2129 style, 1x SC2034 warning in `release.yml:288`, variable `stage` assigned and unused). [MEDIDO]
   - **yamllint** (preset `relaxed`): only `line-length` warnings (85). No type or duplicate-key problems. [MEDIDO]
   - **Image size**: local acceptance images are 1.32 GB, of which `COPY node_modules` is 738 MB because the runtime stage copies the full `npm ci` tree (dev dependencies included). [MEDIDO] A production-only tree is a candidate, but the migrate/Prisma path may need dev packages: [MED].
3. Highest-value, lowest-risk actions (all need owner/`@dev` decision, listed in section 10): add `persist-credentials: false` to every checkout; add a `.github/dependabot.yml` for `github-actions`, `docker`, `docker-compose` and `npm` so the SHA pins do not rot; run ShellCheck/Hadolint/zizmor in CI through pinned containers; write `.env` as UTF-8 without BOM in `installer.ps1` instead of `-Encoding ascii` (accent-in-username risk, section 3.5).
4. Not verified in this session: PSScriptAnalyzer (container attempts failed, see section 3.7), Windows behavior of any PowerShell/Batch claim (no Windows host), `queue: max` semantics beyond the docs.

## 2. Existing notes not repeated here

`docs/research-index.md` already covers OPS-5 CI matrix/packaging, GitHub Actions + `pwsh`, `queue: max`, the Windows installer and disposable Docker PostgreSQL tests. This note only adds convention, linter and hardening material and does not reopen those verdicts.

## 3. PowerShell (installer.ps1, Validar-SubaruShogun.ps1)

### 3.1 Conventions and style
- Microsoft's `about_Execution_Policies`, `about_Character_Encoding` and the PSScriptAnalyzer rule set are the official baseline. PSScriptAnalyzer rules "are based on PowerShell best practices identified by PowerShell Team and the community". [DOC] https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview (2026-03-20 page date; consulted 2026-11-10)
- Project today: `$ErrorActionPreference = 'Stop'` at the top of `installer.ps1`; no `Set-StrictMode`. [MEDIDO]
- Recommended: add `Set-StrictMode -Version 2.0` only after tests on Windows, since it turns uninitialized variables into errors and can change behavior. [MED]

### 3.2 PowerShell 5.1 versus 7
- The binary is `powershell.exe` (Windows PowerShell 5.1, .NET Framework) versus `pwsh.exe` (7.x, .NET); they are side by side, and `pwsh` changed the first positional parameter from `-Command` to `-File`. [DOC] https://learn.microsoft.com/en-us/powershell/scripting/whats-new/differences-from-windows-powershell (2026-02-04; consulted 2026-11-10)
- The `.bat` wrapper calls `powershell.exe`, so **the installer must stay valid 5.1 syntax**: no `?.`, `??`, ternary, pipeline chain operators (`&&`, `||`), which exist only in 7.x. [DOC] same page (null-conditional operators listed as 7.x features).
- `Invoke-WebRequest` in 7.x uses `HttpClient` and has breaking differences from 5.1. Installer already uses `curl.exe`. [DOC]
- Previous research (index row on GitHub Actions + `pwsh`) covers CI usage of `pwsh`; the Windows runner also has 5.1. Recommendation: CI should run the installer test under `powershell.exe` (5.1) because that is what users run. [MED] (verify the existing `installer-smoke` job already does this).

### 3.3 Execution policy
- "The execution policy isn't a security boundary, it's defense in depth." Default on Windows clients with nothing set is `Restricted`; `RemoteSigned` is the default on servers. Enforcement happens only on Windows. [DOC] https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies (2026-08-31; consulted 2026-11-10)
- `Bypass` is "designed for configurations in which a PowerShell script is built into a larger application". That matches the project: the `.bat` runs `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command` with the script held in memory (`[ScriptBlock]::Create`). [DOC] + [MEDIDO]
- Policy applies to script *files*; this installer is passed as a command string, so the practical user barrier is Windows SmartScreen/Mark-of-the-Web on the downloaded `.bat`, not the execution policy. Downloads via `curl.exe`/`Invoke-WebRequest` do not get the Mark of the Web. [DOC] same page.
- Recommendation: keep `Bypass` scoped to the single process (as is) and never `Set-ExecutionPolicy` machine-wide. Publish the SHA-256 of each installer in the release notes so users can verify. [DOC for scope; the checksum is a common practice, [COM]]

### 3.4 Security
- Avoid `Invoke-Expression`; PSScriptAnalyzer flags it (`PSAvoidUsingInvokeExpression`). [DOC] (rule named in the overview page: "Use of `Invoke-Expression`"). Current installer: `Select-String`, no `Invoke-Expression`/`iex` found by grep. [MEDIDO]
- The `.env` file holds only port, image tag, locale and a path; secrets live in Docker volumes. Good. [MEDIDO]
- Do not echo secrets in `Validar-SubaruShogun.ps1` reports: already masks tokens, never reads `.env`. [MEDIDO] (script header).

### 3.5 Encoding pitfalls (highest-value PowerShell finding)
- Windows PowerShell 5.1 reads a script without BOM as the legacy ANSI code page; "If you need to use non-Ascii characters in your scripts, save them as UTF-8 with BOM." PowerShell 7 defaults to `utf8NoBOM`. `Set-Content` in 5.1 defaults to the ANSI code page; `Out-File` and `>` write UTF-16LE. [DOC] https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding (page date 2023-03-09, updated 2025-09-29; consulted 2026-11-10)
- Project status: `Validar-SubaruShogun.ps1` has a UTF-8 BOM (correct for 5.1). `installer.ps1` has no BOM but is shipped inside the `.bat` as UTF-16LE base64, so accents survive. Running the raw `installer.ps1` directly in 5.1 would garble accents. [MEDIDO] (`file` output).
- **Risk to investigate:** `Save-Config` writes `.env` with `Set-Content -Encoding ascii` and includes `LOCAL_COMMUNITY_CATALOG_DIRECTORY`, built from `$InstallHome` (`%LOCALAPPDATA%`). If the Windows user profile path contains an accent (for example "João"), ASCII encoding replaces the character with `?` and the bind-mount path becomes wrong. Not reproduced (no Windows host here). [MED] Test: create a Windows user named with an accent, run install, inspect `.env`. Safer 5.1-compatible write: `[IO.File]::WriteAllLines($EnvFile, $lines, [Text.UTF8Encoding]::new($false))`, which gives UTF-8 without BOM in both 5.1 and 7 (Compose reads `.env` as text; no BOM). The no-BOM advice is [DOC] (same page: "avoid using BOMs in UTF-8 files" for Unix tools); the failure scenario is [MED].
- Also `Get-Content` without `-Encoding` in 5.1 reads BOM-less files as ANSI. Pair reads with the same encoding used for writes. [DOC] same page.

### 3.6 Performance
- Official guidance (with benchmark tables from Microsoft, PowerShell 7.3/7.4 on Windows 11): avoid `+=` on arrays (3,424x slower at 10k items in the sample), use `List[T]` or an array expression; avoid `Out-Null` in large loops (1.5x to 2.2x slower than `$null =`); `Write-Host` can be an order of magnitude slower than `[Console]::WriteLine()`; use `-join` instead of `+=` for strings. Array `+=` was optimized only in 7.5, so 5.1 keeps the cost. [DOC] https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/performance/script-authoring-considerations (2026-01-21; consulted 2026-11-10)
- Project: installer loops are tiny (menus, port probes, a few `.env` lines). Script performance is **not** a bottleneck; the time is Docker pull and container start. Do not rewrite for speed. [MED] (no measurement shows a PowerShell hot spot; `$imageNames += ...` on a handful of items is irrelevant).

### 3.7 Tooling and how to run without installing on the host
- PSScriptAnalyzer: `Install-Module PSScriptAnalyzer` (works on 5.1 and PowerShell 7.2.11+). [DOC] overview page above. Typical severities: Error, Warning, Information.
- Attempt on 2026-11-10: container `mcr.microsoft.com/powershell:latest` resolved to PowerShell 7.4.2; PSScriptAnalyzer 1.25.0 refused to load ("Minimum supported version") and 1.24.0 needed assembly 7.4.6. Tag `lts-ubuntu-24.04` does not exist. **PSScriptAnalyzer was therefore not run**; use a Windows runner (`windows-latest` already used in CI) or a newer pinned `mcr.microsoft.com/powershell` tag found in the MCR tag list. [MEDIDO limitation]
- Formatting: PSScriptAnalyzer can format code (`Invoke-Formatter`). [DOC] overview ("can also fix the formatting").

### 3.8 Checklist for this project (PowerShell)
| # | Action | Tag | Files |
|---|--------|-----|-------|
| P1 | Keep installer syntax PS 5.1-compatible; add a CI parse check under `powershell.exe` | [DOC]/[MED] | `apps/infra/installer/installer.ps1` |
| P2 | Replace `Set-Content -Encoding ascii` for `.env` with UTF-8 no BOM; add a test with an accented profile path | [MED] | installer.ps1 lines ~335, 347, 359 |
| P3 | Run PSScriptAnalyzer on `windows-latest` (severity Warning+Error), fail on Error only at first | [DOC]/[MED] | both `.ps1` |
| P4 | Never `Set-ExecutionPolicy` machine-wide; keep `-ExecutionPolicy Bypass` per process | [DOC] | `package-installer.mjs` |
| P5 | Publish SHA-256 of installers in release notes | [COM] | `release.yml` |

## 4. Batch (.bat wrapper generated by package-installer.mjs)

### 4.1 Conventions and facts
- `setlocal` localizes environment changes until `endlocal` or the end of the file; `enabledelayedexpansion` must be requested explicitly and sets `ERRORLEVEL` 0 when the option is accepted. [DOC] https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setlocal (consulted 2026-11-10)
- `%~f0`, `%~dp0`, `%~nx0`: `%~f1` is the fully qualified path, `%~dp1` drive plus path; `%~` modifiers do not work with `%*`; do not use pipes or redirection with `call`. [DOC] https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/call (consulted 2026-11-10)
- Official Microsoft documentation for batch is a command reference only; there is no official style guide or linter. Everything below beyond those pages is [COM].

### 4.2 Current wrapper (what it does)
`@echo off`, `setlocal`, `goto :run`, a base64 payload between `:payload` and `:endpayload`, then `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "...ReadAllText('%~f0')..."` and `exit /b %errorlevel%`. File is CRLF and pure ASCII. [MEDIDO] `package-installer.mjs` lines 56-77.

### 4.3 Pitfalls relevant here
- **Apostrophe in the path:** `'%~f0'` sits inside a PowerShell single-quoted literal; a folder like `C:\Users\Joe\O'Brien\Downloads` ends the string early. Not reproduced. [MED] Safer option: pass the path through an environment variable (`set "QUEUEBOT_SELF=%~f0"`) and read `$env:QUEUEBOT_SELF` in PowerShell; this also avoids `%`/`!` quirks. The environment-variable approach is a common technique [COM]; the apostrophe failure is a PowerShell quoting rule (single quotes end at an unescaped `'`), documented in `about_Quoting_Rules` [DOC, not fetched in this session: verify].
- **`exit /b %errorlevel%`** is correct, but `%errorlevel%` expands when the line is parsed. It works because it is a standalone line after PowerShell returns. Alternative `exit /b` without a value propagates the last errorlevel in extensions mode. [COM]
- **Label jump over data:** `goto :run` before the payload is the standard trick; lines are 76 chars (cmd limit is 8191). LF-only line endings can break label search in some cmd versions [COM]; the generator emits `\r\n` explicitly and `.gitattributes` pins `*.bat` to CRLF. [MEDIDO]
- **No `chcp` needed:** the file has no non-ASCII text, which avoids OEM versus ANSI problems. [MEDIDO]
- **Windows-specific unknowns not testable here:** behavior with paths containing `^`, `&`, `%`, `!`. `!` is safe because delayed expansion is off. [DOC] (`setlocal` page: delayed expansion is opt-in).

### 4.3b Checklist (Batch)
| # | Action | Tag |
|---|--------|-----|
| B1 | Pass `%~f0` to PowerShell via an environment variable instead of a single-quoted literal; add a test with `O'Brien` and `João` folders on the Windows runner | [MED] |
| B2 | Keep the file ASCII and CRLF; add a unit test asserting no LF-only lines and no bytes above 0x7F (the existing contract test `windows-installer-contract.test.js` is a natural home) | [MED] |
| B3 | No batch linter exists officially; rely on the Windows runner smoke test | [DOC: none exists] |

## 5. Shell (installer.sh / .command, workflow `run:` blocks)

### 5.1 Conventions and tooling
- ShellCheck is "a GPLv3 tool that gives warnings and suggestions for bash/sh scripts". Docker run: `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable myscript` (README). Severity levels error/warning/info/style; `-s sh` selects the dialect (shebang is also honored). [DOC] https://raw.githubusercontent.com/koalaman/shellcheck/master/README.md (consulted 2026-11-10)
- Formatter: shfmt ("formats shell programs"; supports POSIX, Bash, Zsh, mksh). README docker pattern: `docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/mnt" -w /mnt <image> <args>`. [DOC] https://raw.githubusercontent.com/mvdan/sh/master/README.md. Image name `mvdan/shfmt` is common knowledge [COM].
- Measured: `installer.sh` `-s sh` yields 2x SC1112 (unicode apostrophe inside `printf` strings at lines 126 and 135), exit 1 because default threshold includes warnings. With `-S error` the exit is 0. [MEDIDO] Fix is cosmetic: either replace the typographic apostrophe by `'\''`-free wording, or `# shellcheck disable=SC1112` with a reason.

### 5.2 `set -e`, `pipefail`, `trap`, quoting
- The installer uses `#!/bin/sh` with `set -eu`. Good for POSIX sh. `pipefail` is not available in every POSIX `sh` of the past; do not add it to `/bin/sh` scripts without testing on dash and macOS `/bin/sh` (bash 3.2 in POSIX mode). [COM; POSIX.1-2024 added pipefail but support in deployed shells varies: not verified here]
- `set -e` is unreliable: ignored in `if` conditions and `&&`/`||` lists, inside functions used as conditions, masked by `local x=$(cmd)`, pipelines use the last status unless `pipefail`. The Wooledge wiki recommends explicit checks (`|| exit 1`) for important commands and describes the "strict mode" claim as dubious. [DOC-like community reference, authoritative for Bash] https://mywiki.wooledge.org/BashFAQ/105 (consulted 2026-11-10) [COM]
- GitHub-hosted runners: omitting `shell:` runs `bash -e {0}`; `shell: bash` runs `bash --noprofile --norc -eo pipefail {0}`. So steps without `shell: bash` have **no `pipefail`**. The workflows use explicit `set -euo pipefail` in multi-line blocks (e.g. OpenGrep install) which is the right compensation. [DOC] https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax (consulted 2026-11-10)
- `trap` for cleanup: installer uses `mktemp` (line ~352) and `chmod 600` + `mv` for `.env` (line ~481), which is the atomic-write pattern. Confirm a `trap 'rm -f "$tmp"' EXIT` exists around the temp file; grep found no `trap` in `installer.sh`. [MEDIDO] A leftover temp file contains `.env` content copy (no secret values, but port and path). [MED] severity low.
- Quoting: ShellCheck found no SC2086/SC2046 in `installer.sh`. [MEDIDO]

### 5.3 Portability macOS versus Linux
- Since macOS Catalina, zsh is the default login/interactive shell; Apple's page says scripts relying on bash-specific features may fail under another shell and that `/bin/sh` behavior can be tested against bash, dash or zsh. [DOC] https://support.apple.com/en-us/102360 (consulted 2026-11-10)
- macOS ships bash 3.2 (no associative arrays, no `mapfile`, no `${var,,}`); Apple's page does not state the version, so it is [COM]. Using `#!/bin/sh` and ShellCheck `-s sh` (zero SC3xxx findings measured) is the right approach. `.command` files are launched by Terminal using the shebang. [MEDIDO] for ShellCheck result.
- BSD versus GNU: `sed -i`, `date -d`, `readlink -f`, `stat` flags differ. grep of `installer.sh` shows only `sed -n`, `mktemp`, `chmod`, `uname -s`, which are portable. [MEDIDO]

### 5.4 Security
- Never interpolate untrusted data into command strings (`eval`, `sh -c "$var"`); `installer.sh` has no `eval`. [MEDIDO] `curl --insecure` appears only for the health check against the local self-signed `https://localhost` endpoint (line ~374); acceptable because it targets loopback and only checks readiness. [MED] Prefer `--cacert` with the local CA that the product already exports (`.local/localhost-ca.crt`). [COM]
- Secrets: file mode `600` for `.env`. [MEDIDO]

### 5.5 Checklist (Shell)
| # | Action | Tag |
|---|--------|-----|
| S1 | Add ShellCheck (`-s sh`, fail on warning) for `apps/infra/installer/installer.sh` and `.devcontainer/post-create.sh`; fix or justify the 2 SC1112 | [MEDIDO]/[DOC] |
| S2 | Use ShellCheck inside actionlint (remove `-shellcheck=` from `quality-gates.yml:170`), fix SC2129/SC2034 in `main-cd.yml:44`, `release.yml:40`, `release.yml:288`; run actionlint's shellcheck only if the runner has ShellCheck (ubuntu-24.04 image ships it, per actionlint docs) | [MEDIDO]/[DOC] |
| S3 | Add `trap ... EXIT` for the temp file around installer.sh line ~352 | [MED] |
| S4 | Keep `/bin/sh` plus `set -eu`; do not add bashisms | [DOC] |

## 6. GitHub Actions (.github/workflows/*)

### 6.1 Conventions
- Pin to a full-length commit SHA from the action's own repository; tags can be moved. Set default `GITHUB_TOKEN` to read-only and raise per job; pass untrusted expressions through an intermediate `env:` variable and quote shell variables; avoid `pull_request_target` unless needed and never check out untrusted PR code there; self-hosted runners almost never for public repos; use Dependabot version updates for action references; use OIDC instead of long-lived cloud secrets. [DOC] https://docs.github.com/en/actions/reference/security/secure-use (consulted 2026-11-10)
- `permissions`: "If you specify the access for any of these permissions, all of those that are not specified are set to `none`"; `permissions: {}` disables all. `queue` key exists under `concurrency` (`single` default, `max` allows up to 100 pending); "The combination of `queue: max` and `cancel-in-progress: true` is not allowed". [DOC] workflow-syntax page above.
- Since 2025-08-15 an organization/repository policy can enforce SHA pinning (`sha_pinning_required`). [DOC] https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/ (via search result; page not opened) and community write-ups [COM]; exact current behavior unverified.

### 6.2 What the project already does well [MEDIDO]
- 100% SHA-pinned `uses:` with `# vX.Y.Z` comment; `permissions: contents: read` top level; `packages: write` only on the publish job; `permissions: {}` on a no-token job; `timeout-minutes` on all jobs; `concurrency` with `cancel-in-progress: true` for CI and `false` plus `queue: max` for publish/release; `docker login` with `--password-stdin`; `GITHUB_TOKEN` passed through `env:` not inline; cosign and actionlint installed from pinned versions with checksum verification; `quality-gate` aggregate job with `if: always()`.
- Note on `queue: max`: actionlint does not yet know the key, so the project ignores that single message; a pinned actionlint upgrade should remove the ignore when supported. [MEDIDO] (`quality-gates.yml:170`). Do not reopen: covered by `docs/research-index.md`.

### 6.3 Findings
| # | Finding | Evidence | Tag |
|---|---------|----------|-----|
| A1 | No `persist-credentials: false` on any of the 12 checkouts (zizmor `artipacked`, medium). The default leaves the token in `.git/config` for later steps and any artifact that includes `.git`. None of the jobs push commits. | zizmor output, `grep` | [MEDIDO] (impact [DOC]-supported by secure-use guidance on token exposure) |
| A2 | No `.github/dependabot.yml`; SHA pins and base images will age without notice. Dependabot supports `github-actions`, `docker`, `docker-compose` and `npm`; Docker/Compose updates are version updates only, security updates only for actions and npm. | `ls .github`; docs | [MEDIDO]/[DOC] https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories (consulted 2026-11-10) |
| A3 | `-shellcheck=` disables ShellCheck inside actionlint (4 findings hidden). | actionlint with ShellCheck | [MEDIDO] |
| A4 | `${{ steps.installer-version.outputs.version }}`, `${{ matrix.platform }}` interpolated directly in `run:` (`quality-gates.yml:86`): zizmor info. Values come from the repo itself, risk is low; moving to `env:` is the documented pattern. | zizmor, secure-use page | [MEDIDO]/[DOC] |
| A5 | zizmor `self-repository` help: `uses: ./.github/workflows/...` written as local path inside reusable workflow calls (`ci.yml:19`, `main-cd.yml:14`). Style, not a vulnerability. | zizmor | [MEDIDO] |
| A6 | Three workflows trigger on `push` to `main` plus a `release` run-level guard on `github.actor`. The guard is fine; `workflow_dispatch` restricted by actor is a good practice. | file read | [MEDIDO] |

### 6.4 Performance and reliability
- Docker layer cache in CI uses `type=gha,mode=max` per architecture scope. Good; cache size counts against the 10 GB repository cache limit (limit from GitHub docs, [DOC] not re-fetched this session). [MED] measure hit rate before changing.
- `actions/setup-node` with `cache: npm` caches the npm download cache, not `node_modules`; `npm ci` always removes `node_modules`. [DOC-like, setup-node README: not re-fetched] [COM]
- `timeout-minutes` default is 360 when omitted (GitHub docs, from memory, not re-fetched this session: verify). Project sets explicit values: good.
- Jobs can use `strategy.fail-fast: false` for installer matrix (already `false` in `release.yml`). [MEDIDO]
- Retry: do not add blind retries on tests; for network steps (`curl` of OpenGrep install) use `curl --retry 3 --retry-all-errors`. [COM] [MED]
- `concurrency.group` names are case-insensitive. [DOC] workflow-syntax page.

### 6.5 Tools
actionlint (syntax, expressions, runner labels, shellcheck/pyflakes integration; exit 1 on problems) and zizmor (security: template injection, credential persistence, excessive permissions, impostor commits). [DOC] https://github.com/rhysd/actionlint/blob/main/docs/usage.md, https://raw.githubusercontent.com/zizmorcore/zizmor/main/README.md. Run via Docker: `rhysd/actionlint:latest` (bundles shellcheck) and `ghcr.io/zizmorcore/zizmor:latest`, both worked here. [MEDIDO] For CI use pinned tags/digests, not `latest`.

### 6.6 Checklist (Actions)
1. Add `persist-credentials: false` to all 12 `actions/checkout` steps (the contract test `tests/unit/ci-workflow-contract.test.js` can assert it). [MEDIDO]
2. Add `.github/dependabot.yml` for 4 ecosystems with weekly grouped updates. [DOC]
3. Enable ShellCheck inside actionlint; fix 4 findings. [MEDIDO]
4. Add zizmor as a CI job (pinned container digest; start non-blocking, then block on medium+). [MEDIDO]
5. Move `${{ ... }}` from `run:` into `env:` in `quality-gates.yml:86` and the two `package-installer` lines in `release.yml`/`main-cd.yml`. [DOC]
6. Decide whether to enable the organization/repository "Enforce SHA pinning" policy. Owner decision. [DOC, behavior unverified]

## 7. Dockerfile

### 7.1 Conventions [DOC]
https://docs.docker.com/build/building/best-practices/ (consulted 2026-11-10): pin base images to a digest for supply-chain integrity (but this opts out of automatic security fixes, so pair with Dependabot); use multi-stage builds and `COPY --from`; `.dockerignore` to exclude irrelevant files; `USER` with an explicit UID/GID; `CMD` in exec form; use `exec "$@"` in entrypoints; `--pull` and `--no-cache` for fresh builds; combine `apt-get update` with install and clean lists in the same `RUN`. The page does not cover HEALTHCHECK, apk patterns, secret mounts or cache mounts.
Node specifics (Docker's Node project): run as the unprivileged `node` user, "Node.js was not designed to run as PID 1" so use `--init`/Tini, prefer `CMD ["node", ...]` over `npm start` so signals reach Node, `NODE_ENV=production`. [DOC] https://raw.githubusercontent.com/nodejs/docker-node/main/docs/BestPractices.md (consulted 2026-11-10)

### 7.2 Current Dockerfile against the guidance [MEDIDO]
| Aspect | State | Verdict |
|--------|-------|---------|
| Multi-stage, `COPY --from` | 3 stages | good |
| Base | `node:24.20.0-alpine3.24` tag, no digest | pin by digest + Dependabot [DOC]; project trade-off: Node patch-pinned already |
| Layer cache order | `package*.json` then `npm ci`, then sources | good |
| `.dockerignore` | `.git`, `.env*`, secrets, `node_modules`, `.next`, `tests`, `docs`, `.aiox`, dumps | good |
| User | `USER 10001:10001` | good (explicit UID) |
| CMD | exec form `node apps/infra/scripts/start-product.mjs` | good |
| PID 1 | `init: true` in Compose for `bot` | good (equivalent to `--init`) |
| `apk add --no-cache openssl` | unpinned | Hadolint DL3018 x2, low value to pin on Alpine; ignore with a justification in `.hadolint.yaml` [COM] |
| `HEALTHCHECK` | not in image; defined in Compose | fine for Compose-only use; add in image only if the image is run outside Compose [MED] |
| Dev dependencies in runtime | `COPY --from=dependencies /app/node_modules` (full tree) | 738 MB layer of 1.32 GB image [MEDIDO]; candidate to slim [MED] |
| `ARG PRODUCT_VERSION` | not secret | fine; do not pass tokens as build args [DOC-adjacent] |

### 7.3 Performance
- Cache mounts (`RUN --mount=type=cache,target=/root/.npm`) speed up repeated `npm ci` in CI and local rebuilds; not covered in the best-practices page, so source is BuildKit docs: unverified here. [MED] Measure cold and warm build times before changing; CI already uses a GHA layer cache.
- Slimming `node_modules`: use a second install stage `npm ci --omit=dev` and copy that tree, but only if the runtime (migrate, Prisma client, Next production server) does not require dev packages; `prisma generate` runs in the runtime stage at build time and needs the `prisma` CLI. Test with the existing Compose runtime integration tests. [MED]
- `npm ci` supports `--omit=dev`. [COM/DOC-adjacent: npm docs not fetched]

### 7.4 Security
- Scan the image with Trivy or Docker Scout (not fetched here; both are widely documented). [MED]/[COM]
- Build uses `DATABASE_URL=postgresql://queuebot:build-only@db:5432/queuebot` as a command-prefix variable for `prisma generate`; not a secret and not stored in an ENV layer. Acceptable. [MEDIDO]
- `bootstrap` service in Compose runs as `0:0`: it writes secrets/certs into a volume; scope is minimal and documented. [MEDIDO]

### 7.5 Checklist (Dockerfile)
1. Add Hadolint in CI with `.hadolint.yaml` ignoring DL3018 (reason documented), `failure-threshold: warning`. [MEDIDO]
2. Digest-pin `FROM` lines and use Dependabot `docker` updates. [DOC]
3. Measure a production-only `node_modules` stage; adopt only if tests pass and the image shrinks meaningfully. [MED]
4. Keep `.dockerignore` in parity with `.gitignore` for secrets (already). [MEDIDO]

## 8. Docker Compose (compose.yaml, compose.build.yaml, compose.dev.yaml)

### 8.1 Conventions [DOC]
- `depends_on` conditions `service_started`, `service_healthy`, `service_completed_successfully`; Compose alone only waits for "running", not readiness; `healthcheck` options `interval`, `timeout`, `retries`, `start_period` (and `start_interval`, Compose 2.20.2+); `depends_on.restart: true` (2.17.0+) restarts dependents after an explicit Compose restart. https://docs.docker.com/compose/how-tos/startup-order/ and https://docs.docker.com/reference/compose-file/services/ (consulted 2026-11-10)
- `profiles`: services without profiles always start; names `[a-zA-Z0-9][a-zA-Z0-9_.-]+`. `restart`: `no` (default), `always`, `on-failure[:max]`, `unless-stopped`. `init: true` forwards signals and reaps processes. `stop_grace_period` default 10 s. `pull_policy` default `missing`, `latest` always pulled. `cap_drop`, `read_only`, `security_opt: no-new-privileges` available. [DOC] services reference.
- Project name precedence: `-p` > `COMPOSE_PROJECT_NAME` > top-level `name:` > project directory; allowed characters lowercase letters, digits, dash, underscore. [DOC] https://docs.docker.com/compose/how-tos/project-name/ (consulted 2026-11-10)

### 8.2 Current files [MEDIDO]
- `compose.yaml`: top-level `name: subarushogun-gi-twitch-queue-bot` (volumes and networks get a stable prefix; dev file uses a different `name`, so the two never share volumes: good); startup chain `bootstrap` → `db` (healthcheck `pg_isready`, `start_period: 10s`) → `migrate` → `bot` (own healthcheck, `init: true`, `stop_grace_period: 30s`); port bound to `127.0.0.1`; secrets in a named volume mounted read-only in dependents; bind mount with `create_host_path: true`; `user: "10001:10001"` plus `group_add` for the secrets volume group; Postgres 18 data volume at `/var/lib/postgresql` (the layout PostgreSQL 18 images expect, per the official image notes; not re-fetched this session).
- `compose.dev.yaml`: Compose `secrets:` with a file, port bound to loopback, `restart: unless-stopped`.

### 8.3 Opportunities
| # | Item | Tag |
|---|------|-----|
| C1 | `bot` and `db` have no `restart:` policy (default `no`). For an always-on local product after reboot, `unless-stopped` may be wanted; it also affects how the uninstaller and tests behave. Owner/product decision. | [DOC]/owner |
| C2 | Hardening of `bot`: `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `read_only: true` with `tmpfs` for writable paths. Test needed because Next.js and the app write under `/app/.local`. | [DOC]/[MED] |
| C3 | Pin `postgres:18.6-bookworm` by digest and cover by Dependabot `docker-compose`. | [DOC] |
| C4 | `docker compose config --quiet` already runs in CI (`container-build`). Add `docker compose --profile "*" config` only if profiles are introduced. | [DOC] |
| C5 | Resource limits (`mem_limit`) are not set; measure memory in the real Windows/macOS Docker Desktop VM before limiting. | [MED] |

### 8.4 Pitfalls
- A healthcheck is a readiness signal, not a restart mechanism: Docker marks `unhealthy` but does not restart; Compose only uses it for ordering. [DOC] startup-order page.
- Volumes and networks are prefixed by project name; changing `name:` orphans existing data. Treat `name:` as a stable contract. [DOC] project-name page (naming rules); the orphaning consequence is inferred from the same rules [MED].
- Bind mount of `${LOCAL_CERT_DIRECTORY:-./.local}`: on Windows paths with spaces, drive letters and accents are the typical failure; the installer writes absolute paths into `.env` (see P2). [MED]

## 9. YAML

- Where it matters here: workflows, Compose, `docs/qa/gates/*.yml`, task/templates of the framework.
- YAML 1.1 treats unquoted `yes/no/on/off/y/n` (case-insensitive) as booleans and leading-zero numbers as octal; YAML 1.2 narrowed booleans to `true`/`false`. Parsers differ in which spec they follow (sources disagree on some Go and JS parsers). [COM] summarized from search results on 2026-11-10 (for example https://allan.reyes.sh/posts/yaml-norway-law/); verify per parser. In GitHub workflows, the `on:` key is a classic trap for 1.1 tooling (yamllint's `truthy` rule exists for this).
- yamllint rules relevant to type pitfalls: `truthy`, `octal-values`, `quoted-strings`, `key-duplicates`, `key-ordering`, `line-length` (default 80), `document-start`, `indentation`. [DOC] https://yamllint.readthedocs.io/en/stable/rules.html (consulted 2026-11-10)
- Measured with preset `relaxed`: 85 `line-length` warnings only; nothing on truthy, duplicate keys or octal. [MEDIDO] Preset `default` was not run (it would flag `on:`); define a project `.yamllint` with `line-length: disable` and `truthy: {check-keys: false}` if added.
- Anchors and merge keys: Compose supports anchors and `x-` extension fields for reuse; the three repeated `image:` and `build.args` blocks in `compose.build.yaml` could use an `x-` anchor, but with three small services the saving is cosmetic. [COM] [MED] low priority. Merge key `<<` is a 1.1 feature; confirm Compose support before relying on it. [COM], not verified.
- Quote strings that look like numbers/booleans (versions like `"24.20"`, ports `"3000:3000"`). The project quotes ports already. [MEDIDO]
- CRLF in YAML: `.gitattributes` forces LF for `*.yml`/`*.yaml` so Windows checkouts cannot break Compose. [MEDIDO]

## 10. Linter table

| Tool | Language | How to run without installing on the host | Typical severity | Measured here |
|------|----------|--------------------------------------------|------------------|---------------|
| actionlint | GitHub Actions YAML (+ embedded ShellCheck, pyflakes) | `docker run --rm -v "$PWD:/repo:ro" -w /repo rhysd/actionlint:latest` or pinned release binary with checksum (as in CI) | error (exit 1 on any finding) | 4 notes with ShellCheck on; 0 with it off |
| zizmor | GitHub Actions security | `docker run --rm -v "$PWD:/mnt:ro" -w /mnt ghcr.io/zizmorcore/zizmor:latest .github/workflows` | high / medium / low / informational | 27 findings, 12 medium (artipacked) |
| ShellCheck | sh/bash | `docker run --rm -v "$PWD:/mnt:ro" -w /mnt koalaman/shellcheck:stable -s sh file` | error / warning / info / style | 2 warnings in `installer.sh` |
| shfmt | sh/bash formatting | `docker run --rm -v "$PWD:/mnt" -w /mnt mvdan/shfmt -d file` ([COM] image name) | formatting diff, not severity | not run |
| Hadolint | Dockerfile (+ ShellCheck on `RUN`) | `docker run --rm -i hadolint/hadolint < Dockerfile` (README) | error / warning / info / style; `--failure-threshold` | 2 warnings (DL3018) |
| yamllint | YAML | `docker run --rm -v "$PWD:/mnt:ro" -w /mnt cytopia/yamllint -d relaxed .` (community image; official route is `pip install yamllint`) | error / warning per rule | 85 line-length warnings |
| PSScriptAnalyzer | PowerShell | `Install-Module PSScriptAnalyzer`; in a container needs a PowerShell image new enough for the module | Error / Warning / Information | NOT RUN (see 3.7) |
| `docker compose config --quiet` | Compose | built into Docker | error | already in CI |
| Batch | none official | Windows runner smoke test | n/a | n/a |

Note: running these in CI should use pinned versions or digests, matching the project's existing practice for cosign, OpenGrep and actionlint.

## 11. Risks and limitations

- No Windows or macOS host: every PowerShell, Batch and macOS statement is documentation-based or reasoned; PS 5.1 behavior was not executed. The accent/apostrophe path failures (P2, B1) are hypotheses with a clear test, not confirmed bugs.
- Several documentation pages were fetched through a summarizing tool; quotes come from that extraction. A few items were stated from background knowledge and are marked "not re-fetched" (job timeout default 360 min, cache size limit, Postgres 18 data path, `about_Quoting_Rules`).
- zizmor ran offline from a container without a GitHub token; its online audits may have been skipped. 11 findings were "suppressed" by tool defaults; not inspected.
- PSScriptAnalyzer could not be executed in a Linux container (version mismatch); results for PowerShell static analysis are missing.
- Community sources (YAML 1.1/1.2 parser behavior, Batch tricks, pipefail portability) are secondary; weigh accordingly.
- Docker pulled five tool images locally (shellcheck, hadolint, yamllint, zizmor, actionlint plus the MCR PowerShell image). They are disposable; no project resource was changed or removed. Outputs are in `.local/lote-b/` (git-ignored).

## 12. What depends on the owner

1. Adopt Dependabot (new PRs weekly) and its grouping policy.
2. Add linters to CI and the severity at which they block (suggested: ShellCheck, Hadolint, zizmor non-blocking first).
3. Enable the "Enforce SHA pinning" repository/organization policy.
4. Compose `restart:` policy for an always-on local product and hardening (`cap_drop`, `read_only`).
5. Digest pinning of base images (trade-off: manual or Dependabot updates).
6. Whether to require PowerShell 7 later (today the `.bat` targets 5.1, available on every Windows 10/11).
7. Image slimming (production-only dependencies) if the 1.32 GB size matters for user downloads.

## 13. Next steps (for @pm / @dev / @devops / @qa, no implementation here)

- `@dev`: P2, B1, S1/S3, A1, A5 with tests; Dockerfile slimming experiment with before/after size and test results.
- `@qa`: Windows runner tests for accent and apostrophe paths; run PSScriptAnalyzer on `windows-latest`.
- `@devops`: Dependabot file, CI linter jobs, SHA-pinning policy, after owner OK; index this note in `docs/research-index.md` (verdict suggestion: SUFFICIENT for conventions; REFRESH IF the project adopts PowerShell 7 or changes the Compose restart/hardening model).

## 14. Self-assessment (rubric, 0-10)

| Criterion | Score | Justification |
|-----------|-------|---------------|
| Official sources | 9.0 | Microsoft Learn, GitHub Docs, Docker Docs, ShellCheck/Hadolint/shfmt/actionlint/zizmor READMEs; some items from memory flagged; YAML and Batch rely partly on community |
| Evidence | 9.3 | Six tools executed against the real repository; image history inspected; limitations stated (PSScriptAnalyzer not run) |
| Fit to the project | 9.5 | Every section ties to real files and lines |
| Security | 9.2 | Token persistence, injection, pinning, update automation, execution policy, supply chain covered |
| Measurability | 9.0 | Each recommendation has a tag and a test or measurement; accent/apostrophe cases have explicit reproduction steps |
| **Average** | **9.2** | Above the 9.0 target |

## Sources (consulted 2026-11-10)

- GitHub Docs, Secure use reference: https://docs.github.com/en/actions/reference/security/secure-use
- GitHub Docs, Workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub Docs, Dependabot supported ecosystems: https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories
- GitHub changelog, SHA pinning policy (2025-08-15): https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/
- Docker, Build best practices: https://docs.docker.com/build/building/best-practices/
- Docker, Compose startup order: https://docs.docker.com/compose/how-tos/startup-order/
- Docker, Compose services reference: https://docs.docker.com/reference/compose-file/services/
- Docker, Compose project name: https://docs.docker.com/compose/how-tos/project-name/
- Docker Node best practices: https://raw.githubusercontent.com/nodejs/docker-node/main/docs/BestPractices.md
- Microsoft Learn, about_Execution_Policies: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies
- Microsoft Learn, about_Character_Encoding: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding
- Microsoft Learn, Differences between Windows PowerShell 5.1 and 7.x: https://learn.microsoft.com/en-us/powershell/scripting/whats-new/differences-from-windows-powershell
- Microsoft Learn, PowerShell performance considerations: https://learn.microsoft.com/en-us/powershell/scripting/dev-cross-plat/performance/script-authoring-considerations
- Microsoft Learn, PSScriptAnalyzer: https://learn.microsoft.com/en-us/powershell/utility-modules/psscriptanalyzer/overview
- Microsoft Learn, setlocal and call: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setlocal , https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/call
- ShellCheck README: https://raw.githubusercontent.com/koalaman/shellcheck/master/README.md
- shfmt (mvdan/sh) README: https://raw.githubusercontent.com/mvdan/sh/master/README.md
- Hadolint README: https://raw.githubusercontent.com/hadolint/hadolint/master/README.md
- actionlint usage: https://github.com/rhysd/actionlint/blob/main/docs/usage.md
- zizmor README: https://raw.githubusercontent.com/zizmorcore/zizmor/main/README.md
- yamllint rules: https://yamllint.readthedocs.io/en/stable/rules.html
- Bash FAQ 105 (set -e): https://mywiki.wooledge.org/BashFAQ/105
- Apple Support, zsh as default shell: https://support.apple.com/en-us/102360
- Community (YAML 1.1 vs 1.2): https://allan.reyes.sh/posts/yaml-norway-law/
