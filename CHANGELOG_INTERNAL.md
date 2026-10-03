# Internal Changelog

[Português brasileiro](docs/pt-BR/CHANGELOG_INTERNAL.md)

## Unreleased

- Added a shared transition domain service that computes financial intent from locked PostgreSQL state/policy and commits status/order/audit atomically; verified through real migrations and concurrency tests. Chat/EventSub dispatch and financial outbox delivery remain in their assigned later stories.
- Replaced the unavailable paid CodeRabbit review dependency with pinned local OpenGrep `1.30.0` rules; documented scope and limitations in both READMEs and FND-1 records. Linux run: 18 JavaScript files, 0 findings; native Windows `.bat` execution remains unverified.
- Started FND-2 after PO GO (9/10); added a test-first entry-transition decision function that rejects invalid lifecycle pairs and distinguishes external terminal observations from local financial decisions. This is a partial increment; no persistence service or outbox behavior is claimed.
- Added a test-first UID validator for exact nine-digit ASCII input, optional visible manual UID, hidden-mode discard and safe errors that never echo invalid text. Persistence clearing/projection behavior remains pending.
- Added test-first pure queue-key validation, Portuguese command parsing and command authorization. A regression test caught and removed viewer enrollment from bare `!<queue>`; authorization also rejects attempts to use self-service leave against another identity.
- Added isolated real-Compose startup/restart acceptance, POSIX start-helper execution with a path containing spaces, and a static `apps/web` entrypoint served through `@fastify/static`. Linux quality gates pass; Windows `.bat` runtime remains unverified on this host.
- Expanded the FND-5/FND-6 sequence for shared application services and full streamer management through the local panel. Replaced GitHub issue bodies #1 and #6; intentionally posted no comments. UX reference research and `$aiox-ux-design-expert` activation are deferred to FND-6 planning.
- Added linked central operator README translations and dated official integration research for Twitch, Twurple, Prisma, PostgreSQL, and Docker Compose; recorded the documentation-contract TDD cycle.
- Added FND-1 version validation/materialization, bootstrap and Compose startup scripts, Prisma schema/migration, and real PostgreSQL integration coverage.
- Added the Postgres group as a supplemental group to the non-root migrate/bot services so they can read the `0440` shared secret.
- Extended `/health` with the running `product_version`, a real PostgreSQL connectivity result, and `twitch_api: not_configured` until the Twitch integration is implemented. Database failures return a sanitized 503.
- Docker runtime storage was moved to `/home/gustavo/.docker-data` and containerd storage to `/home/gustavo/.containerd-data` during host maintenance; no product installation or application data is included in this project change.
