---
name: project-no-shims-until-rc
description: Owner rule 2026-10-27 - no active users, so no compatibility shims/aliases are required in stories until the rc/stable stage
metadata:
  type: project
---

No active users exist; any structural code change is safe until the `rc` or `stable` stage. Stories must not require compatibility shims or permanent aliases (e.g. `/overlay.html`) while this holds.

**Why:** owner answer to OW-09 (2026-10-27) during the OPS-15 vanilla cutover; `legacy` (`a9279b2`) is history only, rollback = revert the wave commit.

**How to apply:** when validating/rewriting ACs, flag "keep forever for compatibility" wording as removable; re-check when `.release-stage` becomes rc/stable. OPS-15 AC 3/AC 8 still name `/overlay.html` and need rewording before alias removal. See [[project-ready-requires-issue]].
