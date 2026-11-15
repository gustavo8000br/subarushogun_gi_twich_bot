# CI and image delivery

[Português brasileiro](pt-BR/CI-CD.md) · [Back to README](../README.md)

This guide explains how pull request checks, main image publication, and tagged releases relate. The workflows are defined in `.github/workflows/` and use pinned Actions, least-privilege permissions, `npm ci`, and the repository's shared quality workflow.

## Workflow responsibilities

| Workflow | Trigger | Responsibility | Registry/release write access |
| --- | --- | --- | --- |
| `ci.yml` | Pull request targeting `main`; manual dispatch | Calls `quality-gates.yml`; reports one stable aggregate required check | None |
| `quality-gates.yml` | Reusable `workflow_call` | API/infra/web lint and typecheck, shared lint/typecheck, installer smoke on Linux/macOS/Windows, Vitest with PostgreSQL/Compose, actionlint, OpenGrep/version/localization checks, Compose validation, and production image build | None |
| `browser-only.yml` | Pull request targeting `main`; manual dispatch | Runs the fixture-driven `tests/e2e/*-browser-only.mjs` scripts in Chrome against a disposable Next dev server (D-13). Not part of the required quality-gates aggregate while it is non-blocking | None (`contents: read`) |
| `main-cd.yml` | Push to `main` | Re-runs the shared quality gates for the merged commit, then builds and publishes validated Linux images | `packages: write` only in the publishing job |
| `release.yml` | Manual `workflow_dispatch` only, from `main`, by the repository owner (no tag or push trigger) | Validates the tag/source and successful main CD run, builds native installer assets, then publishes bilingual release notes | `contents: write` only in the release job |
| `branch-cleanup.yml` | Weekly schedule (dry run until `BRANCH_CLEANUP_ENABLED` is `true`); manual dispatch (`dry_run` defaults to true) | Deletes remote branches already fully merged into `main` (see "Merged branch cleanup") | `contents: write` only in the delete job |

Pull requests never run the GHCR publisher. The active `main-pr-and-ci` ruleset requires the stable reusable workflow check; it does not require a main-only publishing job. GitHub names reusable workflow checks as `<caller job> / <reusable job>`, so the configured required context is verified from an actual PR run.

The shared workflow ends in an aggregate job that requires every validation job to finish successfully. Failed, canceled, or skipped constituent jobs fail the aggregate. The workflow linter is pinned to actionlint `1.7.12`; ShellCheck integration is disabled because this gate validates GitHub Actions workflows. Its narrow `queue` schema warning suppression is needed because GitHub's supported `concurrency.queue: max` syntax is not yet recognized by that linter release. OpenGrep `1.30.0` is installed from its pinned source commit into an isolated empty `HOME`; its release binary signature is verified with Cosign `2.5.0`, and the pinned Cosign installer verifies its downloaded binary checksum. Installer smoke files are temporary and are not uploaded from normal CI; only the release workflow uploads the tested `.bat`, `.command`, and `.sh` installers.

## Browser-only scripts job (D-13)

`browser-only.yml` runs every script listed under `covered` in `tests/e2e/browser-only-manifest.json` through `npm run test:e2e:browser-only:ci` (`tests/e2e/run-browser-scripts.mjs`). The driver creates a loopback TLS certificate under `.local/browser-only-ci/`, starts `next dev` over HTTPS, runs each script with `APP_ORIGIN` pointing to it, prints a PASS/FAIL summary and exits non-zero if any script failed. Every API response is an intercepted fixture, so the job needs no PostgreSQL, Docker, Twitch, OBS, volumes or secrets. The job installs Chrome with `npx playwright-core install --with-deps chrome`.

- **Rollout:** the workflow is separate from `quality-gates.yml` and not required by the ruleset (non-blocking first). Making it blocking later means adding it to the aggregate and the ruleset, with the owner's OK.
- **Exclusions:** the `excluded` list in the manifest holds scripts that cannot run on a hosted runner (native OBS/CEF, real Twitch), each with a written reason. It is empty today because all scripts are fixture-driven. These scripts are not native OBS/CEF, axe or assistive-technology evidence.
- **Contract:** `tests/unit/browser-only-ci-contract.test.js` fails when a new `tests/e2e/*-browser-only.mjs` is in neither list, when an npm script does not run its file, or when the workflow loses its triggers, read-only permissions or pinned actions.
- **Run locally:** `npm run test:e2e:browser-only:ci` (all) or `node tests/e2e/run-browser-scripts.mjs --only panel-layout` (one). It needs local Chrome (`CHROME_CHANNEL` selects the browser). In a git worktree whose `node_modules` is a symlink, Turbopack fails; set `BROWSER_ONLY_NEXT_ARGS=--webpack`.

## Image tags and publication safety

`compose.yaml` and `compose.build.yaml` default to `IMAGE_TAG=dev` for local development/builds. Installer-generated runtime configuration explicitly pins the validated release image. Set `IMAGE_TAG=main` only when intentionally running the moving image promoted by the main-branch publisher.

| Tag | Meaning |
| --- | --- |
| `main` | Moving AMD64/ARM64 manifest for the latest validated main commit |
| `dev` | Local development/build tag; not published by the main/release workflows |
| `main-linux-amd64`, `main-linux-arm64` | Moving single-architecture tags for that validated source |
| `<full-commit-sha>-linux-amd64`, `<full-commit-sha>-linux-arm64` | Commit-scoped source image tags used to promote moving tags safely; registry tags are mutable aliases |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE` | Versioned AMD64/ARM64 manifest, materialized from the exact source commit |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE-linux-amd64`, `...-linux-arm64` | Versioned single-architecture images |

