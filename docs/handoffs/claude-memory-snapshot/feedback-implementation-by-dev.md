---
name: feedback-implementation-by-dev
description: "Project implementation work must be done by the @dev agent (aiox-dev), not by Orion/aiox-master directly"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cd6bbd8e-d7f6-45cc-a754-567a93742cac
  modified: 2026-10-22T00:41:05.395Z
---

All project implementations (code, tests, catalogs) must be done by `@dev` (agent type `aiox-dev`); Orion orchestrates, delegates and records.

**Why:** owner stated "As implementações do projeto devem ser feitas obrigatoriamente pelo @dev" (2026-10-21), after Orion implemented the call-deadline line, post-save onboarding and expiry announcement directly. Matches the agent-authority matrix (aiox-master: delegate implementation to @dev).

**How to apply:** for any further code change in OPS-15 (and later stories) spawn `aiox-dev` with a self-contained brief (test-first, UX score ≥ 9.0 from `aiox-ux` recorded first, bilingual docs); Orion only reviews, runs gates and updates handoff. Related: [[feedback-decisions-as-popups]].
