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
- [ ] Update the active ruleset to require only the verified aggregate PR check.
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
- **GitHub evidence pending:** The PR Actions run must establish the actual required check context before the active ruleset is changed. No GitHub check result or final QA verdict is claimed yet.

## File List

- `.github/workflows/ci.yml`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/main-cd.yml`
- `.github/workflows/release.yml`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/integration/container-publish-contract.test.js`
- `tests/integration/version-cli.test.js`
- `package.json`, `package-lock.json`, `VERSION`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/CI-CD.md`, `docs/pt-BR/CI-CD.md`
- `docs/DEVELOPMENT.md`, `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-10/story.md`, `docs/pt-BR/stories/OPS-10/story.md`
