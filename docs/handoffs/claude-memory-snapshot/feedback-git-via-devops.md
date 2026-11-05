---
name: feedback-git-via-devops
description: Local commits are authorized by the owner, but every commit/PR/deploy/release action must be run by the @devops agent (aiox-devops), never by Orion or other agents
metadata:
  type: feedback
---

On 2026-10-21 the owner authorized local commits on `feat/ops-15-next-panel` and stated that anything about commits, PRs, deploys etc. is managed by `@devops` (agent `aiox-devops`).

**Why:** agent-authority matrix (devops is the exclusive git/CI/release actor) and the owner's explicit rule; Orion and `@dev` must not run `git commit`/push themselves.

**How to apply:** delegate commits to `aiox-devops` with a commit plan (atomic Conventional Commits, gates before each, messages ending with the attribution lines from the session reminder). The authorization covers COMMITS only: push, PR, tags, version bump, release and cutover still need separate explicit owner authorization. Do not commit while another agent (e.g. `@dev`) is mid-refactor; wait for it to finish and for gates to pass. Related: [[feedback-implementation-by-dev]], [[feedback-issues-body-only]].

**Standing authorization (2026-10-22):** the owner said "Pode seguir com os commits assim que a suíte ficar verde". So after each finished unit of work, once the full suite and gates are green, delegate to `@devops` to create LOCAL commits (explicit pathspec, atomic, each commit self-sufficient, attribution lines). Still never commit incomplete work, and push/PR/tag/bump/release/cutover stay unauthorized. History rewriting needs fresh authorization each time (it was granted once for the 2026-10-22 pathspec fix; backup branch `backup/ops-15-before-history-fix` is kept until the owner says to delete it). Always commit with pathspec (`git commit -- <paths>`), never a bare `git commit` while renames are staged.
