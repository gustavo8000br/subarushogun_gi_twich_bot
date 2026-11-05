---
name: project-stage-no-users
description: Product is in beta with NO active users; structural/breaking code changes (even aliases, URLs, formats) are safe until the rc or stable stage
metadata:
  type: project
---

On 2026-10-27, answering whether to keep the `/overlay.html` aliases forever, the owner said there are **no active users**, so **any structural code change is safe**; it stops being safe only when the project reaches the **rc or stable stage**.

**Why:** backward compatibility with already-emitted OBS URLs, installers or data formats is not needed while there are no users; being too conservative only keeps dead code and slows the cutover and TypeScript migration.

**How to apply:** do not keep compatibility shims, URL aliases, deprecated routes or dual formats for the sake of users who do not exist (e.g. `/overlay.html` aliases can be removed, vanilla overlay/panel deleted, `archive` route dropped). Still keep data safe in the owner's own dev/real channel when relevant, and record every removal in the story/changelog. Re-check this rule when the stage moves to rc or stable: from then on breaking changes need a deprecation path and the owner's OK. Related: [[project-incremental-cutover]], [[project-backend-direction]].
