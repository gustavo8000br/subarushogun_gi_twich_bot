# API and local security
[Português brasileiro](../pt-BR/fullstack-architecture/api-and-local-security.md)


Panel routes are local-session protected. Validate Host and Origin exactly, reject DNS rebinding before admin routes, use HttpOnly/SameSite session cookies and session CSRF tokens, and validate schemas/idempotency/revisions on writes. OAuth callback is a narrowly validated GET exception for Origin; Host/session/state remain required. Return projections rather than Prisma entities. Sanitize Fastify/SDK/Prisma errors and logs; never return or log secrets, tokens, OAuth codes, DB passwords, connection strings, or raw chat/redemption payloads.
