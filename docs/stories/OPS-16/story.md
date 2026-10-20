# OPS-16 — Explain custom queue call-message variables

[Português brasileiro](../../pt-BR/stories/OPS-16/story.md)

**Status:** Backlog — queued for refinement and implementation prioritization; not started. This is a standalone follow-up and does not replace or reorder the active OPS-15 migration.
**Type:** User-facing panel guidance and localization; no API or database change expected.
**Related:** OPS-15 queue creation/settings parity; [GitHub issue #72](https://github.com/gustavo8000br/subarushogun_gi_twich_bot/issues/72).

## Story

As a streamer customizing the message sent when a viewer is called,
I want the panel to explain every supported template variable and its meaning,
so that I can safely personalize the message without guessing what values the bot will send.

## Context

The queue call-message editor currently names the accepted placeholders but does not explain them. The runtime supports `{user}`, `{queue}`, `{position}`, `{uid}`, and `{account}`. Their meanings and privacy conditions must be confirmed against the current formatter before implementation; the API remains authoritative for accepted tokens. This story is limited to operator guidance in the queue creation and settings forms.

## Acceptance criteria

1. The new-queue call-message field and existing queue call-message settings present a localized, accessible explanation of every supported token: `{user}`, `{queue}`, `{position}`, `{uid}`, and `{account}`.
2. Each explanation describes the value actually produced by the existing chat formatter. `{uid}` explicitly explains that it is blank unless the queue's UID visibility requirements allow it; the UI must not imply that it can bypass privacy settings.
3. Guidance includes the existing viewer presence command syntax (`!<queue> present`, localized to the product's current command syntax) and does not invent a new command or token.
4. Existing live preview, field validation, accepted-token set, message limit, and save/create payload behavior remain unchanged. No API route, schema, migration, authorization, or chat behavior is added by this story.
5. English, Spanish, and pt-BR catalog entries are equivalent in meaning and pass localization validation. No raw HTML is used; guidance is associated with the relevant textarea for assistive technology.
6. Named component tests cover both forms, all five tokens and their descriptions, the UID privacy condition, and accessible association. Existing route/formatter tests continue to prove the token meanings and supported set.
7. `$aiox-ux-design-expert` reviews the placement/readability and `$aiox-qa` independently maps the story criteria to tests before this story is considered Ready for Review. OPS-15-wide QA or acceptance is not implied.

## Scope boundaries

- Do not add or rename placeholders. If implementation discovers that a documented meaning is inconsistent across the current formatter, route validation, or catalogs, stop and create a separate behavior-change decision/story rather than silently changing chat output.
- Do not change the default message, which is addressed by the active UI correction recorded in the current worktree.
- Do not claim OBS/CEF, Twitch, or persisted database behavior; this story changes frontend guidance only.

## Implementation notes

- Inspect `apps/api/src/outbox/chat-worker.mjs`, `apps/api/src/commands/chat-handler.mjs`, `apps/frontend/features/queues/new-queue-form.jsx`, and `apps/frontend/features/queues/queue-settings-form.jsx` before editing.
- Keep the panel's runtime catalog and explicit placeholder allowlist authoritative; synchronize first-party catalog discovery validation as needed.
- Suggested verification: focused form/catalog tests, `npm run validate:localization`, `npm run lint`, and `npm run typecheck`; run the project gates required by AGENTS.md before completion.

## File List

- To be populated by the implementing `$aiox-dev` when this backlog story is scheduled.

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-10-19 | Created as a standalone backlog story for explaining supported queue call-message placeholders; no implementation is included in this story artifact. | `$aiox-sm` |
