# Project Brief: Local Twitch Queue Bot for Genshin Impact

[Português brasileiro](pt-BR/project-brief.md)

## Product vision

Give one Twitch streamer a dependable local tool to run several configurable Genshin Impact queues during a live. Viewers enter only through channel-points redemptions; the streamer and authorized moderators can also add a person manually. The tool tracks order, calls, service, and the confirmed outcome of points operations while recovering pending work after restarts.

## Problem and users

The primary operator is the streamer who wants to manage several activities without juggling chat lists or losing state when a process or computer stops. Moderators help with queue operations. Viewers redeem a queue reward, wait, and coordinate game details with the streamer privately outside this application.

## Product boundaries

- One local installation serves one Twitch broadcaster and the broadcaster's own Twitch application.
- PostgreSQL runs locally through Docker Compose; no hosted backend, remote database, telemetry, public domain, or synchronization service is used.
- Twitch is the only runtime external service. No Discord, DM, game login, UID verification, OBS overlay, rankings, public signup, or viewer join command is included.
- The app never asks for, stores, or repeats game credentials. A visible UID is only a nine ASCII digit public game identifier under the specified product format rule.
- Chat and redemption text are untrusted. Invalid payloads are discarded and not echoed or retained raw.

## Success measures

- Point changes are durable, attributable, and reported as pending until Twitch confirms them.
- Restart/reconnection recovery preserves queue order, history, and pending operations.
- Operators can see and resolve connectivity, reconciliation, financial, and reward-management issues locally.
- First run requires Docker Compose v2 and a browser, without host Node.js/PostgreSQL or manual `.env`/YAML edits.
- Product code is JavaScript ESM and is organized under `apps/web`, `apps/api`, `apps/infra`, and other `apps/*` modules only as needed. The repository's `.env.example` is AIOX framework scaffolding, not product configuration.

## Quality and governance

Every behavior increment follows test-first Red → Green → Refactor, with actual evidence recorded in both stories documents. Database guarantees require isolated PostgreSQL and real migrations. English is canonical project documentation with equivalent pt-BR copies. Release stage promotion requires human approval; @devops owns releases and tags.

## Delivery outline

1. Local runtime identity, Compose bootstrap, PostgreSQL schema/migrations, and bilingual operator documentation.
2. Queue domain, UID policy, parser, authorization, and ordered concurrent persistence.
3. Durable outbox and confirmed/recoverable point operations.
4. Twitch OAuth, owned rewards, EventSub, adapters, and reconciliation.
5. Commands, notifications, timeout, cleanup, and current-account ownership.
6. Local panel/API security and system acceptance.

## Source and traceability

Derived from the complete user prompt dated 2026-10-02 and clarification that product code belongs under `apps/*`: see [the product specification](stories/FND-0/spec/spec.md), [requirements](stories/FND-0/spec/requirements.json), and [research](stories/FND-0/spec/research.json).
