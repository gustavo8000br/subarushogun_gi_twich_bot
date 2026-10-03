# Version identity
[Português brasileiro](../pt-BR/fullstack-architecture/version-identity.md)


`package.json` contains base SemVer, `.release-stage` the stage, and `VERSION` the full runtime identity. `apps/infra` validates/materializes an exact seven-hex-character source commit prefix for build artifacts; ordinary startup/checks do not mutate version files. API state presents product identity separately from API contract version and state revision.
