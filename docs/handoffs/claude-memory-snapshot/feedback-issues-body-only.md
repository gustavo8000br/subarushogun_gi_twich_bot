---
name: feedback-issues-body-only
description: "GitHub issues must be updated only through their main body, never with comments (applies to all open issues)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cd6bbd8e-d7f6-45cc-a754-567a93742cac
  modified: 2026-10-22T01:04:10.264Z
---

Never add comments to GitHub issues; always update the issue's main body. The rule applies to every open issue. `@devops` (agent `aiox-devops`) is the only agent that edits issues.

**Why:** owner instruction on 2026-10-21 ("não use comentários nas issues. sempre atualize o corpo principal"), so each issue stays a single current source of truth.

**How to apply:** when scope changes (e.g. OPS-20 / #76 after planning gates), delegate to `@devops` to rewrite the body with `gh issue edit --body-file`, not `gh issue comment`. Planning gates for #76 run one at a time (@po, @data-engineer, @architect, @ux, @qa) and @devops updates the body only after all finish. Related: [[feedback-implementation-by-dev]], [[feedback-decisions-as-popups]].
