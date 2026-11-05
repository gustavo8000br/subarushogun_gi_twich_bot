# OPS-22 / OPS-15 — Single UX plan and review: FT-23 + FT-36 (navigation, messages, cancel deletion)

[Português (pt-BR)](../../pt-BR/stories/OPS-22/ux-plan-ft23-ft36.md)

**Author:** `@ux-design-expert` (Uma), 2026-11-04. **Stories:** [FT-23](../OPS-15/ft-23-navigation-and-messages.md) (#103, 12 criteria), [OPS-22](story.md) (AC 15, 20, 21; FT-36 = #100; texts of FT-25 #98 and FT-26 #99). **Inputs:** [po-validation](po-validation.md) (addenda of 2026-10-30, including the Orion decision on verified cancel), [architect-review-ft36](architect-review-ft36.md) (F15-F24, D-23-1, D-36-1..8 and its addendum), [ft-36-data-engineer-confirmation](ft-36-data-engineer-confirmation.md), [front-end architecture](../../front-end-architecture.md), [OPS-20 UX plan](../OPS-20/ux-plan.md) (model and vocabulary).
**Nature:** planning gate only. No code, catalog or style was changed. Code facts come from a read-only reading of `apps/frontend/features/queues/{queue-lifecycle-actions.jsx, queue-lifecycle.mjs, new-queue-form.jsx, queue-list.jsx, queues-page-content.jsx, new-queue-page-content.jsx}`, `features/panel-shell/{panel-shell.jsx, panel-provider.jsx}`, `apps/shared/panel/queue-confirmation-copy.mjs`, `apps/frontend/styles/panel.css` and `apps/shared/localization/catalogs/panel/{en,es,pt-BR}.tsv`. No internet was used.

## 0. Gate result

**Score: 9.1/10 — static review of code, text and documents only. Gate: PASS (>= 9.0) for the scope in section 9.**

**Not covered by this score (NOT done):** visual rendering (layout, contrast measured on real pixels, sticky region, 320 px reflow), real browser behavior (focus after a full document load, native `<dialog>`), assistive technology (NVDA/JAWS/VoiceOver/TalkBack: whether the status message and the focused title are both announced and in which order), a reading test with streamers. These four are separate evidence classes; none of them can be inferred from this review. Section 7 lists what only they can prove.

The score is conditional on the eight implementation requirements in section 8 (R1-R8). They are not new scope: they are defects of the current code or catalog that this plan found, and the texts below replace them.

## 1. Baseline (what exists today)

| Fact | Evidence |
|---|---|
| The delete and cancel notice is card-local `useState`; it dies with the card (defect D-3). | `queue-lifecycle-actions.jsx:13, 50-66, 99-104` |
| `PanelProvider` is mounted per page; navigation is `<a>`; the create feedback lives in `NewQueueForm` and is not carried to `/queues` (D-4). | `panel-shell.jsx:164-166`, `new-queue-form.jsx` (feedback block) |
| `PanelShell` has `role="status"` only for loading and overview refresh; no persistent outcome region. | `panel-shell.jsx:90-104` |
| The queue title is an `<h2 id="queue-title-<id>">` without `tabindex`, so it cannot receive programmatic focus. The page `<h1>` also has no `tabindex`. | `queue-list.jsx:342`, `queues-page-content.jsx:11`, `new-queue-page-content.jsx:11` |
| The delete/cancel dialog is a native `<dialog>` with the generic title "Confirm action" and the buttons "Cancel" / "Confirm". For "Cancel deletion" this gives the pair "Cancel" (dismiss) and "Confirm" (cancel the deletion): a double negative. | `queue-lifecycle-actions.jsx:105-112`, `panel.confirmation.title`, `panel.dialog.*` |
| The visible "Cancel deletion" button comes from a client heuristic on `remoteSyncStatus`, not from the server rule (F17). | `queue-action-state.mjs:33-36` |
| `panel.queue.delete.done` says "the Twitch reward remains paused" and `panel.queue.delete.pending` says "Local deletion started ... reward untouched". Both are true only for local and converted-manual queues. For a Channel Points queue the reward is deleted. | catalogs, lines 536-537 (pt-BR) |
| The failure mapper knows 5 codes of cancel (`NOT_PENDING`, `CANCELLATION_STALE`, `REWARD_OPERATION_PROCESSING`, `CANCELLATION_UNVERIFIED`, `QUEUE_NOT_FOUND`) and the `already_deleted` status from a 200. The 3 new codes and 2 new reasons have no text. | `queue-lifecycle.mjs:10-30`, `queue-lifecycle-actions.jsx:55-61` |
| The notice text is 12 px (`.queue-action-feedback`) and status colors are tuned for a dark surface. Contrast was not measured. | `panel.css:282-285` |
| Motion is already gated: `@media (prefers-reduced-motion: no-preference)` only. `:focus-visible` has a 2 px purple outline. | `panel.css:21, 349` |
| Existing create results already cover the useful cases: `creation_result.created_local / pending / review / recovered / uncertain / open_queues`. | catalogs lines 289-297 (pt-BR) |

## 2. Principles applied

1. **Never confirm without a positive read.** "Deleted" only when the API returned `deleted`; "cancelled" only for `status: cancelled`; "created" never says the Twitch reward works.
2. **Say what happened to the points and the people**, not Twitch states: entries removed, refunds *requested* (never "returned" before Twitch confirms), reward paused or deleted.
3. **Say what is irreversible where it is chosen**: in the delete dialog, in the cancel dialog and in the result.
4. **One message channel.** Every result of create, delete and cancel goes to one persistent region; nothing lives in a component that can unmount.
5. **Every message that asks for an action offers it** (refresh, Operations, Connection). No dead ends.
6. **Reuse before adding.** Most keys are reused or amended in place; only the new keys of section 4.2 (25, plus `panel.queue.confirm.delete.one`, see the counts note) are added.
7. **One term per concept**, following the existing catalogs: pt-BR "fila", "recompensa" (new text does not use the English "reward"), "exclusão", "devolução de pontos", "espectadores"; en "queue", "reward", "deletion", "points refund", "viewers"; es "cola", "recompensa", "eliminación", "devolución de puntos", "espectadores". es uses the informal "tú" as in the current catalog.

## 3. Flows and states

### 3.1 Outcome channel (shared by every flow)

- **One persistent container** at the top of `<main>` (above the page heading) in `PanelShell`, rendered on every page and on every `status` value (loading, ready, unavailable). It holds **two live elements that are always mounted, empty at first render**: `role="status"` (polite) and `role="alert"` (assertive). A message is written into exactly one of them; the other is emptied. Reason: changing `role` on an element that already holds text is not reliably announced; a live region must exist before its content changes. (This refines FT-23 AC 1, which says "one `role="status"` region (errors in `role="alert"`)": same intent, two stable elements. `@po` acknowledges the wording, see 8-R4.)
- **Which element:** `alert` = the requested change did **not** happen (any 4xx refusal, `not_cancelled`, network failure, uncertain result). `status` = created, deleted, deletion pending, cancelled, refreshed.
- **Content:** one sentence block (state first, consequence second), optional `referenceId` line (`panel.error.reference`, same validation regex as today), optional one action (button or link), and a dismiss button. The dismiss button and the action are **outside** the live elements, in the same container, so they are not re-read on every update.
- **Lifetime:** a message stays until (a) a new outcome replaces it, (b) the user dismisses it, (c) the page changes. No auto-dismiss (nothing disappears on a timer; WCAG 2.2.1).
- **Writing the message:** on a freshly loaded document the effect that applies the outcome runs after the first render, so the live elements already exist and are empty. The text is set in that effect, never in the initial markup.
- **Size and contrast:** body text >= 14 px (R8), contrast >= 4.5:1 against the region background, state never carried by color alone (the first words of every message name the state: "Deletion pending.", "Deletion blocked.", "Deletion cancelled.").
- **Position:** `position: sticky` at the top of the scrolling area so that the message stays visible when focus moves to a queue title far down the list. Validated visually only (section 7).

### 3.2 Create a queue (D-4)

| Step | Behavior |
|---|---|
| Submit | Existing form. Button shows "Saving…" and is disabled while saving (already true). |
| API confirms the creation (`created`, `pending`, `review`, `recovered`) | Navigate with `navigateTo('/queues/?outcome=<code>&queue=<uuid>')`. The form is not reset on the old page (the page is leaving). |
| API result is `uncertain` (no confirmation) | **Do not navigate.** Stay on the form with the existing `creation_result.uncertain` in the `alert` element and the existing link "Open queues". Submit stays disabled (already true) so a second click cannot create a duplicate. |
| Validation or key conflict (`key_conflict`, invalid input) | Stay on the form; existing field and `creation_result.key_conflict` messages; focus rules unchanged. |
| Arrival on `/queues/` | The provider reads `window.location.search` in an effect, validates, sets `panelOutcome`, removes both parameters with `history.replaceState`, and after the projection is ready moves focus (3.7). |

**Codes (closed list) and messages for create** (code to key; the neutral channel-points text never says Twitch worked):

| URL `outcome` | When | Key | Element |
|---|---|---|---|
| `queue_created` | Channel Points queue created (any Twitch state; the card shows the real one) | **new** `panel.outcome.created.channel_points` | status |
| `queue_created_local` | manual-only queue | `panel.queue.creation_result.created_local` (reuse) | status |
| `queue_created_pending` | reward creation awaiting Twitch confirmation | `panel.queue.creation_result.pending` (reuse) | status |
| `queue_created_review` | queue exists, Twitch sync needs review | `panel.queue.creation_result.review` (reuse) | status |
| `queue_created_recovered` | a matching queue was found after an interrupted response | `panel.queue.creation_result.recovered` (reuse) | status |

`[AUTO-DECISION]` Should the existing `creation_result.created_remote` ("Queue created and Twitch reward synchronized") also be carried across the navigation? → **No.** Reason: FT-23 AC 2 says the message must not promise that Twitch succeeded, and the page the user lands on shows the true state on the card. The key stays in use only for the in-form feedback that already exists.

### 3.3 Delete a queue (D-3)

Confirmation (native `<dialog>`, R5):

- Title (specific, not "Confirm action"): "Delete the queue “{title}”?"
- Body, Channel Points queue: what is removed (count with plural), refunds *requested*, reward deleted only after every refund is confirmed, can stay pending, **removed entries do not come back even if the deletion is cancelled later**.
- Buttons: "Back" (first in DOM, receives focus, Escape = Back) and "Delete queue" (`button-danger`). While the request runs, both are disabled and the accept button reads "Saving…". The dialog closes only when the result arrives.
- Local and converted queues keep their current body (amended for plural count only). They have no cancel path, so they do not carry the "do not come back" sentence.

**Results, by API result and queue type** (messages in section 4):

| API result | Queue type | Where | Message key | Element | Action in region |
|---|---|---|---|---|---|
| `deleted`, queues remain | Channel Points | stay on `/queues/` | `panel.outcome.deleted.reward` | status | none |
| `deleted`, queues remain | local (no reward) | stay | `panel.outcome.deleted.local` | status | none |
| `deleted`, queues remain | converted manual | stay | `panel.queue.delete.done` (reuse; true for this type) | status | none |
| `deleted`, **last queue** | any | navigate to `/new-queue/?outcome=queue_deleted_last_<type>&queue=<uuid>`, type in `reward`, `local`, `converted` | same three keys as above | status | none |
| `pending` | Channel Points | stay | `panel.outcome.delete_pending.reward` | status | "Refresh queues" |
| `pending` | local or converted | stay | `panel.queue.delete.pending` (reuse) | status | "Refresh queues" |
| `blocked` | any | stay; **not** a one-time message: a persistent line on the card from the projection (`deletionState = blocked`), see below | `panel.queue.deletion.blocked.*` | card line (not a live announcement) plus the region message when the state is first read after an action | link to the Operations page |
| error 4xx / unknown | any | stay | existing `panel.error.generic` + reference when present | alert | none |
| network, 5xx, invalid response | any | stay | `panel.queue.action_result.uncertain` (reuse) | alert | "Refresh queues" |

- A delete that leaves the queue in `deleting` keeps the card on screen; the card shows the existing `panel.queue.status.pending_delete` line (reuse) and the button "Cancel deletion" only when the **server** says `canCancelDeletion` (R2).
- **Deletion pending** never uses success wording ("deleted", "done", "removed from Twitch"). **Deletion blocked** shows the count of blocking operations (plural keys), the reason when known, and a link to Operations. An unknown `blockReason` falls back to the generic blocked text; the raw code is never shown.
- **Pending is not live** (FT-23 AC 9): the region message and the card state are those of the last projection. The "Refresh queues" action reloads the projection (`refreshQueueProjection`) and, on success, replaces the message with `panel.outcome.refreshed` in the status element. Live updates stay with OPS-23.
- **Manual resolution** (FT-26): the card line is a count, the resolution itself happens on Operations with the existing `panel.operation.action.resolve` and `panel.operation.confirm.resolve` (they already say it does not confirm a refund or a fulfillment). Section 3.6 adds only what is missing.

### 3.4 Cancel a deletion (FT-36)

**Visibility:** the button "Cancel deletion" exists only when the server projection says `canCancelDeletion` (R2). While `cancellationInProgress` is true, the card shows `panel.queue.deletion.cancelling` and the button stays available (repeating it resumes the read; it is idempotent by design, F15/§1.2).

**Confirmation dialog** (replaces `panel.queue.confirm.cancel_delete`; three short paragraphs instead of one long block, each with an `id` listed in `aria-describedby`):

1. What the app does: reads the exact reward on Twitch and cancels only if it exists and is paused. If Twitch cannot confirm, nothing changes.
2. If it works: the queue returns **hidden from viewers and closed**; the reward **stays paused** until you show the queue to viewers and open it again; those two actions are yours.
3. What does not come back: the people who were in the queue were already removed and **do not return**; refunds already requested **keep going and are not undone**; nothing is erased.

Buttons: "Back" (default focus, Escape) and "Cancel deletion" (primary, not danger: it is the safe direction, but it is not trivially reversible, so it keeps a specific verb instead of "Confirm"/"OK").

**Results** (all in the region; `status` = change happened, `alert` = it did not):

| API | Code or reason | Key | Element | Action |
|---|---|---|---|---|
| 200 `cancelled` | — | `panel.queue.delete.cancelled` (amended text) | status | none |
| 200 `not_cancelled` | `queue_delete_reward_absent` | `panel.queue.delete.cancel.reward_absent` (reuse) | alert | Operations link |
| 200 `not_cancelled` | `queue_delete_reward_diverged` | `panel.queue.delete.cancel.reward_diverged` (reuse) | alert | Operations link |
| 200 `not_cancelled` | `queue_delete_cancel_reward_not_paused` | **new** `panel.queue.delete.cancel.reward_not_paused` | alert | Operations link |
| 200 `not_cancelled` | `queue_deletion_cancel_verification_unavailable` | `panel.queue.delete.cancel.unverified` (reuse) | alert | "Cancel deletion" stays on the card to try again |
| 200 `not_cancelled` | `authorization_required` | **new** `panel.queue.delete.cancel.authorization_required` | alert | link to the Twitch connection page (`panel.navigation.connection`) |
| 200 `not_cancelled` | any other reason | `panel.queue.delete.cancel.unverified` (reuse; true: it was not cancelled) | alert | — |
| 409 | `QUEUE_DELETION_ALREADY_COMPLETED` | `panel.queue.delete.cancel.already_deleted` (reuse; mapped from the **code**, not from a 200 status, R6) | alert | "Refresh queues" |
| 409 | `QUEUE_DELETION_PAUSE_IN_PROGRESS` | **new** `panel.queue.delete.cancel.pause_in_progress` | alert | "Cancel deletion" stays; message says to wait a few seconds |
| 409 | `QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED` | **new** `panel.queue.delete.cancel.remote_delete_attempted` | alert | Operations link |
| 409 | `QUEUE_REWARD_OPERATION_PROCESSING` | `panel.queue.delete.cancel.processing` (reuse) | alert | "Refresh queues" |
| 409 | `QUEUE_DELETION_NOT_PENDING`, `QUEUE_DELETION_CANCELLATION_STALE` | `panel.queue.delete.cancel.stale` (reuse) | alert | "Refresh queues" |
| 409 | `QUEUE_DELETION_CANCELLATION_UNVERIFIED` | `panel.queue.delete.cancel.unverified` (reuse) | alert | — |
| 404 | `QUEUE_NOT_FOUND` | `panel.error.queue_not_found` (reuse) | alert | "Refresh queues" |
| 400, unknown code | — | `panel.error.generic` (+ reference) | alert | — |
| network, 5xx, invalid response | — | `panel.queue.delete.cancel.uncertain` (reuse, with `referenceId`) | alert | "Refresh queues" |

Rules that keep the copy honest:

- **No refusal text says the queue is safe or reopened.** Each says the deletion was not cancelled (or what is still pending).
- `remote_delete_attempted` says the DELETE **may** have reached Twitch and the read did not prove the reward; it does not say it was deleted.
- After a successful cancel the card shows a queue that is archived, closed, with a paused reward: the card's own state line and the existing buttons "Show to viewers" and "Open" are the next step. The cancel message names the order (show, then open) without quoting the button labels, so a future label change does not make the text false.
- The mapping is by `code`/`reason` only. The Portuguese `error` sentences of the API are never rendered (architect §1.5).

### 3.5 Delete the last queue (destination)

`resolvePostActionRoute` returns `/new-queue/` only when the projection after the delete holds **no queue that is not `deleted`**. A `pending` or `blocked` last queue stays on `/queues/` (the queue still exists and still needs action). On `/new-queue/` the message is the one of 3.3 ("deleted" variants), the `h1` receives focus (there is no queue title), and the form is untouched and empty. The empty `/queues/` state (`panel.queue.empty.title`) is reached only by direct navigation and keeps its current text.

### 3.6 Texts of FT-25 and FT-26 that live in the same screens

Only the strings that the `@po` listed. Everything else on Operations is reused.

| Need | Reuse | New |
|---|---|---|
| Deletion pending line on the card | `panel.queue.status.pending_delete` | — |
| Deletion blocked: N operations need review | — | `panel.queue.deletion.blocked.{one,many,other}`, `.generic`, `panel.queue.deletion.blocked_link` |
| Operation that blocks a deletion (Operations row tag) | `panel.operation.status.*` | `panel.operation.blocks_deletion` |
| Terminal state after 6 attempts (`attempts_exhausted`) | `panel.operation.status.unknown` | `panel.operation.attempts_exhausted` (what happened, that nothing was confirmed, that "Reconcile / retry" starts a new cycle of 6) |
| Manual resolution | `panel.operation.action.resolve`, `panel.operation.confirm.resolve` | `panel.operation.manual_contradicted` (the re-list still shows it open, tracking was re-armed) |
| Retry now (fresh cycle) | `panel.operation.action.retry` | covered by `attempts_exhausted` |
| Cancel verification in progress | `panel.operation.status.cancel_verification` | — |

### 3.7 Focus after navigation, confirmation and dismissal

| Situation | Focus goes to | Fallback |
|---|---|---|
| Arrive at `/queues/` after create | `queue-title-<uuid>` (`h2`, `tabindex="-1"`), scrolled into view without smooth scrolling under `prefers-reduced-motion` | page `h1` (`tabindex="-1"`) when the UUID is not in the projection |
| Arrive at `/new-queue/` after deleting the last queue | page `h1` | — |
| Dialog opens | "Back" button (first focusable; native `showModal`) | — |
| Dialog closes by Back, Escape or Cancel | the invoking button (native) | if the invoker is gone (the card changed state), the queue title `h2`; if the card is gone, the page `h1` |
| Action finished (delete pending, cancelled, refused) | the invoker if it still exists; else the queue title; else the `h1` | as left |
| Dismiss pressed | page `h1` | — |
| "Refresh queues" pressed | stays on the button; the projection refresh replaces the message with `panel.outcome.refreshed` | if the button is removed, `h1` |

Focus is moved **after** the message is written and after the projection is ready. It never moves while the user is typing in another field (the only case today is the `/new-queue` form, where nothing moves focus).

## 4. Microcopy (en, es, pt-BR) with catalog keys

Conventions: `{title}`, `{count}`, `{id}` follow the existing placeholders; plural keys use `.one`, `.many`, `.other` (pt-BR needs `.many`, as `panel.reconciliation.complete.*` already does). **Reused unchanged:** `panel.queue.creation_result.{created_local,pending,review,recovered,uncertain,open_queues}`, `panel.queue.status.pending_delete`, `panel.queue.delete.pending`, `panel.queue.delete.done`, `panel.queue.delete.cancel.{already_deleted,reward_absent,reward_diverged,unverified,stale,processing,uncertain}`, `panel.queue.action.{delete,cancel_delete}`, `panel.queue.action_result.{saving,uncertain}`, `panel.error.{generic,reference,queue_not_found}`, `panel.navigation.connection`, `panel.operation.*` (status, action and confirm keys).

### 4.1 Amended existing keys (same key, new text)

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.queue.confirm.delete` (Channel Points; plural on `{count}`: `.one`, `.many`, `.other`; shown `.other` form) | Delete the queue “{title}” and its Twitch reward? {count} active entries will be removed and a points refund will be requested for each redemption. The reward is deleted only after every refund is confirmed, and Twitch may leave it pending. Removed entries do not come back, even if you cancel the deletion later. | ¿Eliminar la cola “{title}” y su recompensa de Twitch? Se quitarán {count} entradas activas y se solicitará la devolución de puntos de cada canje. La recompensa se elimina solo cuando se confirme cada devolución, y Twitch puede dejarla pendiente. Las entradas quitadas no vuelven, aunque canceles la eliminación más adelante. | Excluir a fila “{title}” e a recompensa dela na Twitch? {count} entradas ativas serão removidas e a devolução dos pontos de cada resgate será solicitada. A recompensa só é excluída depois que cada devolução for confirmada, e a Twitch pode deixá-la pendente. As entradas removidas não voltam, mesmo que você cancele a exclusão depois. |
| `panel.queue.confirm.delete.one` (singular; `.many` and `.other` carry the text above) | Delete the queue “{title}” and its Twitch reward? {count} active entry will be removed and a points refund will be requested for its redemption. The reward is deleted only after every refund is confirmed, and Twitch may leave it pending. Removed entries do not come back, even if you cancel the deletion later. | ¿Eliminar la cola “{title}” y su recompensa de Twitch? Se quitará {count} entrada activa y se solicitará la devolución de puntos de su canje. La recompensa se elimina solo cuando se confirme cada devolución, y Twitch puede dejarla pendiente. Las entradas quitadas no vuelven, aunque canceles la eliminación más adelante. | Excluir a fila “{title}” e a recompensa dela na Twitch? {count} entrada ativa será removida e a devolução dos pontos do resgate será solicitada. A recompensa só é excluída depois que cada devolução for confirmada, e a Twitch pode deixá-la pendente. As entradas removidas não voltam, mesmo que você cancele a exclusão depois. |
| `panel.queue.confirm.cancel_delete` (paragraph 1) | Cancel the deletion of “{title}”? The app reads the exact reward on Twitch and cancels only if it exists and is paused. If Twitch cannot confirm it, nothing changes and the deletion stays as it is. | ¿Cancelar la eliminación de “{title}”? La aplicación lee la recompensa exacta en Twitch y cancela solo si existe y está pausada. Si Twitch no puede confirmarlo, no cambia nada y la eliminación sigue como está. | Cancelar a exclusão de “{title}”? O app lê a recompensa exata na Twitch e só cancela se ela existir e estiver pausada. Se a Twitch não puder confirmar, nada muda e a exclusão continua como está. |
| `panel.queue.delete.cancelled` | Deletion cancelled. Twitch confirmed that the reward exists and is paused. The queue is closed and hidden from viewers, and the reward stays paused until you show the queue to viewers and open it again. The people who were in the queue were removed and do not come back; refunds already requested keep going. | Eliminación cancelada. Twitch confirmó que la recompensa existe y está pausada. La cola queda cerrada y oculta para los espectadores, y la recompensa sigue pausada hasta que muestres la cola a los espectadores y la abras de nuevo. Las personas que estaban en la cola ya se quitaron y no vuelven; las devoluciones ya solicitadas continúan. | Exclusão cancelada. A Twitch confirmou que a recompensa existe e está pausada. A fila fica fechada e oculta dos espectadores, e a recompensa continua pausada até você mostrar a fila aos espectadores e abri-la de novo. As pessoas que estavam na fila foram removidas e não voltam; as devoluções de pontos já solicitadas continuam. |

Why the amendments: the current `cancelled` text says refund requests "were preserved" but not that entries stay removed (architect I3 and FT-23 risk list require it) and does not say how the reward becomes usable again (D-36-1). The current `confirm.delete` has no mention of the irreversibility of removed entries and uses "{count} entradas" without singular.

### 4.2 New keys

| Key | en | es | pt-BR |
|---|---|---|---|
| `panel.outcome.created.channel_points` | Queue created. The Twitch reward status appears on the card below; check it before sharing the command with viewers. | Cola creada. El estado de la recompensa de Twitch aparece en la tarjeta de abajo; revísalo antes de compartir el comando con los espectadores. | Fila criada. O estado da recompensa na Twitch aparece no cartão abaixo; confira antes de divulgar o comando aos espectadores. |
| `panel.outcome.deleted.reward` | Queue deleted. Twitch confirmed that the reward was deleted. Redemption history was kept. | Cola eliminada. Twitch confirmó que la recompensa se eliminó. Se conservó el historial de canjes. | Fila excluída. A Twitch confirmou que a recompensa foi excluída. O histórico dos resgates foi preservado. |
| `panel.outcome.deleted.local` | Queue deleted. It had no Twitch reward. History was kept. | Cola eliminada. No tenía recompensa de Twitch. Se conservó el historial. | Fila excluída. Ela não tinha recompensa na Twitch. O histórico foi preservado. |
| `panel.outcome.delete_pending.reward` | Deletion pending. Twitch has not confirmed it yet. Active entries were removed and points refunds were requested; the reward is deleted only after every refund is confirmed. Refresh to see the current state. | Eliminación pendiente. Twitch aún no la ha confirmado. Se quitaron las entradas activas y se solicitó la devolución de puntos; la recompensa se elimina solo cuando se confirme cada devolución. Actualiza para ver el estado actual. | Exclusão pendente. A Twitch ainda não confirmou. As entradas ativas foram removidas e a devolução dos pontos foi solicitada; a recompensa só é excluída depois que cada devolução for confirmada. Atualize para ver o estado atual. |
| `panel.queue.deletion.blocked.one` | Deletion blocked: {count} operation needs your review before it can continue. | Eliminación bloqueada: {count} operación necesita tu revisión para continuar. | Exclusão bloqueada: {count} operação precisa da sua revisão para continuar. |
| `panel.queue.deletion.blocked.many` / `.other` | Deletion blocked: {count} operations need your review before it can continue. | Eliminación bloqueada: {count} operaciones necesitan tu revisión para continuar. | Exclusão bloqueada: {count} operações precisam da sua revisão para continuar. |
| `panel.queue.deletion.blocked.generic` | Deletion blocked: Twitch has not confirmed a step. Review the operations or cancel the deletion. | Eliminación bloqueada: Twitch no ha confirmado un paso. Revisa las operaciones o cancela la eliminación. | Exclusão bloqueada: a Twitch não confirmou uma etapa. Revise as operações ou cancele a exclusão. |
| `panel.queue.deletion.blocked_link` | Review the operations | Revisar las operaciones | Revisar as operações |
| `panel.queue.deletion.cancelling` | Checking the reward on Twitch to cancel the deletion. If this takes long, use Cancel deletion again to resume. | Comprobando la recompensa en Twitch para cancelar la eliminación. Si tarda, usa Cancelar eliminación de nuevo para continuar. | Verificando a recompensa na Twitch para cancelar a exclusão. Se demorar, use Cancelar exclusão de novo para retomar. |
| `panel.queue.confirm.cancel_delete_if_ok` (paragraph 2) | If it works, the queue goes back hidden from viewers and closed. The reward stays paused until you show the queue to viewers and open it again; both steps are yours. | Si funciona, la cola vuelve oculta para los espectadores y cerrada. La recompensa sigue pausada hasta que muestres la cola a los espectadores y la abras de nuevo; ambos pasos son tuyos. | Se der certo, a fila volta oculta dos espectadores e fechada. A recompensa continua pausada até você mostrar a fila aos espectadores e abri-la de novo; os dois passos são seus. |
| `panel.queue.confirm.cancel_delete_not_restored` (paragraph 3) | The people who were in the queue were already removed and do not come back. Refunds already requested keep going and are not undone. Nothing is erased. | Las personas que estaban en la cola ya se quitaron y no vuelven. Las devoluciones ya solicitadas continúan y no se deshacen. No se borra nada. | As pessoas que estavam na fila já foram removidas e não voltam. As devoluções de pontos já solicitadas continuam e não são desfeitas. Nada é apagado. |
| `panel.queue.dialog.title.delete` | Delete the queue “{title}”? | ¿Eliminar la cola “{title}”? | Excluir a fila “{title}”? |
| `panel.queue.dialog.title.cancel_delete` | Cancel the deletion of “{title}”? | ¿Cancelar la eliminación de “{title}”? | Cancelar a exclusão de “{title}”? |
| `panel.queue.dialog.back` | Back | Volver | Voltar |
| `panel.queue.delete.cancel.reward_not_paused` | Cancellation was not confirmed because the Twitch reward is not paused. For safety the queue was not reopened and the deletion continues. Review the reward on Twitch or the operations. | No se confirmó la cancelación porque la recompensa de Twitch no está pausada. Por seguridad la cola no se reabrió y la eliminación continúa. Revisa la recompensa en Twitch o las operaciones. | O cancelamento não foi confirmado porque a recompensa na Twitch não está pausada. Por segurança a fila não foi reaberta e a exclusão continua. Revise a recompensa na Twitch ou as operações. |
| `panel.queue.delete.cancel.authorization_required` | Twitch refused the authorization, so the reward could not be read and the deletion was not cancelled. Reconnect the channel on the Twitch connection page and try again. | Twitch rechazó la autorización, así que no se pudo leer la recompensa y la eliminación no se canceló. Reconecta el canal en la página de conexión de Twitch e inténtalo de nuevo. | A Twitch recusou a autorização, então a recompensa não pôde ser lida e a exclusão não foi cancelada. Reconecte o canal na página Conexão Twitch e tente de novo. |
| `panel.queue.delete.cancel.pause_in_progress` | The reward is still being paused on Twitch, so the deletion was not cancelled yet. Wait a few seconds and try again. | La recompensa aún se está pausando en Twitch, así que la eliminación todavía no se canceló. Espera unos segundos e inténtalo de nuevo. | A recompensa ainda está sendo pausada na Twitch, então a exclusão ainda não foi cancelada. Aguarde alguns segundos e tente de novo. |
| `panel.queue.delete.cancel.remote_delete_attempted` | The request to delete the reward may already have reached Twitch, and the read did not confirm that the reward exists and is paused. For safety the deletion was not cancelled. Let it finish or review the operations. | La solicitud para eliminar la recompensa puede haber llegado ya a Twitch, y la lectura no confirmó que exista y esté pausada. Por seguridad no se canceló la eliminación. Déjala terminar o revisa las operaciones. | O pedido para excluir a recompensa pode já ter chegado à Twitch, e a leitura não confirmou que ela existe e está pausada. Por segurança a exclusão não foi cancelada. Deixe-a terminar ou revise as operações. |
| `panel.outcome.dismiss` | Dismiss message | Descartar el mensaje | Dispensar a mensagem |
| `panel.outcome.action.refresh` | Refresh queues | Actualizar colas | Atualizar filas |
| `panel.outcome.refreshed` | Queues refreshed. | Colas actualizadas. | Filas atualizadas. |
| `panel.operation.blocks_deletion` | Blocks the deletion of “{title}” | Bloquea la eliminación de “{title}” | Bloqueia a exclusão de “{title}” |
| `panel.operation.attempts_exhausted` | Automatic attempts ended and Twitch confirmed nothing. Use Reconcile / retry to start a new cycle of 6 attempts, or record a manual resolution. | Los intentos automáticos terminaron y Twitch no confirmó nada. Usa Reconciliar / reintentar para iniciar un nuevo ciclo de 6 intentos, o registra una resolución manual. | As tentativas automáticas terminaram e a Twitch não confirmou nada. Use Reconciliar / tentar novamente para iniciar um novo ciclo de 6 tentativas, ou registre uma resolução manual. |
| `panel.operation.manual_contradicted` | Twitch still lists this redemption as open after your manual resolution, so automatic tracking was resumed. | Twitch sigue listando este canje como abierto tras tu resolución manual, así que se reanudó el seguimiento automático. | A Twitch ainda lista este resgate como aberto depois da sua resolução manual, então o acompanhamento automático foi retomado. |

Counts: 3 amended keys (`confirm.delete` now in the three plural forms, `confirm.cancel_delete`, `delete.cancelled`) and 26 new keys (the 25 of section 4.2, including the 3 plural forms of `blocked`, plus `panel.queue.confirm.delete.one`, which does not exist yet and is created with the amended plural forms of `confirm.delete`; the `@dev` reconciles the final list against the catalog; corrected by the `@qa` count of 2026-11-04), all with en, es and pt-BR. Placeholders `{title}` and `{count}` must be registered for each new key in the placeholder maps (`apps/shared/panel/panel-catalog.mjs` and `apps/shared/localization/discover-catalog-module.mjs`, where `panel.queue.confirm.delete` is registered today), or `npm run validate:localization` fails.

`[AUTO-DECISION]` Cancel button style in the cancel dialog: primary, not danger. Reason: cancelling a deletion moves toward the safe state; the danger style stays on "Delete queue".
`[AUTO-DECISION]` Plural of `{count}` entries in the delete dialog uses plural keys. Reason: the current text prints "1 entradas".

## 5. Accessibility

| Area | Requirement |
|---|---|
| Live regions | Two stable elements (`role="status"`, `role="alert"`), always mounted, empty before first message; the message is a single text node replaced, `aria-atomic="true"`. Dismiss and action controls are outside the live elements. |
| No double announcements | One message at a time; the previous one is cleared first. The loading `status-card` and the overview refresh notices keep their own elements and are not reused. |
| Focus | Section 3.7. All programmatic focus targets carry `tabindex="-1"` and a visible `:focus-visible` outline (existing 2 px purple, offset 3 px); never `tabindex` > 0. After a full document load, focus is set once, after the message. |
| Dialog | Native `<dialog>` with `showModal()`, `aria-modal="true"`, `aria-labelledby` = the specific title, `aria-describedby` = the paragraph ids. Escape closes (= Back). Tab stays inside. The accept button is disabled while the request runs; the close handler resets the pending action only after the result. |
| Keyboard | Every control (dismiss, refresh, Operations link, Connection link, dialog buttons) reachable and operable with Tab, Enter and Space. No keyboard trap. No new shortcut. |
| Contrast and size | Text >= 14 px, >= 4.5:1; state words in the text, never color alone; controls >= 44 px (the OPS-20 target). Not measured here (section 7). |
| Reflow | The region wraps at 320 px width and 400 percent zoom without horizontal scroll; sticky position must not cover the focused title (scroll-margin on focus targets). |
| Reduced motion | No animation on the region. Any fade or slide exists only inside `@media (prefers-reduced-motion: no-preference)` (the pattern already used in `panel.css`). Scrolling to the title uses the default behavior, not `smooth`, when reduce is set. |
| Screen readers | The first words of each message name the state ("Deletion pending.", "Deletion blocked.", "Deletion cancelled."). Links say what they open ("Review the operations"). The `referenceId` is a separate line (`<small>`), read after the message. |
| Language | The region inherits the page `lang`; catalog text is already localized per `localeState`. |

## 6. Loading, empty, error and slow-API states

| State | Behavior |
|---|---|
| Loading (`status = loading`) | The outcome container is already mounted. A parsed URL outcome is written at once and the parameters removed at once; focus moves when the projection is ready. The existing loading `status-card` stays. |
| API unavailable (`status = unavailable`) | The existing `role="alert"` error card shows; the outcome message may sit above it (it is accurate: the queue was created or deleted). Focus does not move to a missing queue title. |
| Empty | `/queues/` with no queue keeps `panel.queue.empty.title`. A created UUID that is not in the projection falls back to the `h1`; the message still shows. |
| Invalid URL | Unknown code or malformed UUID: no message, no focus change, parameters removed, nothing reflected (FT-23 AC 6). |
| Mutation in flight | Dialog stays open, buttons disabled, accept shows "Saving…" (`panel.queue.action_result.saving`). No timeout exists today. |
| **Slow or hanging API** | The read timeout with `AbortSignal` is **FT-44, entered into OPS-23 AC (FT-29)** and is **out of scope here**. Dependency recorded: until FT-44, a hanging mutation leaves the dialog in "Saving…" and a hanging read leaves the loading card. This plan adds no timeout, no retry loop and no "assume success" path. A timeout of a mutation must end in the uncertain message above, never in a success or a blind retry (OPS-21). |
| Uncertain mutation | `panel.queue.action_result.uncertain` / `panel.queue.delete.cancel.uncertain` (alert) with "Refresh queues"; the create form stays disabled, so no duplicate is created. |
| Pending never live | Section 3.3. |

## 7. Verifiable acceptance criteria and evidence classes

### 7.1 UX criteria testable by automated tests

| # | Criterion | Class |
|---|---|---|
| UX-1 | `PanelShell` renders one container with one `role="status"` and one `role="alert"` element, both empty at first render and on every `status` value. | Component |
| UX-2 | After a delete result and after the card unmounts, the message is still in the region. | Component |
| UX-3 | Refusals and `not_cancelled` go to `alert`; created, deleted, pending, cancelled and refreshed go to `status`. | Unit (mapper) + component |
| UX-4 | The mapper covers every row of the 3.4 table: each `code`/`reason` returns the listed key, an unknown `code` returns `panel.error.generic`, an unknown `reason` returns `unverified`, and no API `error` free text is ever rendered. | Unit |
| UX-5 | `resolvePostActionRoute` returns `/new-queue/` only when no non-`deleted` queue remains; pending and blocked last queues stay on `/queues/`; unknown outcome returns `null`. | Unit |
| UX-6 | URL parser: closed code list (the 5 create codes and the 3 `queue_deleted_last_*`), UUID pattern, unknown ignored, both parameters removed with `replaceState`, nothing reflected. Mutation proof: render the raw `outcome` and this test fails. | Unit + `@qa` mutation |
| UX-7 | An `uncertain` create result does not navigate and keeps the submit disabled. | Component |
| UX-8 | No success wording on `pending`: the key for `pending` is never one of the `deleted.*` or `done` keys. | Unit |
| UX-9 | The Cancel deletion button is shown only from the server flag `canCancelDeletion`; while `cancellationInProgress`, the card shows `panel.queue.deletion.cancelling`. | Component |
| UX-10 | The dialog has a specific title, `Back` first in DOM order, `aria-labelledby` and `aria-describedby` pointing to existing ids, the accept button disabled while saving, and three description paragraphs for cancel (including the "do not come back" one). | Component |
| UX-11 | Focus targets exist and are programmatically focusable (`tabindex="-1"` on the queue title and on both page `h1`); focus helper falls back to `h1` when the UUID is absent. | Component |
| UX-12 | Every new key exists in en, es and pt-BR with the same placeholders; plural keys `.one/.many/.other` exist where listed; `npm run validate:localization` and the parity tests pass. | Localization |
| UX-13 | No new `window.location` use outside `navigateTo`. | Unit / static |
| UX-14 | Chromium E2E with fixtures (approved text only): create then `/queues/` with focus on the new title and the neutral message; delete with persistent message; delete last queue then `/new-queue/`; pending and blocked with the Operations link; each cancel refusal; reload does not replay. Asserts computed focus, `role` and text. | Browser-only E2E |
| UX-15 | No animation without `prefers-reduced-motion: no-preference` (CSS contract test for the new rules). | Contract |

### 7.2 What only visual, browser or assistive-technology validation covers (NOT done)

- Whether `position: sticky` keeps the message visible when focus lands on a title far down; real contrast of the status, warning and error colors on the real background; 320 px and 400 percent zoom reflow; dialog look and focus ring visibility.
- Real focus behavior after `window.location.assign` (full document load), including the order of the focus announcement and the status announcement.
- Whether NVDA, JAWS, VoiceOver and TalkBack announce a message written into a region that exists but was empty at document load, and whether the focused title and the message interrupt each other. If they do, the fallback is to set `aria-describedby` on the focus target (to be decided only with evidence).
- Whether the wording is understood by streamers (the reading test). The sentence "do not come back" and "the reward stays paused until you show and open" are the two most likely to need a human reading check.

## 8. Mandatory implementation requirements (conditions of the score)

| # | Requirement | Who |
|---|---|---|
| R1 | Stop using `panel.queue.delete.done` and `.pending` for Channel Points queues: they say "the reward remains paused / untouched", which is false for that type. Use the type-specific keys of 3.3. | `@dev` |
| R2 | Show "Cancel deletion" from the server `canCancelDeletion` and `cancellationInProgress`, not from the `remoteSyncStatus` heuristic (F17). | `@dev` (architect D-36-6) |
| R3 | Add `tabindex="-1"` to the queue title `h2` and to both page `h1`. | `@dev` |
| R4 | Acknowledge the wording refinement of FT-23 AC 1 and AC 11: one persistent container with two stable live elements (`status`, `alert`). | `@po` |
| R5 | Replace the generic dialog (title "Confirm action", buttons "Cancel"/"Confirm") for delete and cancel-delete by the specific title and the buttons "Back" / verb of 3.3 and 3.4. | `@dev` |
| R6 | Map `already_deleted` from the 409 `QUEUE_DELETION_ALREADY_COMPLETED` code (the 200 `already_deleted` branch is dead per the architect). | `@dev` |
| R7 | Plural keys for `{count}` entries and for the blocked count. | `@dev` |
| R8 | Region text >= 14 px (the existing `.queue-action-feedback` is 12 px) and measured contrast >= 4.5:1 before the UI ships. | `@dev` (CSS), `@qa` (measure) |

If any of R1-R3, R5, R6 is not met at the `@qa` gate, the score of this plan does not apply to the delivered UI.

## 9. Score by dimension (static review)

| Dimension | Score | Basis |
|---|---|---|
| Clarity | 9.2 | State words first; entries, refunds, reward and next steps named; the two long ones (cancel dialog, cancel result) were split into short paragraphs. Residual: two sentences need a human reading check. |
| Consistency | 9.1 | Most existing keys reused or amended; same terms per language; same channel for every flow; same dialog pattern as OPS-20 (specific title, verb button, safe default). |
| Accessibility | 8.8 | Pattern is sound (stable live elements, focusable targets, no timer, reduced motion), but the order of focus and announcement after a document load, contrast and reflow are unverified by any browser or assistive technology. This is the dimension that lowers the average. |
| Error recovery | 9.1 | Every refusal says what did not happen and offers the next step (refresh, Operations, Connection, retry); uncertain never becomes success; the create form cannot duplicate. Residual: no read timeout (FT-44). |
| Error prevention | 9.3 | Specific destructive dialog with safe default, consequence stated before and after, server-derived button, no navigation on uncertain create, closed URL list, no free text reflected. |
| i18n | 9.0 | Three languages for every key, plural forms including pt-BR `many`, placeholders registered, no server free text rendered. Residual: es phrasing and the long Operations page title were reviewed by reading only. |

**Final: 9.1/10** (mean 9.08, rounded). It is valid only for: this plan's text and structure, the files named in the nature note, and static review. It does **not** certify the delivered UI, the browser, the assistive technology or the readability test. The `@qa` gate must still run UX-1 to UX-15 and record 7.2 as pending or done by a separate validation.

No correction is required before implementation to keep the score >= 9.0; R1-R8 are required during implementation to keep it valid.

## 10. Gaps for the `@analyst` (do not block the score)

Checked `docs/research-index.md`: there is no note on live regions. Per the golden rule these are LACUNAS, not repeated research.

1. **LACUNA (low):** official guidance (WAI-ARIA 1.2 and Authoring Practices, WCAG 2.2 SC 4.1.3 Status Messages and SC 2.2.1) on announcing a message written into a live region right after a full document load, and on combining it with programmatic focus on another element. This plan follows the common pattern (region present and empty, text set in an effect) but cites no source. Needed before the assistive-technology validation is planned.
2. **LACUNA (low):** native `<dialog>` behavior in Chromium and Firefox for focus restoration when the invoker is removed from the DOM while the dialog is open (the plan sets an explicit fallback; MDN/HTML spec confirmation would let `@dev` drop it or keep it with a reason).
3. **Already deferred (architect):** Next 16 `useRouter`/`useSearchParams`/`<Link>` before FT-28; not needed here.

## 11. Decisions made (autonomous)

- `[AUTO-DECISION]` Two live elements instead of one role-switching element → two (reason: reliable announcements; `@po` acknowledges, R4).
- `[AUTO-DECISION]` `created_remote` is not carried across the navigation → neutral text (reason: FT-23 AC 2).
- `[AUTO-DECISION]` Uncertain create does not navigate → stays on the form (reason: avoids a duplicate and a false "created").
- `[AUTO-DECISION]` Blocked deletion is a persistent card line from the projection, with a region message only when first read after an action (reason: blocked is a state, not an event; the architect's contract is code-only).
- `[AUTO-DECISION]` Refusals and `not_cancelled` use `alert`; successes and pending use `status` (reason: the requested change did not happen).
- `[AUTO-DECISION]` URL outcome parameters are removed right after being applied, even while the projection is still loading (reason: AC 6 and a reload must not replay; the message is accurate whatever the API state).
- `[AUTO-DECISION]` Delete-last navigation uses three codes (`queue_deleted_last_reward`, `_local`, `_converted`) so the message matches the queue type without any free text in the URL (reason: AC 6 closed list).

## Pending items by agent

| Agent | Pending |
|---|---|
| `@po` | R4 (AC 1/11 wording); record the 9.1 and its scope; keep the UX gate "plan delivered, visual/browser/AT not done". |
| `@dev` | R1-R3, R5-R8 and the keys of section 4 when implementation is scheduled (after the other gates). |
| `@qa` | Include UX-1..UX-15 in the test plan and the mutation proof of UX-6; measure contrast (R8); decide whether a separate browser/AT validation is scheduled (7.2). |
| `@analyst` | Gaps 1 and 2, low priority, before the assistive-technology validation. |
| `@sm` | None. |

## Change Log

- 2026-11-04 — `@ux-design-expert` (Uma): created the single FT-23 + FT-36 plan (flows, microcopy in en/es/pt-BR with catalog keys, accessibility, states, testable criteria, score 9.1/10 by static review, requirements R1-R8, gaps). Documentation only; no code, catalog, style or issue was changed.
