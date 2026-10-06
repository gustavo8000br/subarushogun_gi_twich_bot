# Versioning

[Português brasileiro](pt-BR/VERSIONING.md)

The product follows SemVer. `package.json` stores only `MAJOR.MINOR.PATCH`; `.release-stage` is the sole stage source (`alpha`, `beta`, `rc`, or `stable`); and `VERSION` stores the runtime identity `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`.

## Version each shipped main build

A pull request that is ready to merge and ship in the `main` image gets a version before merge. Increment `PATCH` for a small fix or documentation-only change. Increment `MINOR` for a new feature, a large implementation, or a complex fix. Increment `MAJOR` only for a major product change, such as an official launch release explicitly authorized by the owner. Update `package.json`, `package-lock.json`, and tracked `VERSION` consistently. Only the product owner may change the release stage. Implementation work and version increments never change it automatically.

Use `Unreleased` only while changes have not yet been merged and included in the `main` image. When preparing a shipping PR, move the user-facing and technical notes into matching version sections in both English and pt-BR changelogs. Changelog headings use the SemVer base and stage (for example `v0.2.0-alpha`). The full runtime identity includes the exact seven-character SHA of the source commit (for example `v0.2.0-abcdef0-alpha`); CI materializes it in the artifact after the commit exists, so the changelog commit never has to contain its own SHA.

The current mainline product version is `0.4.0-alpha`, which includes the OPS-3 command catalog feature and the earlier `0.3.1-alpha` security patch. The first launch beta target remains `v1.0.0-HHHHHHH-beta`, conditional on FND-7 achieving QA ≥9/10. FND-8 is reserved for a later i18n story; after that story is defined and completed, the intended first beta MINOR is `v1.1.0-HHHHHHH-beta`. No stage promotion is implied by a SemVer increment or successful tests.

## Runtime identity and artifacts

The initial source identity was `v0.1.0-0000000-alpha`. The first materialized alpha image was `v0.1.0-3e0c935-alpha`, built from source commit `3e0c935dbf63dc3edef265394f6b9da5c78a33fd` and published as an AMD64/ARM64 manifest after all CI gates passed. It was a versioned alpha image, not a launch release, GitHub Release, Git tag, or stage promotion.

For each CI image, materialize the first seven hexadecimal characters of the exact source commit and verify the identity inside the image. Do not write the SHA back into the source checkout. A Git discovery error is a build error, never a reason to use the zero marker. The zero marker is for unmaterialized local source builds; a destination computer without Git keeps the identity embedded in the image.

GHCR image tags follow one platform convention: `main` and a full version such as `v0.2.0-abcdef0-alpha` identify multi-platform manifests; `main-linux-amd64`, `main-linux-arm64`, and their versioned equivalents identify single-platform images. Compose defaults to `IMAGE_TAG=main`. Image tags do not determine `product_version`; runtime identity remains embedded in the image.

GitHub Releases and tags remain exclusively managed by `@devops`. Publishing a versioned CI image does not create a GitHub Release or Git tag. Stage promotion requires explicit human approval. The product version, API contract version, and state revision have separate purposes.
