# FND-6 Operator Panel — UX Research and Interaction Brief

[Versão em português](../../pt-BR/stories/FND-6/ux-research.md)

**Research date:** 2026-10-03
**Method:** Desk research of official product documentation and the supplied product specification. No streamer interviews, usability sessions, analytics, or observations of this project in production were available. The proto-persona and design choices below are hypotheses to validate, not user research findings.

## Operator and context

The primary operator is the streamer who manages one Twitch channel from the same computer that hosts the Compose installation. During a live session, attention is split between gameplay and chat. The panel therefore needs to answer quickly: is Twitch connected, which queues are accepting redemptions, who is waiting/called/in service, and which point operations still need confirmation?

The highest-cost mistakes are an incorrect points outcome, a stale or duplicate call, exposing a UID after privacy settings change, and deleting a reward before cancellations are confirmed. The interface should show remote confirmation separately from local intent, keep recovery work visible, and make destructive effects reviewable before confirmation.

## Reference review

| Reference | Observed pattern | Application to this panel |
| --- | --- | --- |
| Twitch Creator Dashboard | A stream control surface groups tools for live operations, viewer rewards, moderation, and settings. | Prioritize live queue state and connectivity; place setup and maintenance controls away from frequent in-live actions. |
| Twitch Channel Points guide | Reward settings are managed in the Creator Dashboard; Twitch currently documents a limit of 50 custom rewards. | Show reward capacity and managed/unmanaged ownership clearly in the reward workflow. |
| Streamer.bot actions and action queues | Operational actions are grouped, and queues can be paused, blocked, or cleared. | Keep queue controls close to the queue they affect; state labels and destructive controls must remain explicit. |
| StreamElements dashboard | The dashboard presents quick navigation, service state, and a filterable activity feed with follow-up actions. | Surface recent and unresolved operations with clear status and a direct recovery action. |
| StreamElements `!queue` behavior | Chat output is bounded to five names plus a count of remaining people. | Use compact summaries in the panel and keep long histories behind a separate view. |

Sources: [Twitch Creator Dashboard](https://help.twitch.tv/s/article/creator-dashboard), [Twitch Channel Points Guide](https://help.twitch.tv/s/article/channel-points-guide), [Streamer.bot Actions](https://docs.streamer.bot/guide/actions/), [Streamer.bot Action Queues](https://docs.streamer.bot/api/sub-actions/core/action-queues), [StreamElements Dashboard Overview](https://support.streamelements.com/hc/en-us/articles/10474723554962-StreamElements-Dashboard-Overview), [StreamElements Queue Command](https://docs.streamelements.com/chatbot/commands/default/queue).

## Proposed information architecture

1. **Live overview:** Twitch/EventSub/database connection, reconciliation freshness, current account, queue state, and unresolved point operations.
2. **Queues:** waiting, called, and in-progress groups; manual add; call, attend, complete, remove, move, open/close, archive, and history.
3. **Queue setup:** reward title/cost/prompt, UID privacy, call template/timeout, limits, and remote synchronization state.
4. **Points and recovery:** requested, pending, confirmed, conflict, failed, or unknown operations; reconcile before retry when remote state is uncertain.
5. **Twitch connection:** callback instructions, app validation, OAuth, channel eligibility, scopes, token health, and reconnect.
6. **Local operations:** version, health, reconciliation time, and concise operator guidance for logs and restart.

## Key interaction flows

### First setup

Show the exact callback URL and setup instructions first. Validate Client ID/Secret with Client Credentials before saving. Never return or reveal the Secret after save. Then start session-bound OAuth, show the authorized channel identity and eligibility, and only enable reward creation after channel points capability is confirmed.

### Live queue operation

Use one queue card per queue. Put waiting count and up to five waiting entries first, followed by called and in-progress entries in distinct groups. A queue action should update local status immediately while remote point status stays labeled pending until confirmed. Calls should show “chamada enviada” only after Helix confirms delivery; failed sends remain actionable without silently extending the deadline.

### Point operation recovery

Present the viewer, queue, requested outcome, attempts, last safe error code, and next retry time. For unknown remote state, offer reconciliation and explicit operator resolution only where allowed by the product rules. Keep a permanent distinction between “solicitado” and “confirmado”.

### Privacy and destructive actions

Explain that visible UID may be shown in selected outputs. On switching to hidden, confirm that stored UIDs will be erased. Before clear or delete, summarize affected entries and point requests; require the specified same-actor/time-bound confirmation. Disable duplicate submission while a request is in progress.

## Visual and interaction direction

- Dark, low-glare surface suitable beside a game, with restrained purple for primary actions and green only for confirmed/healthy states.
- Use system fonts and local assets only; the application should not fetch third-party assets at runtime.
- Prefer readable body text and compact monospace only for IDs, slugs, version, and technical status.
- Status uses text and icon as well as color; pending, unknown, conflict, and confirmed must remain distinguishable without color perception.
- Keep the live overview responsive, keyboard-operable, and usable at narrow window widths. Confirmation dialogs must name the queue and list the consequences.
- Polling should preserve operator context and announce status changes accessibly without moving focus.

## Provisional design tokens

| Token | Value | Use |
| --- | --- | --- |
| `surface` | `#111318` | Page background |
| `surface-panel` | `#191B22` | Queue and setup panels |
| `text-primary` | `#EEEFF2` | Primary content |
| `text-muted` | `#9297A3` | Secondary details |
| `action-primary` | `#B69AFF` | Primary action and focus accent |
| `state-confirmed` | `#B6EC84` | Confirmed/healthy state with text label |
| `state-attention` | `#E6C27A` | Pending/recovery needed |
| `state-conflict` | `#E6A7A7` | Failure/conflict requiring attention |

## Validation plan and limits

Before calling the panel complete, test the flows with at least one streamer unfamiliar with the code: setup, opening a queue, removing a waiting redemption, recognizing pending versus confirmed refund, and hiding a previously visible UID. Record findings and update the design. That validation has not happened yet. The current UI is still provisional and cannot be considered the final UX review.

## TDD / implementation gate

This artifact satisfies the planning prerequisite only. It is not evidence of usability testing and does not mark FND-6 complete. API and product behavior still require tests before implementation; visual refinements must preserve the existing security, privacy, and point-operation contracts.
