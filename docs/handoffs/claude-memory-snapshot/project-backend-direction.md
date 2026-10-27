---
name: project-backend-direction
description: "Owner decisions 2026-10-27 on backend direction — no rewrite, Node stays and goes to TypeScript, Docker mandatory, typing/financial recovery before SSE"
metadata:
  node_type: memory
  type: project
  originSessionId: f36acdcb-70eb-4675-8ce7-abd172911a17
  modified: 2026-10-27T03:09:25.579Z
---

On 2026-10-27, after the @architect study (`docs/process/backend-migration-study.md`), the owner decided:
- **Do not migrate the backend to another language now**; harden the Node backend in slices (plan H-01…H-09). Reopen only on the study's triggers.
- **Go straight to TypeScript** (not only strict JSDoc): convert `apps/api` to `.ts`. Needs its own story, research note on the Node 24.20.0 build/test path (tsc vs type stripping, Vitest, Docker image, installer) and a migration order by module, without freezing the OPS-15 cutover.
- **Docker stays mandatory** on Windows and macOS (no migration trigger).
- **Order:** typing + financial recovery (D-5/D-6, unknown policy: 6 retries then audited manual resolution) first; SSE right after, still a cutover dependency. Navigation after create/delete: `/queues?queue=<id>` and auto-redirect on delete with honest pending states.

**Why:** the real bugs were type errors at library boundaries (e.g. missing `status` on the Twurple redemption class), not language limits; the slowness is test/Docker process, not Node runtime.

**How to apply:** new backend stories assume TypeScript direction; the redemption fix must use real Twurple types and `statusCode`; do not reopen the language question unless a trigger fires. Related: [[feedback-kanban-governance]], [[feedback-agent-concurrency]].
