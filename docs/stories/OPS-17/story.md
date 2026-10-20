# OPS-17 — Multilingual viewer chat commands

[Português brasileiro](../../pt-BR/stories/OPS-17/story.md)

**Status:** Backlog — refinement required; separate from OPS-15 and OPS-16.
**Type:** Twitch chat command behavior; persistence/schema changes require `$aiox-data-engineer` coordination.
**Related:** [GitHub issue #73](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/73).

## Story

As a streamer whose panel language differs from my viewers' languages,
I want viewers to be able to understand and use queue commands in their language,
so that the panel locale does not prevent participation in Twitch chat.

## Context

The panel currently localizes the suggested presence command using the streamer's selected product locale (for example, `!<queue> presente`). Twitch viewers may use another language. The current queue key/alias system and chat handler are authoritative; this story does not assume automatic language detection or an implementation strategy.

## Refinement and acceptance criteria

1. Decide explicitly how command language variants are configured and resolved (for example, fixed supported words or streamer-configured aliases); do not infer a viewer's language automatically.
2. Preserve existing queue command syntax and aliases through a documented backward-compatibility policy.
3. Detect and reject/report collisions among queue keys, aliases, and localized command variants without ambiguous command execution.
4. Keep panel locale independent from accepted chat command variants.
5. Ensure queue call messages, help, acknowledgements, errors, and examples accurately communicate all accepted variants in English, Spanish, and pt-BR where applicable.
6. Add named tests for normalization, locale-independent command resolution, authorization, collisions, feedback, and backward compatibility.
7. If persistence/schema changes are required, obtain a data design and disposable-PostgreSQL migration/rollback plan from `$aiox-data-engineer` before implementation. Unit tests or mocks are not database evidence.
8. `$aiox-architect`, `$aiox-ux-design-expert`, and `$aiox-qa` review the refined scope and acceptance evidence before completion; their results remain separate.

## Scope boundaries

- No automatic language detection is implied.
- No new command word, alias, schema, API contract, or migration is approved by this backlog story.
- Do not change the panel's language selection behavior.

## File list

- To be populated when implementation is scheduled.

## Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-19 | Created a separate refinement story for language-independent Twitch chat command variants; no implementation or persistence decision is included. | `$aiox-master` |
