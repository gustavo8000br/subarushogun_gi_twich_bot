# OPS-10 — Separate CI validation from main-branch image delivery ([issue #45](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/45))

[Português brasileiro](../../pt-BR/stories/OPS-10/story.md)

**Status:** Done
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
- Verify the pinned OpenGrep release binary signature, keep Cosign installation checksum-verified, and queue same-tag release runs without replacing pending attempts.
- Describe GHCR tags as mutable references and digests as exact content identities; test release permission boundaries and concurrency contracts structurally.
- Bind each versioned multi-platform manifest to its full source SHA and embed its exact digest in release installers so later tag movement cannot change an existing download.
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
11. The pinned OpenGrep binary signature is verified before scanning, and the Cosign installation verifies its pinned binary checksum.
12. Release publishing is serialized per tag without canceling in-progress work; multiple pending attempts queue within the GitHub limit, and tests verify job dependencies and least-privilege permissions.
13. Bilingual CI/CD docs distinguish mutable GHCR tags from image digests and accurately describe pending-run queue limits.
14. Release installers are built only after verifying the image manifest's source SHA and AMD64/ARM64 platforms, and their Compose image reference includes the manifest digest.

## Implementation Tasks

- [x] Write workflow contract tests and record Red output before workflow changes.
- [x] Extract quality jobs into a reusable `workflow_call` pipeline with a stable aggregate check.
- [x] Create PR-only CI and main-push CD callers; remove CI artifact uploads and isolate package-write permission to publication.
- [x] Protect publication from cancellation/races; retain per-architecture image tags and manifest convention.
- [x] Update release CI verification to use main CD and preserve exact-source validation.
- [x] Update the active ruleset to require only the verified aggregate PR check.
- [x] Verify pinned OpenGrep binary signatures with Cosign; queue release retries and test permission boundaries.
- [x] Correct bilingual GHCR tag/digest wording and update CI/CD references.
- [x] Isolate OpenGrep's install directory so preexisting binaries cannot skip signature verification; pin release installers to the verified OCI digest.
- [x] Update version to `0.13.0` while retaining `alpha`; update bilingual changelogs, roadmap, story indexes, and CI/CD documentation.
- [ ] Run independent `$aiox-qa` review and record evidence/gate.
- [ ] Confirm PR checks and ruleset behavior from GitHub; do not merge with failing/missing required checks.

## Technical Notes

- `ci.yml` runs for pull requests targeting `main` and manual dispatch. It calls `quality-gates.yml` and has no GHCR publishing job or package-write permission. `main-cd.yml` runs only on pushes to `main`, reruns those quality gates, then grants `packages: write` only to its publishing job.
- The active `main-pr-and-ci` ruleset requires only `CI quality gates / Required quality gate`, confirmed against PR Actions run `37690120672` and a readback of ruleset `24656777`.
- Main publication uses a non-cancelable `queue: max` concurrency group. Full-SHA architecture tags are commit-scoped registry aliases, not immutable content identifiers; use the registry digest when exact image content identity is required. The versioned manifest is published for the exact validated source before a current-main check controls promotion of moving `main` tags.
- Release jobs are serialized per tag with `cancel-in-progress: false` and `queue: max`. The release workflow checks the successful `main-cd.yml` run for the exact tagged commit and requires that commit to be on `main`.
- OpenGrep `1.30.0` is installed from a pinned upstream source commit and its release binary signature is checked with Cosign `2.5.0`. Cosign is installed through a SHA-pinned action that verifies its downloaded binary checksum. actionlint is pinned with SHA-256 verification; its narrow schema-warning suppression covers GitHub's supported `concurrency.queue: max` field.
- The same reusable workflow is the shared quality implementation. Pull requests validate the merge context; main CD independently validates its trusted merged commit before publication. No `workflow_run` privilege handoff is used.

## TDD Evidence

