# OPS-4 — Adopt the MIT License

[Português brasileiro](../../pt-BR/stories/OPS-4/story.md)

**Status:** Ready for Review  
**Type:** Documentation and repository metadata  
**Version:** `0.4.1-alpha` (PATCH; alpha stage retained)

## User story

As a project contributor, I want the repository to publish clear MIT licensing terms so that people can understand the permissions and conditions for using and contributing to the project.

## Acceptance criteria

- [x] Add the complete standard MIT License text with the project copyright holder and current year.
- [x] Declare `MIT` in `package.json` and keep `package-lock.json` consistent.
- [x] Replace the unlicensed notices in both READMEs with reciprocal, accurate MIT references.
- [x] Increment the base version by PATCH to `0.4.1`; retain the `alpha` stage and zero source marker until a build materializes a commit SHA.
- [x] Record concise user-facing and internal changes in the English and pt-BR changelogs.
- [x] Keep English and pt-BR versioning/story records aligned, including correcting OPS-3's merged status (PR #24).
- [x] Run required repository quality gates; record actual commands and results below.

## TDD / verification record

This story changes licensing and documentation metadata, not application behavior. No application behavior test is added. `npm run validate:version`, JSON/lockfile checks and reciprocal-document checks passed. `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:static`, `npm audit --audit-level=high`, Compose config and `git diff --check` passed; see the PR validation output for exact results. `npm run build` is not defined in this repository; Docker image build is the production build path and application/runtime files are unchanged.

## File list

- [x] `LICENSE`
- [x] `package.json`, `package-lock.json`, `VERSION`
- [x] `README.md`, `README.pt-BR.md`
- [x] `CHANGELOG.md`, `CHANGELOG_INTERNAL.md`
- [x] `docs/pt-BR/CHANGELOG.md`, `docs/pt-BR/CHANGELOG_INTERNAL.md`
- [x] `docs/VERSIONING.md`, `docs/pt-BR/VERSIONING.md`
- [x] `docs/stories.md`, `docs/pt-BR/stories.md`
- [x] `docs/stories/OPS-3/story.md`, `docs/pt-BR/stories/OPS-3/story.md`
- [x] `docs/stories/OPS-4/story.md`, `docs/pt-BR/stories/OPS-4/story.md`
