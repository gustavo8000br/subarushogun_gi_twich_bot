---
name: pathspec-commits
description: One rule, no exceptions - every commit is `git commit -F msg -- <paths>` (renames list old AND new paths) after the cached list matches the gate group
metadata:
  type: feedback
---

One rule, no exceptions: every commit uses `git commit -F msg -- <paths>` with the gate group's exact paths, AND before it `git diff --cached --name-only` must match that list. Renames are not an exception: list both the old and the new path in the pathspec.

**Why:** On 2026-10-22 pre-staged `git mv` renames (OPS-15 S-03) were swept into the unrelated AIOX sync commit 5225fe5, leaving intermediate checkouts broken. With one-time owner authorization the branch history was then rewritten on 2026-10-22 (backup branch `backup/ops-15-before-history-fix` kept until the owner says to delete it); any future rewrite needs fresh authorization.

**How to apply:** Before every commit in a multi-group batch, print the cached name list and compare it to the group's path list. Working zsh recipe (2026-10-28): `git diff --cached --quiet && git add -- ${=G}` then `diff <(git diff --cached --name-only | sort) <(echo ${=G} | tr ' ' '\n' | sort)`; keep commit messages in the ignored `.local/devops-msg/`, never `/tmp`. When the gate holds back a pair (e.g. OPS-26 K-1), leave it unstaged rather than stashing while another agent may be editing it. Rename groups: stage old and new dirs together, check `git diff --cached --name-status -M` shows `R100` per file, then still commit with the pathspec `git commit -F msg -- <old-dir> <new-dir> <other paths>` (git records the renames when both sides are listed). The no-pathspec form used once for FT-40 `ec12ae0` (2026-10-29) is retired; QA gate 2026-10-29b L-2 flagged it as contradicting the canonical rule. Path lists may live in `.local/devops-msg/<group>.paths` (bash `xargs -a <file> git add --`). Canonical rule: AGENTS.md "Regras do proprietário" (commits only by @devops, after the @qa verdict, with pathspec).
