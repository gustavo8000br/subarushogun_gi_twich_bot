# Language conventions, performance and TypeScript migration (research note, Batch A)

[Português brasileiro](../../pt-BR/research/2026-11-10-language-conventions-app/README.md)

- Author: `@analyst` (Atlas). Date: 2026-11-10. Desk research (official documentation first) plus read-only measurements in the repository. No code, tests, config or git state were changed. Only this note and its pt-BR copy were written.
- Reuse (golden rule): `docs/research-index.md` row 23 (`docs/stories/OPS-15/typescript-migration-research.md`, 2026-10-27) is **SUFFICIENT** for Node type stripping, coexistence, Vitest/Twurple contract tests and the first Biome analysis. It is cited here, not repeated. This note re-checked only the **fired refresh triggers** (TypeScript 7.0 shipped, typescript-eslint status, Biome 2.5/2.6, Next 16.4) and the **gaps** (Fastify shutdown, Prisma pool and slow queries, Node profiling, Next bundles and caching, CSS, runtime validation).
- Evidence labels: **DOC** = proven by official documentation or by the installed source; **MEASURE** = depends on a measurement in this project; **COMMUNITY** = community opinion or secondary source; **UNVERIFIED** = inference. Each recommendation carries one of these plus a source and date.
- Project versions read on 2026-11-10: Node 24.20.0 (pinned; the Node docs now show 24.22.2, **do not change the pin**), TypeScript 7.0.2, Next 16.4.1, React 19.3.1, Fastify 5.12.5, Prisma and `@prisma/client` 6.19.3 with the `@prisma/adapter-pg` driver adapter, Vitest 5.0.3, ESLint 10.12.0, Twurple 8.2.0.

## 0. Executive summary

1. **TypeScript migration is viable and low-risk to the runtime, and it is worth doing in the order API edges first** (`twitch`, `outbox`, `http`), then `persistence`, then the rest. Node 24.20.0 runs `.ts` natively (type stripping is Stable since v24.12.0, DOC), so the Docker image keeps "run source", with no build step.
2. **The type-safety gain comes from `strict`, not from the file extension.** Measured today: the whole tree has **0 errors** with the current `strict:false`, **276 errors** with `--strict --noImplicitAny false`, and **1,349 errors** with `--strict` (MEASURE, TS 7.0.2, 3.1 to 3.9 s per full run). About 75 % of the strict errors are implicit `any` on parameters, which the conversion to annotations fixes anyway. So the cost of "strict JSDoc" and "strict `.ts`" is similar; `.ts` adds rename churn and removes JSDoc verbosity.
3. **Do not expect runtime speed from TypeScript.** Types are erased. Performance work must come from measurement (Event Loop, memory, slow queries, bundle), not from the language (sections 5 to 7).
4. **Biome + `tsc --noEmit` stays the recommended lint and type gate** for now. typescript-eslint still cannot use TypeScript 7 (the API arrives with 7.1; support is in internal review, 2026-09-29). Biome's promise rules (`noFloatingPromises`, `noMisusedPromises`) are still **nursery** (DOC, read 2026-11-10).
5. **Most valuable non-TypeScript finding:** the API shutdown path (`apps/api/src/server.mjs`) has no timeout, no `try/catch` and no hard-exit fallback, and closes the HTTP server only after the workers stop. This is a plausible contributor to the "API hangs under `node --watch`" problem. It is a **hypothesis to measure**, not a confirmed root cause (section 4).
6. **Prisma runs two pools** (the `PrismaPg` adapter and a separate `pg.Pool`, both with `pg` defaults). Worth a conscious decision by `@data-engineer` (section 5).
7. **Estimated cost:** about 12 to 15 `@dev` + `@qa` cycles (one cycle = one slice/PR) for the API, in line with the 5 to 7.5 person-weeks of note #23 (UNVERIFIED; re-estimate after the canary slice).

## 1. TypeScript on Node 24 (re-checked)

