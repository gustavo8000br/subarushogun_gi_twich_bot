# Runtime and boundaries
[Português brasileiro](../pt-BR/front-end-architecture/runtime-and-boundaries.md)


`apps/web/public` contains static HTML, CSS and vanilla JavaScript served by `@fastify/static` from the local Fastify process. No frontend framework, TypeScript, transpiler, bundler, or public hosting is introduced. The browser never imports Prisma or communicates with Twitch directly.
