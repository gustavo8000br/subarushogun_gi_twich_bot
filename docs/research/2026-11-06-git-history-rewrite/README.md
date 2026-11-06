# Rewriting the Git history safely and auditing commit content (research note)

[Português brasileiro](../../pt-BR/research/2026-11-06-git-history-rewrite/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-05 (folder dated 2026-11-06 at the coordinator's request). Branch: `docs/post-cutover-docs`.
- Labels: **VERIFIED** (official page read in this session, or measured in the repository), **PARTIAL** (incomplete or secondary source), **UNVERIFIED** (inference, not confirmed).
- Scope: research and recommendation only. No history was rewritten, no remote was touched, no `gh` call was made. The only commands run were read-only (`git log`, `git rev-list`, `git for-each-ref`, `which`).
- Owner request (2026-11-05): use the Pro Git chapter "Rewriting History" to rewrite the history; hashes may change; **file content must not**. The goal is to let the coordinator audit what already exists.

## 1. Executive summary

1. **Auditing does not require rewriting.** Every audit technique below is read-only (`git log -S/-G`, `git grep` over revisions, scanners). Audit first; rewrite only what the audit finds.
2. **A first audit already ran (read-only, this session).** On `origin/main` (`cb0c604`, 207 commits, 22 merges): 0 commits with a `Claude-Session` trailer or session URL in the message, 0 session ids in any file content, 0 hits for common token shapes, no `.env`/key files ever added except the two `.env*.example` files. The literal domain `claude.ai/code` appears in 5 commits, in `AGENTS.md`, `CLAUDE.md` and handoff/QA-gate documents that describe the ban (no session id attached). The 52 trailer commits exist **only** in two local backup branches (`backup/pre-scrub-2026-10-29`, `backup/remote-before-history-fix-local`; 63 and 13 commits not on `origin`). See section 5 for limits.
3. **Pro Git itself says not to rewrite pushed history and calls `filter-branch` "no longer the recommended way"**; it points to `git-filter-repo`. For a public repo with merged PRs, use `git filter-repo`, never `filter-branch` and never an interactive rebase of `main`.
4. **A rewrite on GitHub is never total.** After a force-push, old SHAs stay reachable through `refs/pull/*`, forks and cached views until GitHub Support cleans them. Rewriting is **not** a security control; for a secret, rotate first.
5. **Order with the pending release:** if any rewrite happens, do it **before** the tag is created, because the tag name `v0.3.0-<hash>-beta` derives from the `main` hash.
6. **Recommended path:** (a) audit now, (b) rewrite only on a concrete finding, with `git filter-repo` in a fresh clone, (c) no general squash or reorganization.

## 2. Pro Git chapter, exact commands (VERIFIED, https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History, read 2026-11-05)

| Goal | Command |
|---|---|
| Fix the last commit (message or content) | `git commit --amend` (`--no-edit` keeps the message) |
| Edit a range | `git rebase -i HEAD~3` (argument = parent of the oldest commit to edit) |
| Rebase script verbs | `pick`, `reword`, `edit`, `squash`, `fixup`, `drop`, `exec`, `break`, `label`, `reset`, `merge` |
| Stop at a commit | change `pick` to `edit`, then `git commit --amend` and `git rebase --continue` |
| Reorder / delete | reorder lines; delete a line or use `drop` |
| Squash | `squash` (merge messages) or `fixup` (discard message) |
| Split a commit | mark `edit`, then `git reset HEAD^`, `git add`/`git commit` in pieces, `git rebase --continue` |
| Abort / recover | `git rebase --abort`; `git reflog` |
| Remove a file from every commit | `git filter-branch --tree-filter 'rm -f passwords.txt' HEAD` (add `--all` for all branches) |
| Change e-mail everywhere | `git filter-branch --commit-filter '...git commit-tree "$@"...' HEAD` |

Warnings quoted by the chapter:

- "since so much work is local within your clone, you have a great deal of freedom to rewrite your history locally. However, once you push your work, it is a different story entirely, and you should consider pushed work as final unless you have good reason to change it."
- Amending or rebasing changes SHA-1s; do not include commits already pushed to a central server.
- "deleting or altering a commit will cause the rewriting of all the commits that follow it."
- `filter-branch` "has many pitfalls, and is no longer the recommended way to rewrite history. Instead, consider using `git-filter-repo`." It also says not to use it "unless your project isn't yet public and other people haven't based work off the commits you're about to rewrite." Our repo is public, so this is the exact case the book warns about.
- Two other details matter here: `rebase -i` flattens merge commits by default (this repo has 22 merges on `main`, from GitHub PR merges), and every rewrite drops commit/tag signatures.

## 3. `git filter-repo` (VERIFIED, manual at https://github.com/newren/git-filter-repo, `Documentation/git-filter-repo.txt`, read 2026-11-05)

When to use: any scripted, repo-wide rewrite (remove a path from all commits, scrub text in all blobs, rewrite e-mails or messages). It is the tool Pro Git and GitHub both recommend.

| Need | Command |
|---|---|
| Measure first (no change) | `git filter-repo --analyze` (reports in `.git/filter-repo/analysis/`) |
| Preview | `git filter-repo ... --dry-run` (saves original and filtered streams to compare) |
| Remove paths from all history | `git filter-repo --path <p> --invert-paths` (also `--path-glob`, `--path-regex`) |
| Keep only some paths | `git filter-repo --path <p>` (without `--invert-paths`) |
| Scrub text in all file versions | `git filter-repo --replace-text expressions.txt` |
| Scrub text in commit/tag messages | `git filter-repo --replace-message expressions.txt` |
| Fix author/committer | `git filter-repo --mailmap <file>` (or `--use-mailmap` for `.mailmap`) |
| Scriptable edits | `--commit-callback '<python body>'`, `--blob-callback`, `--tag-callback` (bytestrings, `b"..."`) |
| Only some refs | `--refs <refs>` (implies `--partial`; disables reflog expiry and gc: avoid) |
| Secret removal mode | `--sensitive-data-removal` (alias `--sdr`; needs git-filter-repo 2.47+; fetches all refs; `--no-fetch` skips that) |

`--replace-text` syntax (one rule per line): `literal:` (default), `glob:`, `regex:`; `==>` sets the replacement (default `***REMOVED***`); regex and glob apply to the whole file without flags (`(?m)` for line anchors). Example file: `regex:session_[A-Za-z0-9]{20,}==>REMOVED`.

Behaviors that matter for us (VERIFIED):

- **Fresh clone required.** It aborts unless the repo looks freshly cloned; for a local source use `git clone --no-local`. `--force` bypasses the check, and the manual says "It is a really bad idea to get in the habit of always specifying `--force`."
- **Removes the `origin` remote** to prevent accidental pushes; re-add it with `git remote add origin <url>` only when ready.
- **Rewrites abbreviated hashes inside commit messages** to the new hashes (same abbreviation length); `--preserve-commit-hashes` turns that off. Hashes written **inside files** (docs, handoffs) are not touched.
- **Signatures are removed** from commits and tags.
- **Maps for traceability:** `.git/filter-repo/commit-map` (`old new`, all-zeros = removed), `ref-map`, `changed-refs`, `first-changed-commits`. They replace the manual `.local/hash-map-*.tsv` effort.
- Empty commits that **become** empty are pruned (`--prune-empty auto`), so the count can drop.
- Verification after the rewrite: `git log -S"<string>" --all -p --` must print nothing; after the server is cleaned, `git cat-file -t <first changed commit>` must fail.
- Installation (VERIFIED, INSTALL.md): a single Python 3 file, `python3 git-filter-repo`, or `git filter-repo` when on `$PATH`; also `pipx install git-filter-repo`. Latest release read: v2.47.0 (the release page shows "04 Dec" without a year; PARTIAL). **It is not installed here** (`which git-filter-repo`: none). Local Git is 2.43.0.

## 4. GitHub side (VERIFIED, https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository, read 2026-11-05)

- Order given by GitHub: **revoke/rotate** (may make the rewrite unnecessary) -> rewrite locally -> verify -> `git push --force --mirror origin` -> coordinate collaborators -> contact Support if needed.
- **Still reachable after the force-push:** forks (the commit stays there), cached views by SHA, and pull requests that reference the commits, including `refs/pull/*`. Those refs are read-only for users, so pushes to them fail; other failures usually mean branch protection must be temporarily lifted.
- **Support** can delete or dereference PRs, run server garbage collection, remove cached views and purge LFS objects. Send: owner/repo, number of affected PRs, the "First Changed Commit(s)" from filter-repo. It only helps when rotating is not a sufficient mitigation, and it does **not** clean sensitive text quoted in PR bodies or comments.
- Rewriting changes commit hashes and removes signatures. Merge or close open PRs before starting.
- **Ruleset `main-pr-and-ci`** (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets): the "Block force pushes" rule is on by default and blocks everybody not on the bypass list; "Require status checks" and a PR requirement would also reject a direct push. Bypass can be given to a role (e.g. repository admin), team or app, mode "Always allow" or "For pull requests only" (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository); enforcement can be switched Active/Disabled without deleting the ruleset (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets). Two ways to push: (1) add the owner as bypass actor with "Always allow" for the window, then remove; (2) set enforcement to Disabled for the window, then Active. **Prefer (1)** (the window is limited to one actor and the protection stays on for everyone else). The repo's rule list was not read (no GitHub access allowed); whether the ruleset has a non-fast-forward rule is UNVERIFIED. Only the owner (admin) changes rulesets; `@devops` cannot self-authorize this.
- Tags: no tag exists yet, so there is nothing to delete or re-point. The 2026-10-29 rewrite already left old SHAs reachable on GitHub; a second rewrite adds a second set.
- Not found in the official pages read: a statement about how a merged PR page renders when its commits are gone (UNVERIFIED; expect the PR to stay "merged" with the old SHAs served from `refs/pull/N/*`).

## 5. Auditing the content of all commits (read-only)

### Current tree vs history

A scan of the working tree (`npm run review:static`, OpenGrep) only sees the latest version of each file. A secret that was added and later deleted is invisible there but remains in history and in every clone. Use history-aware tools for the audit.

### Git-only techniques (no install, nothing leaves the machine; VERIFIED in https://git-scm.com/docs/git-diff and `git-log`)

- `git log --all -S'<string>' --oneline` finds commits that change the **number of occurrences** of a literal (add/remove). `--pickaxe-regex` makes the string a regex.
- `git log --all -G'<regex>' --oneline` finds commits whose patch lines (added or removed) match a regex. A moved occurrence is visible to `-G` but not to `-S`. Add `-p`, `--name-only` or `--pickaxe-all` to see what changed.
- Messages: `git log --all -i --grep='<regex>' --format='%h %s'` (messages are not covered by `-S/-G`).
- Names: `git log --all --diff-filter=A --name-only --format=` lists every path ever added (find `.env`, keys, dumps).
- Authors: `git log --all --format='%an <%ae>' | sort | uniq -c`.
- Every revision at once: `git rev-list --all | xargs -n 50 git grep -I -n -E '<regex>'` (slow on large repos; `-G` is usually enough).
- Size/outliers: `git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sort -k3 -n -r | head` or `git filter-repo --analyze`.

### Measured here (this session, VERIFIED by command, regexes below)

| Check | `origin/main` (207 commits) | `--all` (276 commits) |
|---|---|---|
| `Claude-Session` trailer or `claude.ai/code` in messages | 0 | 52 (only in the 2 local backup branches) |
| `session_[0-9A-Za-z]{20}` in any diff | 0 | 0 |
| `claude.ai/code` in any diff | 5 commits (ban text in `AGENTS.md`, `CLAUDE.md`, QA gates, handoffs; no id) | 6 |
| `ghp_`, `github_pat_`, `sk-`, `AKIA`, `xox*-`, `BEGIN ... PRIVATE KEY`, `oauth:` shapes | 0 | 0 |
| Paths ever added matching `.env`, `.pem`, `.key`, `id_rsa` | only `.env.example`, `.env.product.example` | same |
| Author identities | 3 (two human spellings, plus `GitHub <noreply@github.com>` on 60 merge/squash commits) | same |

Limits: the regex list is a sample, not a secret scanner (no entropy checks, no Twitch client-secret or database-URL shape, no base64/encoded content, binary blobs skipped by `-G`). The local clone is 8283 reachable objects, 8.9 MiB packed. Unknowns left: Twitch client secret/EventSub secret shapes, `postgresql://user:pass@` strings and screenshots/binaries (add rules in section 6).

### Scanners (run on the machine)

| Tool | Local only? | Installed here | Notes |
|---|---|---|---|
| `git` pickaxe (above) | yes | yes (2.43.0) | baseline, covers custom patterns |
| OpenGrep (`opengrep`, `npm run review:static`) | yes | yes (`~/.local/bin/opengrep`) | tree only, not history; scan old revisions only by checking them out (not recommended) |
| `gitleaks git <repo> --report-format json --report-path <file>` (VERIFIED, https://github.com/gitleaks/gitleaks) | yes (regex/entropy; no network use is described, offline behavior not stated: PARTIAL) | **no** | `--redact` hides values in output; `.gitleaks.toml` adds custom rules (`[extend] useDefault = true`); exit code 1 on findings; scans history via `git log -p` |
| `trufflehog git file://<repo> --no-verification --json` (VERIFIED, https://github.com/trufflesecurity/trufflehog) | **only with `--no-verification`**: default verification calls the provider API to test each credential | **no** | do not run with verification on; reports as JSON |
| `git filter-repo --analyze` | yes | **no** | sizes and paths, not secrets |

Installing a scanner is a dependency decision. Both gitleaks and trufflehog ship as single static binaries on GitHub releases (PARTIAL: the pages list Homebrew, Docker, release binaries and source builds). Keep the binary under the project (for example `.local/tools/`, already git-ignored) and verify the release checksum. **Dependency approval is the owner's.**

Reports: write scanner output to a git-ignored folder (`.local/history-audit/`), redacted; commit only the summary (counts, commit short hashes, file paths), never the secret values.

## 6. Recommendation

### Strategy comparison

| Option | What | Risk | Verdict |
|---|---|---|---|
| (a) Audit only | Section 5, no rewrite | none to history | **Do now.** Answers the owner's real need. |
| (b) Targeted rewrite | `git filter-repo --replace-text/--replace-message/--invert-paths` only for confirmed findings | medium: all hashes from the first changed commit on change; old SHAs stay reachable on GitHub | **Only if (a) finds something.** |
| (c) Squash/reorganize | `rebase -i`, squash, reorder, split | high: loses the commit-by-commit audit trail and the 22 PR merge structure, rewrites every hash, no security gain, `rebase -i` flattens merges, conflicts compound | **Not recommended.** If the owner wants a "clean" history for readability, treat it as a separate decision with its own story. |

### Steps (numbered, with preconditions)

1. **Decide the goal (owner).** Audit only, or audit plus clean-up of findings. Precondition: the owner reads sections 1 and 4 (a rewrite does not make old SHAs disappear from GitHub).
2. **Run the read-only audit** (section 5 techniques) from a clean checkout; store raw output in `.local/history-audit/` (ignored). Precondition: none. Add project-specific patterns: Twitch client secret/EventSub secret, `DATABASE_URL`/`postgresql://` with a password, `Authorization:` headers, UID values, the session URL form. Optional, owner-approved: gitleaks (and trufflehog with `--no-verification`) binaries under `.local/tools/`.
3. **Triage findings.** For each: is it a real secret? If yes, **rotate/revoke first**; for non-secrets (like the ban text), leave as is. Record counts and short hashes in the audit summary. Precondition: step 2 report.
4. **If no finding needs a rewrite, stop.** Create the release tag from the current `main`. Done.
5. **If a rewrite is justified, prepare (owner decides the window).** Preconditions: no open PRs (merge or close them), the `@qa` release-fix work merged or saved as a patch, the owner available to adjust the ruleset, and no tag created yet.
6. **Back up (two copies, both inside the project and git-ignored).** `git clone --mirror <origin url> .local/history-rewrite/backup-YYYYMMDD.git` (all refs, including `refs/pull/*`), plus keep the existing local clone as is. Do not delete the existing local `backup/*` branches without owner OK; they still carry the old URL trailers (see below).
7. **Rewrite in a fresh clone, not in this worktree.** `git clone --no-local <this repo or origin> .local/history-rewrite/work` (a clone from `origin` carries no `backup/*` branches, which is desired). Install `git-filter-repo` at `.local/tools/` (single file, version >= 2.47, owner-approved). Prepare `expressions.txt`. Run `python3 .local/tools/git-filter-repo --analyze` and then the real command with `--dry-run` first. Typical commands: `--replace-text expressions.txt`, `--replace-message expressions.txt`, or `--path <file> --invert-paths`.
8. **Verify content, not only hashes.** Precondition: step 7 done. Check: (i) `git log -S"<string>" --all -p --` prints nothing; (ii) compare final trees: `git diff <old main> <new main> --stat` must show only the intended files (the owner's rule: content is what matters); (iii) `git rev-list --count` old vs new, using `.git/filter-repo/commit-map` for old->new; (iv) run the project gates (`npm ci`, lint, typecheck, `npm test`, `review:static`) on the new tip through `@qa`, as for any release. Without these, no force-push.
9. **Update hash references.** `docs/**` that cite commit hashes (find with `git grep -nE '\b[0-9a-f]{7,40}\b'`), issues bodies, and `.local` maps. filter-repo fixes hashes only in commit messages; file contents need a follow-up commit built from the `commit-map`. `@devops` updates issue bodies (never comments). Precondition: step 8.
10. **Force-push (owner + `@devops`).** Owner adds a temporary bypass actor to `main-pr-and-ci` (mode "Always allow"), `@devops` re-adds `origin` and runs `git push --force --mirror origin` (refs/pull/* failures are expected and harmless), owner removes the bypass actor. Precondition: step 8 PASS from `@qa`; backups exist. Prefer `--force-with-lease` per branch if the mirror push is not needed.
11. **Clean the server side (optional, owner decides).** If sensitive data was involved, open a GitHub Support request with the "First Changed Commit(s)" and the two merged PR numbers (#101, #110). If it was only cosmetic, accept that old SHAs remain reachable (as after 2026-10-29).
12. **Tag after the rewrite.** Run the release only now, so `v0.3.0-<new hash>-beta` matches the final `main`. Precondition: ruleset restored; the CI check `CI quality gates / Required quality gate` green on the new `main` (a force-push of an unchanged tree still needs CI to run for later PRs).
13. **Reset every other clone** (reclone; do not rebase the old branches over the new `main`, or the old commits come back). Re-create work branches from the new `main` and cherry-pick from the `commit-map` if needed.

### Interactions with this project

- **PR #101 and #110 (merged):** GitHub keeps the PR pages and `refs/pull/N/*` pointing at the old commits; the merged PRs remain readable, but their commit SHAs will not match `main` any more. UNVERIFIED how the UI labels them; Support can dereference if wanted.
- **Issues and docs citing hashes:** will point to old SHAs that still resolve on GitHub via PR refs (PARTIAL) but not on the new `main`; plan one update pass (step 9).
- **Release tag:** `release.yml` names the tag after the `main` hash; rewrite before the tag (step 12). Do not touch the `@qa` files (`release.yml`, the shell-contract test, the QA gate) in this work.
- **Local `backup/*` branches:** they hold the 52 trailer commits and ignore the filter in a fresh `origin` clone. Keep them as the owner already decided (D-15 note: two local backups with the URL stay until owner OK), outside any push. Never push them.
- **Signatures:** the repo history is GitHub-generated for 60 commits; web-flow signatures (if any) are lost after the rewrite. UNVERIFIED whether any commit is signed.

### What depends on the owner

1. Goal (audit only vs rewrite findings); whether any hash-changing rewrite is acceptable now that the release is pending.
2. Approval to install `git-filter-repo` and optionally gitleaks/trufflehog binaries (dependency decision), and the version pin.
3. Adjusting ruleset `main-pr-and-ci` for the force-push window (only admins can) and restoring it.
4. Contacting GitHub Support after the push (owner account).
5. Keeping or removing the local `backup/*` branches that still contain the old URL.

## 7. Self-assessment (rubric, target >= 9.0)

| Criterion | Score | Basis |
|---|---|---|
| Official sources | 9.5 | Pro Git chapter, `git-filter-repo` manual and INSTALL, GitHub docs (removal, rulesets), git-diff pickaxe docs, gitleaks/trufflehog READMEs, all read |
| Evidence | 9.0 | Measured counts on `origin/main` and `--all`; gaps labelled (ruleset rules unread, merged-PR UI, trufflehog offline) |
| Fit to our case | 9.5 | Public repo, ruleset, pending tag, merged PRs, local backups, release-hash tag name |
| Procedure safety | 9.0 | Backups, fresh clone, dry-run, content diff, QA gate, bypass window, rotate-first; the force-push order is not tested in this repo |
| Measurability | 9.0 | Each step has a pass check (`git log -S` empty, tree diff, commit-map, CI green, `git cat-file -t` fails) |
| **Overall** | **9.2** | |

## 8. Limitations

- No GitHub API access (by instruction): ruleset content, fork count, PR behavior after a rewrite and Support timing were not checked.
- The release page date for filter-repo has no year; use the version shown by the installed file.
- Scanners are not installed here; their offline behavior is documented only partially (trufflehog verification is the one network call, VERIFIED; gitleaks network behavior is not stated, PARTIAL).
- The measured regex audit is a sample, not a full secret scan.

## 9. Next steps

- `@aiox-master`: decide step 1 with the owner; if (a), delegate step 2 to `@qa` (read-only commands) with the patterns above.
- `@devops`: only after the owner OK, steps 6, 10, 11 and the issue-body updates.
- `@dev`: no code change needed for audit; only the hash-reference update in step 9 if a rewrite happens.
