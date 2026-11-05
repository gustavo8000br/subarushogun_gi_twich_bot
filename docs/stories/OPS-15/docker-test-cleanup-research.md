# OPS-15 Research: Disposable Docker PostgreSQL in Vitest integration tests (image pull, cleanup, contention)

[Português brasileiro](../../pt-BR/stories/OPS-15/docker-test-cleanup-research.md)

- Date: 2026-10-23. Author: @analyst (Atlas). Research only; no code, test, container or Docker command was run (the local Docker socket was not accessible to this agent: `permission denied while trying to connect to the docker API`).
- Trigger: `docs/research-index.md` had no row for this topic (GAP). Evidence comes from the @qa gates [qa-gate-2026-10-22.md](qa-gate-2026-10-22.md) (rows "npm test (full)" and "Full suite") and [qa-gate-2026-10-23.md](qa-gate-2026-10-23.md) (rows "npm test (full, parallel, run 1)", "Test infrastructure robustness" and section "Cleanup").
- Location: the repository keeps research notes next to the story (`docs/stories/<ID>/*-research.md` + pt-BR copy), not in `docs/research/`. This note follows that pattern.
- Labels: **VERIFIED** = official doc, upstream source, installed package source or this repository's code; **PARTIAL** = official source confirms part, the rest is my reading or a secondary source; **UNVERIFIED** = inference, must be proven by a test.
- Versions: Vitest 5.0.3 (`package.json`, installed), Docker CLI 29.9.2 client (local; the daemon version could not be read), image `postgres:18.6-bookworm`.

## 1. What the code does today (VERIFIED, repository)

| Item | Where |
|---|---|
| Every `docker` call uses `spawnSync` with `timeout: 30_000`, including `docker run` (which may pull the image implicitly). | `tests/integration/queue-repository.test.js:26`, `overlay-widget-repository.test.js:22`, `qra-postgres-fixtures.test.js:27` |
| `containerStarted = true` is set only **after** `docker run` returns exit 0. | `queue-repository.test.js:658-662`, `overlay-widget-repository.test.js:54-58`, `qra-postgres-fixtures.test.js:59-68` |
| Cleanup runs only `if (containerStarted)`. | `queue-repository.test.js:694`, `overlay-widget-repository.test.js:77`, `qra-postgres-fixtures.test.js:88` |
| `queue-repository` (and `command-policy-persistence.test.js:53`, `tombstone-index-plan.test.js:48`, `command-policy-v3-migration.test.js:52`, `postgres-foundation.test.js:49`) clean up with a single `docker stop` whose result is ignored. These files never fail in cleanup, but never verify it either. | lines above |
| `overlay-widget-repository` and `qra-postgres-fixtures` use the shared helper `cleanupIsolatedPostgres`, which verifies removal and throws. These are exactly the two files that failed under the parallel suite. | `tests/helpers/isolated-postgres-cleanup.mjs` |
| All containers run with `--rm` (AutoRemove). The two failing files also mount a **named** volume. | `overlay-widget-repository.test.js:54-57`, `qra-postgres-fixtures.test.js:60-65` |
| Vitest config: `testTimeout` and `hookTimeout` 120 000 ms; no `pool`, `maxWorkers`, `fileParallelism` or `globalSetup`, so the defaults apply. | `vitest.config.js:7-8` |
| The image tag `postgres:18.6-bookworm` is repeated in 7 integration files. | `grep -rl postgres:18.6-bookworm tests` |

Helper behavior, line by line (`tests/helpers/isolated-postgres-cleanup.mjs`):

