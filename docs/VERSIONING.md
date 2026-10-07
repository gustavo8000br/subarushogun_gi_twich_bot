# Versioning

[Português brasileiro](pt-BR/VERSIONING.md)

The product follows SemVer. `package.json` stores only `MAJOR.MINOR.PATCH`; `.release-stage` is the sole stage source (`alpha`, `beta`, `rc`, or `stable`); and `VERSION` stores the runtime identity `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`.

## Version each shipped main build

A pull request that is ready to merge and ship in the `main` image gets a version before merge. Increment `PATCH` for a small fix or documentation-only change. Increment `MINOR` for a new feature, a large implementation, or a complex fix. Increment `MAJOR` only for a major product change, such as an official launch release explicitly authorized by the owner. Update `package.json`, `package-lock.json`, and tracked `VERSION` consistently. Only the product owner may change the release stage. Implementation work and version increments never change it automatically.

Every shipping PR receives its selected version before merge. Record user-facing and technical notes directly under matching version headings in both English and pt-BR changelogs; do not use an `Unreleased` section. Changelog headings use the SemVer base and stage (for example `v0.2.0-alpha`). The full runtime identity includes the exact seven-character SHA of the source commit (for example `v0.2.0-abcdef0-alpha`); CI materializes it in the artifact after the commit exists, so the changelog commit never has to contain its own SHA.

## Current release plan

The current product base version is `0.12.0`, `.release-stage` is `alpha`, and the unmaterialized checkout identity is `v0.12.0-0000000-alpha`. OPS-8 and OPS-9 are complete; FND-9 and DOC-2 remain before the first canonical public beta. The owner authorized beta promotion only after FND-9 is complete and the recorded OPS-8/DOC-2 release gates are satisfied. The planned first public release identity is `v1.0.0-HHHHHHH-beta`; do not promote the stage, change to `1.0.0`, create a tag, or publish a release before those gates are satisfied.

## GitHub release contents

The release tag and title use the full materialized identity, for example `v1.0.0-a1b2c3d-beta`. Attach exactly one installer file per supported desktop OS: `.bat` for Windows, `.command` for macOS, and `.sh` for Linux. Build release notes from the matching version section in both `CHANGELOG.md` and `docs/pt-BR/CHANGELOG.md`; the release body presents the user-facing changes in English and pt-BR. Do not use `CHANGELOG_INTERNAL.md` as public release notes. Tags and releases are created exclusively by `@devops` after the owner-approved release gate.

Each attached installer embeds the same full release identity as its GHCR `IMAGE_TAG`. Its normal update action pulls that selected release image before updating and only records the new tag after the pull succeeds. `main` remains the Compose/CI default; previously published installers do not silently drift to a later image.

Pushing a correctly formed version tag runs `.github/workflows/release.yml`. The workflow checks that the tag's SemVer, stage, and seven-character SHA match the tagged source, builds and launches one installer on each native runner, and only then publishes the GitHub Release with both public changelog sections. A missing translated section or any failed platform build prevents publication. Ordinary branch and documentation pushes never publish a release.

## Runtime identity and artifacts

The initial source identity was `v0.1.0-0000000-alpha`. The first materialized alpha image was `v0.1.0-3e0c935-alpha`, built from source commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` and published as an AMD64/ARM64 manifest after all CI gates passed. It was a versioned alpha image, not a launch release, GitHub Release, Git tag, or stage promotion.

For each CI image, materialize the first seven hexadecimal characters of the exact source commit and verify the identity inside the image. Do not write the SHA back into the source checkout. A Git discovery error is a build error, never a reason to use the zero marker. The zero marker is for unmaterialized local source builds; a destination computer without Git keeps the identity embedded in the image.

GHCR image tags follow one platform convention: `main` and a full version such as `v0.2.0-abcdef0-alpha` identify multi-platform manifests; `main-linux-amd64`, `main-linux-arm64`, and their versioned equivalents identify single-platform images. Compose defaults to `IMAGE_TAG=main`. Image tags do not determine `product_version`; runtime identity remains embedded in the image.

Publishing a versioned CI image does not create a GitHub Release or Git tag. Stage promotion requires explicit human approval. The product version, API contract version, and state revision have separate purposes.
