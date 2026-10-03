# Greenfield Planning Validation

[Português brasileiro](pt-BR/planning-validation.md)

## Scope reviewed

The full-stack product brief, PRD, frontend specification, integrated architecture, service architecture, and frontend architecture were reviewed against the FND-0 requirements/spec/research artifacts and the supplied AIOX `po-master-checklist.md`.

## Findings

| Checklist area | Result | Evidence |
| --- | --- | --- |
| Project setup and initialization | Ready with implementation gates | Private GitHub repository and local `main` exist; Node 24.20.0, npm 11.19.0, Docker 29.8.1/Compose v5.5.1 and authenticated `gh` are available. Product `package.json`, README and runtime remain pending FND-1 TDD work. |
| Infrastructure and deployment | Planned | Compose topology and isolated real PostgreSQL/migration tests are specified in architecture and FND-1 plan. No implementation or platform parity is claimed. |
| External dependencies and integrations | Researched; implementation checks pending | Official references and pinned versions are in `stories/FND-0/spec/research.json`; SDK contract behavior must be tested against installed versions. No live Twitch credentials were used. |
| UI/UX | Planned | Panel flow, privacy, status, accessibility and safe rendering appear in frontend spec/architecture. UI contract tests precede implementation. |
| User/developer responsibility | Ready | Twitch developer app and authorization are streamer-provided; local code, tests, docs and validation are project work. Release/tag authority remains @devops; stage promotion is human-approved. |
| Feature sequencing and dependencies | Ready | FND-1 through FND-6 order persistence before domain/integrations/panel and requires migration-backed tests. |
| MVP scope alignment | Ready | Non-goals preserve the explicit exclusions; no public signup, multi-channel, Discord, game credentials, overlay or hosted services are added. |
| Documentation and handoff | Ready with parity work tracked | Each planning document links to its pt-BR counterpart. Stories/changelogs/integration/versioning docs remain implementation deliverables. |
| Post-MVP | Deferred as specified | Overlay, Discord, rankings, export/backup feature, public hosting and horizontal scale remain out of scope. |

## Conditional decision

**PO gate: APPROVED WITH SCOPE INTERPRETATION.** The operator decided to preserve the product's required mutable panel and treat AIOX CLI-first as a framework development/operations guideline. No additional domain CLI is added. The required product panel remains the operator control surface and all panel/chat mutations pass through the same server-side domain services.

The open governance decision is resolved. Product implementation can proceed through the Story Development Cycle. No product code was written during planning.

## Risks carried forward

- File-backed Compose secret permissions may differ across Linux and Docker Desktop; verify before claiming platform compatibility.
- Twitch SDK field normalization, send result semantics and current endpoint scopes require version-specific contract tests.
- Financial side effects cannot be exactly-once over HTTP; retain durable intent and remote confirmation as the contract.
- AIOX sharding requires `@kayvan/markdown-tree-parser`; it was installed globally because `.aiox-core/core-config.yaml` enables `markdownExploder`.

## Workflow status

- Spec Pipeline: requirements, complexity, official-source research, spec, critique and implementation plan present; critique approved with recorded medium issues.
- Greenfield Fullstack: discovery/PRD/UI/full-stack architecture written and sharded; PO validation approved with scope interpretation.
- Greenfield Service: service architecture written and sharded; shared product planning gate approved.
- Greenfield UI: frontend specification and architecture written and sharded; shared product planning gate approved.
- Story Development Cycle: starting with FND-1 after story creation and validation.
- Auto Worktree + Git Workflow: intentionally last and not started.
