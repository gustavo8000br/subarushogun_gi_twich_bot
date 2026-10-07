# OPS-7 — Hierarchical chat-command permissions and audience roles

[Português brasileiro](../../pt-BR/stories/OPS-7/story.md)

**Status:** Done — independent QA passed 10/10 on 2026-10-07.
**Planning:** Spec Pipeline approved (critique 4.85/5); implementation TDD is underway.
**Issue:** [#39](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/39)

## Story

As a streamer, I want to set a minimum audience level for configurable commands, so that higher groups inherit access predictably and the panel, chat help and command authorization show the same rule.

As a streamer, I want to distinguish Twitch subscribers from followers, so I can grant access based on either current chat badges or a verified current follower relationship.

## Acceptance criteria

- The hierarchy is `everyone < follower < subscriber < VIP < moderator < streamer`; this is product policy, not a Twitch-defined hierarchy. Role IDs are distinct and labels localized.
- Configurable commands use one minimum role (`everyone`, `follower`, `subscriber`, VIP, or moderator) and display the inherited audience before save; broadcaster retains identity-based access. VIP evidence only counts while the existing VIP toggle is enabled.
- Queue management and `!queue ping` remain locked to streamer/moderator. `!conta <name>` and `!conta reset` are streamer-only by broadcaster ID.
- Moderator/VIP/subscriber claims come only from the current target-channel message badges. Follower is checked by the documented Helix endpoint using the event user ID and optional `moderator:read:followers` scope.
- Unknown follower status fails closed without command, queue, account, redemption, outbox, or success-chat side effects. Other commands not dependent on follower checks continue working.
- Optional follower scope is requested only when needed and only through session-bound OAuth. Failed/declined consent preserves the previous usable credentials and policy.
- Existing explicit allowlists remain `legacy_exact` until a streamer reviews and saves each command conversion; startup does not broaden/narrow or rewrite saved policies.
- Chat help, protected command catalog, panel, API and authorization use the same canonical policy resolver; user-authored queue content remains unchanged.
- Tests cover role inheritance, fixed permissions, follower tri-state and rate failures, OAuth scope, help/cooldown, migration, API/panel safety, and absence of unauthorized effects. PostgreSQL guarantees use actual migrations in an isolated PostgreSQL instance.
- Every behavior increment records actual Red → Green → Refactor evidence. Independent implementation QA must score 10/10 before Done. No live Twitch test is claimed unless performed.

## Planning artifacts

- `spec/spec.md`, `spec/requirements.json`, `spec/research.json`, `spec/complexity.json`, `spec/critique.json`, `spec/plan.json`.
- Equivalent artifacts live under `docs/pt-BR/stories/OPS-7/`.
- Actual Red → Green → Refactor records: `tdd-log.md` and its pt-BR pair.

## File list

## Implementation file list

- API/domain: `apps/api/src/commands/catalog.mjs`, `apps/api/src/commands/authorization.mjs`, `apps/api/src/commands/chat-handler.mjs`, `apps/api/src/http/queue-routes.mjs`, `apps/api/src/server.mjs`, `apps/api/src/persistence/queue-repository.mjs`, `apps/api/src/persistence/twitch-credential-repository.mjs`, `apps/api/src/twitch/oauth.mjs`, `apps/api/src/twitch/integration.mjs`, `apps/api/src/twitch/helix-adapter.mjs`, `apps/shared/localization/discover-catalog-module.mjs`.
- Panel/catalog/localization: `apps/web/app.js`, `apps/web/command-catalog-view.mjs`, `apps/web/localization/catalogs/panel/en.tsv`, `apps/web/localization/catalogs/panel/pt-BR.tsv`, `apps/web/localization/catalogs/panel/es.tsv`, `apps/web/localization/catalogs/chat/en.tsv`, `apps/web/localization/catalogs/chat/pt-BR.tsv`, `apps/web/localization/catalogs/chat/es.tsv`.
- Tests: `tests/unit/hierarchical-command-policy.test.js`, `tests/unit/command-authorization.test.js`, `tests/unit/command-catalog.test.js`, `tests/unit/command-catalog-view.test.js`, `tests/unit/chat-command-handler.test.js`, `tests/unit/queue-routes.test.js`, `tests/unit/twitch-oauth.test.js`, `tests/unit/twitch-integration.test.js`, `tests/unit/twitch-adapter.test.js`, `tests/integration/command-policy-persistence.test.js`, `tests/integration/queue-repository.test.js`, `tests/integration/panel-localization-contract.test.js`.
- Documentation/evidence: `docs/integrations.md`, `docs/pt-BR/integrations.md`, `docs/ROADMAP.md`, `docs/pt-BR/ROADMAP.md`, `docs/stories.md`, `docs/pt-BR/stories.md`, `docs/stories/OPS-7/`, `docs/pt-BR/stories/OPS-7/`.

The matching execution evidence is in `tdd-log.md` and `docs/pt-BR/stories/OPS-7/tdd-log.md`. The implementation gates have passed; QA disposition is recorded in the story review before it can be marked Done.
## QA Results

**Verdict:** PASS — **10/10**. Independent review approved all documented acceptance areas. Automated gates: 87 test files / 704 tests passed; lint, typecheck, OpenGrep, localization validation, version validation, Compose configuration and diff check passed. The PostgreSQL regression failed when the transaction method was removed and passed after restoration. The initial helper prototype chronology remains disclosed in the TDD log; a later test-first PostgreSQL remediation is also recorded. No live Twitch follower lookup or OAuth consent was performed or claimed. Full evidence: [QA report](qa/qa-report.md).

## Change Log

- 2026-10-07: Moved from In Review to Done after independent QA passed 10/10.
