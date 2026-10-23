---
name: feedback-always-research-web
description: "Research rule: check docs/research-index.md first (golden rule); research the internet (official docs first) only for a GAP or fired REFRESH trigger, via @analyst/@architect, before technical or planning decisions"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cd6bbd8e-d7f6-45cc-a754-567a93742cac
  modified: 2026-10-22T01:06:37.867Z
---

Always search the internet (official documentation first; blogs, forums and community threads as supplementary evidence) to fill gaps and catch pitfalls before decisions, plans and gates. Cite links and dates and state what could not be verified.

**Why:** owner reminder on 2026-10-21 ("isso é regra de projeto"); it is also in CLAUDE.md (UX e pesquisa). Several AIOX subagents (`aiox-data-engineer`, `aiox-architect` has web tools, `aiox-po`, `aiox-dev`, `aiox-qa`, `aiox-ux`) lack WebSearch, so research is not done unless someone with the tool does it.

**How to apply:** before dispatching a gate or implementation, have Orion (WebSearch/WebFetch) or `aiox-analyst`/`aiox-architect` (they have web tools) produce a research note, and pass its findings to agents without web access. Do not treat research as a substitute for tests in the project environment. Related: [[feedback-implementation-by-dev]]. Canonical text: AGENTS.md (Pesquisa técnica obrigatória + Regras do proprietário).

**Workflow update (2026-10-21):** the owner added `@analyst` (agent `aiox-analyst`) as an explicit step in the research → planning → development flow: run `@analyst` research before each planning gate and before each `@dev` task, and pass its note to agents without web tools. Recorded in CLAUDE.md (Papéis AIOX / UX e pesquisa) and in the OPS-20 planning-gates checklist.

**Golden rule (2026-10-22):** if `@analyst` already researched a topic and judged no further research is needed, do NOT spend tokens on more research (removes redundancy). Check `docs/research-index.md` (SUFFICIENT / REFRESH IF / GAP verdicts) before dispatching any research; research only for a GAP or a fired REFRESH trigger. Recorded in CLAUDE.md. This refines, not cancels, the "always research" rule above.
