# Coding Standards

[Português brasileiro](../pt-BR/framework/coding-standards.md)

- Use JavaScript ESM with JSDoc and descriptive English identifiers for code, tables, columns, audit events and technical logs.
- Keep user-facing product copy and Twitch chat responses in Brazilian Portuguese.
- Keep modules in `apps/web`, `apps/api`, `apps/infra`; root files are limited to Compose/Docker/npm entrypoints and project docs/config.
- Keep domain transition rules in domain services. HTTP handlers, chat handlers, timers, EventSub and workers must not write status directly.
- Validate every external/user input at its boundary. Treat chat/redemption text as untrusted; persist only allowlisted fields. Render user values with `textContent`.
- Never log tokens, secrets, authorization codes, DB passwords/URLs, raw messages, or rejected payloads.
- Keep PostgreSQL transactions short and never across Twitch network calls. Use DB constraints for uniqueness/concurrency, not in-memory locks alone.
- Every behavior change is test-first Red → Green → Refactor; record genuine commands/results in both stories files. Integration guarantees use isolated real PostgreSQL and real migrations.
- Keep docs in English with meaning-equivalent files in `docs/pt-BR/`, reciprocal links, and unchanged identifiers/paths/commands.
- Do not add unrequested product capabilities or alter the product version/stage in routine edits.
