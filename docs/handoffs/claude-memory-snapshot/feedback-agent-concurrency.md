---
name: feedback-agent-concurrency
description: "Before dispatching agents in parallel, check for conflicts (same files, same role, shared test/Docker/port resources, timing measurements); serialize or isolate in a worktree when they overlap"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f36acdcb-70eb-4675-8ce7-abd172911a17
  modified: 2026-10-24T02:45:52.491Z
---

On 2026-10-23 two `@qa` agents ran in the same worktree (a final gate running the full Docker suite and a read-only suite audit measuring durations). The owner asked Orion to always take care when dispatching equivalent agents or agents that touch the same files, so there are no conflicts.

**Why:** parallel agents in one checkout can overwrite each other's files, fail on each other's half-written docs (documentation contract tests scan `docs/`), fight over Docker containers/images, ports (Next dev on 3000) and the dev DB, and distort timing measurements. The 2026-10-22 Docker cleanup flake itself came from contention.

**How to apply — check before every parallel dispatch:**
1. **Write set:** list the files/dirs each agent will write. Any overlap (including shared docs like changelogs, story File List/Change Log, research index, handoff) → run in sequence.
2. **Same role twice:** two instances of the same agent (two `@qa`, two `@dev`) only in parallel with disjoint write sets and no shared runtime resource; otherwise sequence.
3. **Shared runtime:** only one agent at a time runs the full suite, Docker/PostgreSQL integration tests, E2E servers (ports) or `docker image rm`/cleanup.
4. **Measurements:** timing/performance runs always alone on the machine.
5. **Git:** `@devops` commits only after every agent that writes to the tree has finished; never stage while another agent is writing.
6. **Isolation option:** when parallel work really helps (e.g. two `@dev` slices), use a separate git worktree per agent (`isolation: "worktree"`), remembering each worktree needs its own `npm ci`.
7. **Tell each agent** which paths are out of its scope and which other agent is running, and ask it to mark results affected by concurrency.
8. **Safe to parallelize:** read-only research (`@analyst`), read-only reviews that run no tests, and planning docs in separate files.

Related: [[feedback-qa-runs-final-tests]], [[feedback-git-via-devops]], [[feedback-always-orion]].