| Item | Finding | Label / source |
|---|---|---|
| Stability | Type stripping is **Stability 2 - Stable since v24.12.0**; warning removed in 24.3.0; default-on since 23.6.0. The page now shows v24.22.2. | DOC, [Node 24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html), 2026-11-10 |
| Not supported without `--experimental-transform-types` | `enum`, runtime `namespace`, parameter properties, `import x = ...`. Decorators fail to parse. `.tsx` is unsupported. Type-only namespaces work. | DOC, same page |
| `tsconfig.json` | Node **ignores it**; `paths` produce an error (use subpath imports starting with `#`). | DOC, same page |
| Imports | Extension is mandatory (`./x.ts`); type-only imports need `import type` (or `verbatimModuleSyntax`). Node refuses `.ts` inside `node_modules`. Stack-trace lines are preserved (types become whitespace). | DOC, same page |
| Recommended flags | `noEmit`, `target: esnext`, `module: nodenext`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. | DOC, same page |
| TypeScript 7.0 (2026-07-08) | Native compiler, 8 to 12x faster full builds; **no programmatic API until 7.1**; `@typescript/typescript6` gives `tsc6` for tools; `strict` now defaults to `true`, `types` defaults to `[]`, `rootDir` defaults to `./`; `--checkers`, `--builders`, `--singleThreaded` are experimental. | DOC, [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), 2026-11-10 |
| 7.0 JSDoc breaking changes | `@enum` unrecognized, `@class` no longer makes constructors, standalone `?` invalid, postfix `!` unsupported, etc. **This repo has 0 uses** of `@enum`, `@class`, `@constructor` or `@this` (grep, 368 JSDoc tags total), so it is not affected. | DOC + MEASURE (repo grep) |
| Current `tsconfig.json` | Sets `strict:false` explicitly, so the new 7.0 default does not change behavior. Keep explicit values; do not rely on defaults after upgrades. | MEASURE (repo) |
| `tsc` as gate, build cost | `tsc -p tsconfig.json --noEmit` over 15.8 k lines of `apps/` took **3.9 s** (0 errors); the same run with `--strict --noImplicitAny false` took 3.1 s. CI cost is negligible; the heavy CI parts remain Docker PostgreSQL and `next build`. | MEASURE (2026-11-10, TS 7.0.2) |
| Coexistence `.mjs` <-> `.ts`, Vitest `.ts` | Already analyzed: keep `allowJs` + `checkJs`, add `.ts` to `include`, `allowImportingTsExtensions`, importers change `./x.mjs` to `./x.ts` in the same slice; Vitest `include` must add `.ts`. | Note #23 (SUFFICIENT) |
| Vitest transform | Vitest advertises built-in TypeScript/JSX support, but the page read does **not** state which transformer is used or that types are not checked; type errors in tests are caught only by `tsc` if tests are in a tsconfig. | DOC (partial), [Vitest features](https://vitest.dev/guide/features.html), 2026-11-10; MEASURE the transform time |

Convention recommendation: keep `erasableSyntaxOnly` + `verbatimModuleSyntax` from the first `.ts` file (DOC). Forbid `enum` and runtime `namespace`; use `as const` objects plus a union type (COMMUNITY, widely used pattern).

## 2. Modern JS/TS conventions

| Convention | Recommendation | Label |
|---|---|---|
| ESM, extensions in relative imports | Already the repo style (`.mjs`). Keep explicit extensions; they are mandatory for `.ts` anyway. | DOC (Node page) |
| `strict` progressively | Ladder on a second tsconfig per folder: (1) `strictNullChecks` and friends (`--strict --noImplicitAny false`: 276 errors repo-wide), (2) `noImplicitAny` per converted folder (1,073 more errors, mostly parameter annotations). Flip root `strict: true` only when every API file is converted. | MEASURE (counts) + Note #23 |
| Promises | No floating promises in workers and shutdown code. Biome `noFloatingPromises` (since v2.0.0) and `noMisusedPromises` exist but are **nursery**, severity "information", with unsafe fixes, and enable the project scanner and type inference. Use them as `warn` on `apps/api` only, after checking false positives. | DOC, [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/), 2026-11-10; MEASURE (false-positive rate) |
| Error handling | Keep the project rule (safe generic text + `referenceId`, no stack to clients). In TS, enable `useUnknownInCatchVariables` (part of `strict`) and narrow errors with a helper; never `catch (e: any)`. | DOC (tsconfig reference, part of `strict`) / opinion on the helper |
| JSON and DTO types | Prisma and `JSON.parse` types are compile-time only. Anything from the network, from a JSON column or from env must be validated at the boundary. Fastify already validates request bodies with JSON Schema (Ajv); derive TS types from the same schema (section 4). | DOC (Fastify) |
| `satisfies` | Use for config and lookup tables so the literal type is kept while the shape is checked (TS 4.9 feature). | COMMUNITY/DOC (TS handbook, not re-read here); low risk |
| Runtime schemas | Preferred for this project: **plain JSON Schema + `json-schema-to-ts`** (no new runtime library, Fastify-native). Alternatives with official Fastify providers: TypeBox and Zod. Choose one per module and do not mix in the same plugin scope. | DOC, [Fastify type providers](https://fastify.dev/docs/latest/Reference/Type-Providers/), 2026-11-10 |
| `const`/`as const` for schemas in variables | Required with json-schema-to-ts, otherwise `type: 'object'` widens to `string` and inference breaks; no runtime effect. | DOC (same page) |
| Unused code | Keep `no-unused-vars` with `_` ignore (ESLint today, `noUnusedVariables` in Biome). | Note #23 |

## 3. React and Next 16 App Router

Repo facts (MEASURE, 2026-11-10): 33 `.jsx` files (3,289 lines) in `apps/frontend`, 18 of them start with `'use client'`; `next.config.mjs` delegates to `scripts/next-runtime-config.mjs`, which only configures `rewrites` (no `typedRoutes`, no `cacheComponents`); there is no `next/dynamic` or `React.lazy` use.

| Topic | Finding | Label / source |
|---|---|---|
| Server vs Client | Layouts and pages are Server Components by default. Use Client Components only for state, handlers, effects and browser APIs. **A `'use client'` file pulls all its imports and directly rendered components into the client bundle**; push the directive down to the interactive leaf. Props crossing the boundary must be serializable; server children can be passed through `children`. Providers should wrap as deep as possible. `server-only` is optional but gives a build-time error. | DOC, [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) (updated 2026-10-05), read 2026-11-10 |
| Hydration | HTML first, RSC payload reconciles trees, JS hydrates Client Components; later navigations render Client Components only on the client. For an operator panel that is mostly interactive and live, big RSC wins are not obvious: **measure** the hydrated JS per route before refactoring. | DOC + MEASURE |
| Bundle measurement | `next analyze` (Turbopack bundle analyzer, **since v16.1**) filters by route and client/server, traces import chains; `--output` writes `.next/diagnostics/analyze` so before/after can be diffed; `next analyze export` streams JSON Lines (**v16.4+**, available in 16.4.1). `@next/bundle-analyzer` is the **Webpack** path. Use `next analyze --output` as the zero-new-dependency route. | DOC, [Package bundling](https://nextjs.org/docs/app/guides/package-bundling) (updated 2026-10-15) |
| Lazy loading | Move heavy, non-interactive work (syntax highlight, charts, markdown) to Server Components; `optimizePackageImports` for packages with many exports. Apply **only** after the analyzer shows a large module. | DOC (same page); MEASURE |
| Typed routes | `typedRoutes: true` needs a TypeScript project and generates `.next/types`; non-literal hrefs need `as Route`. Route-aware helpers `PageProps`, `LayoutProps`, `RouteContext` are generated by `next dev/build/typegen`. These benefits arrive only when the frontend moves to `.tsx`. | DOC, [Next TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript) (updated 2026-08-25) |
| TypeScript 7 in Next | Next uses the project-local `tsc` CLI during `next build` by default (so TS 7 works), prints native diagnostics, checks the full tsconfig (tests included if included there). `experimental.useTypeScriptCli` is experimental. `next.config.ts` exists but the `.mjs` config can stay. | DOC (same page) |
| Cache and revalidation | Cache Components (`cacheComponents: true`, `'use cache'`, `cacheLife`, `cacheTag`, Partial Prerendering) is **opt-in** for existing apps; docs say both it and Partial Prefetching will be on everywhere in the next major. For a local, authenticated operator panel with live data, the expected gain is small. **Do not enable now**; revisit when Next 17 is announced. | DOC, [Caching](https://nextjs.org/docs/app/getting-started/caching) (updated 2026-10-06); opinion on applicability |

## 4. Fastify 5

Installed code was checked: `handlerTimeout`, `preClose`, `forceCloseConnections` and `return503OnClosing` exist in Fastify 5.12.5 (DOC, `node_modules`).

| Topic | Finding | Label / source |
|---|---|---|
| Close sequence | `close()` flags closing, runs `preClose` hooks (requests still active), drains connections per `forceCloseConnections`, stops listening, runs `onClose`, then resolves. | DOC, [Server reference](https://fastify.dev/docs/latest/Reference/Server/), 2026-11-10 |
| Connection options | `forceCloseConnections` default `"idle"` (idle keep-alive destroyed, **in-flight requests continue**); `true` destroys persistent connections; `return503OnClosing` default `true`; `keepAliveTimeout` 72 s; `connectionTimeout` 0; `requestTimeout` 0 (docs recommend a non-zero value, e.g. 120 s, without a reverse proxy); `handlerTimeout` 0 (503 + aborted `request.signal` on expiry, cooperative). Upgraded connections are not tracked and can block `close()`; close them in `preClose`. | DOC (same page) |
| Typed routes | Official type providers: `@fastify/type-provider-json-schema-to-ts`, `-typebox`, `-zod`; apply `withTypeProvider` again in each encapsulated plugin; for schemas in variables use `as const`. | DOC, Type Providers page |
| Plugins and encapsulation | Keep route modules as plugins taking a typed `FastifyInstance`; do not mutate global state from plugins. | Note #13 / #21 (SUFFICIENT) |
| Backpressure | Not documented as an automatic feature for custom streaming. Bound queues and writes in application code (worker concurrency, SSE per-client buffers). The SSE design is already in note #21. | UNVERIFIED (docs silent) |

**Repo reading (`apps/api/src/server.mjs`, `runtime.mjs`, MEASURE by code reading):**

- `Fastify({ logger: false, bodyLimit: 32 * 1024, https })` uses all timeouts at their defaults (`requestTimeout`, `handlerTimeout`, `connectionTimeout` = 0).
- `SIGTERM`/`SIGINT` call `shutdown()` with `void`; `shutdown()` has **no `try/catch`, no timeout and does not set an exit path**. `runtime.stop()` runs: worker loops, timeout loop, Twitch integration, `app.close()`, `prisma.$disconnect()`, `pool.end()` in sequence. A step that never resolves keeps the process alive forever; a throw becomes an unhandled rejection.
- The HTTP server **keeps accepting requests while the workers and the Twitch integration stop** (it is closed fourth).
- `node --watch` (`apps/frontend/scripts/dev-runtime-config.mjs`) restarts by killing the process; `--watch-kill-signal` exists since v24.4.0 (Active development) and the doc excerpt read does **not** state the default signal. So the hang is **plausibly** one of: a step in `runtime.stop()` that waits for an in-flight tick, an open handle (Twurple WebSocket, pool client), or an active (not idle) connection. **Not confirmed.**
- **Measurement recipe (read-only for production code):** send SIGTERM to a running dev API, timestamp each `stop()` step, and print `process.getActiveResourcesInfo()` after 5 s. Treat the result as the root cause evidence.
- **Recommended convention (opinion, standard practice, MEASURE the effect):** wrap `shutdown()` in `try/catch`, give every step a timeout, add a `preClose` hook that ends long-lived streams (needed before SSE lands), consider closing the HTTP server **first** (it already answers 503 on closing) and add an `unref`'d hard-exit timer so a stuck step cannot hold the process.
- Set an explicit `requestTimeout` and a conservative `handlerTimeout` only after measuring the slowest legitimate route (UNVERIFIED which values are safe).

## 5. Prisma and PostgreSQL

Database changes stay with `@data-engineer`; this section lists measurement items, not schema decisions.

| Topic | Finding | Label / source |
|---|---|---|
| Types | `prisma-client-js` already generates `index.d.ts`; no generator change needed (Note #23). Prisma 7 deprecates `prisma-client-js` and makes driver adapters the default; **stay on 6.19.3** until a deliberate upgrade story. | Note #23; DOC (v7 pages) |
| Pools | Docs (v6 engine) default `connection_limit` = physical CPUs x 2 + 1, `pool_timeout` 10 s, `connect_timeout` 5 s. With a driver adapter the pool belongs to the driver; the page states `pg` defaults to `max` 10 for v7. **This project builds `new PrismaClient({ adapter: new PrismaPg(...) })` and also `new pg.Pool(...)`**, so there are two independent pools (up to 2 x 10 connections by `pg` defaults, UNVERIFIED for adapter 6.19.3). Make the sizes explicit and document the total against Postgres `max_connections`. | DOC, [Connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool), 2026-11-10; MEASURE |
| Slow queries | Enable query events with `log: [{ emit: 'event', level: 'query' }]` and `prisma.$on('query', e => ...)` (fields `query`, `params`, `duration` ms). In the disposable PostgreSQL use `pg_stat_statements` (needs `shared_preload_libraries`, `CREATE EXTENSION`, `compute_query_id`; default `track = top`; shared memory proportional to `max`, default 5000 entries). Prisma's own Query Insights is for Prisma Postgres, so it does not apply here. | DOC, [Prisma logging](https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging), [PostgreSQL pg_stat_statements 18](https://www.postgresql.org/docs/current/pgstatstatements.html), 2026-11-10 |
| `EXPLAIN` | Run `EXPLAIN (ANALYZE, BUFFERS)` on the statements ranked by `total_exec_time`, on a disposable DB with realistic row counts. | COMMUNITY/standard practice (PostgreSQL EXPLAIN docs not re-read) |
| N+1 | Prisma defines it as one extra query per result in a loop; remedies: `include`, an `in` filter, `relationLoadStrategy: "join"` (only for simple equality filters), batching `findUnique`. `findMany` is not batched. Hint from the repo: `queue-repository.mjs` has 22 `await` calls inside `for` loops (grep, may be intentional sequential work inside transactions). **Candidates only; confirm with query logs.** | DOC, [Query optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance); MEASURE |
| Transactions | Keep money/queue state changes in a single transaction and verify with real PostgreSQL integration tests (project rule). | Project rule |

## 6. Node performance (measure first)

| Tool | What it gives | Label / source |
|---|---|---|
| `performance.eventLoopUtilization()` (alias in `perf_hooks` since v24.12.0) | `idle`, `active`, `utilization` (ELU) cumulative or as delta between two samples; it measures time outside the event provider, **not CPU**. | DOC, [perf_hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html), 2026-11-10 |
| `perf_hooks.monitorEventLoopDelay({ resolution })` | Event Loop delay histogram; `samplePerIteration` option added in v24.19.0. The histogram fields and units were in the unread part of the page; read them before use. | DOC (partial) |
| `--cpu-prof`, `--heap-prof` | Stable since v22.4.0 / v20.16.0; write `.cpuprofile` / `.heapprofile`; `--cpu-prof-dir`, `--cpu-prof-interval` (default 1000 us), `--heap-prof-interval` (default 512 KiB). Open the files in Chrome DevTools or Firefox Profiler; **nothing to install**. | DOC, [Node CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html), 2026-11-10 |
| `process.memoryUsage()` / `resourceUsage()` | RSS and heap snapshot numbers for a periodic log line. | DOC (known API, not re-read) |
| `autocannon`, `clinic` | Load generation and flame graphs. They need an npm install. **Do not install globally**: run with an npm cache and prefix **inside the project** (for example `npm exec --cache .local/npm-cache --prefix .local/tools ...`) or add a pinned devDependency only with owner approval. Maintenance status of `clinic` was not verified. | COMMUNITY / UNVERIFIED |

Convention: first collect a baseline (idle and under a scripted load) for ELU, delay p99, RSS and heap over 10 minutes with the Twitch workers running; only an indicator crossing a pre-agreed threshold opens an optimization story. This keeps the research-index #22 triggers measurable. Streams and bounded queues apply when a path moves large or unbounded data; the outbox loops are the candidates (MEASURE).

## 7. CSS

Repo facts (MEASURE): 588 lines (`panel.css` 540, `overlay.css` 48); 136 distinct hex colors against only 9 declared custom properties and 111 `var()` uses; `prefers-reduced-motion` is handled in both files (overlay disables the transition; panel gates the entrance animation behind `no-preference`); `backdrop-filter` blur appears on the sticky top bar and the dialog backdrops (panel only, not in the overlay).

| Topic | Recommendation | Label / source |
|---|---|---|
| Custom properties | Centralize color, spacing and radius tokens in `:root` and make components consume `var(--token)`. The 136 vs 9 ratio shows drift. Low risk, no runtime cost. | MEASURE (repo) + COMMUNITY |
| Reduced motion | `reduce` means remove, reduce **or replace** motion (replace scaling with an opacity fade, for example); Baseline widely available since January 2020. The current pattern (`no-preference` gate) is correct. | DOC, [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion), 2026-11-10 |
| Contrast | WCAG 2.2 SC 1.4.3 (AA): 4.5:1 for normal text, 3:1 for large text (18 pt or 14 pt bold, about 24 px or 18.5 px); ratios are not rounded. SC 1.4.11 asks 3:1 for non-text UI; its exact threshold was not stated on the page read. Verify every `--text`/`--muted` pair with a calculator; the UX reviews own the score. | DOC, [WCAG 2.2 Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), 2026-11-10 |
| Render performance | Animating `transform` avoids reflow and repaint and can run off the main thread (MDN); `opacity` is not covered by that page. The overlay uses a 120 ms opacity transition and no blur, which is the cheap path. Keep blur and large shadows out of the overlay; they stay in the panel. | DOC (partial), [MDN animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance); MEASURE in OBS |
| OBS/CEF support | The bundled CEF version was **not found**: OBS 28 shipped Chromium 103; a later thread tested Chromium 126 without promising a release; builds differ by distro. Do not use newer CSS (nesting, `:has`, `@layer`, `color-mix`) in `overlay.css` until the version is read from the real OBS and the feature is confirmed there. Existing note #3 trigger applies. | COMMUNITY / UNVERIFIED, [OBS CEF thread](https://github.com/obsproject/obs-studio/discussions/3853) |
| `!important` | `background: transparent !important` in the overlay is deliberate for OBS transparency; keep it documented. | MEASURE (repo) |

## 8. Biome 2 versus ESLint + typescript-eslint

| Point | Finding | Label / source |
|---|---|---|
| Versions | Biome v2.6 (2026-10-15: Markdown, YAML, SCSS, JS plugins in developer preview, `biome inspect`); v2.5 (2026-06-05: over 500 lint rules, 73 nursery rules promoted, `lint`/`check` about 13 % faster, watch mode for type-aware rules). | DOC, [Biome blog](https://biomejs.dev/blog/), [v2.5](https://biomejs.dev/blog/biome-v2-5/), 2026-11-10 |
| Promise rules | `noFloatingPromises` / `noMisusedPromises` are **nursery** (the fetched page says behavior can change; severity information; unsafe fix). The v2.5 post does not list them among promoted rules. | DOC, 2026-11-10 |
| typescript-eslint | Issue #10940 (TS 7 support) is open: TypeScript 7.1 API support "looking more and more stable", PR #12803 in internal review, first version expected roughly on par with TS 6 in speed (status 2026-09-29). No released version uses TS 7. Side-by-side workaround: `@typescript/typescript6`. | DOC, [issue 10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) |
| Gap | Biome has no listed equivalents for `await-thenable`, `no-unnecessary-condition`, `switch-exhaustiveness-check`, `restrict-template-expressions` or the `no-unsafe-*` family (rule-sources page, per note #23). `tsc --strict` plus a `never` check in `switch` covers exhaustiveness as a convention. | Note #23 |
| Project stage | ESLint 10.12.0 works today on `.js/.mjs/.jsx`; it needs a TS parser and a TS 6 side copy for `.ts`. Biome handles `.ts` without the TypeScript API. | Note #23 |
| Recommendation | Keep the Note #23 recommendation: **Biome + `tsc` strict per module**, no typescript-eslint now. **Refresh trigger:** typescript-eslint ships TS 7.1 support, or Biome promotes the promise rules out of nursery. Format in one isolated commit listed in `.git-blame-ignore-revs`. | DOC + Note #23 |

## 9. Feasibility of migrating to TypeScript

**Measured baseline (2026-11-10, TS 7.0.2, `tsc -p tsconfig.json --noEmit`, flags only on the command line):**

| Run | Errors | Time |
|---|---|---|
| Current config (`strict:false`) | 0 | 3.9 s |
| `--strict --noImplicitAny false` | 276 (TS2339 93, TS2322 57, TS2345 38, TS18047 27, TS18046 20) | 3.1 s |
| `--strict` | 1,349 (TS7006 650, TS7031 263, TS2339 133, TS7005 65, TS7053 62) | n/a |

Strict errors by API folder: `persistence` 416 (`queue-repository.mjs` alone 371), `twitch` 185, `http` 125 (`queue-routes.mjs` 92), `outbox` 97, `commands` 88, `domain` 56, `server` 27, `observability` 23. Outside the API: `apps/shared` about 100 and `apps/frontend` about 56.

**Estimated cost (UNVERIFIED; one cycle = one @dev + @qa round for one slice/PR; the 5 to 7.5 person-weeks of note #23 is consistent):**

| Slice | Scope | Cycles | Why this order |
|---|---|---|---|
| TS-0 | tsconfig ladder + `.ts` include, OpenGrep `typescript`, Vitest include, CI `prisma generate` before `tsc`, Biome decision, one canary file through Docker and CI | 2 | Proves the toolchain before volume |
| TS-1 | `twitch/*` (13 files, 1,520 lines) strict, contract tests over real Twurple classes | 2 | Bug class lives at the adapter edge (index #20) |
| TS-2 | `outbox/*` (7 files, 870 lines) | 1 | Floating-promise and retry risks |
| TS-3 | `http/*` (5 files, 1,120 lines) plus json-schema-to-ts on the top 5 routes | 2 | Request/response contract |
| TS-4 | `persistence/*` (3,056 lines): split `queue-repository.mjs` (2,837 lines) first, then convert | 3 to 4 | Largest and riskiest; 371 strict errors |
| TS-5 | `domain`, `commands`, `observability` (15 files, 1,317 lines) | 1 to 2 | Mostly pure logic |
| TS-6 | `server.mjs`, `runtime*.mjs`, global `strict: true`, drop `checkJs` for `apps/api` | 1 | Closes the migration |
| **Total** | | **12 to 15** | |

**Expected gains (to measure, not promised):** (a) share of real defects in a triaged sample of 50 strict errors from `twitch/*` and `outbox/*` (the Twurple `status` and `statusCode` class of bug); (b) fewer fake/mocks drifting from real Twurple classes; (c) agent feedback loop (`tsc` full run 3 to 4 s); (d) review effort per PR. **No runtime speed or memory gain is expected** (types are erased).

**Alternative to compare:** staying on JavaScript plus JSDoc and raising strictness only. The same 1,349 errors must be fixed either way; the extension change adds import-path churn but gives generics, `satisfies`, `interface`, native syntax and removes JSDoc verbosity. Given the owner decision of 2026-10-27 (backend to TypeScript), the recommendation is `.ts`, with the strictness ladder doing most of the value.

**What not to migrate (now):**

- `tests/` (158 `.js` files, about 25 k lines): keep JavaScript; type only new shared helpers that touch the typed contracts.
- Scripts that run outside the image build or on Windows installers (`apps/infra/scripts`, `apps/frontend/scripts`, `next.config.mjs`, `start-product.mjs`): low value, higher breakage risk.
- Prisma migrations, SQL and generated files.
- Frontend `.jsx` to `.tsx` (33 files): second wave, optional. Benefits are `typedRoutes` and prop types; Next compiles TSX regardless of Node stripping.
- `apps/shared`: decide together with the frontend owners; it is imported by Next and by the API.

**Recommended order:** TS-0, TS-1, TS-2, TS-3, TS-4, TS-5, TS-6; frontend `.tsx` and typed routes after TS-6, if the owner wants it. Run the shutdown measurement (section 4) and the performance baseline (section 6) **in parallel**, since they are independent of the language.

**Risks:** OpenGrep silently skipping `.ts` (prove with a seeded `.ts` fixture); import-rename regressions (one folder per PR plus the Docker smoke test); strict errors in `queue-repository` making TS-4 long; tools that need the TypeScript API are blocked until 7.1 (typescript-eslint, some editors for embedded languages); `@private` Twurple constructor in test helpers (note #23); CI must run `prisma generate` before `tsc`.

## 10. Checklist of conventions for the project

- [ ] `erasableSyntaxOnly` and `verbatimModuleSyntax` on from the first `.ts` file; no `enum` and no runtime `namespace`.
- [ ] Explicit tsconfig values (do not depend on TS 7 defaults); `types` listed.
- [ ] Strict ladder per folder; no `// @ts-nocheck` as an exit state of a slice.
- [ ] `import type` for types; relative imports with extension.
- [ ] Boundary validation with the Fastify JSON Schema and `json-schema-to-ts` (`as const` for schemas in variables); no unvalidated JSON/env/DB JSON.
- [ ] No floating promises in workers and shutdown; Biome promise rules at `warn` on `apps/api` first.
- [ ] `useUnknownInCatchVariables` and an error-narrowing helper; safe generic client errors with `referenceId`.
- [ ] Shutdown with `try/catch`, per-step timeouts, `preClose` for streams and a hard-exit timer; measured before and after.
- [ ] Explicit pool sizes for `pg.Pool` and the Prisma adapter; query log and `pg_stat_statements` in the disposable DB before any index proposal.
- [ ] Baseline ELU, delay p99, RSS and heap recorded before any performance story.
- [ ] `next analyze --output` before and after any bundle change; no `next/dynamic` without a measured large module.
- [ ] CSS tokens in `:root`; reduced-motion gate for every animation; contrast pairs checked; no new CSS features in `overlay.css` until the OBS CEF version is known.

## 11. Risks and limitations

- Official docs were read through a fetch tool that summarizes pages. Some pages were truncated (Node `perf_hooks` histogram fields, Node CLI middle part) and are marked partial. The default signal of `node --watch` was not stated in the excerpt.
- Not verified: WCAG 1.4.11 exact threshold, OBS bundled CEF version, `clinic` maintenance, PostgreSQL `EXPLAIN` docs, TypeScript `satisfies` handbook text, `process.getActiveResourcesInfo()` details.
- The cycle estimates and the 12 to 15 total are inferences from error counts and line counts, not from measured velocity.
- Strict error counts include `apps/shared` and `apps/frontend` JS. Counts were produced with CLI flags only; no config file was changed.
- The shutdown analysis is by code reading; no process was run. Desk research does not replace tests in the project environment (PostgreSQL, browser, real Twitch, OBS/CEF).
- The web tool does not support Haiku worker fan-out in this environment; the research was done directly by the main agent.

## 12. What depends on the owner

1. Approve TypeScript **order and timing** relative to the OPS-15 cutover (the migration can run in parallel only if write sets do not overlap).
2. Approve the Biome move and its one-time formatting commit (history churn).
3. Approve any **new devDependency** for load/profile tools (`autocannon`, `clinic`) or accept the built-in-only path.
4. Decide whether the frontend `.jsx` to `.tsx` second wave and `typedRoutes` are wanted.
5. Decide whether `apps/shared` moves with the API or with the frontend.
6. Authorize a live check in OBS to read the CEF version before any new CSS feature.

## 13. Self-assessment (rubric, target at least 9.0)

| Criterion | Weight | Score | Note |
|---|---|---|---|
| Official sources first, dated, labeled | 20 % | 9.2 | 17 official pages read; labels on every recommendation |
| Reuse of the research index, no repeated research | 10 % | 9.5 | Row 23 reused; only triggers and gaps researched |
| Project-grounded evidence (measured) | 20 % | 9.3 | `tsc` baseline and strict ladder measured; shutdown and pool facts from code |
| TypeScript feasibility (order, cost, risks, no-go list) | 20 % | 9.0 | Cost is an estimate; revalidate after TS-0 |
| Coverage of the 8 themes | 15 % | 8.7 | CSS/OBS CEF, `EXPLAIN` and clinic partially verified |
| Honesty about limits and owner decisions | 10 % | 9.5 | Hypotheses are marked as hypotheses |
| Parity en / pt-BR, readability | 5 % | 9.0 | |
| **Weighted total** | | **9.1** | |

## Sources (read on 2026-11-10)

- [Node.js 24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html), [perf_hooks](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html), [CLI](https://nodejs.org/docs/latest-v24.x/api/cli.html)
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [typescript-eslint issue 10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Package bundling](https://nextjs.org/docs/app/guides/package-bundling), [TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript), [Caching](https://nextjs.org/docs/app/getting-started/caching)
- [Fastify Server reference](https://fastify.dev/docs/latest/Reference/Server/), [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [Prisma connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool), [logging](https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging), [query optimization](https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance), [PostgreSQL pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [Biome blog](https://biomejs.dev/blog/), [Biome v2.5](https://biomejs.dev/blog/biome-v2-5/), [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/)
- [Vitest features](https://vitest.dev/guide/features.html)
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion), [MDN CSS and JS animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance), [WCAG 2.2 Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [OBS browser/CEF thread](https://github.com/obsproject/obs-studio/discussions/3853) (COMMUNITY)
- Repository (MEASURE): `package.json`, `tsconfig.json`, `apps/api/src/server.mjs`, `apps/api/src/runtime.mjs`, `apps/frontend/styles/*.css`, `apps/frontend/scripts/dev-runtime-config.mjs`, `node_modules/fastify`, `docs/stories/OPS-15/typescript-migration-research.md`
