# QA Gate — release.yml tag identity fix (2026-11-06c)

[Português brasileiro](../../pt-BR/stories/OPS-15/qa-gate-2026-11-06c-release-tag.md)

**Reviewer:** @qa (Quinn). **Verdict: PASS. Score: 9.3/10** (minimum 9.0).
**Scope:** two lines in `release.yml` (`git config user.name` / `user.email` before `git tag -a`), new `tests/unit/release-workflow-tag-contract.test.js`, changelog entries. No `git add`, commit or push.

## Evidence

- Diff: only the 2 lines, inside the `else` branch (tag does not exist yet), before `git tag -a`; the existing-tag branch is untouched. Local (repo-scoped) git config on an ephemeral runner; identity is the standard `github-actions[bot]` noreply address.
- Targeted `*workflow*` tests: 19/19. `lint`, `validate:version`, `validate:localization`, `review:static`, `git diff --check`: exit 0. `actionlint`: only the 2 accepted `queue: max`. `npm test`: 178 files, 1976 tests, exit 0.
- Own mutations (restored, `cmp` identical): remove `user.name`, remove `user.email`, move both configs after `git tag -a`: each makes 1 test fail (3 of 3 killed).
- Security: `grep "claude.ai/"` on the diff: none.

## Read-only checks of the "probable" risks (2026-11-05)

- `git ls-remote --tags origin`: 0 tags. `gh release list`: 0 releases. No partial tag or release exists now.
- Rulesets (`gh api .../rulesets`): 2, both `target: branch` (`legacy-no-delete-no-force-push`, `main-pr-and-ci`); no tag ruleset, and the legacy tag-protection endpoint returns 404. So pushing the tag with `GITHUB_TOKEN` (`contents: write`) is not blocked today.
- Workflow default token permission is `read`, but the job declares `contents: write`, which is enough.

## Risk handling for @devops

1. Before re-running, repeat `git ls-remote --tags origin` and `gh release list`. If a new tag ruleset was added meanwhile, create the tag by an authorized path instead of the token.
2. The tag step is idempotent (reuses an existing tag only if it points to the source commit), but `gh release create` is not: if a run fails after the tag push and before/while creating the release, a re-run fails at `gh release create` only if the release exists. Check `gh release view <tag>`; a tag without release is fine to re-run; a partial draft/release must be removed by the `@devops` (owner OK for destructive removal) before re-running. A tag pointing to another commit must never be moved.
3. After the run: confirm the tag, one pre-release with exactly 3 assets.

## Findings

- Low (accepted): the test checks text order inside the step, not real git behavior; real proof is dispatching `release.yml` (not claimed here).
- Low (accepted): `gh release create` with `--verify-tag` depends on the pushed tag being visible; expected on GitHub.

## Commit group (single)

- `.github/workflows/release.yml`
- `tests/unit/release-workflow-tag-contract.test.js` (new)
- `CHANGELOG_INTERNAL.md`
- `docs/pt-BR/CHANGELOG_INTERNAL.md`
- `docs/stories/OPS-15/qa-gate-2026-11-06c-release-tag.md`
- `docs/pt-BR/stories/OPS-15/qa-gate-2026-11-06c-release-tag.md`

Note: the earlier fix (`shell: bash`, test `release-workflow-shell-contract.test.js`, gate `2026-11-06b`) is already on `main` (PR #111); this commit carries only the bot identity fix.
Message: `fix(release): set the bot identity before the annotated tag [OPS-15]`.
