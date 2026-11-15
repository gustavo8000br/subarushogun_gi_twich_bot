# Owner-only test installer on GitHub: gaps L1 to L5 (research note)

[Português brasileiro](../../pt-BR/research/2026-11-11-owner-test-installer-github/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-11 (all pages consulted on this date). Desk research, official GitHub and Microsoft documentation first. No code, config or git/GitHub state was changed; only this note, its pt-BR copy and the index rows were written.
- Input: `docs/stories/OPS-15/windows-owner-test-installer-design.md` (`@architect`, section 6, gaps L1 to L5). This note answers those gaps and says what changes in the design.
- Labels on every answer:
  - **DOC**: stated by an official page (link given; quotes are as returned by the page-reading tool, not by a browser).
  - **TEST**: not stated by the documentation, or only by community posts; needs a real run (owner on GitHub or Windows, or `@qa`).
  - **COMMUNITY**: forum, issue or blog evidence; opinion or anecdote.
  - **MEASURED**: measured on this machine today.
- Limits: the GitHub Docs and Microsoft Learn pages were read through a summarizing fetch tool, so a few sentences were not returned. "Not stated" below means "not in what the tool returned". No GitHub account other than the owner's was available, so nothing about what a non-collaborator sees was tested.

## 0. Executive summary

1. **Option C of the `@architect` is confirmed.** A `push` run uses the workflow file of the pushed commit, even on a branch that is not merged into the default branch (DOC). `workflow_dispatch` is documented as requiring the file on the default branch, so option A is not guaranteed (DOC). Nothing here forces a change to `main`.
2. **One design detail must change: "prevent self-review" must stay OFF.** The owner both pushes (triggers) and approves. With the option on, the owner cannot approve their own run (DOC), so the job would wait until it times out.
3. **Environments work for free on a public repository** (required reviewers up to 6, branch/tag rules, Environment secrets; DOC). The secret is released only after approval and only to the allowed branch (DOC).
4. **New risk found (L5): `--target "$GITHUB_SHA"`.** The REST page for creating a release says the token needs the `workflow` scope when the resolved target commit adds or changes files under `.github/workflows/` relative to the default branch. `GITHUB_TOKEN` has no `workflows` permission (DOC). The test branch always differs from `main` in that folder. Whether a **draft** is affected is not documented (TEST). Mitigation: use `--target main` (or the default branch SHA) and write the branch SHA in the notes.
5. **Drafts:** only users with push access get draft listings (DOC for the API); the direct download of a draft asset by an outsider is not documented (TEST, community says 404 or login). **Artifacts:** anyone with read access can list and download them, and on a public repository that is every signed-in account (DOC plus COMMUNITY). The decision "one job, no `upload-artifact`" is confirmed.
6. **PBKDF2 (L4):** the `HashAlgorithmName` constructors exist from .NET Framework 4.7.2 (DOC). Windows 10 ships 4.7.2 from version 1803 and 4.8 from 1903; older builds can install it (DOC). 600,000 iterations of PBKDF2-HMAC-SHA256 is the current OWASP figure (DOC). The speed in Windows PowerShell 5.1 is not documented; Node on this machine needs 0.40 s (MEASURED) and .NET Framework is reported 2 to 4 times slower than modern .NET (COMMUNITY), so expect about 1 to 2 s (TEST on Windows).
7. Seven items stay open and are tests, not research (section 7).

## 1. L1: `workflow_dispatch` and `push` on a non-default branch

| Question | Answer | Label | Source |
|---|---|---|---|
| Must the file exist on the default branch for `workflow_dispatch`? | Yes: "This event will only trigger a workflow run if the workflow file exists on the default branch." The manual-run page repeats: "To trigger the `workflow_dispatch` event, your workflow must be in the default branch." | DOC | [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) |
| Can it be dispatched against another branch? | The events page says: "Once a workflow has run at least once, you can dispatch it against any branch or tag via the GitHub API or GitHub CLI." The table gives `GITHUB_SHA` = "Last commit on the `GITHUB_REF` branch or tag" and `GITHUB_REF` = "Branch or tag that received dispatch". Read together: the file of the chosen ref is what runs, but the workflow must be registered first. The two sentences are in tension and the page does not settle a file that exists only off the default branch. | DOC + TEST | same page |
| Does the first run register it? | One blog (2025-08-19) says a workflow that never ran must run once first (it suggests a temporary `pull_request` trigger) and then `gh workflow run <file> --ref <branch>` works. Other threads report a 404 for a file that exists only on a feature branch and a fix by using the numeric workflow ID. None is official. | COMMUNITY | [blog](https://andreynautilus.github.io/posts/2025-08-19-github-workflow_dispatch-from-branch), [community search results](https://github.com/orgs/community/discussions/25756) |
| Is the file on the default branch needed for `push`? | No. The events page says the `push` event includes "workflows that are not merged into the default branch". `GITHUB_SHA` is the "tip commit pushed to the ref" and `GITHUB_REF` is the updated ref, so the file version of the pushed commit is used. | DOC | events page |
| Difference between the branch file and the default-branch file | `push` uses the pushed commit; `schedule` uses the default branch ("Scheduled workflows run on the latest commit on the default branch"); `pull_request_target` uses the base. So the only trigger that depends on the default branch for registration is the manual one. | DOC | events page |

Edge cases of `push` with `branches` + `paths` (DOC, [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)):

- Both filters must match; if either skips the run, nothing starts (and a required check would stay "Pending").
- Existing branch: the diff is head versus base SHA. **New branch:** the diff is against "the parent of the ancestor of the deepest commit pushed". So the first push of `test/windows-owner` triggers as long as some pushed commit touches the marker file.
- No changed files means no run. An **empty commit never triggers** a `paths`-filtered workflow. Each later run needs a commit that changes `.github/test-windows-owner.trigger` (for example a counter line).
- Path filters are not evaluated for tag pushes. More than 1,000 commits always runs; a diff timeout always runs; with over 3,000 changed files the match can be missed (the fetch tool reported 3,000, the architect's draft did not mention it; irrelevant here).
- Deleting the branch makes `GITHUB_SHA` revert to the default branch (DOC): do not rely on a delete event.
- Pushes made with the repository `GITHUB_TOKEN` do not start runs (DOC). The owner's own credentials are used, so this does not apply.
- Tags: not used by this design, so no tag-triggered workflow can fire.

**Implications for the design**

- D-T1 option **C is confirmed** by documentation. Keep `paths` + `branches` (+ actor guard). Write in the owner's guide: "change the marker line in each commit; an empty commit does nothing".
- Option A (`gh workflow run --ref`) is **not documented as working** for a file that exists only off the default branch. Treat it as TEST only. If the first push run happens, a later `gh workflow run <workflow-id> --ref test/windows-owner` might work (COMMUNITY); do not promise it and do not build on it.
- Keep `workflow_dispatch: {}` in the file only as an optional extra. It will not show a "Run workflow" button while the file is absent from `main` (DOC).
- CLI detail: the long flag is `--ref` (also `-r` in the installed `gh` 2.103.3, MEASURED by `gh workflow run --help`). The design says `-r`; both work locally, but the docs page lists only `--ref`.
- TEST L1-a (optional, costs one run): after the first push run, try dispatch by workflow ID with `--ref`. Not needed for C.

## 2. L2: Environments on a public repository, free plan

| Question | Answer | Label | Source |
|---|---|---|---|
| Available on the free plan of a public repository? | Yes. "Users with GitHub Free plans can only configure environments for public repositories." The REST page: environments, Environment secrets and deployment protection rules are available in public repositories on all current plans; required reviewers and wait timers are limited to public repositories on Free, Pro and Team. | DOC | [Managing environments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment), [REST environments](https://docs.github.com/en/rest/deployments/environments) |
| If the repository becomes private? | The page says rules and secrets on a repository that becomes private are ignored on Free. Consequence: no approval gate and no secret; the design's early abort on an empty secret then stops the job. Keep that abort. | DOC | managing-environments page |
| Who configures it? | Personal repository: the owner. Organization: `admin` access. Anyone who can edit workflows can create an environment just by naming it, but it starts with no rules and no secrets, and only admins configure it. | DOC | same |
| Required reviewers | Up to 6 users or teams. One approval is enough. Reviewers need at least read access. | DOC | same + REST |
| Can the author approve? | Optional setting "prevent self-review": the user who triggered the run cannot approve it, "even if they are a required reviewer". Off by default. **Sole owner = pusher = reviewer, so the setting must be OFF.** | DOC | managing page, [changelog 2023-10-16](https://github.blog/changelog/2023-10-16-actions-prevent-self-reviews-for-secure-deployments-across-actions-environments) |
| Admin bypass | "Allow administrators to bypass configured protection rules" is on by default. What it does for a required-reviewer gate is not described in what the tool returned. | DOC + TEST | managing page |
| Branch restriction | "Deployment branches": selected branches and tags with name patterns (branch or tag, set separately). Wildcards use Ruby `File.fnmatch` and `*` does not match `/`; the literal name `test/windows-owner` is exact. | DOC | [branch policies REST](https://docs.github.com/en/rest/deployments/branch-policies) |
| Secrets | Environment secrets reach only jobs that name the environment, and only after its rules pass. "A job cannot access environment secrets until a reviewer approves." | DOC | managing page, [secure use](https://docs.github.com/en/actions/reference/security/secure-use) |
| Other limits | Name up to 255 characters, case-insensitive, unique. Deleting the environment deletes its secrets and rules and fails waiting jobs. Wait timer 0 to 43,200 minutes. | DOC | managing page, REST |

**Residual risks (documented principle, not tested):**

- Anyone with write access can push a modified workflow to `test/windows-owner` and the owner would see an approval request for that run. The approval screen shows the commit; the owner must check it is theirs. Mitigation to evaluate: a branch ruleset limiting who can push the branch (rulesets on public repositories were not read in this pass: TEST).
- Masking is not guaranteed: "automatic redaction is not guaranteed", derived values (encodings) should be registered as secrets, and a leaked log must be deleted and the secret rotated (DOC, secure use). The PBKDF2 hash is not a password, but treat it as sensitive.
- Run logs of a public repository are public. That is stated by no page I read in this pass, so `@qa` must verify it on the first run (TEST) and keep every `echo` away from the hash and the draft URL.

**Implications for the design**

- Add to the owner steps: required reviewer = owner, **prevent self-review OFF**, deployment branch rule `test/windows-owner` (selected branches), admin bypass left as is (the owner approves anyway; TEST what happens).
- Keep the empty-secret abort in the job (also covers the "became private" case).
- Add an acceptance criterion: `@qa` confirms on the first real run that a push by the owner stops at "waiting for review" and that no secret value exists in the log before approval.

## 3. L3: who sees draft releases and Actions artifacts on a public repository

| Question | Answer | Label | Source |
|---|---|---|---|
| Who sees drafts? | REST list: "Only users with push access will receive listings for draft releases." Creating a release needs push access. | DOC | [REST releases](https://docs.github.com/en/rest/releases/releases) |
| Direct download of a draft asset by an outsider | The asset REST page says nothing about drafts and requires authentication for most calls. A community case reports a draft asset only downloadable when logged in with access, and another shows draft assets under a temporary `releases/download/untagged-<hash>/` path that 404s after publishing. Not official. Expect "404 or login" for outsiders, but prove it. | COMMUNITY + TEST | [asset REST](https://docs.github.com/en/rest/releases/assets), [Istio thread](https://discuss.istio.io/t/cannot-download-1-1-snapshot-4/453), [issue](https://github.com/LRainner/AgentCat/issues/16) |
| What does a draft expose to accounts without write? | By the documented listing rule, nothing in the API list. The page for managing releases does not say who sees the web feed. Whether the existence of the tag name or the release title leaks: tag is not created for a draft in the usual case (see L5) so no ref appears; title is private to pushers in the list. | DOC (API) + TEST (web) | releases page |
| Forks | A fork gets branches, not releases or secrets. Not read in this pass: treat as TEST/known behavior and do not rely on it. | TEST | none |
| Who sees and downloads Actions artifacts? | REST: "Anyone with read access to the repository can use this endpoint" (list, get). The user guide: "Read access to the repository is required" to download. On a public repository every account has read access, so every **signed-in** account can download; the download URL redirects and "expires after 1 minute". Third-party evidence says there is no permanent public link and the web UI needs login. | DOC + COMMUNITY | [REST artifacts](https://docs.github.com/en/rest/actions/artifacts), [download guide](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/downloading-workflow-artifacts), [nightly.link](https://github.com/oprypin/nightly.link) |
| Retention | `retention-days` in `upload-artifact` cannot exceed the repository/organization limit; the default (90 days) came from search summaries, not from a page I read. | DOC + COMMUNITY | [storing artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts) |

**Implications for the design**

- **Confirmed:** single job and no `upload-artifact` for the `.bat` (D-T3 item 3). An artifact would be downloadable by any signed-in account, and the `.bat` embeds the hash.
- The draft is the right container, but the claim "invisible to outsiders" for the **asset** is only documented for the list. Add a test: with no token, `curl -sI` the `browser_download_url` of the draft asset and expect no `200`; if possible also with a second test account.
- Do not print the draft URL in the log (`gh release create` prints it; redirect or discard stdout). It is harmless if the draft is private, but removes a lead.
- Rotation matters: even a private draft can leak by the owner forwarding the `.bat`. The password travels by another channel (already in D-T4).

## 4. L4: PBKDF2 on Windows 10 and PowerShell 5.1

| Question | Answer | Label | Source |
|---|---|---|---|
| Constructor with `HashAlgorithmName` | `Rfc2898DeriveBytes(String, Byte[], Int32, HashAlgorithmName)`, `(Byte[], Byte[], Int32, HashAlgorithmName)` and `(String, Int32, Int32, HashAlgorithmName)` apply to .NET Framework 4.7.2, 4.8 and 4.8.1 (not to 4.6.x or 4.7/4.7.1). | DOC | [Rfc2898DeriveBytes constructors](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes.-ctor?view=netframework-4.8.1) |
| Default hash of the older constructors | The class is described as based on HMACSHA1. The 3-argument constructors (no `HashAlgorithmName`) therefore produce SHA-1 PBKDF2 and would silently differ from the Node helper. | DOC | [class page](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes?view=netframework-4.8.1) |
| Minimums | Salt must be 8 bytes or larger; iteration count greater than zero. 16-byte salt is fine. | DOC | constructors page |
| Static `Pbkdf2` method | Exists for modern .NET only; its overloads are not listed for .NET Framework. Do not use in PowerShell 5.1. | DOC | class page |
| .NET Framework per Windows 10 build | 4.6 with 1507, 4.6.1 with 1511, 4.6.2 with 1607, 4.7 with 1703, 4.7.1 with 1709, **4.7.2 preinstalled from 1803**, 4.8 preinstalled from 1903; earlier builds can install 4.7.2/4.8 (the table marks them as installable). Windows 11 ships 4.8 or 4.8.1. | DOC | [versions and dependencies](https://learn.microsoft.com/en-us/dotnet/framework/migration-guide/versions-and-dependencies) |
| Windows PowerShell 5.1 runtime | It runs on the full .NET Framework and ships in Windows; support follows the Windows version. | DOC | [What is Windows PowerShell?](https://learn.microsoft.com/en-us/powershell/scripting/what-is-windows-powershell) |
| Recommended iterations | OWASP: "PBKDF2-HMAC-SHA256: 600,000 iterations (recommended)"; HMAC-SHA-256 is preferred when FIPS validated implementations are needed. The page also warns about very long passwords (DoS) and suggests pre-hashing with a salt; irrelevant for a short password with a length cap. | DOC | [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| `-AsSecureString` | `Read-Host -AsSecureString` is documented in 5.1 and shows an asterisk per character. The docs warn that characters made of several code points (emoticons) may cause problems in passwords. | DOC | [ConvertFrom-SecureString 5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring?view=powershell-5.1) |
| Is `SecureString` protective? | Microsoft's guidance (DE0001) says to avoid it in new development: it only keeps the value out of ordinary `String` objects, the plain text must still be materialized to be used, and it is encrypted only on .NET Framework. Treat it as "no echo, short exposure", not as protected memory. | DOC | [DE0001](https://github.com/dotnet/platform-compat/blob/master/docs/DE0001.md) |
| Time of 600,000 iterations in PS 5.1 | **No official number.** Node 24.20.0 `pbkdf2Sync` (sha256, 600,000) took 397 ms on this Linux machine (MEASURED, 2026-11-11). One Stack Overflow post (mirror) reports PBKDF2 on .NET Framework 4.8 about 4 times slower than .NET 8, with no iteration count (COMMUNITY). Estimate 1 to 2 s on a normal desktop, more on a weak one. | MEASURED + COMMUNITY + TEST | [mirror of the question](https://backiee.wasmer.app/http_Stackoverflow_com/questions/78441140/rfc2898derivebytes-is-very-slow-in-c-sharp-net-framework-version-4-8) |

**Implications for the design**

- D-T2 is **confirmed**: constructor with `HashAlgorithmName` needs 4.7.2+, which covers Windows 10 1803 and later by default; 1607 to 1709 would need the update. The fallback `Add-Type` HMAC loop remains useful for them. A pure PowerShell loop is too slow (not measured; reasonable).
- **Never use the constructors without `HashAlgorithmName`** (they use SHA-1). The contract test should assert that every `Rfc2898DeriveBytes` call in `installer.ps1` and `Gerar-HashSenhaTeste.ps1` passes `HashAlgorithmName` (`SHA256`), and that the interoperability test covers Node hash verified in PowerShell.
- Prefer the `Byte[]` password overload with explicit UTF-8 bytes (4.7.2+, DOC): same encoding as Node, and the plain `String` is not needed for the hash.
- Document **ASCII-only passwords** (letters, digits, common symbols). Console encoding of `Read-Host` in a `.bat`-launched window (OEM code page) versus the UTF-8 Node terminal could hash different bytes for accented characters. This is a design inference, to be proven by an interoperability test with a non-ASCII canary (TEST).
- Do not claim memory protection. State "no echo, bytes zeroed best-effort, .NET strings are immutable".
- Budget: the architect's "under 5 s" check for the fallback is plausible; add a measurement step for the owner (`Measure-Command` around the derivation) and keep the 2-second pause between attempts.
- Keep OWASP 600,000 and the format `pbkdf2-sha256$600000$...`; revisit if the figure changes (REFRESH IF).

## 5. L5: `gh` commands and token permissions

| Question | Answer | Label | Source |
|---|---|---|---|
| `gh release create --draft --prerelease --target` | Flags exist: `-d/--draft` ("Save the release as a draft instead of publishing it"), `-p/--prerelease`, `--target <branch>` ("Target branch or full commit SHA"), `-t/--title`, `-n/--notes`, `--verify-tag`. Confirmed locally with `gh` 2.103.3 (MEASURED). | DOC + MEASURED | [gh release create](https://cli.github.com/manual/gh_release_create) |
| When is the tag created? | "If a matching git tag does not yet exist, one will automatically get created from the latest state of the default branch. Use `--target` to point to a different branch or commit." The REST page says `target_commitish` decides where the tag is created and is "unused if the Git tag already exists". **Neither page says whether a draft creates the tag.** Community shows drafts living under an `untagged-<hash>` URL, which suggests no tag until publishing. | DOC + COMMUNITY + TEST | [REST releases](https://docs.github.com/en/rest/releases/releases) |
| Attaching assets | With assets, `gh` creates a draft, uploads and then publishes unless `--draft` is given; the steps are not atomic. With immutable releases enabled, protections apply only when published; a draft can still be modified or deleted. | DOC (installed help) | `gh release create --help` |
| Permission to create | "Users with push access to the repository can create a release." Job-level `contents: write` allows creating a release. | DOC | REST releases, [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions) |
| **Workflow-file edge case** | REST create-release: the token needs the `workflow` scope (and fine-grained/App tokens the "Workflows" repository permission) "when the resolved target commit modifies workflow files" relative to the default branch; otherwise a 404 (sometimes 403). The `permissions:` key lists 17 scopes and `workflows` is not one of them, so `GITHUB_TOKEN` cannot get it. | DOC | REST releases, workflow syntax |
| `gh secret set --env` | `-e/--env <environment>` sets an Environment secret. "If `--body` isn't set, the value is read from standard input"; a bare `gh secret set NAME --env E` prompts, and `< file` or a pipe also work. Careful: `-f` is `--env-file` (dotenv), not a body file; there is no `--body-file`. Required token scopes are not on the page. Secrets are encrypted locally before upload (installed help). | DOC + MEASURED | [gh secret set](https://cli.github.com/manual/gh_secret_set) |
| `gh api` for the Environment | `PUT /repos/{owner}/{repo}/environments/{name}` with `reviewers` (type `User` or `Team`, `id`; up to 6), `prevent_self_review`, `wait_timer`, `deployment_branch_policy` {`protected_branches`, `custom_branch_policies`} (must have opposite values; same value gives 422). Then `POST .../environments/{name}/deployment-branch-policies` with `name` and `type` (`branch`); needs `custom_branch_policies: true` first or it returns 404; a duplicate returns 303. Classic tokens need `repo`; admin access on the repository. Fine-grained permission names are not on the pages. | DOC + TEST | [REST environments](https://docs.github.com/en/rest/deployments/environments), [branch policies](https://docs.github.com/en/rest/deployments/branch-policies) |
| `GITHUB_TOKEN` and triggers | Events created by `GITHUB_TOKEN` do not start new runs, except `workflow_dispatch` and `repository_dispatch`. Setting `permissions: {}` disables every permission; naming one sets all others to `none`. | DOC | [events page](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), workflow syntax |
| `gh release delete` | `--cleanup-tag` and `-y/--yes` exist (installed help). | MEASURED | `gh release delete --help` |

Command patterns for `@devops` (assembled from the fields above; **TEST**, not run here; replace the placeholders; the user id is read, not written to a file):

```text
# Environment with reviewer and no self-review block
gh api -X PUT repos/<owner>/<repo>/environments/windows-owner-test --input - <<'JSON'
{"prevent_self_review": false,
 "reviewers": [{"type": "User", "id": <numeric user id from: gh api user --jq .id>}],
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON

# Allow only the test branch
gh api -X POST repos/<owner>/<repo>/environments/windows-owner-test/deployment-branch-policies \
  -f name='test/windows-owner' -f type=branch

# Secret (prompt; the value is never typed on the command line)
gh secret set TEST_INSTALLER_PASSWORD_HASH --env windows-owner-test
```

**Implications for the design**

- **Change D-T3 step 4:** do not use `--target "$GITHUB_SHA"` blindly. The test branch commit always differs from `main` under `.github/workflows/`, which is exactly the documented condition that asks for a `workflow` scope that `GITHUB_TOKEN` cannot have. Use `--target main` (a commit with no workflow change) for the draft and write the real `$GITHUB_SHA` in the release notes. If the owner ever publishes, the tag would point at `main`'s tip, not at the test branch: acceptable because the draft is deleted, never published. Document: "never publish this draft".
- The fallback if even `--target main` fails: create the release through `gh api` with the same fields, and finally only a plain artifact-less route (not recommended). All are TEST.
- Keep job-level `permissions: { contents: write }` only on the one job, with `permissions: {}` at the top (confirmed). `checkout` works with `contents: write` (it includes read).
- The Environment creation is an **owner/`@devops` action with the owner's admin credentials**, not something the workflow does. Keep it out of the workflow.
- `gh secret set` with no `--body` is right (stdin or prompt). Do not use `--body "$VAR"` (shell history, process list). If the Node helper pipes into it, the helper must print the hash on stdout only and prompt on stderr or the TTY.
- `gh release delete test-windows-<run_id> --cleanup-tag --yes` is valid (tag cleanup is a no-op if no tag exists).

## 6. Does option C of the `@architect` hold?

Yes, with four corrections:

1. Prevent self-review OFF (section 2).
2. `--target main` instead of `$GITHUB_SHA` for the draft, SHA in the notes (section 5).
3. Marker file must change in every triggering commit; empty commits do nothing (section 1).
4. Add TEST items for the outsider download, run logs visibility and the admin-bypass behavior (section 7).

## 7. Open items (tests, not research)

| # | Item | Who | How |
|---|---|---|---|
| T-1 | First push of `test/windows-owner` stops at "waiting for review"; no secret in the log before approval | `@qa` with owner | Real run; read log |
| T-2 | Admin bypass: does it skip the reviewer gate for the owner? | owner | Observe the first run |
| T-3 | `gh release create --draft --prerelease --target main` succeeds with `GITHUB_TOKEN` when the branch changes workflow files; also `--target $GITHUB_SHA` (to know if the edge case bites) | `@qa` | Two runs, or one then the other |
| T-4 | Draft asset URL without token returns no `200`; second account if available | `@qa` | `curl -sI` |
| T-5 | Run logs of this public repository visible without login | `@qa` | Anonymous request |
| T-6 | PBKDF2 600,000 time in Windows PowerShell 5.1 and the fallback; non-ASCII canary interoperability with the Node helper | owner / Windows session | `Measure-Command`; the checks in D-T5 item 4 |
| T-7 | Optional: dispatch by workflow ID with `--ref` after the first run | `@devops` | One `gh workflow run` |

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Owner leaves self-review ON | Job waits and times out | Owner steps say OFF; `@qa` checks the setting |
| `--target $GITHUB_SHA` rejected for workflow changes | No draft | `--target main`, SHA in notes (T-3) |
| Another writer pushes a changed workflow to the test branch | Secret read after the owner approves without checking | Check the commit at approval; branch ruleset (not verified) |
| Hash or draft URL printed in the public log | Disclosure | No echo; QA log scan; masking is not guaranteed |
| Framework older than 4.7.2 (Windows 10 1607 to 1709) | Constructor missing | `Add-Type` fallback or install 4.8 |
| SHA-1 default constructor used by mistake | Hash never matches | Contract test on every `Rfc2898DeriveBytes` call |
| Accented password differs between Node and PowerShell | Owner locked out | ASCII-only rule; non-ASCII canary test |
| Repository turned private | Rules and secrets ignored | Empty-secret abort (already in the design) |

## 9. Next steps (no implementation here)

- `@architect`: apply the four corrections to `windows-owner-test-installer-design.md` (D-T1 owner steps, D-T3 step 4, D-T2 contract wording).
- `@dev`: contract tests for `HashAlgorithmName` on every call, `--target main`, no `--body`, no `upload-artifact`, marker file note in the docs.
- `@qa`: tests T-1 to T-5 on the first real run; leak scan of log and draft.
- `@devops`: Environment creation with the owner's credentials after the owner decides; branch creation only after that.
- Owner: T-2, T-6, deleting the draft and the secret afterwards.

## 10. Self-assessment (rubric, target at least 9.0)

| Criterion | Weight | Score | Note |
|---|---|---|---|
| Official sources first, dated, labeled | 25 % | 9.2 | 14 official pages (GitHub Docs, GitHub CLI manual, Microsoft Learn, OWASP); every answer labeled |
| Coverage of L1 to L5 and edge cases | 25 % | 9.0 | Found two items the draft missed (self-review deadlock, workflow-file target check); outsider access and PS 5.1 timing remain TEST |
| Fit to the project and actionable design changes | 20 % | 9.3 | Four concrete corrections, command patterns, test list |
| Honesty about limits | 15 % | 9.3 | Tool summarization limits, community-only items and untested commands flagged |
| Verification in the environment | 10 % | 8.5 | `gh` flags and Node timing measured; GitHub behavior itself not exercised (no remote writes allowed) |
| Parity en / pt-BR, readability | 5 % | 9.0 | |
| **Weighted total** | | **9.1** | |

## Sources (consulted 2026-11-11)

- GitHub Docs: [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Managing environments](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment), [Secure use](https://docs.github.com/en/actions/reference/security/secure-use), [GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token), [Artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts), [Downloading artifacts](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/downloading-workflow-artifacts), [Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
- GitHub REST: [Releases](https://docs.github.com/en/rest/releases/releases), [Release assets](https://docs.github.com/en/rest/releases/assets), [Artifacts](https://docs.github.com/en/rest/actions/artifacts), [Environments](https://docs.github.com/en/rest/deployments/environments), [Deployment branch policies](https://docs.github.com/en/rest/deployments/branch-policies); [changelog 2023-10-16](https://github.blog/changelog/2023-10-16-actions-prevent-self-reviews-for-secure-deployments-across-actions-environments) (read as a search result only).
- GitHub CLI manual: [gh release create](https://cli.github.com/manual/gh_release_create), [gh secret set](https://cli.github.com/manual/gh_secret_set); installed `gh` 2.103.3 help.
- Microsoft Learn: [Rfc2898DeriveBytes constructors](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes.-ctor?view=netframework-4.8.1), [class](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.rfc2898derivebytes?view=netframework-4.8.1), [.NET Framework versions and Windows](https://learn.microsoft.com/en-us/dotnet/framework/migration-guide/versions-and-dependencies), [What is Windows PowerShell?](https://learn.microsoft.com/en-us/powershell/scripting/what-is-windows-powershell), [ConvertFrom-SecureString 5.1](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring?view=powershell-5.1); [DE0001](https://github.com/dotnet/platform-compat/blob/master/docs/DE0001.md); [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Community (opinion/anecdote): [workflow_dispatch from a branch, 2025-08-19](https://andreynautilus.github.io/posts/2025-08-19-github-workflow_dispatch-from-branch), [community discussion 25756](https://github.com/orgs/community/discussions/25756), [Istio draft download thread](https://discuss.istio.io/t/cannot-download-1-1-snapshot-4/453), [AgentCat issue 16](https://github.com/LRainner/AgentCat/issues/16), [nightly.link](https://github.com/oprypin/nightly.link), [Stack Overflow mirror on PBKDF2 speed](https://backiee.wasmer.app/http_Stackoverflow_com/questions/78441140/rfc2898derivebytes-is-very-slow-in-c-sharp-net-framework-version-4-8).
- MEASURED: Node 24.20.0 `crypto.pbkdf2Sync` 600,000 iterations, 397 ms; `gh` 2.103.3 `--help` output.
