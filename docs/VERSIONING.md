# Versioning

[Português brasileiro](pt-BR/VERSIONING.md)

The product follows SemVer. `package.json` stores only the base `MAJOR.MINOR.PATCH`; `.release-stage` is the sole stage source (`alpha`, `beta`, `rc`, or `stable`); `VERSION` stores the runtime identity `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`. Development remains on major `0` with the `alpha` stage until the human-approved launch release. The initial source identity is `v0.1.0-0000000-alpha`.

Starting with the next pull request, CI materializes the first seven hexadecimal characters of the exact checked-out source commit into the container image and verifies the value from inside that image. This produces identities such as `v0.1.0-a1b2c3d-alpha`; the SHA is never written back into the checkout. A Git discovery error is a build error, never a reason to use the zero marker. Normal validation, startup, documentation and code commits do not update version files. The zero marker remains for unmaterialized local source builds. Stage promotion requires explicit human approval. Releases and tags are managed by `@devops`.

GHCR image tags follow one platform convention: `main` and a complete version such as `v0.1.0-abcdef0-alpha` identify multi-platform manifests; `main-linux-amd64`, `main-linux-arm64`, and their versioned equivalents identify single-platform images. Compose defaults to `IMAGE_TAG=main`, allowing Docker to select the host architecture from the manifest. `IMAGE_TAG` can override the tag. Image tags do not determine `product_version`; runtime identity remains embedded in the image.

The launch release follows the complete planned SemVer/release workflow, including its approved product version and stage; development CI builds do not create a release or tag.

Every release updates both changelogs and passes the project quality gates. User-visible changes belong in `CHANGELOG.md`; implementation and operational changes belong in `CHANGELOG_INTERNAL.md`. Runtime identity is distinct from API contract version and state revision.
