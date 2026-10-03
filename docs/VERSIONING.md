# Versioning

[Português brasileiro](pt-BR/VERSIONING.md)

The product follows SemVer. `package.json` stores only the base `MAJOR.MINOR.PATCH`; `.release-stage` is the sole stage source (`alpha`, `beta`, `rc`, or `stable`); `VERSION` stores the runtime identity `vMAJOR.MINOR.PATCH-HHHHHHH-STAGE`. Before a Git source commit exists, the foundation identity is `v0.1.0-0000000-alpha`.

Build materialization uses the first seven hexadecimal characters of the exact source commit, after verifying Git metadata and source consistency. A Git discovery error is a build error, never a reason to use the zero marker. Materialization writes only to the artifact copy. Normal validation, startup, documentation and code commits do not update version files. Stage promotion requires explicit human approval. Releases and tags are managed by `@devops`.

Every release updates both changelogs and passes the project quality gates. User-visible changes belong in `CHANGELOG.md`; implementation and operational changes belong in `CHANGELOG_INTERNAL.md`. Runtime identity is distinct from API contract version and state revision.
