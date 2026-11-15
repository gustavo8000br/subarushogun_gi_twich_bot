---
name: aiox-commit
description: >
  @devops only (project override, AGENTS.md "Git e commits"): create a local conventional
  commit of the groups released by the @qa verdict, with an explicit pathspec. Never pushes.
user-invocable: true
---

# AIOX Local Commit

> Project override: only `@devops` (subagent `aiox-devops`) runs this skill. Any other agent stops
> and hands the package to the orchestrator. The Git authority guard blocks commits by other agents.

## Steps

1. Have the `@qa` verdict for this package in hand (PASS, CONCERNS or WAIVED, score >= 9.0) and its list of released groups.
2. Recompute the tree fingerprint cited in the verdict; if it changed, stop.
3. `git status`, `git diff`, then stage only the released paths with an explicit pathspec (`git add -- <paths>`); never `-A`, `.` or `-a`; never force-add secrets.
4. Check `git diff --cached --name-only` against the released list and `git diff --cached` plus the message with `grep -n "claude.ai/"` (a match means stop).
5. Commit with an explicit pathspec (`git commit -m "<message>" -- <paths>`), conventional message + story id:

```text
feat: short description [Story X.Y]
fix: short description [Story X.Y]
docs: ...
test: ...
chore: ...
```

6. Do **NOT** push here; push and PR follow the `push`/`create-pr` missions of `@devops`.

## Forbidden

- `git push`, `--force`, `git commit --no-verify` to bypass gates
- Amending published commits without explicit user request
- Running this skill as any agent other than `@devops`
- A `Claude-Session` trailer or any Claude session URL in the message
