# HTTP surface
[Português brasileiro](../pt-BR/architecture/http-surface.md)


All mutating operations use POST/PATCH/DELETE, schema validation, local session, CSRF, operation idempotency key and applicable state revision. GET `/api/state` is session protected and returns explicit projected data with `product_version`, `api_contract_version`, state revision, timestamp, account, connectivity, queues and privacy-filtered entries. OAuth callback is a single validated GET exception. Static assets never receive Prisma client or secrets.
