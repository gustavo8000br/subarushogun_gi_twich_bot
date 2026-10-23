---
name: pathspec-commits
description: Always commit with `git commit -- <paths>` (or check `git diff --cached` is empty first) when the index already holds staged changes from other agents
metadata:
  type: feedback
---

Selective batches must use `git commit -F msg -- <paths>` or verify `git diff --cached --name-only` matches only the intended paths before committing.

**Why:** On 2026-10-22 pre-staged `git mv` renames (OPS-15 S-03) were swept into the unrelated AIOX sync commit 5225fe5, leaving intermediate checkouts broken. With one-time owner authorization the branch history was then rewritten on 2026-10-22 (backup branch `backup/ops-15-before-history-fix` kept until the owner says to delete it); any future rewrite needs fresh authorization.

**How to apply:** Before every commit in a multi-group batch, print the cached name list and compare it to the group's path list. Canonical rule: AGENTS.md "Regras do proprietário" (commits only by @devops, after the @qa verdict, with pathspec).
