# OPS-10 — Separate CI validation from main-branch image delivery ([issue #45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45))

[Português brasileiro](../../pt-BR/stories/OPS-10/story.md)

**Status:** InProgress
**Executor:** `$aiox-devops` for workflow/ruleset operations; `$aiox-dev` for contract tests and implementation.
**Quality gate:** `$aiox-architect` architecture review and independent `$aiox-qa` validation.

## Story

As a maintainer,
I want pull request validation and main-branch image delivery to be distinct workflows that share one tested quality pipeline,
so that pull requests never present image publishing as a skipped check and only validated commits publish to GHCR.

## Scope

- Reusable quality workflow owns API/infra/web lint and typecheck, shared lint/typecheck, native installer smoke tests, Vitest/PostgreSQL/Compose tests, OpenGrep/version validation, Compose validation, and production image build.
- PR CI calls the quality workflow and does not request package-write permissions or publish images.
- Main CD calls the same quality workflow for the merged commit, then publishes the existing `main` moving tag, per-architecture tags, and exact materialized product identity tags to GHCR.
- Publication is serialized and cannot be canceled by a later main push while publishing. Outdated source commits must not leave a stale `main` manifest as the final image.
- CI installer smoke jobs do not upload artifacts that no CI job consumes. Release workflow remains responsible for tested installer release assets.
- Active `main-pr-and-ci` ruleset requires the aggregate PR quality gate, not a conditionally skipped GHCR publication check.
- Update the release workflow's source-CI lookup to the main CD workflow, preserving verification that the exact tagged source commit passed gates on `main`.
- Document CI/CD responsibilities, image tag semantics, release association, and rollback/retry behavior in both languages.
- Keep `.release-stage` at `alpha`; do not create a release or tag.

## Acceptance Criteria

1. GitHub Actions parses and runs separate PR CI and main CD workflows; PR runs contain no GHCR publishing job, package-write permission, or skipped publish status.
2. Both workflows invoke the same reusable quality workflow; its aggregate check fails if any required validation job fails or is canceled and succeeds only when all required jobs succeed.
3. Native installer smoke tests remain on Linux, macOS, and Windows, while temporary installer artifacts are not uploaded from ordinary CI runs.
4. GHCR publishing runs only for a push to `main`, waits for the reusable quality workflow to succeed, and preserves AMD64/ARM64 architecture tags, multi-platform manifests, cache behavior, and exact materialized product identity.
5. Concurrent or superseded main runs cannot cancel an active image publish or leave an outdated build as the final `main` manifest. A retry of the same source commit is safe.
6. The active ruleset requires the stable PR quality gate and does not require main-CD/GHCR checks for pull requests; PR-required contexts are verified against a real GitHub Actions run.
7. The release workflow checks the successful main-CD run for the exact tagged source commit before publishing its release assets.
8. Workflow contract tests are written first and demonstrate the old mismatch (required PR check for skipped publishing, unnecessary installer uploads, shared-workflow/release lookup absent) before implementation.
9. Bilingual docs, story indexes, roadmap, `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`, and their pt-BR counterparts describe the same workflow and current status.
10. Quality gates pass: project tests, lint, typecheck, OpenGrep, version/localization validation, Compose validation, workflow YAML/lint validation, PR checks, and final ruleset inspection. No active application volume is recreated or removed.

## Implementation Tasks

- [x] Write workflow contract tests and record Red output before workflow changes.
- [x] Extract quality jobs into a reusable `workflow_call` pipeline with a stable aggregate check.
- [x] Create PR-only CI and main-push CD callers; remove CI artifact uploads and isolate package-write permission to publication.
- [x] Protect publication from cancellation/races; retain per-architecture image tags and manifest convention.
- [x] Update release CI verification to use main CD and preserve exact-source validation.
- [x] Update the active ruleset to require only the verified aggregate PR check.
- [x] Update version to `0.13.0` while retaining `alpha`; update bilingual changelogs, roadmap, story indexes, and CI/CD documentation.
- [ ] Run independent `$aiox-qa` review and record evidence/gate.
- [ ] Confirm PR checks and ruleset behavior from GitHub; do not merge with failing/missing required checks.

## Technical Notes

- Current `ci.yml` runs on PR, main push, and manual dispatch. Its `container-publish` condition is already restricted to `push` on `main`, but the active ruleset lists this skipped-on-PR check as required.
- Current workflow-wide concurrency uses `cancel-in-progress: true`, which can cancel main publication.
- The release workflow currently looks up `ci.yml` for the tagged source commit. This must track the new main CD run after the trigger split.
- GitHub documentation confirms job-level conditions can mark a job skipped while reporting success; required status checks treat skipped as successful. It also documents reusable workflow check names as caller job plus inner job. The actual check name must be read from the PR run before changing the ruleset.
- Avoid `workflow_run` privilege escalation. The main CD workflow must checkout and build its own trusted `push` commit, never execute an untrusted PR head with package-write permissions.
- Preserve the current tag contract: `main` is a moving installation channel; architecture tags identify platform-specific images; the full product identity is built from the exact main commit and remains available to versioned installers.
- A reusable workflow is the shared implementation. PR validation runs against the PR merge context; main CD independently validates the merged source before publication.

