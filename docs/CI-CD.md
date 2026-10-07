# CI and image delivery

[Português brasileiro](pt-BR/CI-CD.md) · [Back to README](../README.md)

This guide explains how pull request checks, main image publication, and tagged releases relate. The workflows are defined in `.github/workflows/` and use pinned Actions, least-privilege permissions, `npm ci`, and the repository's shared quality workflow.

## Workflow responsibilities

| Workflow | Trigger | Responsibility | Registry/release write access |
| --- | --- | --- | --- |
| `ci.yml` | Pull request targeting `main`; manual dispatch | Calls `quality-gates.yml`; reports one stable aggregate required check | None |
| `quality-gates.yml` | Reusable `workflow_call` | API/infra/web lint and typecheck, shared lint/typecheck, installer smoke on Linux/macOS/Windows, Vitest with PostgreSQL/Compose, OpenGrep/version checks, Compose validation, and production image build | None |
| `main-cd.yml` | Push to `main` | Re-runs the shared quality gates for the merged commit, then builds and publishes validated Linux images | `packages: write` only in the publishing job |
| `release.yml` | Push of a version tag `v*` | Validates the tag/source and successful main CD run, builds native installer assets, then publishes bilingual release notes | `contents: write` only in the release job |

Pull requests never run the GHCR publisher. The active `main-pr-and-ci` ruleset requires the stable reusable workflow check; it does not require a main-only publishing job. GitHub names reusable workflow checks as `<caller job> / <reusable job>`, so the configured required context is verified from an actual PR run.

The shared workflow ends in an aggregate job that requires every validation job to finish successfully. Failed, canceled, or skipped constituent jobs fail the aggregate. Installer smoke files are temporary and are not uploaded from normal CI; only the release workflow uploads the tested `.bat`, `.command`, and `.sh` installers.

## Image tags and publication safety

`compose.yaml` defaults to `IMAGE_TAG=main`.

| Tag | Meaning |
| --- | --- |
| `main` | Moving AMD64/ARM64 manifest for the latest validated main commit |
| `main-linux-amd64`, `main-linux-arm64` | Moving single-architecture tags for that validated source |
| `<full-commit-sha>-linux-amd64`, `<full-commit-sha>-linux-arm64` | Immutable source images used to promote tags safely |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE` | Versioned AMD64/ARM64 manifest, materialized from the exact source commit |
| `vMAJOR.MINOR.PATCH-SHA7-STAGE-linux-amd64`, `...-linux-arm64` | Versioned single-architecture images |

The publisher queues main runs without canceling an active publish. It builds immutable per-commit architecture images first, checks whether the source is still the current `main` commit, and only then promotes moving architecture tags and the multi-platform manifest. A superseded run may leave its immutable versioned images available, but it cannot move the shared `main` tags backward. Re-running a failed publication for the same source is safe; the immutable tags identify that exact source.

The image build uses GitHub Actions cache scopes separated by architecture. `main` images are continuously published from validated merges; a GitHub Release and its installer downloads are created only by a version tag after release validation. Publishing a `main` image does not create a release or promote `.release-stage`.

## Failure, retry, and rollback

- A failed quality gate blocks publication. Fix the source and push a new commit, or rerun the failed workflow after confirming the source and dependencies are unchanged.
- A failed image build/publish is visible in `Main CD`; rerun that workflow for the same source commit after addressing a transient cause. The main tags are promoted only after both architecture images are available and the source-current check passes.
- A failed tagged release does not create a successful partial release: native installers must pass and the exact tagged source must have a successful main CD run. Rerun the failed release workflow for the same tag after resolving the failure.
- To roll an installation back, select a previously published full image identity as `IMAGE_TAG` for Compose or reinstall its matching tagged installer. Do not overwrite or retag a published version. Follow the normal backup practices before changing an active installation.

## Official references consulted

Consulted 2026-10-07:

- [Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — shared quality workflow contract.
- [Workflow syntax and concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — `queue: max`, serialization, and non-cancellation behavior.
- [Ruleset troubleshooting](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules) — required context naming for reusable workflows.
- [Status checks](https://docs.github.com/en/pull-requests/reference/status-checks) — skipped job status behavior.
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions) — pinned actions and permissions guidance.

See also [development setup](DEVELOPMENT.md), [versioning and releases](VERSIONING.md), and the [project roadmap](ROADMAP.md).
