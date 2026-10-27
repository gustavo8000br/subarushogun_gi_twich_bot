# OPS-15 — Server-Sent Events (SSE) for the Next panel: research note

> Português: [`docs/pt-BR/stories/OPS-15/sse-research.md`](../../pt-BR/stories/OPS-15/sse-research.md)

- **Author:** @analyst (Atlas) — 2026-10-27
- **Trigger:** owner decision (2026-10-27) to update the Next panel in real time through SSE. `docs/research-index.md` had no note on this (GAP); `panel-defects-architecture-review.md` only names SSE as an alternative.
- **Scope:** research only. No code was changed. This note does not replace a test in the project environment.
- **Labels:** VERIFIED = confirmed in official docs or in the installed source; PARTIAL = partly confirmed or inferred from source/spec; UNVERIFIED = not confirmed.

## Installed baseline (read from the repository, 2026-10-27)

| Item | Value | Label |
|---|---|---|
| Fastify | `5.12.5` (root `package.json`) | VERIFIED |
| Next.js | `16.4.1` | VERIFIED |
| SSE plugin installed | none (`node_modules/@fastify` has no `sse`; no `fastify-sse-v2`) | VERIFIED |
| Dev proxy | `apps/frontend/scripts/dev-proxy-config.mjs`: `rewrites` send `/api/*`, `/overlay/api/*`, `/health`, `/callback` to Fastify | VERIFIED |
| Prod proxy | same `rewrites` (`beforeFiles`) to `FASTIFY_INTERNAL_ORIGIN` (default `https://localhost:3109`); panel served by a **custom server** `node:https` + `getRequestHandler()` (`start-production.mjs`) | VERIFIED |
| Dev HTTPS | `next dev --experimental-https` | VERIFIED |
| Protocol to the browser | `node:https` server = **HTTP/1.1** (no HTTP/2) in prod; dev `--experimental-https` is also HTTP/1.1 | VERIFIED (prod, by code) / PARTIAL (dev, not measured) |
| Session | `local-session.mjs`: `onRequest` checks `Host`, `Origin` (only if present), cookie session (in-memory `Map`) for `/api/*`, CSRF only for non-GET/HEAD | VERIFIED |
| `compress` in `next.config` | not set (default `true`) | VERIFIED |

## Q1. Fastify: plugin, headers, heartbeat, reconnection, cleanup

**Options.**

1. **`@fastify/sse`** (official Fastify org). npm `0.6.1`, `peerDependencies: { fastify: "^5.x" }`, last modified 2026-10-18 — compatible with 5.12.5 (VERIFIED via `npm view`). API: route option `sse: 'only' | 'dual' | 'manual'`, `reply.sse.send()` (object, string, async generator or Readable), `reply.sse.keepAlive()`, `reply.sse.onClose(cb)`, `reply.sse.close()`, `reply.sse.lastEventId`, `reply.sse.replay(cb)`, `reply.sse.isConnected`, plugin-level `heartbeatInterval` (default 30 000 ms), per-route `heartbeat: false` (VERIFIED, README). Caveats: version **0.x** (API may still change), small project (28 stars, 3 open issues at the time of reading), backpressure only described as "efficient" (PARTIAL). For `sse: 'only'` with `Accept: application/json` it returns 406.
2. **`fastify-sse-v2`** (community). `4.2.2`, `peerDependencies: fastify >=4`, last modified 2026-01-27 (VERIFIED via `npm view`). Mature, but not maintained by the Fastify org.
3. **Raw response** with `reply.hijack()` + `reply.raw.writeHead/write` (Fastify Reply docs: after `hijack()` Fastify no longer runs `onSend`/serialization and the handler owns the response). No dependency; everything (heartbeat, `drain`, cleanup) is manual. VERIFIED (docs) / design inference PARTIAL.

**Recommendation:** `@fastify/sse` pinned to an exact version (project already pins versions), with `heartbeatInterval` **15 000 ms** (see Q2, the 30 s proxy timeout). If @architect does not accept a 0.x dependency, the fallback is `reply.hijack()` with a small helper (≈60 lines) — both are viable; the plugin is not required.