- **Initial workflow contract Red:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js` — 10 behavior assertions failed because PR CI still owned conditional GHCR publication, there was no reusable quality workflow/main-only CD, and release verification still queried `ci.yml`. YAML parsing and test setup succeeded; failures were the missing/incorrect workflow behaviors.
- **Architecture-tag race regression Red:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 failed / 2 passed because build steps still wrote moving `main-linux-*` tags before checking whether the source remained current.
- **Green:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passed after extracting shared checks, separating triggers/permissions, checking the source before promotion, and using full-SHA-scoped architecture tags as source references for moving tags.
- **QA follow-up Red:** After Quinn's review, `npm test -- --run tests/unit/ci-workflow-contract.test.js` failed 1/8 because the reusable quality pipeline omitted `npm run validate:localization` and actionlint. The setup parsed correctly; the failure was the missing gate behavior.
- **QA follow-up Green:** `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 16 passed after adding pinned actionlint `1.7.12` (SHA-256 checked) and localization validation. Local `/tmp/actionlint -ignore 'unexpected key "queue" for "concurrency" section'` passed; the narrow ignore covers GitHub's supported queue field absent from actionlint's current schema.
- **Version-manifest Red:** `npm test -- --run tests/integration/container-publish-contract.test.js` — 1 failed / 3 passed because a superseded main run skipped creation of its exact versioned manifest, which could leave a later release installer without its image tag.
- **Version-manifest Green/refactor:** local pinned `/tmp/actionlint -shellcheck= -ignore 'unexpected key "queue" for "concurrency" section'` and the combined workflow/version contracts passed; `npm test -- --run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/version-cli.test.js` — 17 passed after publishing each version manifest before the current-source check and guarding only moving `main` tags.
- **Audit-finding Red:** `npx vitest run tests/unit/ci-workflow-contract.test.js` — 3 failed / 7 passed because release concurrency had no multi-pending queue, the OpenGrep binary was not signature-verified, and docs described mutable registry tags as immutable.
- **Audit-finding Green:** `npx vitest run tests/unit/ci-workflow-contract.test.js` — 10 passed after adding structural release permission/dependency assertions, per-tag `queue: max`, Cosign-verified OpenGrep installation, and accurate digest/tag documentation in both languages.
- **Artifact-pinning Red:** `npx vitest run tests/unit/ci-workflow-contract.test.js tests/integration/container-publish-contract.test.js tests/integration/unified-installer.test.js` — 6 failed / 36 passed because release CI did not resolve a source-verified image digest, installer packaging rejected `tag@sha256:digest`, and OpenGrep could reuse a binary whose signature check is skipped. After implementing the digest output and isolated `HOME`, the focused workflow, publisher, installer, and Compose suites passed 52/52.
- **Final local quality gates:** `npm test` passed 88 files / 734 tests; `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), actionlint 1.7.12, `npm run validate:version`, `npm run validate:localization`, `docker compose config --quiet`, and `git diff --check` passed on the implementation snapshot. Focused workflow, publisher, installer, Compose, and documentation contracts also passed. Test-created resources were cleaned; the active product's two data volumes remained present and untouched.
- **GitHub evidence:** PR #46 run `37689341108` reported `CI quality gates / Required quality gate` and all 11 job checks passed before the QA follow-up change. Active ruleset `main-pr-and-ci` was then updated and read back with that exact aggregate as its sole required context. Run `37690120672` passed all 11 jobs on commit `edd99ee`. The final audit-finding snapshot still requires its own Actions run and independent QA validation before merge.

## File List

- `.github/workflows/ci.yml`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/main-cd.yml`
- `.github/workflows/release.yml`
- `tests/unit/ci-workflow-contract.test.js`
- `tests/integration/container-publish-contract.test.js`
- `tests/integration/unified-installer.test.js`, `tests/integration/compose-contract.test.js`
- `apps/infra/scripts/package-installer.mjs`
- `tests/integration/version-cli.test.js`
- Pinned actionlint download and checksum verification in `.github/workflows/quality-gates.yml`
- `package.json`, `package-lock.json`, `VERSION`
- `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/CI-CD.md`, `docs/pt-BR/CI-CD.md`
- `docs/integrations.md`, `docs/pt-BR/integrations.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/DEVELOPMENT.md`, `docs/pt-BR/DESENVOLVIMENTO.md`
- `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`

## Change Log

- 2026-10-07 — Applied independent CI/CD audit findings: signed OpenGrep binary verification, release retry queueing and permission contracts, and correct GHCR tag/digest semantics. Release installers now pin the verified image digest.
| 2026-10-07 | 0.13.0 | QA Gate PASS (9.4/10) — Status: InReview → Done; all 14 acceptance criteria verified. | @qa |
- `docs/stories.md`, `docs/pt-BR/stories.md`
- `docs/stories/OPS-10/story.md`, `docs/pt-BR/stories/OPS-10/story.md`
- `docs/qa/gates/OPS-10-ci-cd-workflow-delivery.yml`

## QA Results

### Review Date: 2026-10-07

### Reviewed By: Quinn (`$aiox-qa`)

**Gate: PASS — 9.4/10 → `docs/qa/gates/OPS-10-ci-cd-workflow-delivery.yml`.** The current PR revision passed hosted quality gates and the active ruleset requires the observed aggregate check. The earlier story documentation mismatch is corrected in both languages.

**Reviewed revision:** `3e49fc0e8159f4377a8c143b35129b111ef89a9d` (PR #46; HEAD matches).

**GitHub evidence:** Actions run `37691970595` passed all 11 jobs: 88 test files / 734 tests, API/infra/web lint and typecheck, shared lint/typecheck, Linux/macOS/Windows installer smoke, workflow lint/OpenGrep/version/localization validation, Compose config and production image build, and the aggregate `CI quality gates / Required quality gate`. Read-only inspection confirms active ruleset `main-pr-and-ci` (ID `24656777`) requires only `CI quality gates / Required quality gate`, matching the observed check name.

**Independent local checks:** `npm run lint`, `npm run typecheck`, `npm run review:static` (0 findings), `npm run validate:version` (`v0.13.0-0000000-alpha`), `npm run validate:localization` (5 modules; en/es/pt-BR), and `git diff --check` passed. I did not rerun `npm test`, Compose, or Docker in this review because the complete suite and image build passed on the isolated GitHub runner, and this QA task prohibits touching local Docker volumes.

**Acceptance review:** AC 1–14 are covered by the workflow definitions, workflow/installer/Compose contract tests, bilingual documentation and the successful PR run. The tests assert least-privilege package/release permissions, required aggregate behavior, release queueing and limits, signature-verified OpenGrep installation, source-SHA/platform annotations, and digest-pinned installer references. The active ruleset was read back from GitHub. Actual GHCR publication and a tagged release were not executed on this PR; their conditions and contracts are validated, while those product-delivery events remain for their authorized main/release workflows.

**Gate:** PASS → `docs/qa/gates/OPS-10-ci-cd-workflow-delivery.yml`

**Lifecycle:** Status changed from `InReview` to `Done`; the QA Change Log entry records the transition. No Docker commands or volume changes were made.
