# Internal Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG_INTERNAL.md)

## Unreleased

- Added FND-1 version validation/materialization, bootstrap and Compose startup scripts, Prisma schema/migration, and real PostgreSQL integration coverage.
- Added the Postgres group as a supplemental group to the non-root migrate/bot services so they can read the `0440` shared secret.
- Extended `/health` with the running `product_version`, a real PostgreSQL connectivity result, and `twitch_api: not_configured` until the Twitch integration is implemented. Database failures return a sanitized 503.
- Docker runtime storage was moved to `/home/gustavo/.docker-data` and containerd storage to `/home/gustavo/.containerd-data` during host maintenance; no product installation or application data is included in this project change.