**Lifecycle and headers.**
- `onRequest` hooks (the local session) run **before** the handler, so the stream inherits the `Host`/`Origin`/session check without extra code (VERIFIED in `local-session.mjs`; Fastify hook order VERIFIED in the docs).
- Headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform` (the `no-transform` matters, see Q2), `Connection: keep-alive` (HTTP/1.1 only), `X-Accel-Buffering: no` (only matters with nginx; harmless; the project has no nginx — PARTIAL relevance).
- Heartbeat: comment line `:\n\n` every ~15 s (WHATWG spec suggests ~15 s for proxies that drop idle connections — VERIFIED).
- `retry:` field sets the client reconnection time (VERIFIED, spec). Suggest `retry: 3000`.
- `Last-Event-ID`: the browser resends it on automatic reconnection (VERIFIED, spec). The server reads it from `reply.sse.lastEventId` or `request.headers['last-event-id']`.
- Cleanup: on `request.raw` / `reply.raw` `close`, remove the subscriber from the in-process emitter, clear the heartbeat timer. With `@fastify/sse`: `reply.sse.onClose()`. Also close all streams in `onClose` of the Fastify instance (graceful shutdown), otherwise `app.close()` waits on open connections (PARTIAL — Fastify 5 has `forceCloseConnections`, check the current value).
- Backpressure: if `write()` returns `false`, do not queue unbounded; because the design sends only small invalidations (Q4), the right policy is **coalesce** (keep only "dirty" flags per topic) and, if the buffer stays full, close the stream so the client reconnects and refetches. PARTIAL (design).

## Q2. Next proxy (dev and prod)

Read directly from the installed Next 16.4.1 source (VERIFIED):

- **Rewrites to an external URL are streamed, not buffered.** `server/lib/router-utils/proxy-request.js` uses `httpxy` and does `proxyRes.pipe(res)`; it destroys the upstream request when the browser closes (`res.on('close', () => proxyReq.destroy())`). So the upstream SSE stream reaches the browser chunk by chunk, and client disconnects propagate to Fastify (the `close` cleanup in Q1 will fire). A community report claims Next 15/16 rewrites buffer SSE in standalone mode ([cubic.dev PR review](https://cubic.dev/pr/lfnovo/open-notebook/pull/770)); the installed code does not show that for this path. Label: VERIFIED for the code path; the community claim is UNVERIFIED for this project.
- **Proxy timeout of 30 s.** `proxyRequest(..., config.experimental.proxyTimeout)` → `proxyTimeout || 30000` → `proxyReq.setTimeout(30000, destroy)`. That is a **socket idle** timeout: a stream with no bytes for 30 s is cut. Consequences: (a) heartbeat must be **< 30 s** (15 s); the `@fastify/sse` default of 30 s **races with it** and must be changed; (b) alternatively set `experimental.proxyTimeout` in `next.config` (experimental; prefer the heartbeat). VERIFIED (source).
- **gzip compression buffers SSE.** `router-server.js` installs the `compression` middleware unless `compress: false`, also for custom servers ([Next docs, `compress`](https://nextjs.org/docs/app/api-reference/config/next-config-js/compress), updated 2025-06-16: "when using `next start` or a custom server"). The middleware considers `text/*` compressible and wraps the response in gzip, which holds bytes in zlib until a flush that the proxy never calls → events arrive late or in bursts. The same middleware **skips compression when the response has `Cache-Control: no-transform`** (`shouldTransform`). So the precise fix is `Cache-Control: no-cache, no-transform` on the Fastify SSE response; `compress: false` globally is not needed (and Next does not recommend disabling it). VERIFIED (source + docs); real effect in the browser UNVERIFIED until the environment test.
- **Route handler in Next (`app/api/.../route.ts`) as a streaming proxy:** not needed, and it would add a second hop with its own buffering risks. Not recommended.
- **Bypass straight to Fastify (another port):** it would become a different origin, breaking the `Origin` check, `SameSite=Lax` cookie and CSRF assumptions. Not recommended.
- **Connection limit.** Over HTTP/1.1 browsers allow **6 connections per origin** (MDN `EventSource` note; WHATWG warns about this and suggests a shared worker). The panel is HTTP/1.1 in prod (`node:https`). One SSE per tab uses 1 of 6; with 3+ panel tabs plus the regular fetches the panel can stall. Mitigation: **one stream per tab** and, if the owner usually opens several tabs, share one stream via `BroadcastChannel` + leader election or a `SharedWorker` (later). HTTP/2 would remove this limit but needs `node:http2` in the custom server and is not justified now. VERIFIED (spec/MDN) / impact PARTIAL.

## Q3. Client: `EventSource` vs `fetch` streaming

- **`EventSource` (recommended).** Same-origin GET; cookies are sent (same origin, `withCredentials` not needed). It cannot set custom headers (VERIFIED, spec) — not a problem: the stream is a read-only GET and the session hook does not require CSRF for GET. It has automatic reconnection with `Last-Event-ID` and `retry`.
- **`fetch` + `ReadableStream`**: allows headers (e.g. `X-CSRF-Token`) and full control over backoff, but you must write the parser, the reconnection and the `Last-Event-ID` yourself. Only worth it if a header becomes mandatory. Not needed now.
- **CSRF/Origin:** the stream has no side effects, so no CSRF token. Cross-site reading is blocked: another site has no cookie (`SameSite=Lax` blocks it on cross-site subresource requests) and gets no CORS. The `Origin` check runs only when the header is present; for a same-origin GET the browser usually omits it (Fetch spec, `basic` tainting) — PARTIAL, confirm in a real browser.
- **Reconnection and backoff:** the spec reconnects automatically on network errors and allows extra backoff by the browser. But **any non-200 status or wrong Content-Type closes it for good** (`readyState = CLOSED`, no reconnection) — VERIFIED. The client must therefore have its own loop: on `error` with `readyState === CLOSED`, wait with exponential backoff + jitter (e.g. 1 s → 30 s), call `GET /api/session` again, then open a new `EventSource`.
- **Server restart (in-memory session lost):** the reconnection hits `401` → `EventSource` closes (non-200). The loop above recovers it: `/api/session` creates a new cookie and CSRF token, the client stores the new token, reopens the stream and does a **full refetch** (the old event IDs mean nothing to a new process). VERIFIED (code + spec) / flow PARTIAL.
- **Hidden tab (`visibilitychange`):** browsers do not close `EventSource` in background tabs. For a streamer the panel often sits in a background tab during the live — **do not** close the stream when hidden by default. On `visible`, do a cheap refetch of the active views to fix anything lost to throttling. PARTIAL (browser throttling behaviour varies, test needed).

## Q4. Channel design

- **One stream per tab:** `GET /api/events` (exact name for @architect).
- **Invalidation events, not full data.** Events: `queue.changed`, `calls.changed`, `operations.changed` (outbox), `rewards.sync.changed`, `health.changed`, plus `hello` (sends the server `instanceId`) and the heartbeat comment. `data` carries only `{ topic, version }` (no PII). The client refetches with the existing REST endpoints (which already apply auth, localization, and error handling).
  - Why: one source of truth (REST), small payloads, no second serializer to keep in sync with the API, and the privacy rules of Q5 are easy to verify.
- **Ordering and dedup:** `id: <instanceId>-<monotonic seq>`. The client keeps the last `version` per topic and ignores older ones; several events for the same topic within ~100–250 ms are coalesced into one refetch (debounce).
- **Resume:** on reconnection with `Last-Event-ID` from the same `instanceId`, the server may send only the topics changed since that seq (small ring buffer, e.g. last 256 events) — or, simpler and safe, **always** send a `resync` event telling the client to refetch everything. Recommendation: start with `resync` on every (re)connection; ring buffer only if the refetch is heavy. Different `instanceId` = server restarted = full refetch.
- **Fallback:** if the stream cannot be established for N attempts (e.g. 3) or 60 s, switch to **slow polling** (15–30 s) of the same endpoints and keep trying SSE in the background; show a discreet "real time unavailable" status (UX with @ux-design-expert).
- **Overlay:** keeps the 1 s polling for now (OBS/CEF, other session model); migrating it to SSE is a separate decision and needs a test in OBS.

## Q5. Security and privacy

- **Never in the stream:** tokens (Twitch, session, CSRF), cookies, headers, Twitch UID/user IDs, chat text, redemption text/user input, display names in free text, error messages/stacks, connection strings. Only topic, version/seq, `instanceId` and, at most, counters/states already shown in the panel. This matches the project rule for JSON logs.
- **Logs:** log connection open/close with session hash/`referenceId` and counts, never the event body.
- **Limits:** max streams per session (e.g. 4) and global (e.g. 32); the extra stream gets `429` (the client goes to the backoff loop). Close streams of a session that expires. Heartbeat detects dead sockets.
- **Unexpected errors** inside the stream: send a generic `event: error` with `referenceId` only, then close; never the message.
- **Automated tests:**
  - Vitest + real Fastify on an ephemeral port (`app.listen({ port: 0 })`) + `fetch` with `ReadableStream` parsing: headers (`text/event-stream`, `no-transform`), 401 without session, heartbeat (fake timers or short interval), event on domain change, cleanup on client abort (subscriber count returns to 0), limit per session, payload without forbidden fields (assert keys allow-list).
  - A test through the **Next proxy** (dev server) to prove that there is no gzip and no 30 s cut: an event at t+0 and t+40 s must arrive. This is integration, not unit.
  - Browser E2E only for: automatic reconnection, recovery after Fastify restart (401 → new session), multiple tabs, background tab.
  - Domain flows backed by PostgreSQL keep using an isolated PostgreSQL (project rule).

## Q6. Alternatives (note only)

- **WebSocket (`@fastify/websocket`):** bidirectional, but the panel only needs server → client; commands already go through REST with CSRF. It needs `Upgrade` through the Next proxy (httpxy supports `ws`, but in Next the upgrade path differs from `rewrites` in some setups — not verified), its own auth on the handshake and its own reconnection. More complexity, no gain.
- **Long polling:** works everywhere, but more requests and latency; useful only as the fallback.
- **Why SSE is enough:** local panel, one operator, low event rate, one direction, cookies and same origin already solved, native reconnection, plain HTTP through the existing proxy.

## Recommended design (summary)

1. Fastify: `@fastify/sse` (exact pin) or `reply.hijack()`; route `GET /api/events`, behind the existing `onRequest` session hook; headers `text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; heartbeat 15 s; `retry: 3000`; cleanup on close and on `app.close()`; per-session and global limits.
2. Domain: an in-process emitter publishes `{topic}` after each commit (queue, calls, outbox, reward sync, health); the SSE layer coalesces and sends `{topic, version}`.
3. Proxy: keep the `rewrites`; do not set `compress: false`; rely on `no-transform` + heartbeat < 30 s.
4. Client: one `EventSource` per tab; event → debounced targeted refetch; own backoff loop on `CLOSED` with `/api/session` renewal; full refetch on `hello` with a new `instanceId`; slow polling fallback.
5. Privacy: invalidation only, allow-list test.

## Risks

- `@fastify/sse` is 0.x and small — API change or bug risk (mitigation: exact pin, or `hijack`).
- Default 30 s heartbeat of the plugin vs the 30 s Next proxy timeout — streams cut every ~30 s if not changed.
- gzip if a future change removes `no-transform` or another layer compresses.
- 6-connection limit with several tabs.
- Refetch storm if events are not coalesced.
- `experimental.proxyTimeout` and Next internal proxy behaviour may change between Next versions.

## What only an environment test confirms

1. Events arrive one by one (no gzip, no buffering) through `next dev --experimental-https` **and** through `start-production.mjs` (`curl -N -H 'Accept-Encoding: gzip'` shows no `Content-Encoding` and incremental output).
2. A stream idle longer than 30 s with a 15 s heartbeat is not cut.
3. Browser disconnect closes the Fastify subscriber (count back to 0).
4. Whether the browser sends `Origin` on the same-origin `EventSource` and whether the `Host` check accepts the proxied request.
5. Fastify restart → 401 → recovery with a new session.
6. Behaviour in a background tab during a real live session, and with 3+ tabs.

## Sources (accessed 2026-10-27)

- WHATWG HTML Standard, Server-sent events: https://html.spec.whatwg.org/multipage/server-sent-events.html — VERIFIED
- `@fastify/sse` README: https://github.com/fastify/sse — VERIFIED (npm `0.6.1`, peer `fastify ^5.x`)
- `fastify-sse-v2` on npm: https://www.npmjs.com/package/fastify-sse-v2 — VERIFIED (`4.2.2`)
- Fastify Reply (`hijack`, `raw`): https://fastify.dev/docs/latest/Reference/Reply/ — VERIFIED
- Fastify Hooks: https://fastify.dev/docs/latest/Reference/Hooks/ — VERIFIED
- Next.js `compress`: https://nextjs.org/docs/app/api-reference/config/next-config-js/compress — VERIFIED (updated 2025-06-16)
- MDN `EventSource` (6-connection limit note): https://developer.mozilla.org/en-US/docs/Web/API/EventSource — VERIFIED
- Installed source: `node_modules/next/dist/server/lib/router-utils/proxy-request.js`, `node_modules/next/dist/server/lib/router-server.js`, `node_modules/next/dist/compiled/compression`, `node_modules/next/dist/compiled/httpxy` (Next 16.4.1) — VERIFIED
- Community: cubic.dev review on Next 16 rewrites buffering SSE: https://cubic.dev/pr/lfnovo/open-notebook/pull/770 — UNVERIFIED for this project
- Community: Medium, slow SSE in Next.js: https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996 — supplementary
