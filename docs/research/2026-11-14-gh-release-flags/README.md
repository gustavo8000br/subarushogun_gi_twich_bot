# gh release create: --prerelease, --latest and --latest=false

[Português brasileiro](../../pt-BR/research/2026-11-14-gh-release-flags/README.md)

- Date: 2026-11-14. Author: `@analyst`. Scope: desk research (official docs only). Verdict: **SUFFICIENT** (REFRESH IF the `gh` major version or the REST `make_latest` semantics change).

## Answers

1. **Flags (VERIFIED, CLI manual):** `gh release create` accepts `-p/--prerelease` ("Mark the release as a prerelease") and `--latest` ("Mark this release as Latest (default [automatic based on date and version]). --latest=false to explicitly NOT set as latest"). The manual's own example is `gh release create v1.2.3 --latest=false`. So `--latest=false` is valid.
2. **Can a prerelease be latest? (VERIFIED, REST docs):** no. `make_latest` accepts `true`, `false`, `legacy` (default `true` for new releases) and states "Drafts and prereleases cannot be set as latest". The "latest release" endpoint also skips prereleases and drafts. Therefore `--latest=false` on a prerelease is **redundant but harmless**; it only makes the intent explicit. The CLI manual does not describe the interaction between the two flags (PARTIAL: the guarantee comes from the REST page, not from a CLI statement or a live test).
3. **Recommended form:** alpha/beta/rc: `--prerelease --latest=false` (explicit, safe even if the rule ever changes). stable: a normal release (no `--prerelease`) with `--latest`.
4. **Risk of `--latest` on stable (PARTIAL):** the CLI default (flag omitted) is "automatic based on date and version", matching the REST `legacy` mode (newest creation date and higher semver). An explicit `--latest` asks for "latest" unconditionally (REST `true`), so a stable release with a lower semver than the current latest (for example a backport) would **take over** "Latest". It is harmless for a linear history where each stable is the newest. For a backport, use `--latest=false` or omit the flag. Whether the CLI maps `--latest` to `make_latest=true` and an omitted flag to `legacy` was not confirmed in the manual text (UNVERIFIED; check the `gh` source or a test repo if a backport flow is ever needed).

## Conclusion for the release.yml `case`

`alpha|beta|rc` -> `--prerelease --latest=false` and `stable` -> `--latest` is correct for a linear release line. Note: `.github/workflows/release.yml:302` currently passes only `--prerelease`; the `case` is still to be written.

## Sources

- https://cli.github.com/manual/gh_release_create
- https://docs.github.com/en/rest/releases/releases#create-a-release

## Limitations

No live release creation was run (it would publish on the real repository). Behaviour is from documentation only.
