# Versioning

[Português brasileiro](pt-BR/VERSIONING.md)

The product follows SemVer. `package.json` stores only `MAJOR.MINOR.PATCH`; `.release-stage` is the sole stage source (`alpha`, `beta`, `rc`, or `stable`); and `VERSION` stores the runtime identity `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`.

## Version each shipped main build

Version increments are dense: bump only when a coherent milestone ships in the `main` image, never for a single story, a single cutover wave, a documentation-only change, or an internal refactor. Increment `PATCH` only for a fix to something already released. Increment `MINOR` for a dense, coherent milestone (a set of features, a large implementation, or a complex fix). Increment `MAJOR` for an incompatible change to a public contract (API, URLs/links, data formats); `MAJOR` may increase already in `alpha` and `beta`. When the release stage advances, the version resets for the new stage: `v1.0.0-rc`, then `v1.0.0-stable`. `v1.0.0-beta` is reserved for when everything is validated and functional (including Windows, macOS, native OBS, and live Twitch evidence); until then `beta` uses `0.N.0`. Authority: in `alpha` and `beta` the orchestrator decides when a milestone warrants a bump and `@devops` executes it after the `@qa` verdict, informing the owner; from `rc` and `stable` every bump needs the owner's express approval. Push, pull request, tag, and release still need the owner's separate approval. Update `package.json`, `package-lock.json`, and tracked `VERSION` consistently. Only the product owner may change the release stage. Implementation work and version increments never change it automatically. The authoritative policy is the "Política de bumps de versão" section of `AGENTS.md`.

Every PR that carries a bump receives its selected version before merge. Record user-facing changes under the matching version heading in the stage-specific English and pt-BR changelogs: `CHANGELOG-alpha.md`, `CHANGELOG-beta.md`, `CHANGELOG-rc.md`, or `CHANGELOG-stable.md`, paired with `docs/pt-BR/CHANGELOG-<stage>.md`. The root `CHANGELOG.md` files are indexes. Do not use an `Unreleased` section. Public changelogs follow the format in `AGENTS.md` (exact `## vX.Y.Z-stage` heading, one `> [!WARNING]` block for incompatible changes, categories with a colored square plus a text label, English and pt-BR mirrored). Changelog headings use the SemVer base and stage (for example `v0.2.0-alpha`). The full runtime identity includes the exact seven-character SHA of the source commit (for example `v0.2.0-abcdef0-alpha`); CI materializes that value in the artifact after the commit exists, so the changelog commit never has to contain its own SHA.

## Current release plan

The current shipping target is product base version `0.2.0`; `.release-stage` remains `beta`, and the unmaterialized checkout identity is `v0.2.0-0000000-beta`. This feature lets a streamer cancel a pending reward-backed queue deletion after the exact managed Twitch reward is verified to exist and remain paused. It preserves the queue's entries and financial history and permits a later safe deletion attempt. The owner must test this build locally, including the recovery flow; no live Twitch operation is claimed by automated tests. Beta release publication remains manually triggered by the owner; this version bump does not create a Git tag or GitHub Release.

## GitHub release contents

The release tag and title use the full materialized identity, for example `v0.2.0-a1b2c3d-beta`. Attach exactly one installer file per supported desktop OS: `.bat` for Windows, `.command` for macOS, and `.sh` for Linux. Build release notes from the matching version section in the changelog file for that stage in English and pt-BR. Do not use `CHANGELOG_INTERNAL.md` as public release notes. Only the repository owner manually dispatches the release workflow from `main` for an existing version tag; `@devops` maintains the workflow and a tag push cannot publish a release automatically. Every GitHub Release is marked as a prerelease, including a `stable`-stage identity, until the owner changes this policy.

Each attached installer embeds the full release identity and the verified GHCR manifest digest as `IMAGE_TAG` (`<version>@sha256:<digest>`). Its normal update action pulls that exact release image before updating and only records the new reference after the pull succeeds. `main` remains the Compose/CI default; previously published installers do not silently drift when a mutable GHCR version tag is moved.

Manually dispatching `.github/workflows/release.yml` requires an existing version tag as input. The workflow verifies the tag's SemVer, stage, and seven-character SHA against its source commit, requires that commit to be on `main` with a successful Main CD run, builds and launches one installer on each native runner, and only then publishes a prerelease with both public changelog sections. A missing translated section or any failed platform build prevents publication. Branch pushes and tag pushes never publish a release.

## Runtime identity and artifacts

The initial source identity was `v0.1.0-0000000-alpha`. The first materialized alpha image was `v0.1.0-3e0c935-alpha`, built from source commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` and published as an AMD64/ARM64 manifest after all CI gates passed. It was a versioned alpha image, not a launch release, GitHub Release, Git tag, or stage promotion.

For each CI image, materialize the first seven hexadecimal characters of the exact source commit and verify the identity inside the image. Do not write the SHA back into the source checkout. A Git discovery error is a build error, never a reason to use the zero marker. The zero marker is for unmaterialized local source builds; a destination computer without Git keeps the identity embedded in the image.

GHCR image tags follow one platform convention: `main` and a full version such as `v0.2.0-abcdef0-alpha` identify multi-platform manifests; `main-linux-amd64`, `main-linux-arm64`, and their versioned equivalents identify single-platform images. Registry tags are mutable references; the OCI digest identifies exact image content. Release installers pin the versioned manifest by digest. Compose defaults to `IMAGE_TAG=main`. Image tags do not determine `product_version`; runtime identity remains embedded in the image.

Publishing a versioned CI image does not create a GitHub Release or Git tag. Stage promotion requires explicit human approval. The product version, API contract version, and state revision have separate purposes.