## TDD Evidence

- **Initial workflow contract Red:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js` — 10 behavior assertions failed because PR CI still owned conditional GHCR publication, there was no reusable quality workflow/main-only CD, and release verification still queried `ci.yml`. YAML parsing and test setup succeeded; failures were the missing/incorrect workflow behaviors.
- **Architecture-tag race regression Red:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 failed / 2 passed because build steps still wrote moving `main-linux-*` tags before checking whether the source remained current.
- **Green:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passed after extracting shared checks, separating triggers/permissions, checking the source before promotion, and using immutable full-SHA architecture inputs for moving tags.
- **QA follow-up Red:** After Quinn's review, `npm test -- --run tests/unit/ci-workflow-contract.test.js` failed 1/8 because the reusable quality pipeline omitted `npm run validate:localization` and actionlint. The setup parsed correctly; the failure was the missing gate behavior.
- **QA follow-up Green:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passed after adding pinned actionlint `1.7.12` (SHA-256 checked) and localization validation. Local `/tmp/actionlint -ignore 'unexpected key "queue" for "concurrency" section'` passed; the narrow ignore covers GitHub's supported queue field absent from actionlint's current schema.
- **Version-manifest Red:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 failed / 3 passed because a superseded main run skipped creation of its exact versioned manifest, which could leave a later release installer without its image tag.
- **Version-manifest Green/refactor:** local pinned `/tmp/actionlint -shellcheck= -ignore 'unexpected key "queue" for "concurrency" section'` and the combined workflow/version contracts passed; `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 17 passed after publishing each immutable version manifest before the current-source check and guarding only moving `main` tags.
- **Local quality gates:** `npm test` — 88 files / 727 tests passed; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), actionlint 1.7.12, `npm run validate:version`, `npm run validate:localization`, `docker compose config --quiet`, and `git diff --check` passed. The full suite's isolated Compose/PostgreSQL containers and volumes were cleaned up; active product services and volumes remained unchanged.
- **GitHub evidence:** PR #46 run `37689341108` reported `CI quality gates / Required quality gate` and all 11 job checks passed before the QA follow-up change. Active ruleset `main-pr-and-ci` was then updated and read back with that exact aggregate as its sole required context. The final commit still needs fresh Actions and independent QA validation.

## File List

- `.github/workflows/ci.yml`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/main-cd.yml`
- `.github/workflows/release.yml`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/integration/container-publish-contract.test.js`
- `tests/integration/version-cli.test.js`
- Pinned actionlint download and checksum verification in `.github/workflows/quality-gates.yml`
- `package.json`, `package-lock.json`, `VERSION`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/CI-CD.md`, `docs/pt-BR/CI-CD.md`
- `docs/DEVELOPMENT.md`, `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-10/story.md`, `docs/pt-BR/stories/OPS-10/story.md`

## QA Results

### Review Date: 2026-10-07

### Reviewed By: Quinn (`$aiox-qa`)

**Gate: FAIL — 7.6/10.** The local workflow contract tests and quality checks pass, but required GitHub check/ruleset acceptance is not satisfied and several CI/CD documents claim that the pending ruleset change is already active.

**Local evidence:** `npm exec -- vitest run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` passed 16/16; `npm run validate:version`, `npm run validate:localization`, `npm run typecheck`, `npm run lint`, `npm run review:static` (0 findings), and `git diff --check` passed. The full test suite and Docker/Compose execution were not run during this read-only review to avoid changing the local installation or volumes.

**Findings:**

1. **High — REQ-001, real PR check and ruleset are still incompatible.** Read-only GitHub inspection found no PR or Actions run for `feat/ops-10-ci-cd-pipeline`. The active `main-pr-and-ci` ruleset (ID `24656777`) still requires legacy job contexts, including `Publish Linux multi-platform images to GHCR`, and does not require the new aggregate `CI quality gates` context. The actual reusable-workflow check name cannot be confirmed until a PR run exists. This leaves acceptance criteria 6 and 10 unmet. Create the PR, observe the real check, have `@devops` update the ruleset to the verified PR aggregate, and inspect the active ruleset again before merge.
2. **Medium — DOC-001, documentation overstates the deployed state.** `docs/CI-CD.md` and its pt-BR counterpart state that the active ruleset already requires the stable reusable-workflow check; both internal changelogs say the aggregate is the only required check. The live ruleset still lists the old individual checks and GHCR publisher. Align both languages and changelogs with the verified GitHub state after the ruleset update.
3. **Medium — TEST-001, two declared CI validations are absent from the reusable gate.** Acceptance criterion 10 requires workflow YAML/lint and localization validation. The workflow contract test parses YAML with `js-yaml`, but no GitHub Actions-aware linter such as `actionlint` runs; `quality-gates.yml` also does not invoke `npm run validate:localization`. Add those checks or resolve the acceptance-criteria discrepancy before completion.

**Not validated in this review:** PR Actions contexts, native installer smoke jobs on GitHub runners, the GHCR publish path, and a real main-CD run. No Docker commands or volume changes were made. The current story status is already `InProgress`; the lifecycle transition pre-check requires `InReview` and a Change Log section, so no lifecycle field was changed.
