# Story OPS-1: Continuous integration for API, infrastructure, and web

[Português brasileiro](../../pt-BR/stories/OPS-1/story.md)

**Complexity:** MEDIUM
**Executor:** @dev
**Quality gate:** @qa
**Capability:** Repository CI
**GitHub issue:** [#20](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/20)

## Status

**InReview**

## Story

**As a** project maintainer,
**I want** GitHub Actions to lint and typecheck each application area, run the full test suite, validate version/configuration, and build the container image,
**so that** pull requests receive repeatable quality feedback before merge.

## Acceptance Criteria

1. Pull requests targeting `main` and pushes to `main` run the CI workflow with read-only repository permissions and cancellable per-branch runs.
2. API, infra, and web each have an independent lint and JavaScript typecheck job using the pinned project Node version and `npm ci`.
3. The complete Vitest suite runs on Linux with Docker available for real PostgreSQL and Compose integration tests.
4. The workflow runs OpenGrep, version validation, Compose configuration validation, and builds the production Docker image without requiring Twitch credentials or a live database for image generation.
5. Workflow commands and build assumptions are documented in English and pt-BR; project quality checks pass locally.

## TDD Evidence

- **Workflow contract:** `npm test -- --run tests/unit/ci-workflow-contract.test.js` first failed with `ENOENT` for the missing `.github/workflows/ci.yml`, proving no CI contract existed. After the initial implementation, four assertions failed because the contract test assumed matrix entries and build command formatting that differed from the actual workflow; the test expectations were corrected to assert the workflow's matrix and Compose image-build behavior.
- **Green:** the focused contract command passed all 5 tests after adding independent scripts/configs, read-only Actions workflow and Docker build/test jobs.
- **Per-app typecheck regression:** `npm run typecheck:infra` failed because the isolated project could not resolve Node globals/types which had been incidentally loaded in the aggregate project. Adding the pinned `@types/node@24.13.6` development dependency and explicit Node types made `npm run typecheck:api`, `npm run typecheck:infra`, and `npm run typecheck:web` pass.
- **Final local verification:** `npm test` — 46 files, 288 tests passed; `npm run lint`, `npm run typecheck`, all six per-app lint/typecheck commands, `npm run review:static` (40 application JS files, 0 findings), `npm run validate:version`, `docker compose config --quiet`, `docker compose build bot`, Ruby YAML parsing of `.github/workflows/ci.yml`, and `git diff --check` passed.
- **Action pinning Red/Green:** the workflow contract first failed because actions referenced movable release tags. After replacing them with the immutable commit SHAs corresponding to checkout `v6.0.3`, setup-node `v7.0.0`, and setup-buildx `v4.4.1`, the focused contract passed again. Release references were checked against the official repositories on 2026-10-05.
- GitHub-hosted Actions execution is pending the pull request and is not claimed as passed yet.

## File List

- `.github/workflows/ci.yml`
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.api.json`, `tsconfig.infra.json`, `tsconfig.web.json`
- `tests/unit/ci-workflow-contract.test.js`
- `README.md`, `README.pt-BR.md`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-1/story.md`, `docs/pt-BR/stories/OPS-1/story.md`


## QA Results

Pending @qa review.