- `:10` runs `docker rm --force <name>` and **ignores the result** (status, stderr, `error`).
- `:11-14` runs `docker inspect <name>` **once**. If it returns exit 0 (the container still exists), it throws at once. There is no wait and no retry.
- `:2` `isMissing` accepts `no such container|object` (case-insensitive) as "gone".
- `:13`, `:18`, `:22` build the message with `stderr ?? stdout ?? '...'`. With `encoding: 'utf8'`, `spawnSync` returns `''` (not `null`) for an empty stream, so when `inspect` **succeeds** (status 0, `stderr === ''`) the message is just `Isolated PostgreSQL container cleanup failed: ` with no detail. That matches the 2026-10-22 gate, which could only write "contention" (VERIFIED by code reading; Node returns strings when `encoding` is set).
- `:16-19` and `:20-23`: volume removal and verification, also single-shot.
- Worst-case time of the helper: 4 calls × 30 s = 120 s, which equals `hookTimeout` (`vitest.config.js:8`) before counting `prisma.$disconnect()`.

## 2. Answers

### Q1. How to make sure the image exists before the tests

- **VERIFIED** (Docker docs, `docker container run`, https://docs.docker.com/reference/cli/docker/container/run/): `--pull` accepts `missing` (default, pull only if not cached), `always` and `never` ("never pull, fail if not cached").
- **VERIFIED** (docker/cli source, `cli/command/container/create.go`, https://github.com/docker/cli/blob/master/cli/command/container/create.go): with the default `missing` policy, the CLI first calls `ContainerCreate`; on a not-found image it prints `Unable to find image '<ref>' locally`, pulls with the **command context**, then retries `ContainerCreate`. The pull is therefore inside the 30 s `spawnSync` budget of `docker run`. This is the exact text recorded in the 2026-10-23 gate.
- **VERIFIED** (Vitest docs, https://vitest.dev/config/globalsetup): `globalSetup` "is called before the test workers are created and only if there is at least one test queued"; teardown runs "after all test files have finished running"; values reach tests through `provide`/`inject`. The page says nothing about a timeout.
- **VERIFIED** (installed source, `node_modules/vitest/dist/chunks/index.DpLw24bj.js`, `_initializeGlobalSetup`): Vitest 5.0.3 simply `await`s `setup()`; there is no timeout wrapper. A pull in `globalSetup` is only bounded by the timeout we pass to the Docker command.
- **VERIFIED** (https://vitest.dev/config/hooktimeout): default `hookTimeout` is 10 000 ms in Node; `0` disables it. The project sets 120 000 ms. Per-hook timeouts (`beforeAll(fn, 120_000)`) override it.
- **Recommendation (PARTIAL: design choice, not tested here):** a shared helper `ensurePostgresImage()` that runs `docker image inspect postgres:18.6-bookworm` (fast, exit 0 when present) and, only if missing, `docker pull` with its own long timeout (for example 300 s), called at the top of every PostgreSQL `beforeAll`; then run the container with `--pull never` so `docker run` can never pull inside its 30 s budget. The `beforeAll` timeout must cover the pull (for example 420 s).
- Why not `globalSetup` as the first choice: it runs whenever any test is queued, so `npm run test:unit` on a machine without the image would also download ~630 MB, and a machine without Docker would need a guard. It becomes the better option if the config is split into `unit` and `integration` projects with `globalSetup` only on the integration project (UNVERIFIED for this repo: not tried). A `docker pull` step in CI before `npm test` is a complementary, @devops-owned option (`.github/workflows/quality-gates.yml:110` runs `npm test`).
- **UNVERIFIED:** whether several parallel `docker pull` of the same image are deduplicated by the daemon. The helper should not depend on it; with the image cached it never pulls.

### Q2. Created container, `docker rm -f` on a missing container, `--rm`

- **VERIFIED** (docker/cli `cli/command/container/run.go`, https://github.com/docker/cli/blob/master/cli/command/container/run.go): `docker run` = `createContainer` (which includes the pull) **then** `ContainerStart`. If the client dies between the two calls, the container stays as created on the daemon.
- **VERIFIED** (repository evidence, `qa-gate-2026-10-23.md`, "Cleanup"): the orphan `queuebot-repo-43295-34484391` was in state `created`, never started, with `AutoRemove true`.
- **VERIFIED** (Docker Engine API v1.52, `HostConfig.AutoRemove`, https://docs.docker.com/reference/api/engine/version/v1.52.yaml): "Automatically remove the container when the container's process exits." A container that never started never exits, so **`--rm` does not remove a `Created` container**. `docker ps --filter status=created` documents `created` as "never been started" (https://docs.docker.com/reference/cli/docker/container/ls/).
- **VERIFIED** (moby `daemon/monitor.go`, https://github.com/moby/moby/blob/master/daemon/monitor.go): AutoRemove calls `containerRm(... ForceRemove: true, RemoveVolume: true)` on exit; errors are only logged. `RemoveVolume` removes anonymous volumes only; named volumes survive (`docker container rm`, https://docs.docker.com/reference/cli/docker/container/rm/: "if a volume was specified with a name, it will not be removed").
- **VERIFIED** (Node 24 docs, https://nodejs.org/docs/latest-v24.x/api/child_process.html): on `timeout`, `spawnSync` sends `killSignal` (default `SIGTERM`), returns `status: null`, `signal` set and `error` set ("failed or timed out").
- **PARTIAL:** the exact phase in which the 2026-10-23 client died (during pull, after create, during start) was not recorded. The orphan proves it reached `create`.
- **VERIFIED** (docker/cli `cli/command/container/rm.go`, master, https://github.com/docker/cli/blob/master/cli/command/container/rm.go): `if opts.force && errdefs.IsNotFound(err) { continue }`, so `docker rm -f <missing>` prints nothing for that name and exits **0**. The behavior dates from a 2020 docker/cli change by Sebastiaan van Stijn (mirror: https://git.coopcloud.tech/p4u1/docker-cli/src/commit/32d8f358df005d478f1a29886b94f3e8ac111fcd/cli/command/container/rm_test.go). **PARTIAL** for the QA machine: the daemon version was not read; the code must still not depend on the exit code alone (keep the `inspect` check).
- **VERIFIED** (Engine API `DELETE /containers/{id}`): 404 "no such container" (example `No such container: c2ada9df5af8`), 409 "conflict", `force`: "If the container is running, kill it before removing it."
- **VERIFIED** (docker/cli `cli/command/system/inspect.go`): `docker inspect <missing>` returns `error: no such object: <ref>`. The current regex (`:2`) matches it.
- **Answer:** yes, the container can exist as `Created` after the client is killed, and `--rm` does not help for that case. `docker rm -f <name>` is idempotent (exit 0 on missing), so cleanup should run **always**, not behind `containerStarted`.
- **VERIFIED** (installed source, `node_modules/vitest/dist/chunks/run.BTlFXlnv.js`, `runSuite`): `afterAll` runs inside a `finally` with the comment "afterAll runs even if beforeAll or suite children fail". So an unconditional cleanup in `afterAll` does run after a failed `beforeAll`.

### Q3. Why `rm -f` / cleanup fails under contention, and what the code handles

Known daemon causes (VERIFIED in moby `daemon/delete.go`, https://github.com/moby/moby/blob/master/daemon/delete.go, and Engine API):

1. `removal of container <name> is already in progress` (`errdefs.Conflict`, 409): a second removal while one holds `RemovalInProgress`. With `--rm`, an AutoRemove started by an exit (for example a container that was stopped or crashed) can race with our explicit `rm -f`.
2. `could not kill container: ...` and `unable to remove filesystem` (the latter also sets the container's removal error and leaves it in place).
3. Volume removal returns 409 "Volume is in use and cannot be removed" while a container still references it (Engine API `VolumeDelete`).
4. Client-side timeout (our 30 s `spawnSync`): the client is killed but the daemon keeps working; `inspect` right after can still see the container. **UNVERIFIED** that this is what happened on 2026-10-22 (the stderr was not recorded), but it is the most consistent explanation: only the two files that verify removal failed, both passed alone, and the empty message matches `inspect` exit 0.

| Case | Handled? | Where |
|---|---|---|
| Container gone after `rm` (`no such container/object`) | Yes | `isolated-postgres-cleanup.mjs:2`, `:11-12` |
| Volume gone (`no such volume`) | Yes | `:16-17`, `:20-21` |
| Volume still present after removal | Yes, fails visibly (unit test exists) | `:20-23`; `tests/unit/isolated-postgres-cleanup.test.js:22-31` |
| `rm -f` result (409 already in progress, kill failure, timeout `ETIMEDOUT`) | **No**, result ignored | `:10` |
| Container still present right after `rm` (removal in progress) | **No**, throws at once, no polling | `:11-14` |
| Empty diagnostic when `inspect` succeeds (`'' ?? ...`) | **No**, message is empty | `:13` (same pattern `:18`, `:22`) |
| `spawnSync` timeout on `inspect`/`volume rm` (`status: null`, `error.code`) | **No**, treated as generic failure, no detail | `:12`, `:17`, `:21` |
| Volume 409 "in use" while container removal finishes | **No** retry | `:16-18` |
| Container created but `docker run` failed/timed out (`containerStarted` false) | **No**, cleanup skipped | `queue-repository.test.js:694`, `overlay-widget-repository.test.js:77`, `qra-postgres-fixtures.test.js:88` |
| `docker stop` result in 5 files | Not checked (cannot fail, cannot detect leaks) | `queue-repository.test.js:694` and the 4 lines in section 1 |

Recommended tolerance pattern (PARTIAL: derived from the sources above, not from an official "retry guide"; Docker does not publish one): treat removal as a **converging state check** with a deadline. Call `rm -f`, then poll `inspect` until "no such" or deadline (for example 60 s, 500 ms to 1 s steps). Treat 409 "already in progress" and `ETIMEDOUT` as transient. Retry volume removal on "in use" inside the same deadline. On final failure, throw with status, signal, `error.code` and stderr (container/volume names only; no connection string).

### Q4. Testcontainers for Node

- **VERIFIED** (https://node.testcontainers.org/modules/postgresql/): `@testcontainers/postgresql` gives `new PostgreSqlContainer(image).start()`, `getConnectionUri()`, `snapshot()`/`restoreSnapshot()`. **PARTIAL** (Node config page https://node.testcontainers.org/configuration/ lists `TESTCONTAINERS_RYUK_DISABLED`; behavior described in Go docs https://golang.testcontainers.org/features/garbage_collector): the Ryuk sidecar removes labelled containers, networks and volumes after the test process goes away, which also covers crashed runs.
- **VERIFIED** (repository, `docs/stories/OPS-20/test-research.md:15,42`; `package.json`): not a dependency today; that note already recommended keeping the repo pattern.
- **Recommendation:** not now. It is a new dependency (story + issue), a second container (Ryuk) per run, and a rewrite of 7 files, to fix what one helper fixes. Revisit only if orphans keep appearing after the helper fix, or if more container types are added. A cheap middle ground: add `--label queuebot.test=disposable` to `docker run` so the owner/@qa can list leftovers with `docker ps -a --filter label=queuebot.test` (VERIFIED filter: https://docs.docker.com/reference/cli/docker/container/ls/).

## 3. Recommendation for @dev (test-first)

Change set (one story task; no product code):

1. `tests/helpers/isolated-postgres-cleanup.mjs`
   - Make it `async`, inject `sleep` and `now` for tests, accept optional `volumeName` (queue-repository uses tmpfs).
   - Capture the `rm -f` result; poll `inspect` until missing or deadline; treat "already in progress" and `ETIMEDOUT` as transient; retry `volume rm` on "in use".
   - Build messages with `||` and include `status`, `signal`, `error?.code`, stderr.
2. New shared helper (same folder), for example `tests/helpers/isolated-postgres-image.mjs`: `ensurePostgresImage()` (`image inspect`, else `pull` with a long timeout) and one exported constant for the image tag.
3. The 7 PostgreSQL integration files: call `ensurePostgresImage()` first, add `--pull never` (and optionally the label) to `docker run`, and call the cleanup helper **unconditionally** in `afterAll` (drop the `containerStarted` guard and the bare `docker stop`). Raise the `beforeAll` timeout to cover the pull, and give `afterAll` an explicit timeout larger than the cleanup deadline.

Tests that must fail first (`tests/unit/isolated-postgres-cleanup.test.js`, fake `runDocker`, no Docker):

1. **First RED:** "waits until the container disappears when inspect still finds it right after rm": `rm` → 0; `inspect` → 0 (still present); `inspect` → 1 `error: no such object: queuebot-test`; then volume removed. Today it throws at `:13`.
2. "retries volume removal while the volume is in use": `volume rm` → 1 `volume is in use`, then 0; `volume inspect` → `no such volume`. Today it throws at `:18`.
3. "reports status, signal and timeout code when the container never disappears": `inspect` always 0 until the injected deadline → error message is not empty and contains the status. Today the message is empty.
4. "treats a timed-out rm (status null, error.code ETIMEDOUT) as transient and still verifies removal".
5. "is a no-op success when the container was never created" (`rm -f` exit 0, `inspect` no such object) — guards the unconditional call.
6. New unit test for `ensurePostgresImage`: no `pull` when `image inspect` returns 0; `pull` with the long timeout when it returns 1; a failed pull throws a clear error.

Then the integration proof belongs to @qa: full parallel `npm test` on a machine **without** the image cached (`docker image rm postgres:18.6-bookworm` only if no other project uses it), and a repeated full run to check cleanup under contention. Desk research cannot close that.

## 4. Limitations

- No Docker command was run; the daemon was not reachable from this agent. Daemon version on the QA machine is unknown.
- The stderr of the 2026-10-22 cleanup failures was not recorded (the helper hides it), so the root cause of item 2 of the problem stays **UNVERIFIED** until the improved message captures it.
- docker/cli and moby sources were read from `master`, not from the exact installed release tag.
- No official Docker guidance on retry/backoff for removal exists that I could find; the pattern in Q3 is derived.
- Community sources were not needed; none are relied on.

## Sources

- Docker CLI `container run`: https://docs.docker.com/reference/cli/docker/container/run/
- Docker CLI `container rm`: https://docs.docker.com/reference/cli/docker/container/rm/
- Docker CLI `container ls`: https://docs.docker.com/reference/cli/docker/container/ls/
- Docker Engine API v1.52 (OpenAPI): https://docs.docker.com/reference/api/engine/version/v1.52.yaml
- docker/cli `create.go`, `run.go`, `rm.go`, `system/inspect.go`: https://github.com/docker/cli/tree/master/cli/command
- docker/cli 2020 `rm -f` change (mirror): https://git.coopcloud.tech/p4u1/docker-cli/src/commit/32d8f358df005d478f1a29886b94f3e8ac111fcd/cli/command/container/rm_test.go
- moby `daemon/delete.go`, `daemon/monitor.go`: https://github.com/moby/moby/tree/master/daemon
- Node.js 24 `child_process.spawnSync`: https://nodejs.org/docs/latest-v24.x/api/child_process.html
- Vitest `globalSetup`, `hookTimeout`, `teardownTimeout`, `fileParallelism`, `pool`, `maxWorkers`: https://vitest.dev/config/globalsetup, https://vitest.dev/config/hooktimeout, https://vitest.dev/config/teardowntimeout, https://vitest.dev/config/fileparallelism, https://vitest.dev/config/pool, https://vitest.dev/config/maxworkers
- Testcontainers for Node: https://node.testcontainers.org/modules/postgresql/, https://node.testcontainers.org/configuration/; Go garbage collector: https://golang.testcontainers.org/features/garbage_collector
