---
name: feedback-dev-db-disposable
description: "The dev database is always disposable; never migrate, restore or preserve the old dev volume"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f36acdcb-70eb-4675-8ce7-abd172911a17
  modified: 2026-10-24T02:09:03.861Z
---

On 2026-10-23 (new Ubuntu machine) the owner said the development database is always disposable: the old `queuebot-dev-…_next_dev_postgres_data` volume is not migrated, and `npm run dev:start` creates a fresh one when needed.

**Why:** the owner does not keep data in the dev DB; it is a throwaway environment.

**How to apply:** do not ask to migrate or restore the dev DB volume, and do not list it as an owner pending item. Still never remove a volume whose ownership is unclear (Docker hygiene rules in AGENTS.md still apply); just treat a missing dev DB as normal. Related: [[feedback-qa-runs-final-tests]].
