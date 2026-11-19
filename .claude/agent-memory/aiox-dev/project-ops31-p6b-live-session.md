---
name: project-ops31-p6b-live-session
description: OPS-31 P6b (live session, M4) facts that are not obvious from the code: Twurple offline event has no stream id, API/test conventions used, what P7 must wire
metadata:
  type: project
---

P6b (FT-90, 2026-11-19, branch `feat/ops-31-p6b`) delivered `stream_sessions` (M4 `20261119090000_live_session`), the pure reducer
`domain/live-session.mjs`, `persistence/live-session-repository.mjs`, `twitch/live-session-service.mjs`, `twitch/current-stream.mjs`.

- Twurple 8.2.0 `EventSubStreamOfflineEvent` has NO stream id (only broadcaster fields) while the research note says `stream.offline`
  carries `id`. The runtime reads the raw payload id if present, else `null`; an offline without id asks the two-negative Helix
  reconciliation. Why: closing on a guess would end a live that is still running. How to apply: any code that keys on the offline id
  must tolerate `null`; P8 run C should record a real payload.
- P7 must hand `repository.createCapWindowProvider({ isRevoked: () => integration.liveEventsRevoked })` to the gate's `capWindowStart`
  (`provider` option); the gate never imports the live modules (LIVE-1 static test enforces it).
- `liveSession` in `GET /api/state` is absent (not null) when unavailable, so the exact top-level key test stays valid.
- Mutation runner pattern: `.local/p6b/mutations/mutate.py <json> [ids]` (sha-restored, ANCHOR NOT FOUND reported); PG barrier proof =
  hold the channel lock in a separate Prisma transaction and poll `pg_locks` waiters (`classid`, `objsubid = 2`).