The publisher queues main runs without canceling an active publish. It builds per-commit architecture images first and publishes the versioned multi-platform manifest for that exact commit. The full-SHA tags scope those registry aliases to a source commit; a registry tag can still be moved, so it is not a content-integrity guarantee. Use the image digest when an exact content identity is required. The workflow then checks whether the source is still the current `main` commit and only then promotes moving architecture tags and the multi-platform `main` manifest. A superseded run keeps its versioned image reference available for a later tagged release, but cannot move shared `main` tags backward. Re-running a failed publication for the same source is safe as a source association; the registry digest identifies the exact content. Release jobs are also serialized per tag without cancellation, with up to 100 pending runs; once full, GitHub cancels additional queued runs instead of replacing an existing pending run.

The image build uses GitHub Actions cache scopes separated by architecture. `main` images are continuously published from validated merges; a GitHub Release and its installer downloads are created only by a version tag after release validation. The release workflow checks that the image index carries the exact tagged source commit and embeds `<version-tag>@sha256:<manifest-digest>` in each installer. Later movement of a GHCR tag therefore does not change the image used by an already published installer. Publishing a `main` image does not create a release or promote `.release-stage`.

## Failure, retry, and rollback

- A failed quality gate blocks publication. Fix the source and push a new commit, or rerun the failed workflow after confirming the source and dependencies are unchanged.
- A failed image build/publish is visible in `Main CD`; rerun that workflow for the same source commit after addressing a transient cause. The main tags are promoted only after both architecture images are available and the source-current check passes.
- A failed tagged release does not create a successful partial release: native installers must pass and the exact tagged source must have a successful main CD run. Rerun the failed release workflow for the same tag after resolving the failure.
- To roll an installation back, select a previously published full image identity as `IMAGE_TAG` for Compose or reinstall its matching tagged installer. Do not overwrite or retag a published version. Follow the normal backup practices before changing an active installation.

## Merged branch cleanup

`branch-cleanup.yml` runs every Monday (04:17 UTC) and on manual dispatch. It deletes remote branches that are already fully merged into `main`. The repository setting `delete_branch_on_merge` covers new merges; this workflow covers branches merged earlier or by other means. The selection logic is in `apps/infra/scripts/branch-cleanup.mjs`.

- **What it deletes:** only branches whose tip is an ancestor of `main` (`git merge-base --is-ancestor`), whose tip commit is at least 7 days old (the grace period looks at the date of the tip commit, not at the age of the branch: a branch created long ago whose last commit is recent is kept, and a new branch pointing at an old commit can qualify at once), with a plain name (letters, digits, `.`, `_`, `-`, `/`). At most 20 per run, oldest first; the summary warns when more qualify.
- **What it never deletes:** `main` and the default branch, protected branches, heads of open pull requests, branches with commits not in `main`, recent branches, and names with unusual characters (reported as skipped).
- **Squash-merged branches are not covered:** a squash merge creates a new commit, so the branch tip is never an ancestor of `main` and this workflow never deletes it. Those branches are removed by the native `delete_branch_on_merge` repository setting, which is already on.
- **Dry run first:** a manual dispatch defaults to `dry_run: true` and only writes the plan. The weekly schedule also runs as a dry run until the repository variable `BRANCH_CLEANUP_ENABLED` is exactly `true`. To enable it, after reviewing the summary of a manual dry run: `gh variable set BRANCH_CLEANUP_ENABLED --body true` (owner or `@devops` only). To disable it again: `gh variable delete BRANCH_CLEANUP_ENABLED` (or set it to any other value).
- **Inactivity:** GitHub disables scheduled workflows in a repository with no activity for 60 days. If the weekly run stops appearing in the Actions tab, re-enable it there (or run it manually).
- **Permissions:** the `plan` job reads contents and pull requests; only the `delete` job has `contents: write`. Before each deletion the delete job re-checks that the branch still points to the planned commit and that no pull request is open for it; otherwise it skips the branch.
- **Results:** the run summary lists each branch with `deleted`, `skipped` or `failed` plus totals. A failure on one branch does not stop the others; the job exits with an error if any branch failed. Manual runs of the delete path with real deletion have not been exercised on GitHub yet.
- **Restore:** the run summary lists branch name, tip hash and last commit date. Restore with `git push origin <tip-hash>:refs/heads/<branch>`.

## Official references consulted

Consulted 2026-10-07:

- [Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — shared quality workflow contract.
- [Workflow syntax and concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — `queue: max`, serialization, and non-cancellation behavior.
- [Ruleset troubleshooting](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules) — required context naming for reusable workflows.
- [Status checks](https://docs.github.com/en/pull-requests/reference/status-checks) — skipped job status behavior.
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) — pinned actions and permissions guidance.
- [OpenGrep installation](https://github.com/opengrep/opengrep/blob/acf67b45c97c4b63626536605c77064ef536806d/INSTALL.md) and [signed release binaries](https://github.com/opengrep/opengrep/releases/tag/v1.30.0) — pinned version and Cosign signature verification.
- [Cosign installer v3.9.0](https://github.com/sigstore/cosign-installer/tree/v3.9.0) — checksum-verifying installation of the pinned Cosign CLI.
- [actionlint releases](https://github.com/rhysd/actionlint/releases) and [usage](https://github.com/rhysd/actionlint/blob/main/docs/usage.md) — pinned workflow linter and supported invocation.

See also [development setup](DEVELOPMENT.md), [versioning and releases](VERSIONING.md), and the [project roadmap](ROADMAP.md).
